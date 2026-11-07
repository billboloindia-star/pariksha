"""Gemini-powered fallback for mapping a weak-topic name (free text from an
attempt's own topic label, e.g. from an AI-converted Paper Vault paper) to a
real Master Vault bank chapter when the frontend's deterministic
string-matching (exact / normalized / substring) finds nothing. Only called
as the last resort after a cache-table miss - see src/main.py's
/bank/resolve-topic, which is the only caller."""

import json
import logging
from typing import List, Optional

from google import genai
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-flash-lite-latest"


class BankChapterOption(BaseModel):
    section: str
    chapter: str


class TopicResolveInput(BaseModel):
    topic: str
    chapters: List[BankChapterOption]  # the ONLY valid section/chapter values Gemini may return


class TopicResolveCandidate(BaseModel):
    section: str
    chapter: str


class TopicResolveOutput(BaseModel):
    confident: bool
    section: Optional[str] = None
    chapter: Optional[str] = None
    candidates: List[TopicResolveCandidate] = []


def _build_prompt(data: TopicResolveInput) -> str:
    chapter_lines = "\n".join(f"- [{c.section}] {c.chapter}" for c in data.chapters[:400])
    return f"""A student's exam attempt recorded a question under the topic label "{data.topic}" -
this label came from whatever source converted that paper and may not exactly match any chapter
name in the student's own tagged question bank below.

Available chapters (format: [Section] Chapter name) - you may ONLY use these exact section/chapter
strings, never invent or paraphrase one:
{chapter_lines}

Decide whether "{data.topic}" clearly corresponds to ONE of these chapters (same underlying concept,
just a different label or phrasing), is ambiguous between a FEW of them, or doesn't match any of
them at all (e.g. it's from a section with no chapters in the list above, like an English topic
when only Quant/Reasoning chapters exist).

Respond with JSON only - no markdown fences, no commentary. Match this exact shape:

{{"confident": true, "section": "exact section", "chapter": "exact chapter", "candidates": []}}

or, if ambiguous between 2-3 close possibilities:

{{"confident": false, "section": null, "chapter": null, "candidates": [{{"section": "...", "chapter": "..."}}, ...]}}

or, if genuinely nothing in the list is a reasonable match:

{{"confident": false, "section": null, "chapter": null, "candidates": []}}

Only mark "confident": true when you're quite sure - a wrong confident match sends the student to
practice the wrong topic, which is worse than asking them to pick. When in doubt, return 2-3
candidates instead of guessing, and return zero candidates rather than forcing a bad one."""


def _parse_response(response_text: str) -> TopicResolveOutput:
    json_text = response_text.strip()
    if json_text.startswith("```"):
        json_text = json_text.split("```")[1]
        if json_text.startswith("json"):
            json_text = json_text[4:]
        json_text = json_text.strip()
    data = json.loads(json_text)
    return TopicResolveOutput(**data)


class TopicResolver:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def resolve(self, data: TopicResolveInput) -> TopicResolveOutput:
        prompt = _build_prompt(data)
        try:
            response = self.client.models.generate_content(model=MODEL_NAME, contents=[prompt])
            return _parse_response(response.text)
        except Exception as e:
            logger.error(f"Failed to resolve topic '{data.topic}': {e}")
            raise
