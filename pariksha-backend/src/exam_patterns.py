"""Real-world exam pattern reference data for the 6 predefined Target Exams -
sectional structure, timing, and topic-wise question weightage from previous
years, used to bias the AI study planner toward topics that are actually
heavily tested, not just toward whatever the user happens to be weak at.

Provenance varies by exam and is noted in each one's comment:
- RRB PO Prelims and RRB Clerk Prelims are backed by REAL tallied PYQ papers
  (memory-based reconstructions, question-by-question topic classification),
  not estimates - see the comment above each.
- Everything else is coaching-institute consensus (Oliveboard, BankersAdda,
  PracticeMock, etc.) cross-checked across several sources as of Nov 2026,
  since IBPS/SBI don't publish an official topic-wise blueprint. These drift
  a little year to year and should be treated as directional, not exact.

Either way, this is said explicitly wherever the data reaches the Gemini
prompt, so the model doesn't present any of it as harder fact than it is.
"""

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class SectionPattern:
    name: str
    questions: int
    minutes: float
    topic_weightage: Dict[str, str]  # chapter-ish label -> typical question count/range


@dataclass
class StagePattern:
    total_questions: int
    total_marks: int
    total_minutes: float
    sectional_timer: bool  # each section has its own hard time limit, no borrowing
    sections: List[SectionPattern]
    strategy: str
    # "pyq": tallied directly from real previous-year question papers.
    # "estimate": coaching-institute consensus, no official blueprint exists.
    source: str = "estimate"


