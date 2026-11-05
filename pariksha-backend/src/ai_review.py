"""Gemini-powered performance review: a personalized summary, strengths/weaknesses,
and a short study plan, generated from one attempt's aggregate stats (never the raw
question text - keeps the payload small and avoids sending paper content to a third
party unnecessarily)."""

import json
import logging
from typing import List, Optional

from google import genai
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-flash-lite-latest"


class TopicSummary(BaseModel):
    topic: str
    attempted: int
    total: int
    correct: int
    avgSec: Optional[float] = None


class SlowAnswer(BaseModel):
    question: int
    topic: str
    seconds: float
    correct: bool


class PerformanceInput(BaseModel):
    examTitle: str
    examCategory: str
    net: float
    total: int
    correct: int
    wrong: int
    skipped: int
    attempted: int
    accuracy: float
    avgSec: float
    tabSwitches: int
    topics: List[TopicSummary]
    slowest: List[SlowAnswer]


class ReviewPoint(BaseModel):
    title: str
    detail: str


class StudyPlanDay(BaseModel):
    day: str
    title: str
    detail: str
    minutes: int


class PerformanceReview(BaseModel):
    summary: str
    strengths: List[ReviewPoint]
    weaknesses: List[ReviewPoint]
    plan: List[StudyPlanDay]


def _build_prompt(data: PerformanceInput) -> str:
    topic_lines = "\n".join(
        f"- {t.topic}: {t.correct}/{t.attempted} correct ({t.attempted}/{t.total} attempted)"
        + (f", avg {t.avgSec:.1f}s" if t.avgSec is not None else "")
        for t in data.topics
    )
    slow_lines = "\n".join(
        f"- Q{s.question} ({s.topic}): {s.seconds:.0f}s, {'correct' if s.correct else 'wrong'}"
        for s in data.slowest
    )
    return f"""You are reviewing one mock exam attempt for a student preparing for {data.examCategory}.

Paper: {data.examTitle}
Net score: {data.net}/{data.total}
Correct: {data.correct}  Wrong: {data.wrong}  Skipped: {data.skipped}  Attempted: {data.attempted}/{data.total}
Accuracy on attempted questions: {data.accuracy}%
Average seconds per attempted question: {data.avgSec:.1f}s
Tab switches / focus losses during the attempt: {data.tabSwitches}

Per-topic performance:
{topic_lines}

Slowest answers:
{slow_lines}

Write a personalized performance review as JSON only - no markdown fences, no commentary before or
after. Reference real topic names and numbers from the data above, not generic advice. Match this
exact shape:

{{
  "summary": "2-3 sentences, direct and specific, referencing actual numbers/topics from above",
  "strengths": [{{"title": "short topic/pattern name", "detail": "1-2 sentences, specific"}}, ...],
  "weaknesses": [{{"title": "short topic/pattern name", "detail": "1-2 sentences, specific, actionable"}}, ...],
  "plan": [{{"day": "D1", "title": "short focus for this day", "detail": "1 sentence, concrete action", "minutes": 30}}, ...]
}}

2-3 strengths, 2-3 weaknesses, a 4-6 day plan ending in a full retake. Base every point strictly on
the data given - never invent a topic or number that isn't above."""


def _parse_response(response_text: str) -> PerformanceReview:
    json_text = response_text.strip()
    if json_text.startswith("```"):
        json_text = json_text.split("```")[1]
        if json_text.startswith("json"):
            json_text = json_text[4:]
        json_text = json_text.strip()
    data = json.loads(json_text)
    return PerformanceReview(**data)


class GeminiReviewer:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def review(self, data: PerformanceInput) -> PerformanceReview:
        prompt = _build_prompt(data)
        try:
            response = self.client.models.generate_content(model=MODEL_NAME, contents=[prompt])
            return _parse_response(response.text)
        except Exception as e:
            logger.error(f"Failed to generate performance review: {e}")
            raise
