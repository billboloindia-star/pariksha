"""Gemini-powered target-exam study plan generation: given a user's real weak
topics and the exact chapter names in their bank, produces a phased plan
whose focusTopics are guaranteed to be real bank chapters (never invented
names) so the frontend's existing section/chapter deep-link into Master
Vault just works."""

import json
import logging
from typing import Dict, List, Optional

from google import genai
from pydantic import BaseModel

from src.config import settings
from src.exam_patterns import pattern_prompt_block

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-flash-lite-latest"


class WeakTopicInput(BaseModel):
    topic: str
    accuracy: int
    attempts: int


class SectionConfidenceInput(BaseModel):
    section: str
    level: str  # "very_low" | "average" | "excellent" - the user's own self-rating
    # Set when the user took the inline diagnostic quiz for this section instead
    # of (or to confirm) their self-rating - a measured number, more trustworthy
    # than a guess, so it should carry more weight in the plan than `level` alone.
    diagnosticAccuracy: Optional[float] = None
    # Per-chapter accuracy from that same diagnostic quiz - a section-level
    # rating/score can't tell the planner WHICH chapters inside the section
    # need the work, so this is the real signal for picking focusTopics
    # within a section when it's present.
    chapterAccuracy: Optional[Dict[str, float]] = None
    # Manual per-chapter self-rating (very_low/average/excellent) for a user
    # who'd rather say directly which chapters they know than take the
    # diagnostic quiz - weaker than chapterAccuracy (a guess, not measured)
    # but still finer-grained than the bare section-level `level`.
    chapterLevels: Optional[Dict[str, str]] = None


class ExamPlanInput(BaseModel):
    exam: str
    stage: str
    daysUntilExam: int
    targetCutoff: float
    currentAvgAccuracy: float
    weakTopics: List[WeakTopicInput]
    # Exact bank chapter names, grouped by section - the only valid focusTopic
    # values. Grouped (not a flat list) so the model can actually see which
    # section each chapter belongs to and give every section fair coverage,
    # instead of guessing from the chapter name text alone.
    chaptersBySection: Dict[str, List[str]]
    # Self-reported (or diagnostic-measured) starting point per section - mainly
    # useful for a cold-start user with little/no attempt history, where
    # weakTopics alone has nothing to go on.
    sectionConfidence: List[SectionConfidenceInput] = []


class ExamPlanPhase(BaseModel):
    label: str
    weeks: float
    description: str
    focusTopics: List[str] = []


class ExamPlanOutput(BaseModel):
    phases: List[ExamPlanPhase]
    focusDistribution: dict[str, float]
    dailyHoursEstimate: float


LEVEL_LABEL = {"very_low": "Very low", "average": "Average", "excellent": "Excellent"}


def _mock_guidance(days: int) -> str:
    if days <= 10:
        return (
            "Exam is <=10 days away: mock tests must dominate from here on - at least 40-50% of "
            "total study time in focusDistribution, and a FULL-LENGTH TIMED MOCK EVERY SINGLE DAY "
            "is mandatory (say so explicitly in the relevant phase description). At this distance, "
            "speed/accuracy under real exam conditions matters far more than learning anything new."
        )
    if days <= 21:
        return (
            "Exam is 11-21 days away: mock tests should be 30-40% of total study time, ramping up "
            "to a daily full mock in the final phase (say so explicitly in that phase's description)."
        )
    if days <= 45:
        return (
            "Exam is 22-45 days away: mock tests should be 20-30% of total study time overall, "
            "with the final phase explicitly moving to daily or near-daily mocks."
        )
    return (
        "Exam is 45+ days away: mock tests can start lighter, around 12-20% of total study time "
        "early on, but MUST still ramp up to daily mocks by the final phase (say so explicitly)."
    )


