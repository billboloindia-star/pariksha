"""Gemini-powered target-exam study plan generation: given a user's real weak
topics and the exact chapter names in their bank, produces a phased plan
whose focusTopics are guaranteed to be real bank chapters (never invented
names) so the frontend's existing section/chapter deep-link into Master
Vault just works."""

import json
import logging
from typing import List, Optional

from google import genai
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-flash-lite-latest"


class WeakTopicInput(BaseModel):
    topic: str
    accuracy: int
    attempts: int


class ExamPlanInput(BaseModel):
    exam: str
    stage: str
    daysUntilExam: int
    targetCutoff: float
    currentAvgAccuracy: float
    weakTopics: List[WeakTopicInput]
    availableChapters: List[str]  # exact bank chapter names - the only valid focusTopic values


class ExamPlanPhase(BaseModel):
    label: str
    weeks: float
    description: str
    focusTopics: List[str] = []


class ExamPlanOutput(BaseModel):
    phases: List[ExamPlanPhase]
    focusDistribution: dict[str, float]
    dailyHoursEstimate: float


def _build_prompt(data: ExamPlanInput) -> str:
    weak_lines = "\n".join(
        f"- {t.topic}: {t.accuracy}% accuracy over {t.attempts} attempts" for t in data.weakTopics
    ) or "- No attempt history yet - treat this as a cold start and build a broad foundation plan."
    chapters_lines = "\n".join(f"- {c}" for c in data.availableChapters[:400])

    return f"""You are building a phased study plan for a student preparing for {data.exam} ({data.stage}).

Days until the exam: {data.daysUntilExam}
Target cutoff they need to clear: {data.targetCutoff}%
Their current average accuracy across recent attempts: {data.currentAvgAccuracy}%

Their weakest topics right now (lowest accuracy first):
{weak_lines}

The ONLY valid chapter names you may use in "focusTopics" (use the exact string as given, do not
paraphrase, abbreviate, or invent a new chapter name):
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
  until the exam). The LAST phase must be light revision/mocks only, with an EMPTY focusTopics list
  (no new topics that close to the exam).
- Every other phase's focusTopics must be chosen from the "valid chapter names" list above,
  weighted toward the weakest topics given - do not pick topics the student is already strong at
  except lightly in a later phase as upkeep.
- focusDistribution values are percentages across study time (by section name, e.g. "Reasoning",
  "Quant"), must sum to 100, weighted toward whichever sections are weakest.
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