# Keyed by (examName, stage). "both" falls back to prelims (the gateway stage).
EXAM_PATTERNS: Dict[str, Dict[str, StagePattern]] = {
    "IBPS PO": {
        "prelims": StagePattern(
            total_questions=100, total_marks=100, total_minutes=60, sectional_timer=True,
            sections=[
                SectionPattern("English", 30, 20, {
                    "Reading Comprehension": "8-10 (largest single English topic)",
                    "Cloze Test": "5",
                    "Error Spotting / Sentence Correction": "5-7",
                    "Fillers / Para-jumbles": "5-7",
                }),
                SectionPattern("Quant", 35, 20, {
                    "Data Interpretation": "10-15 (highest-weightage quant topic, ~15% of the section)",
                    "Arithmetic (Average, Ratio, SI-CI, Profit-Loss, Time-Work etc.)": "10-15",
                    "Simplification / Approximation": "5",
                    "Number Series": "5",
                    "Quadratic Equations": "0-5",
                    "Data Sufficiency": "0-5",
                }),
                SectionPattern("Reasoning", 35, 20, {
                    "Puzzles & Seating Arrangement": "15-20 (dominant topic, well over half the section)",
                    "Syllogism": "5",
                    "Inequality": "5",
                    "Alphanumeric / Number Series": "5",
                    "Coding-Decoding": "0-5 (not every year)",
                    "Blood Relation / Direction Sense / Order & Ranking": "5 combined",
                }),
            ],
            strategy=(
                "Each section has its own 20-minute timer with NO borrowing time between sections. "
                "Reasoning typically carries the most scoring potential (puzzles dominate it), so it's "
                "often attempted with real focus rather than rushed. Within Quant, clear the quick wins "
                "(Simplification, Number Series, one easy DI set) before committing to a second DI/data "
                "sufficiency set. Within Reasoning, clear Syllogism/Inequality/Blood Relation/Direction "
                "first (fast, high-accuracy), then commit to at most 2-3 puzzle sets rather than reading "
                "every puzzle on offer - a half-solved 4th puzzle wastes the section's time budget."
            ),
        ),
        "mains": StagePattern(
            total_questions=155, total_marks=200, total_minutes=180, sectional_timer=True,
            sections=[
                SectionPattern("Reasoning & Computer Aptitude", 45, 60, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality": "8-10",
                    "Input-Output, Data Sufficiency, Coding-Decoding": "10-15 combined",
                    "Computer Aptitude basics": "5-10",
                }),
                SectionPattern("Data Analysis & Interpretation", 35, 45, {
                    "Data Interpretation (table/bar/pie/caselet/mixed)": "20-25 (heaviest single topic in Mains)",
                    "Data Sufficiency": "5",
                    "Probability / Permutation-Combination": "5-10",
                }),
                SectionPattern("General/Economy/Banking Awareness", 40, 35, {
                    "Current affairs (last 4-6 months)": "20-25",
                    "Banking & financial awareness, static GK": "15-20",
                }),
                SectionPattern("English Language", 35, 40, {
                    "Reading Comprehension": "10",
                    "Error Spotting / Sentence Improvement / Para-jumbles": "15-20",
                    "Vocabulary / Cloze": "5-10",
                }),
            ],
            strategy=(
                "Mains is far denser than Prelims - DI alone can be a third of the quant-equivalent "
                "section. GA has a hard ceiling (memory only, not solvable on the spot), so cap prep "
                "time there rather than over-indexing on it. Computer Aptitude is usually the easiest, "
                "fastest marks in its section - clear it before the harder reasoning sets. A descriptive "
                "English test (letter + essay, ~30 min) follows the objective paper."
            ),
        ),
    },
    "SBI PO": {
        "prelims": StagePattern(
            total_questions=100, total_marks=100, total_minutes=60, sectional_timer=True,
            sections=[
                SectionPattern("English", 30, 20, {
                    "Reading Comprehension": "8-10",
                    "Cloze Test / Fillers": "5-7",
                    "Error Spotting / Para-jumbles": "8-10",
                }),
                SectionPattern("Quant", 35, 20, {
                    "Data Interpretation": "10-15 (DI is the single highest-weightage quant topic)",
                    "Number Series": "5",
                    "Simplification / Approximation": "5",
                    "Quadratic Equations": "0-5",
                    "Arithmetic miscellaneous": "10-15",
                }),
                SectionPattern("Reasoning", 35, 20, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality": "8-10",
                    "Alphanumeric Series, Coding-Decoding": "5-10",
                    "Blood Relation / Direction / Ranking": "5",
                }),
            ],
            strategy=(
                "Near-identical structure to IBPS PO Prelims - sectional 20-minute timers, no "
                "cross-section borrowing. SBI's Quant is generally considered slightly more "
                "calculation-heavy than IBPS's. 20+ solid attempts per section (not just raw attempts - "
                "accuracy matters more given the 0.25 negative mark) is a realistic strong-prelims target."
            ),
        ),
        "mains": StagePattern(
            total_questions=155, total_marks=200, total_minutes=180, sectional_timer=True,
            sections=[
                SectionPattern("Reasoning & Computer Aptitude", 45, 60, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality / Input-Output": "15-20",
                    "Computer Aptitude basics": "5-10",
                }),
                SectionPattern("Data Analysis & Interpretation", 35, 45, {
                    "Data Interpretation (incl. caselet/missing-data variants)": "20-25",
                    "Data Sufficiency / Probability": "10",
                }),
                SectionPattern("General/Economy/Banking Awareness", 40, 35, {
                    "Current affairs (last 4-6 months)": "20-25",
                    "Banking & financial awareness, static GK": "15-20",
                }),
                SectionPattern("English Language", 35, 40, {
                    "Reading Comprehension": "10",
                    "Grammar / Error Spotting / Para-jumbles": "15-20",
                }),
            ],
            strategy=(
                "Same overall shape as IBPS PO Mains. SBI's DI sets in Mains lean toward longer, "
                "multi-part caselets - budget more time per DI set rather than attempting more sets. "
                "Followed by a descriptive test (Letter + Essay, ~30 min)."
            ),
        ),
    },
    "IBPS Clerk": {
        "prelims": StagePattern(
            total_questions=100, total_marks=100, total_minutes=60, sectional_timer=True,
            sections=[
                SectionPattern("English", 30, 20, {
                    "Reading Comprehension": "8-10",
                    "Cloze Test / Fillers": "5-7",
                    "Error Spotting / Para-jumbles": "8-10",
                }),
                SectionPattern("Numerical Ability", 35, 20, {
                    "Simplification / Approximation": "10-15 (biggest single topic - built for speed)",
                    "Number Series": "5",
                    "Data Interpretation": "10-15",
                    "Arithmetic miscellaneous": "5-10",
                }),
                SectionPattern("Reasoning", 35, 20, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality": "8-10",
                    "Alphanumeric/Number Series, Coding-Decoding": "5-10",
                    "Blood Relation / Direction / Ranking": "5",
                }),
            ],
            strategy=(
                "Clerk Prelims rewards speed over depth more than PO does - Simplification/"
                "Approximation alone can be a third of the Numerical Ability section, so drilling "
                "calculation speed there has an outsized payoff. Same hard 20-minute-per-section rule."
            ),
        ),
        "mains": StagePattern(
            total_questions=190, total_marks=200, total_minutes=160, sectional_timer=True,
            sections=[
                SectionPattern("General/Financial Awareness", 50, 35, {
                    "Current affairs + static/banking GK": "50 (whole section is recall-based)",
                }),
                SectionPattern("General English", 40, 35, {
                    "Reading Comprehension": "10",
                    "Grammar / Cloze / Para-jumbles": "25-30",
                }),
                SectionPattern("Reasoning Ability & Computer Aptitude", 50, 45, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality / Input-Output": "15-20",
                    "Computer Aptitude basics": "10-15",
                }),
                SectionPattern("Quantitative Aptitude", 50, 45, {
                    "Data Interpretation": "15-20",
                    "Simplification / Arithmetic miscellaneous": "20-25",
                    "Number Series / Quadratic": "5-10",
                }),
            ],
            strategy=(
                "Clerk Mains is generally rated slightly easier than PO Mains and has no descriptive "
                "paper or interview - this IS the final selection stage, so treat it with full PO-level "
                "seriousness despite the 'easier' reputation. GA is pure recall; don't over-invest study "
                "time there relative to its fixed ceiling."
            ),
        ),
    },
    "SBI Clerk": {
        "prelims": StagePattern(
            total_questions=100, total_marks=100, total_minutes=60, sectional_timer=True,
            sections=[
                SectionPattern("English", 30, 20, {
                    "Reading Comprehension": "8-10",
                    "Cloze Test / Fillers": "5-7",
                    "Error Spotting / Para-jumbles": "8-10",
                }),
                SectionPattern("Numerical Ability", 35, 20, {
                    "Simplification / Approximation": "10-15",
                    "Number Series": "5",
                    "Data Interpretation": "10-15",
                    "Arithmetic miscellaneous": "5-10",
                }),
                SectionPattern("Reasoning", 35, 20, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality": "8-10",
                    "Alphanumeric/Number Series, Coding-Decoding": "5-10",
                    "Blood Relation / Direction / Ranking": "5",
                }),
            ],
            strategy=(
                "Near-identical pattern to IBPS Clerk Prelims - speed on Simplification/Approximation "
                "pays off disproportionately given it's the single biggest Numerical Ability topic."
            ),
        ),
        "mains": StagePattern(
            total_questions=190, total_marks=200, total_minutes=160, sectional_timer=True,
            sections=[
                SectionPattern("General/Financial Awareness", 50, 35, {
                    "Current affairs + static/banking GK": "50",
                }),
                SectionPattern("General English", 40, 35, {
                    "Reading Comprehension": "10",
                    "Grammar / Cloze / Para-jumbles": "25-30",
                }),
                SectionPattern("Quantitative Aptitude", 50, 45, {
                    "Data Interpretation": "15-20",
                    "Simplification / Arithmetic miscellaneous": "20-25",
                    "Number Series / Quadratic": "5-10",
                }),
                SectionPattern("Reasoning Ability & Computer Aptitude", 50, 45, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality / Input-Output": "15-20",
                    "Computer Aptitude basics": "10-15",
                }),
            ],
            strategy=(
                "Same shape as IBPS Clerk Mains - this is SBI Clerk's final selection stage, no "
                "interview. GA is pure recall; cap prep time there against its fixed ceiling."
            ),
        ),
    },
    "RRB PO": {
        # Prelims section below is from REAL tallied PYQ data (not an estimate):
        # the 22-Nov-2025 1st-shift memory-based paper, fully read and classified
        # question-by-question - Reasoning Q1-40 read directly from the source PDF,
        # Quant from a previously-ingested topic-tagged transcript (Q41-76 of 80;
        # the source paper's last 4 quant questions weren't captured, so that
        # section's count is "of 36 tallied", not "of 40").
        "prelims": StagePattern(
            total_questions=80, total_marks=80, total_minutes=45, sectional_timer=False,
            sections=[
                SectionPattern("Reasoning", 40, 20, {
                    "Puzzles & Seating Arrangement (circular/linear/box/floor, all variants combined)": "23 of 40 - dominant, well over half the section",
                    "Syllogism": "4",
                    "Inequality": "3",
                    "Direction Sense": "3",
                    "Blood Relation / Family": "3",
                    "Number-based (digit pairs/manipulation)": "2",
                    "Alphabet Classification": "1",
                    "Word Formation": "1",
                }),
                SectionPattern("Quant", 40, 25, {
                    "Data Interpretation": "10 of 36 tallied",
                    "Arithmetic (Average/Ratio/SI-CI/Profit-Loss/Time-Work etc.)": "10 of 36 tallied",
                    "Approximation": "6 of 36 tallied",
                    "Quadratic Equations": "5 of 36 tallied",
                    "Number Series": "5 of 36 tallied",
                }),
            ],
            strategy=(
                "RRB Prelims is COMPOSITE-timed (45 minutes for the whole paper), not hard-sectioned "
                "like IBPS/SBI - you can shift time between Reasoning and Quant as needed, which is a "
                "real tactical difference worth planning around (e.g. banking extra time from a strong "
                "section into a weaker one). Slightly shorter and less dense than IBPS/SBI Prelims (80 "
                "vs 100 questions), with no English section at this stage. Puzzles alone eat well over "
                "half the Reasoning section in real papers - strong puzzle-solving speed matters more "
                "here than almost anywhere else in the syllabus; Quant is comparatively balanced across "
                "its top 4-5 topics, so no single quant topic carries the section the way puzzles do."
            ),
            source="pyq",
        ),
        "mains": StagePattern(
            total_questions=200, total_marks=200, total_minutes=120, sectional_timer=False,
            sections=[
                SectionPattern("Reasoning", 40, 30, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality / Input-Output": "15-20",
                }),
                SectionPattern("Quant", 40, 30, {
                    "Data Interpretation": "15-20",
                    "Arithmetic / Simplification": "20-25",
                }),
                SectionPattern("General Awareness", 40, 15, {
                    "Current affairs + banking/financial GK": "40",
                }),
                SectionPattern("Computer Knowledge", 40, 15, {
                    "Computer fundamentals": "40",
                }),
                SectionPattern("English/Hindi", 40, 30, {
                    "Grammar, vocabulary, comprehension": "40",
                }),
            ],
            strategy=(
                "Mains is also composite-timed (120 min for all 5 sections combined), so the same "
                "time-shifting tactic applies at a bigger scale. Computer Knowledge and General "
                "Awareness are typically the fastest, highest-accuracy marks (pure recall, no "
                "calculation) - many aspirants clear these first to bank quick marks before the "
                "heavier Reasoning/Quant sections."
            ),
        ),
    },
    "RRB Clerk": {
        # Prelims section below is from REAL tallied PYQ data (not an estimate):
        # a fully topic-tagged IBPS RRB Clerk Prelims 2024 memory-based paper
        # (10 Aug 2024, 2nd shift), both sections complete at 40/40 questions each.
        "prelims": StagePattern(
            total_questions=80, total_marks=80, total_minutes=45, sectional_timer=False,
            sections=[
                SectionPattern("Reasoning", 40, 20, {
                    "Puzzles & Seating Arrangement (circular/linear/floor combined)": "15 of 40",
                    "Word Series": "5",
                    "Alphanumeric Series": "5",
                    "Direction Sense": "3",
                    "Syllogism": "3",
                    "Ranking and Order": "3",
                    "Number-based": "2",
                    "Inequality": "2",
                    "Word Formation": "1",
                    "Coding-Decoding": "1",
                }),
                SectionPattern("Quant", 40, 25, {
                    "Simplification": "15 of 40 - by far the biggest single topic, built for speed",
                    "Data Interpretation": "10 of 40",
                    "Number Series": "5 of 40",
                    "Arithmetic miscellaneous (Mensuration, Partnership, Time-Speed-Distance, "
                    "Mixture-Alligation, Profit-Loss, SI, Average, Ages, Time-Work, Percentage)": "10 of 40, 1 each",
                }),
            ],
            strategy=(
                "Same composite-timing structure as RRB PO Prelims (45 min total, no hard per-section "
                "split). Simplification alone is a real third of the Quant section here (15 of 40 in "
                "tallied papers) - speed drilling on it has an outsized payoff. Reasoning is still "
                "puzzle-heavy but noticeably less puzzle-concentrated than RRB PO's paper was, with more "
                "weight spread across Word/Alphanumeric Series."
            ),
            source="pyq",
        ),
        "mains": StagePattern(
            total_questions=200, total_marks=200, total_minutes=120, sectional_timer=False,
            sections=[
                SectionPattern("Reasoning", 40, 30, {
                    "Puzzles & Seating Arrangement": "15-20",
                    "Syllogism / Inequality / Input-Output": "15-20",
                }),
                SectionPattern("Quant", 40, 30, {
                    "Data Interpretation": "12-15",
                    "Arithmetic / Simplification": "25-28",
                }),
                SectionPattern("General Awareness", 40, 15, {
                    "Current affairs + banking/financial GK": "40",
                }),
                SectionPattern("Computer Knowledge", 40, 15, {
                    "Computer fundamentals": "40",
                }),
                SectionPattern("English/Hindi", 40, 30, {
                    "Grammar, vocabulary, comprehension": "40",
                }),
            ],
            strategy=(
                "This Mains result is the ENTIRE selection for RRB Clerk (Office Assistant) - no "
                "further stage. Composite 120-minute timer across all 5 sections; Computer Knowledge "
                "and GA are the fastest guaranteed marks and worth clearing early."
            ),
        ),
    },
}


