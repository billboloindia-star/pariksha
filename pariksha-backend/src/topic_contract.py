"""Deterministic topic-allocation "contract": given a user's real bank
chapters, the exam's real pattern/weightage data, and their weak-topic /
confidence state, computes WHICH real chapters should be covered and roughly
how many per real-exam topic area - server-side, with no LLM judgment call
involved in the allocation itself.

This exists because leaving chapter SELECTION entirely to the Gemini prompt
(via prose rules like "pick a diverse spread") turned out unreliable in
practice: with no real weakness signal to break a tie, the model kept
defaulting to the same 1-2 generic-sounding chapter names (e.g. "Profit &
Loss" and "Time & Work" for every Arithmetic-heavy section) instead of
actually spreading across the user's real, much larger bank. Computing the
allocation here and handing Gemini a FIXED chapter list to sequence/narrate
removes that failure mode - the model's job becomes phasing and writing good
descriptions around a decision that's already made, not making the decision.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from src.exam_patterns import SectionPattern, StagePattern


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _label_keywords(label: str) -> List[str]:
    """Pulls matchable keyword fragments out of a topic_weightage label like
    "Arithmetic (Average/Ratio/SI-CI/Profit-Loss/Time-Work/Partnership/Mixture
    etc.)" - the parenthetical's slash/comma-separated hints, plus the base
    label itself."""
    paren_m = re.search(r"\(([^)]*)\)", label)
    base = re.sub(r"\([^)]*\)", "", label)
    raw_parts = re.split(r"[/,&]", base) + (re.split(r"[/,&]", paren_m.group(1)) if paren_m else [])
    kws = []
    for p in raw_parts:
        p = re.sub(r"\b(etc|all|variants|combined|when present|and)\b", "", p, flags=re.I)
        norm = _normalize(p)
        if len(norm) >= 3:
            kws.append(norm)
    return kws


def _first_weight_number(note: str) -> float:
    """Pulls a representative count out of a weightage note string - handles
    "23 of 40", "~3-4 of 40", "8-10 (...)", "5", "0-5 (not every year)"."""
    m = re.search(r"(\d+)\s*-\s*(\d+)", note)
    if m:
        return (int(m.group(1)) + int(m.group(2))) / 2
    m = re.search(r"\d+", note)
    return float(m.group()) if m else 1.0


@dataclass
class ChapterPick:
    chapter: str
    reason: str  # why this one, e.g. "diagnostic-confirmed weakest (32%)" or "coverage - no signal yet"


@dataclass
class TopicBucket:
    label: str
    weightNote: str  # the full human-readable real-exam-weight string (detail/tooltip use)
    weightCount: float  # parsed representative question count, e.g. 23.5 - for a clean "24/40" badge
    sectionTotal: int  # the section's total question count, e.g. 40 - the badge's denominator
    chapters: List[ChapterPick] = field(default_factory=list)


@dataclass
class ContractSection:
    section: str
    buckets: List[TopicBucket] = field(default_factory=list)
    # bank chapters in this section that matched no bucket at all (rare - only
    # when the pattern's topic labels don't cover something the user's bank has)
    unmatched: List[str] = field(default_factory=list)


def _section_capacity(level: str, days_until_exam: int) -> int:
    """How many total chapter slots this section gets across the whole plan.
    More days -> more room to cover ground; a confidently "excellent" section
    gets less room than "very_low"/"average" (still some, for upkeep)."""
    base = max(6, min(20, round(days_until_exam / 5)))
    mult = {"very_low": 1.3, "average": 1.0, "excellent": 0.55}.get(level, 1.0)
    return max(3, round(base * mult))


def build_contract(
    pattern: Optional[StagePattern],
    chapters_by_section: Dict[str, List[str]],
    weak_topic_accuracy: Dict[str, int],  # real chapter name -> accuracy%, from attempt history
    section_levels: Dict[str, str],  # section -> "very_low"/"average"/"excellent"
    chapter_accuracy: Dict[str, Dict[str, float]],  # section -> {chapter: diagnostic/manual accuracy%}
    days_until_exam: int,
) -> List[ContractSection]:
    if not pattern:
        return []

    pattern_by_section = {sp.name: sp for sp in pattern.sections}
    result: List[ContractSection] = []

    for section, bank_chapters in chapters_by_section.items():
        sp: Optional[SectionPattern] = pattern_by_section.get(section)
        if not sp or not bank_chapters:
            continue

        bank_norm = {c: _normalize(c) for c in bank_chapters}

        # 1. explicit keyword matches per bucket
        bucket_matches: Dict[str, List[str]] = {}
        for label in sp.topic_weightage:
            kws = _label_keywords(label)
            matched = [c for c, cn in bank_norm.items() if any(k in cn or cn in k for k in kws)]
            bucket_matches[label] = matched

        # 2. the single highest-weighted bucket also absorbs any bank chapter
        # that matched NOTHING - broad real categories (Arithmetic, Puzzles &
        # Seating Arrangement) are broad for a reason, and this is what
        # actually fixes "only 2 Arithmetic chapters ever get picked": the
        # user's other 15 Arithmetic-ish chapters have no clean keyword of
        # their own, so without this they'd never be eligible at all.
        claimed = {c for cs in bucket_matches.values() for c in cs}
        leftover = [c for c in bank_chapters if c not in claimed]
        catch_all_label = None
        if leftover and sp.topic_weightage:
            catch_all_label = max(sp.topic_weightage, key=lambda lb: _first_weight_number(sp.topic_weightage[lb]))
            # interleave keyword-matched and absorbed-leftover chapters rather
            # than appending leftovers at the end - with no weakness signal to
            # rank by, selection just takes the front of this list, so a pure
            # append would always re-pick the same couple of keyword-matched
            # names (the original bug) and never reach the absorbed variety.
            existing = bucket_matches[catch_all_label]
            interleaved: List[str] = []
            for i in range(max(len(existing), len(leftover))):
                if i < len(existing):
                    interleaved.append(existing[i])
                if i < len(leftover):
                    interleaved.append(leftover[i])
            bucket_matches[catch_all_label] = interleaved

        # 3. capacity + selection
        level = section_levels.get(section, "average")
        capacity = _section_capacity(level, days_until_exam)
        total_weight = sum(_first_weight_number(n) for n in sp.topic_weightage.values()) or 1

        sec_chapter_accuracy = chapter_accuracy.get(section, {})
        buckets: List[TopicBucket] = []
        for label, note in sp.topic_weightage.items():
            matched = bucket_matches.get(label, [])
            if not matched:
                continue
            weight = _first_weight_number(note)
            target = max(1, round((weight / total_weight) * capacity))
            if label == catch_all_label:
                # a broad real category absorbing many otherwise-unmatched
                # chapters needs real floor coverage, not just its
                # weight-proportional share - otherwise selection never gets
                # past the first couple of keyword-matched names.
                target = max(target, min(len(matched), 4))
            target = min(target, len(matched))

            def rank_key(c: str):
                if c in sec_chapter_accuracy:
                    return (0, sec_chapter_accuracy[c])  # measured/manual weakest first
                if c in weak_topic_accuracy:
                    return (1, weak_topic_accuracy[c])  # real attempt-history weakest first
                return (2, 0)  # no signal - stable order, just fills coverage

            ranked = sorted(matched, key=rank_key)
            picks: List[ChapterPick] = []
            for c in ranked[:target]:
                if c in sec_chapter_accuracy:
                    reason = f"weakest rated/measured in this group ({round(sec_chapter_accuracy[c])}%)"
                elif c in weak_topic_accuracy:
                    reason = f"real weak topic from your attempts ({weak_topic_accuracy[c]}% accuracy)"
                else:
                    reason = "no signal yet - included for real-exam coverage"
                picks.append(ChapterPick(chapter=c, reason=reason))
            buckets.append(TopicBucket(label=label, weightNote=note, weightCount=weight, sectionTotal=sp.questions, chapters=picks))

        all_matched_pool = {c for cs in bucket_matches.values() for c in cs}
        unmatched = [c for c in bank_chapters if c not in all_matched_pool]
        result.append(ContractSection(section=section, buckets=buckets, unmatched=unmatched))

    return result