def _build_prompt(data: ExamPlanInput) -> str:
    weak_lines = "\n".join(
        f"- {t.topic}: {t.accuracy}% accuracy over {t.attempts} attempts" for t in data.weakTopics
    ) or "- No attempt history yet."
    chapters_lines = "\n".join(
        f"## {section}\n" + "\n".join(f"- {c}" for c in chapters[:80])
        for section, chapters in data.chaptersBySection.items()
    )
    section_names = list(data.chaptersBySection.keys())

    if data.sectionConfidence:
        conf_blocks = []
        for c in data.sectionConfidence:
            line = f"- {c.section}: self-rated \"{LEVEL_LABEL.get(c.level, c.level)}\""
            line += (
                f", confirmed by a {round(c.diagnosticAccuracy)}% score on a diagnostic quiz"
                if c.diagnosticAccuracy is not None else " (no diagnostic taken - treat as a rough guess)"
            )
            if c.chapterAccuracy:
                chapter_lines = "\n".join(
                    f"    - {chapter}: {round(acc)}%" for chapter, acc in c.chapterAccuracy.items()
                )
                line += f"\n  Per-chapter diagnostic results within {c.section} (MEASURED - use THIS to pick which chapters of {c.section} need focusTopics, not just the section-level rating above):\n{chapter_lines}"
            elif c.chapterLevels:
                chapter_lines = "\n".join(
                    f"    - {chapter}: self-rated \"{LEVEL_LABEL.get(lv, lv)}\"" for chapter, lv in c.chapterLevels.items()
                )
                line += f"\n  Manual per-chapter self-ratings within {c.section} (a guess, not measured, but still more specific than the section-level rating alone - use THIS to pick which chapters of {c.section} need focusTopics):\n{chapter_lines}"
            conf_blocks.append(line)
        conf_lines = "\n".join(conf_blocks)
        starting_point_block = f"""
The student's self-reported starting point, section by section (use this heavily if attempt
history above is thin or empty - a diagnostic-confirmed rating is far more reliable than a bare
self-rating, so trust those numbers over a self-rating alone). A section-level rating alone can't
tell you which chapters WITHIN that section to focus on, so where a per-chapter breakdown is given
below, that is your real signal for choosing that section's focusTopics - don't just pick arbitrary
chapters from the section's valid-chapter list because the section itself was rated low:
{conf_lines}
"""
    else:
        starting_point_block = "\nNo starting-point self-assessment was given - rely on attempt history alone; if that's empty too, treat this as a cold start and build a broad foundation plan.\n"

    pattern_block = pattern_prompt_block(data.exam, data.stage)

    return f"""You are building a phased study plan for a student preparing for {data.exam} ({data.stage}).

Days until the exam: {data.daysUntilExam}
Target cutoff they need to clear: {data.targetCutoff}%
Their current average accuracy across recent attempts: {data.currentAvgAccuracy}%

Their weakest topics right now (lowest accuracy first):
{weak_lines}
{starting_point_block}
{pattern_block}
Use the real exam pattern above as a second axis alongside weakness/confidence when choosing
focusTopics: a topic that is BOTH weak/low-confidence AND heavily-weighted in the real exam (e.g.
Puzzles & Seating Arrangement, Data Interpretation) deserves priority over an equally-weak topic
that barely shows up in the real paper. Also use the sectional timing and strategy notes above to
make phase descriptions concrete and exam-realistic (attempt order, time budget per section, which
topics to triage vs skip) instead of generic study advice.

Mock test cadence for this timeline (follow this - do not default to a flat ~15% regardless of
how close the exam is): {_mock_guidance(data.daysUntilExam)}

The ONLY valid chapter names you may use in "focusTopics" (use the exact string as given, do not
paraphrase, abbreviate, or invent a new chapter name), grouped by section so you know exactly
which section each one belongs to - every section listed here ({", ".join(section_names)}) needs
real representation in the plan, not just the one or two sections with the most attempt history:
{chapters_lines}

Write a phased study plan as JSON only - no markdown fences, no commentary. Match this exact shape:

{{
  "phases": [
    {{"label": "short phase name e.g. Foundation & weak-topic repair", "weeks": 2,
      "description": "1-2 sentences, concrete, referencing real topics from above",
      "focusTopics": ["exact chapter name", "exact chapter name", "exact chapter name"]}},
    ...
  ],
  "focusDistribution": {{"Reasoning": 42, "Quant": 34, "Mock tests": 16, "English": 8}},
  "dailyHoursEstimate": 2.5
}}

Rules:
- 3-5 phases whose "weeks" sum to roughly {max(1, data.daysUntilExam // 7)} (the number of weeks
  until the exam). The LAST phase must be revision + mocks only, with an EMPTY focusTopics list (no
  new topics that close to the exam), and its description must explicitly state the mock cadence
  from the guidance above (e.g. "one full timed mock every day" when the exam is very close -
  never describe the last phase as "light" when days remaining is small).
- Every other phase's focusTopics must be chosen from the "valid chapter names" list above,
  weighted toward the weakest topics given - do not pick topics the student is already strong at
  except lightly in a later phase as upkeep.
- Coverage across sections must be fair, not dominated by whichever section happens to have the
  most attempt-history rows. Count the TOTAL focusTopics you pick for each section across all
  phases combined: a section rated "Excellent" (and with no diagnostic contradicting that) can
  reasonably get few or none, but any section rated "Very low" or "Average" must get a real,
  comparable share - do not let one section end up with 8-10 topics while another sits at 1-2
  when both were rated similarly. If a section's own weak-topic/attempt signal is thin, pull more
  of its focusTopics straight from that section's own chapter list above instead of skipping it.
- focusDistribution values are percentages across study time (by section name, e.g. "Reasoning",
  "Quant"), must sum to 100, weighted toward whichever sections are weakest - factor in the
  starting-point self-assessment above too, not just attempt history, especially for a student
  with few or no attempts yet.
- focusDistribution MUST include a "Mock tests" key whose share matches the mock test cadence
  guidance given above for this exam's timeline - never default it to a small fixed number
  regardless of days remaining. The fewer the days left, the bigger this share gets.
- dailyHoursEstimate is a realistic number (1.5-4) given the days remaining and how far current
  accuracy is from the target cutoff - a bigger gap or fewer days means more hours/day.
- Every phase description must reference specific real topic names, not generic advice."""


def _parse_response(response_text: str) -> ExamPlanOutput:
    json_text = response_text.strip()
    if json_text.startswith("```"):
        json_text = json_text.split("```")[1]
        if json_text.startswith("json"):
            json_text = json_text[4:]
        json_text = json_text.strip()
    data = json.loads(json_text)
    return ExamPlanOutput(**data)


class ExamPlanner:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def generate(self, data: ExamPlanInput) -> ExamPlanOutput:
        prompt = _build_prompt(data)
        try:
            response = self.client.models.generate_content(model=MODEL_NAME, contents=[prompt])
            return _parse_response(response.text)
        except Exception as e:
            logger.error(f"Failed to generate exam plan: {e}")
            raise