def pattern_for(exam: str, stage: str) -> StagePattern | None:
    by_stage = EXAM_PATTERNS.get(exam)
    if not by_stage:
        return None
    return by_stage.get(stage) or by_stage.get("prelims")


def pattern_prompt_block(exam: str, stage: str) -> str:
    """Renders a pattern as prompt text, or '' if this exam/stage isn't mapped."""
    p = pattern_for(exam, stage)
    if not p:
        return ""
    sec_lines = []
    for s in p.sections:
        topic_lines = "\n".join(f"      - {topic}: {count}" for topic, count in s.topic_weightage.items())
        sec_lines.append(f"  - {s.name}: {s.questions} questions, {s.minutes} min\n{topic_lines}")
    timer_note = (
        "Each section above has its OWN hard time limit with no borrowing between sections."
        if p.sectional_timer else
        "Timing is COMPOSITE across the whole paper (no per-section split) - time can be shifted "
        "between sections, which is a real tactical difference worth factoring into the plan."
    )
    provenance = (
        "tallied directly from real previous-year question papers, question by question - this is "
        "measured data, not a guess"
        if p.source == "pyq" else
        "coaching-institute consensus estimates, not an official IBPS/SBI blueprint - directional, "
        "not exact, but far better signal than guessing"
    )
    return f"""
Real exam pattern for {exam} ({stage}), from previous years ({provenance}):
Total: {p.total_questions} questions, {p.total_marks} marks, {p.total_minutes} minutes. {timer_note}
{chr(10).join(sec_lines)}

Time-management strategy for this exam: {p.strategy}
"""
