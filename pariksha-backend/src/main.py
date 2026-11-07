"""Pariksha backend: email/password accounts + attempt history, on AWS Lambda."""

import base64
import json
import random
import re
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from src.ai_review import GeminiReviewer, PerformanceInput, PerformanceReview
from src.auth import create_jwt, get_current_email, hash_password, verify_password
from src.config import settings
from src.db import attempts_table, bank_table, library_table, s3, target_exam_table, topic_map_table, users_table
from src.exam_plan import ExamPlanInput, ExamPlanner, SectionConfidenceInput, WeakTopicInput
from src.topic_resolver import BankChapterOption, TopicResolveInput, TopicResolver
from src.models import (
    AdaptiveLogEntry,
    AttemptRecord,
    AuthResponse,
    AvatarUpload,
    BankIngestRequest,
    BankIngestResult,
    BankQuestion,
    BankQuestionIn,
    BankSectionSummary,
    CalendarDay,
    ChangePasswordRequest,
    Credentials,
    LibraryFileLink,
    LibraryItem,
    LibraryListResponse,
    LibrarySavePaper,
    LibraryUpload,
    MeResponse,
    PracticePaperRequest,
    ProfileUpdate,
    QuestionNoteUpdate,
    SectionConfidence,
    TargetExamAcceptRequest,
    TargetExamGenerateRequest,
    TargetExamPhase,
    TargetExamPlan,
    TargetExamState,
    TopicContractBucket,
    TopicContractChapter,
    TopicContractSection,
    TargetExamTask,
    TopicCandidate,
    TopicConfirmRequest,
    TopicResolveRequest,
    TopicResolveResponse,
)

MAX_LIBRARY_FILE_BYTES = 6 * 1024 * 1024
MAX_LIBRARY_FILES_PER_UPLOAD = 20
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

_reviewer = GeminiReviewer()
_planner = ExamPlanner()
_resolver = TopicResolver()

app = FastAPI(title="Pariksha API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://pariksha.billbolo.in", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_decimal(value):
    """DynamoDB has no native float type; walk the dict converting floats to Decimal."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_decimal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_decimal(v) for v in value]
    return value


def _from_decimal(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, dict):
        return {k: _from_decimal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_decimal(v) for v in value]
    return value


def _normalise_email(raw: str) -> str:
    email = raw.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return email


def _avatar_key(email: str, ext: str) -> str:
    return f"avatars/{email}.{ext}"


def _avatar_url(item: dict) -> str | None:
    key = (item or {}).get("avatarKey")
    if not key:
        return None
    return f"https://{settings.bank_images_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"


def _query_all(table, **kwargs) -> list:
    """DynamoDB Query caps a single response at ~1MB - a single call silently
    truncates once a user's data grows past that (confirmed on the bank
    table at 8k+ questions, and again on the library table once items
    started embedding a full 30-50 question paper each), so every read
    loops on LastEvaluatedKey until it's genuinely exhausted."""
    items: list = []
    res = table.query(**kwargs)
    items.extend(res.get("Items", []))
    while "LastEvaluatedKey" in res:
        res = table.query(ExclusiveStartKey=res["LastEvaluatedKey"], **kwargs)
        items.extend(res.get("Items", []))
    return items


@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: Credentials):
    email = _normalise_email(body.email)
    existing = users_table.get_item(Key={"email": email}).get("Item")
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    users_table.put_item(Item={"email": email, "passwordHash": hash_password(body.password), "plan": "free"})
    return AuthResponse(token=create_jwt(email), email=email, plan="free")


@app.post("/auth/login", response_model=AuthResponse)
def login(body: Credentials):
    email = _normalise_email(body.email)
    item = users_table.get_item(Key={"email": email}).get("Item")
    if not item or not verify_password(body.password, item["passwordHash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return AuthResponse(
        token=create_jwt(email), email=email, plan=item.get("plan", "free"),
        name=item.get("name"), avatarUrl=_avatar_url(item),
    )


@app.post("/auth/change-password")
def change_password(body: ChangePasswordRequest, email: str = Depends(get_current_email)):
    item = users_table.get_item(Key={"email": email}).get("Item")
    if not item or not verify_password(body.currentPassword, item["passwordHash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    if len(body.newPassword) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    users_table.update_item(
        Key={"email": email},
        UpdateExpression="SET passwordHash = :h",
        ExpressionAttributeValues={":h": hash_password(body.newPassword)},
    )
    return {"ok": True}


@app.get("/me", response_model=MeResponse)
def me(email: str = Depends(get_current_email)):
    item = users_table.get_item(Key={"email": email}).get("Item")
    return MeResponse(email=email, plan=(item or {}).get("plan", "free"), name=(item or {}).get("name"), avatarUrl=_avatar_url(item))


@app.put("/me", response_model=MeResponse)
def update_profile(body: ProfileUpdate, email: str = Depends(get_current_email)):
    name = (body.name or "").strip()
    users_table.update_item(
        Key={"email": email},
        UpdateExpression="SET #n = :n",
        ExpressionAttributeNames={"#n": "name"},
        ExpressionAttributeValues={":n": name or None},
    )
    item = users_table.get_item(Key={"email": email}).get("Item")
    return MeResponse(email=email, plan=(item or {}).get("plan", "free"), name=(item or {}).get("name"), avatarUrl=_avatar_url(item))


@app.post("/me/avatar", response_model=MeResponse)
def upload_avatar(body: AvatarUpload, email: str = Depends(get_current_email)):
    ext = ALLOWED_AVATAR_TYPES.get(body.fileType)
    if not ext:
        raise HTTPException(status_code=400, detail="Use a JPEG, PNG, or WEBP image.")
    try:
        raw = base64.b64decode(body.fileBase64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode the image.")
    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (max 2MB).")

    # Overwrite the same key every time rather than a fresh uuid per upload -
    # one avatar per account, so there's nothing to clean up on re-upload.
    key = _avatar_key(email, ext)
    s3.put_object(Bucket=settings.bank_images_bucket, Key=key, Body=raw, ContentType=body.fileType)
    users_table.update_item(
        Key={"email": email},
        UpdateExpression="SET avatarKey = :k",
        ExpressionAttributeValues={":k": key},
    )
    item = users_table.get_item(Key={"email": email}).get("Item")
    return MeResponse(email=email, plan=(item or {}).get("plan", "free"), name=(item or {}).get("name"), avatarUrl=_avatar_url(item))


def require_premium(email: str = Depends(get_current_email)) -> str:
    item = users_table.get_item(Key={"email": email}).get("Item")
    if (item or {}).get("plan", "free") != "premium":
        raise HTTPException(status_code=403, detail="This feature needs a premium plan.")
    return email


@app.get("/attempts", response_model=List[AttemptRecord])
def list_attempts(email: str = Depends(get_current_email)):
    res = attempts_table.query(
        KeyConditionExpression=Key("userId").eq(email),
        ScanIndexForward=False,
        Limit=50,
    )
    return [_from_decimal(item) for item in res.get("Items", [])]


@app.post("/attempts", response_model=AttemptRecord)
def add_attempt(record: AttemptRecord, email: str = Depends(get_current_email)):
    item = _to_decimal(record.model_dump())
    item["userId"] = email
    attempts_table.put_item(Item=item)
    return record


@app.patch("/attempts/{when}/questions/{q_index}/note")
def update_question_note(
    when: int, q_index: int, body: QuestionNoteUpdate, email: str = Depends(get_current_email)
):
    try:
        attempts_table.update_item(
            Key={"userId": email, "when": when},
            UpdateExpression=f"SET questions[{q_index}].#note = :val",
            ExpressionAttributeNames={"#note": "note"},
            ExpressionAttributeValues={":val": body.note},
            ConditionExpression="attribute_exists(userId)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Attempt not found.")
        raise
    return {"ok": True}


@app.post("/analyze", response_model=PerformanceReview)
def analyze(data: PerformanceInput, email: str = Depends(get_current_email)):
    try:
        return _reviewer.review(data)
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't generate a review — try again.")


def _library_key(email: str, item_id: str, file_name: str) -> str:
    return f"{email}/{item_id}/{file_name}"


# Thumbnail rendering lives in its own service (pariksha-doc-processing), not
# here - PyMuPDF is a heavy native dependency that would otherwise bloat
# every cold start of this API for a feature only the upload path needs.
# That service watches the library bucket via an S3 event and writes
# `thumbnailUrl` onto the item asynchronously once it's rendered.


def _encode_cursor(key: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def _decode_cursor(cursor: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid pagination cursor.")


LIBRARY_LIST_PAGE_SIZE = 30


@app.get("/library", response_model=LibraryListResponse)
def list_library(cursor: str | None = None, email: str = Depends(get_current_email)):
    # A full item can embed a 30-50 question paper (each with its own text/
    # options) - sending every item's full paper inline in one response, for
    # a vault that's grown to 200+ items, blew past a few MB and made the
    # page time out. The list view only ever needs to know WHETHER a paper
    # exists and how big it is, not its contents, so this strips `paper`
    # down to hasPaper/questionCount and paginates server-side on top of
    # that, via DynamoDB's own LastEvaluatedKey (not the Python-side
    # _query_all loop used elsewhere, which is for internal aggregation
    # reads that must see everything - this endpoint deliberately returns
    # one bounded page per call).
    kwargs: dict = dict(
        KeyConditionExpression=Key("userId").eq(email),
        ScanIndexForward=False,
        Limit=LIBRARY_LIST_PAGE_SIZE,
    )
    if cursor:
        kwargs["ExclusiveStartKey"] = _decode_cursor(cursor)
    res = library_table.query(**kwargs)

    out = []
    for item in res.get("Items", []):
        paper = item.get("paper")
        light = _from_decimal({k: v for k, v in item.items() if k not in ("userId", "paper")})
        light["hasPaper"] = bool(paper)
        light["questionCount"] = len(paper.get("questions", [])) if paper else None
        out.append(light)

    next_cursor = _encode_cursor(res["LastEvaluatedKey"]) if "LastEvaluatedKey" in res else None
    return {"items": out, "nextCursor": next_cursor}


@app.get("/library/{item_id}", response_model=LibraryItem)
def get_library_item(item_id: str, email: str = Depends(get_current_email)):
    item = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Not found.")
    paper = item.get("paper")
    out = _from_decimal({k: v for k, v in item.items() if k != "userId"})
    out["hasPaper"] = bool(paper)
    out["questionCount"] = len(paper.get("questions", [])) if paper else None
    return out


@app.post("/library", response_model=LibraryItem)
def upload_library_files(body: LibraryUpload, email: str = Depends(get_current_email)):
    if not body.files:
        raise HTTPException(status_code=400, detail="No files to save.")
    if len(body.files) > MAX_LIBRARY_FILES_PER_UPLOAD:
        raise HTTPException(status_code=400, detail=f"Too many files at once (max {MAX_LIBRARY_FILES_PER_UPLOAD}).")

    decoded = []
    for f in body.files:
        try:
            raw = base64.b64decode(f.fileBase64, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not decode {f.fileName}.")
        if len(raw) > MAX_LIBRARY_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"{f.fileName} is too large for the vault (max 6MB each).")
        decoded.append((f, raw))

    item_id = uuid.uuid4().hex
    files_meta = []
    for f, raw in decoded:
        key = _library_key(email, item_id, f.fileName)
        s3.put_object(Bucket=settings.library_bucket, Key=key, Body=raw, ContentType=f.fileType or "application/octet-stream")
        files_meta.append({"fileName": f.fileName, "fileType": f.fileType, "fileSize": len(raw)})

    title = body.title or files_meta[0]["fileName"]
    if not body.title and len(files_meta) > 1:
        title = f"{files_meta[0]['fileName']} (+{len(files_meta) - 1} more)"

    item = {
        "userId": email,
        "itemId": item_id,
        "title": title,
        "files": files_meta,
        "createdAt": int(time.time() * 1000),
    }
    # thumbnailUrl is set a few seconds later by the pariksha-doc-processing
    # service, triggered by this PDF landing in the library bucket - not
    # here, so the upload response doesn't wait on a PDF render.
    library_table.put_item(Item=item)
    return {k: v for k, v in item.items() if k != "userId"}


@app.get("/library/{item_id}/files", response_model=List[LibraryFileLink])
def library_file_links(item_id: str, email: str = Depends(get_current_email)):
    item = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Not found.")
    links = []
    for f in item.get("files", []):
        key = _library_key(email, item_id, f["fileName"])
        url = s3.generate_presigned_url(
            "get_object", Params={"Bucket": settings.library_bucket, "Key": key}, ExpiresIn=1800
        )
        links.append({"fileName": f["fileName"], "url": url})
    return links


@app.put("/library/{item_id}", response_model=LibraryItem)
def save_library_paper(item_id: str, body: LibrarySavePaper, email: str = Depends(get_current_email)):
    item = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Not found.")
    library_table.update_item(
        Key={"userId": email, "itemId": item_id},
        UpdateExpression="SET paper = :p",
        ExpressionAttributeValues={":p": _to_decimal(body.paper)},
    )
    updated = {**item, "paper": body.paper}
    out = _from_decimal({k: v for k, v in updated.items() if k != "userId"})
    out["hasPaper"] = True
    out["questionCount"] = len(body.paper.get("questions", []))
    return out


@app.delete("/library/{item_id}")
def delete_library_item(item_id: str, email: str = Depends(get_current_email)):
    item = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
    if item:
        for f in item.get("files", []):
            key = _library_key(email, item_id, f["fileName"])
            s3.delete_object(Bucket=settings.library_bucket, Key=key)
    library_table.delete_item(Key={"userId": email, "itemId": item_id})
    return {"ok": True}


def _section_chapter(section: str, chapter: str) -> str:
    return f"{section}#{chapter}"


def _validate_bank_question(q: BankQuestionIn, index: int) -> str | None:
    if not q.text.strip():
        return f"Question {index + 1}: missing text."
    if q.type == "mc":
        if not q.options or len(q.options) < 2:
            return f"Question {index + 1}: multiple-choice needs at least two options."
        if q.answer_index is None or not (0 <= q.answer_index < len(q.options)):
            return f"Question {index + 1}: answer_index is missing or out of range."
    elif q.type == "num":
        if q.answer is None:
            return f"Question {index + 1}: numeric question needs an answer."
    else:
        return f"Question {index + 1}: type must be \"mc\" or \"num\"."
    return None


@app.post("/bank/ingest", response_model=BankIngestResult)
def ingest_bank_questions(body: BankIngestRequest, email: str = Depends(require_premium)):
    errors: list[str] = []
    rows = []
    now = int(time.time() * 1000)
    for i, q in enumerate(body.questions):
        err = _validate_bank_question(q, i)
        if err:
            errors.append(err)
            continue
        item = _to_decimal(q.model_dump())
        item["userId"] = email
        item["questionId"] = uuid.uuid4().hex
        item["createdAt"] = now
        item["sectionChapter"] = _section_chapter(q.section, q.chapter)
        rows.append(item)

    if rows:
        with bank_table.batch_writer() as batch:
            for item in rows:
                batch.put_item(Item=item)

    return BankIngestResult(ingested=len(rows), errors=errors[:5])


@app.get("/bank/sections", response_model=List[BankSectionSummary])
def bank_sections(email: str = Depends(require_premium)):
    # Only the three small attributes needed for counting - the full items
    # (text/options/solution/table/image) are most of each item's size, and
    # pulling all of them across 8k+ rows is what made this endpoint take
    # ~10s; a count-only projection cuts the transferred payload drastically.
    items = _query_all(
        bank_table,
        KeyConditionExpression=Key("userId").eq(email),
        ProjectionExpression="#sec, chapter, difficulty",
        ExpressionAttributeNames={"#sec": "section"},
    )
    groups: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"easy": 0, "medium": 0, "hard": 0})
    for item in items:
        key = (item.get("section", ""), item.get("chapter", ""))
        diff = item.get("difficulty", "medium")
        if diff not in groups[key]:
            diff = "medium"
        groups[key][diff] += 1
    return [
        BankSectionSummary(
            section=section, chapter=chapter, count=sum(counts.values()), byDifficulty=counts
        )
        for (section, chapter), counts in sorted(groups.items())
    ]


@app.get("/bank/questions", response_model=List[BankQuestion])
def bank_questions(
    section: str,
    chapters: str,
    difficulty: str | None = None,
    email: str = Depends(require_premium),
):
    chapter_list = [c.strip() for c in chapters.split(",") if c.strip()]
    out = []
    for chapter in chapter_list:
        out.extend(_query_all(
            bank_table,
            IndexName="BankBySectionChapterIndex",
            KeyConditionExpression=Key("userId").eq(email)
            & Key("sectionChapter").eq(_section_chapter(section, chapter)),
        ))
    if difficulty:
        out = [q for q in out if q.get("difficulty") == difficulty]
    return [_from_decimal(q) for q in out]


@app.post("/bank/practice-paper")
def generate_practice_paper(body: PracticePaperRequest, email: str = Depends(require_premium)):
    pool = []
    for chapter in body.chapters:
        pool.extend(_query_all(
            bank_table,
            IndexName="BankBySectionChapterIndex",
            KeyConditionExpression=Key("userId").eq(email)
            & Key("sectionChapter").eq(_section_chapter(body.section, chapter)),
        ))
    if body.difficulty:
        pool = [q for q in pool if q.get("difficulty") == body.difficulty]
    if not pool:
        raise HTTPException(status_code=404, detail="No questions match that chapter/difficulty selection.")

    sample = random.sample(pool, min(body.count, len(pool)))
    sample = [_from_decimal(q) for q in sample]

    chapters_label = ", ".join(body.chapters)
    questions = []
    for q in sample:
        questions.append({
            "id": q["questionId"],
            "section": body.section,
            "topic": q["chapter"],
            "type": q["type"],
            "text": q["text"],
            "table": q.get("table"),
            "image": q.get("image"),
            "solution": q.get("solution"),
            "options": q.get("options"),
            "ans": q["answer_index"] if q["type"] == "mc" else q["answer"],
        })

    paper = {
        "title": f"{body.section} practice — {chapters_label}",
        "exam": body.section,
        "durationMinutes": body.durationMinutes,
        "negativeMarking": body.negativeMarking,
        "sections": [{"name": body.section, "from": 0, "to": len(questions) - 1}],
        "questions": questions,
    }
    return paper


def _normalize_topic_for_cache(s: str) -> str:
    """Mirrors the frontend's normalizeTopic() in Progress.tsx exactly - the
    two MUST agree, or a topic resolved once never hits the cache again.
    Deliberately a distinct name from the Target Exam section's own
    _normalize_topic() below (different, incompatible normalization used
    for weak-topic dedup there) - do not merge them."""
    norm = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return re.sub(r"s\b", "", norm)


def _bank_chapters_with_section(email: str) -> list[dict]:
    items = _query_all(
        bank_table,
        KeyConditionExpression=Key("userId").eq(email),
        ProjectionExpression="#sec, chapter",
        ExpressionAttributeNames={"#sec": "section"},
    )
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for it in items:
        key = (it.get("section"), it.get("chapter"))
        if key[0] and key[1] and key not in seen:
            seen.add(key)
            out.append({"section": key[0], "chapter": key[1]})
    return out


def _repair_chapter(value: str | None, chapter_to_section: dict[str, str]) -> tuple[str, str] | None:
    """Gemini is told the chapter list as "[Section] Chapter" lines and
    occasionally echoes that bracket format back verbatim in its own
    "chapter" field instead of the bare name - confirmed live (e.g. it
    returned "[Quant] Boats & Streams"). A chapter string that doesn't
    exactly match a real bank chapter is actively dangerous to trust (it'd
    silently break the practice-builder deep link), so repair it against
    the known-good list rather than ever trusting Gemini's own `section`
    field - the section is derived here, not taken from the AI response."""
    if not value:
        return None
    if value in chapter_to_section:
        return value, chapter_to_section[value]
    stripped = re.sub(r"^\[[^\]]*\]\s*", "", value).strip()
    if stripped in chapter_to_section:
        return stripped, chapter_to_section[stripped]
    return None


@app.post("/bank/resolve-topic", response_model=TopicResolveResponse)
def resolve_topic(body: TopicResolveRequest, email: str = Depends(require_premium)):
    """Last-resort fallback for when the frontend's own deterministic
    findMatch() (exact / normalized / substring against bank chapters)
    found nothing for a weak-topic name. Tries a per-user cache before ever
    calling Gemini, and writes back to that cache on a confident AI result
    so the same topic never needs a second AI call."""
    norm = _normalize_topic_for_cache(body.topic)
    if not norm:
        return TopicResolveResponse(candidates=[])

    cached = topic_map_table.get_item(Key={"userId": email, "topicNorm": norm}).get("Item")
    if cached:
        return TopicResolveResponse(section=cached["section"], chapter=cached["chapter"], source="cache")

    chapters = _bank_chapters_with_section(email)
    if not chapters:
        return TopicResolveResponse(candidates=[])
    chapter_to_section = {c["chapter"]: c["section"] for c in chapters}

    try:
        out = _resolver.resolve(TopicResolveInput(
            topic=body.topic,
            chapters=[BankChapterOption(**c) for c in chapters],
        ))
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't resolve that topic — try again.")

    if out.confident and out.chapter:
        repaired = _repair_chapter(out.chapter, chapter_to_section)
        if repaired:
            chapter, section = repaired
            topic_map_table.put_item(Item={
                "userId": email,
                "topicNorm": norm,
                "topic": body.topic,
                "section": section,
                "chapter": chapter,
                "resolvedBy": "ai",
                "createdAt": int(time.time() * 1000),
            })
            return TopicResolveResponse(section=section, chapter=chapter, source="ai")
        # Gemini said it was confident but named a chapter that isn't real,
        # even after repair - don't trust it, fall through to candidates.

    candidates: list[TopicCandidate] = []
    for c in out.candidates:
        repaired = _repair_chapter(c.chapter, chapter_to_section)
        if repaired:
            chapter, section = repaired
            candidates.append(TopicCandidate(section=section, chapter=chapter))
    return TopicResolveResponse(candidates=candidates)


@app.post("/bank/confirm-topic")
def confirm_topic(body: TopicConfirmRequest, email: str = Depends(require_premium)):
    """Called once the user picks one of /bank/resolve-topic's ambiguous
    candidates - writes it to the same cache table so next time this exact
    topic resolves instantly, no AI call, no re-asking the user."""
    topic_map_table.put_item(Item={
        "userId": email,
        "topicNorm": _normalize_topic_for_cache(body.topic),
        "topic": body.topic,
        "section": body.section,
        "chapter": body.chapter,
        "resolvedBy": "user",
        "createdAt": int(time.time() * 1000),
    })
    return {"ok": True}


# ======================================================================
# Target Exam: a tracked study plan toward one real bank exam, generated by
# Gemini from the user's actual weak topics and kept in sync with their
# attempt history on every read (countdown, readiness score, today's tasks,
# consistency calendar). One active plan per user - accepting a new one
# overwrites whatever was there before.
# ======================================================================

def _normalize_topic(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _attempt_accuracy(a: dict) -> float:
    if a.get("accuracy") is not None:
        return float(a["accuracy"])
    attempted = a.get("total", 0) - a.get("skipped", 0)
    if attempted <= 0:
        return 0.0
    return round(a.get("correct", 0) / attempted * 100)


def _weak_topics_for_plan(attempts: list, chapter_to_section: dict) -> List[WeakTopicInput]:
    """Weakest topics, balanced across sections (up to 6 per section, ~20 total)
    instead of one flat top-12 - a section with more total attempt volume
    would otherwise crowd out a thinner-but-equally-weak section entirely
    (e.g. 10 Reasoning topics vs 2 Quant ones for an identical confidence
    rating), starving the planner of any signal to put real Quant time in."""
    agg: dict = defaultdict(lambda: {"ok": 0, "att": 0})
    for a in attempts:
        for topic, tally in (a.get("byTopic") or {}).items():
            agg[topic]["ok"] += int(tally.get("ok", 0))
            agg[topic]["att"] += int(tally.get("att", 0))

    by_section: dict = defaultdict(list)
    for t, v in agg.items():
        if v["att"] <= 0:
            continue
        w = WeakTopicInput(topic=t, accuracy=round(v["ok"] / v["att"] * 100), attempts=v["att"])
        by_section[chapter_to_section.get(t, "Other")].append(w)

    out: List[WeakTopicInput] = []
    for topics in by_section.values():
        topics.sort(key=lambda w: w.accuracy)
        out.extend(topics[:6])
    out.sort(key=lambda w: w.accuracy)
    return out[:20]


def _recent_avg_accuracy(attempts: list, days: int) -> float:
    cutoff = int(time.time() * 1000) - days * 86400000
    recent = [a for a in attempts if int(a.get("when", 0)) >= cutoff]
    if not recent:
        return 0.0
    return round(sum(_attempt_accuracy(a) for a in recent) / len(recent), 1)


def _day_str(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _compute_streak(whens_ms: list) -> int:
    days = {_day_str(w) for w in whens_ms if w}
    streak = 0
    cur = datetime.now(timezone.utc).date()
    while cur.strftime("%Y-%m-%d") in days:
        streak += 1
        cur -= timedelta(days=1)
    return streak


def _compute_calendar(attempts: list, accepted_at_ms: int) -> tuple:
    by_day: dict = defaultdict(int)
    for a in attempts:
        by_day[_day_str(int(a.get("when", 0)))] += 1

    today = datetime.now(timezone.utc).date()
    accepted_day = datetime.fromtimestamp(accepted_at_ms / 1000, tz=timezone.utc).date()
    start = max(accepted_day, today - timedelta(days=27))

    out: List[CalendarDay] = []
    missed_this_week = 0
    d = start
    while d <= today:
        ds = d.strftime("%Y-%m-%d")
        n = by_day.get(ds, 0)
        if d < accepted_day:
            level = "0"
        elif n == 0:
            level = "miss" if d < today else "0"  # today isn't "missed" until the day is over
        elif n >= 3:
            level = "3"
        elif n == 2:
            level = "2"
        else:
            level = "1"
        out.append(CalendarDay(date=ds, level=level))
        if level == "miss" and (today - d).days < 7:
            missed_this_week += 1
        d += timedelta(days=1)
    return out, missed_this_week


def _current_phase_index(plan: dict, accepted_at_ms: int) -> int:
    accepted_day = datetime.fromtimestamp(accepted_at_ms / 1000, tz=timezone.utc).date()
    today_offset = (datetime.now(timezone.utc).date() - accepted_day).days
    phases = plan.get("phases", [])
    for i, p in enumerate(phases):
        if p.get("startDay", 0) <= today_offset < p.get("endDay", 0):
            return i
    return max(0, len(phases) - 1)


def _today_tasks(phase: dict, attempts_today: list) -> List[TargetExamTask]:
    done_topics = set()
    for a in attempts_today:
        for topic in (a.get("byTopic") or {}).keys():
            done_topics.add(_normalize_topic(topic))
    tasks = []
    for topic in (phase.get("focusTopics") or [])[:4]:
        done = _normalize_topic(topic) in done_topics
        tasks.append(TargetExamTask(topic=topic, label=f"{topic} — practice", meta="Today's focus", done=done))
    return tasks


def _readiness(current_avg: float, target_cutoff: float, accepted_at_ms: int, exam_date_ms: int) -> tuple:
    """Combines two signals: the accuracy gap right now (positive = behind
    target), and time pressure - the same gap matters more as the exam gets
    closer relative to how much runway the plan originally had. Early in a
    plan a 20-point gap is normal and expected to close; late, it's
    alarming. Deliberately a simple linear model, not a statistical one -
    good enough to drive a status badge, not a hard prediction."""
    now_ms = int(time.time() * 1000)
    total_span = max(1, exam_date_ms - accepted_at_ms)
    elapsed_frac = min(1.0, max(0.0, (now_ms - accepted_at_ms) / total_span))
    time_urgency = 0.5 + 0.5 * elapsed_frac  # 0.5 early on -> 1.0 right before the exam

    gap = target_cutoff - current_avg  # positive = behind target
    readiness = 100 - max(0, gap) * time_urgency * 1.3
    if gap < 0:
        readiness = min(100, readiness + min(10, -gap * 0.3))
    readiness = max(0, min(100, round(readiness)))

    if gap <= -3:
        status = "ahead"
    elif gap > 8 or readiness < 55:
        status = "behind"
    else:
        status = "on_track"
    return readiness, status


def _maybe_append_adaptive_log(log: List[AdaptiveLogEntry], missed_week: int, attempts: list) -> None:
    """A handful of simple, pragmatic rules evaluated fresh on every GET -
    not a persisted trigger system, just enough for the plan to feel alive
    without overbuilding this for a first pass. Each entry's `detail` ends
    with a hidden [tag] used purely to avoid re-logging the same event
    every single page load."""
    now = int(time.time() * 1000)
    week_tag = datetime.now(timezone.utc).strftime("%G-W%V")
    if missed_week >= 3 and not any(e.detail.endswith(f"[{week_tag}]") for e in log if e.kind == "warning"):
        log.append(AdaptiveLogEntry(
            date=now, kind="warning",
            message=f"{missed_week} missed days this week",
            detail=f"Readiness recalculated to account for the gap — stay consistent to close it. [{week_tag}]",
        ))

    recent5 = sorted(attempts, key=lambda a: a.get("when", 0))[-5:]
    if len(recent5) == 5 and all(_attempt_accuracy(a) >= 85 for a in recent5):
        tag = f"streak5-{recent5[-1].get('when')}"
        if not any(e.detail.endswith(f"[{tag}]") for e in log if e.kind == "good"):
            log.append(AdaptiveLogEntry(
                date=now, kind="good",
                message="5 strong attempts in a row",
                detail=f"Every one of your last 5 attempts was above 85% accuracy — keep this pace up. [{tag}]",
            ))


def _bank_chapters_by_section(email: str) -> Dict[str, List[str]]:
    items = _query_all(
        bank_table,
        KeyConditionExpression=Key("userId").eq(email),
        ProjectionExpression="#sec, chapter",
        ExpressionAttributeNames={"#sec": "section"},
    )
    out: Dict[str, List[str]] = {}
    seen: set = set()
    for it in items:
        sec, ch = it.get("section"), it.get("chapter")
        if not sec or not ch or (sec, ch) in seen:
            continue
        seen.add((sec, ch))
        out.setdefault(sec, []).append(ch)
    return out


def _target_exam_state(email: str, item: dict) -> TargetExamState:
    attempts = _query_all(attempts_table, KeyConditionExpression=Key("userId").eq(email))
    attempts = [_from_decimal(a) for a in attempts]

    exam_date = date.fromisoformat(item["examDate"])
    days_left = max(0, (exam_date - date.today()).days)
    exam_date_ms = int(datetime(exam_date.year, exam_date.month, exam_date.day, tzinfo=timezone.utc).timestamp() * 1000)

    current_avg = _recent_avg_accuracy(attempts, days=7)
    readiness, status = _readiness(current_avg, float(item["targetCutoff"]), int(item["acceptedAt"]), exam_date_ms)
    streak = _compute_streak([int(a.get("when", 0)) for a in attempts])
    calendar, missed_week = _compute_calendar(attempts, int(item["acceptedAt"]))

    plan = item["plan"]
    phase_idx = _current_phase_index(plan, int(item["acceptedAt"]))
    phases = plan.get("phases", [])
    current_phase = phases[phase_idx] if phases else {}

    today_str = _day_str(int(time.time() * 1000))
    attempts_today = [a for a in attempts if _day_str(int(a.get("when", 0))) == today_str]
    today_tasks = _today_tasks(current_phase, attempts_today)

    adaptive_log = [AdaptiveLogEntry(**e) for e in item.get("adaptiveLog", [])]
    before = len(adaptive_log)
    _maybe_append_adaptive_log(adaptive_log, missed_week, attempts)
    if len(adaptive_log) != before:
        target_exam_table.update_item(
            Key={"userId": email},
            UpdateExpression="SET adaptiveLog = :l",
            ExpressionAttributeValues={":l": _to_decimal([e.model_dump() for e in adaptive_log])},
        )

    return TargetExamState(
        exam=item["exam"], stage=item["stage"], examDate=item["examDate"], targetCutoff=item["targetCutoff"],
        totalMarks=float(item.get("totalMarks", 100)),
        sectionConfidence=[SectionConfidence(**c) for c in item.get("sectionConfidence", [])],
        createdAt=item["createdAt"], acceptedAt=item["acceptedAt"], plan=TargetExamPlan(**plan),
        adaptiveLog=adaptive_log,
        daysLeft=days_left, currentAvgAccuracy=current_avg, readiness=readiness, readinessStatus=status,
        streak=streak, currentPhaseIndex=phase_idx, todayTasks=today_tasks, calendar=calendar,
        missedDaysThisWeek=missed_week,
    )


@app.post("/target-exam/generate", response_model=TargetExamPlan)
def generate_target_exam_plan(body: TargetExamGenerateRequest, email: str = Depends(require_premium)):
    attempts = _query_all(attempts_table, KeyConditionExpression=Key("userId").eq(email))
    attempts = [_from_decimal(a) for a in attempts]
    chapters_by_section = _bank_chapters_by_section(email)
    chapter_to_section = {c: sec for sec, chs in chapters_by_section.items() for c in chs}
    weak = _weak_topics_for_plan(attempts, chapter_to_section)
    current_avg = _recent_avg_accuracy(attempts, days=14)

    try:
        exam_date = date.fromisoformat(body.examDate)
    except ValueError:
        raise HTTPException(status_code=400, detail="examDate must be YYYY-MM-DD.")
    days_until = max(1, (exam_date - date.today()).days)

    try:
        out, contract = _planner.generate(ExamPlanInput(
            exam=body.exam, stage=body.stage, daysUntilExam=days_until,
            targetCutoff=body.targetCutoff, currentAvgAccuracy=current_avg,
            weakTopics=weak, chaptersBySection=chapters_by_section,
            sectionConfidence=[SectionConfidenceInput(**c.model_dump()) for c in body.sectionConfidence],
        ))
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't generate a plan — try again.")

    topic_contract = [
        TopicContractSection(
            section=sec.section,
            unmatched=sec.unmatched,
            buckets=[
                TopicContractBucket(
                    label=b.label, weightNote=b.weightNote, weightCount=b.weightCount, sectionTotal=b.sectionTotal,
                    chapters=[TopicContractChapter(chapter=p.chapter, reason=p.reason) for p in b.chapters],
                )
                for b in sec.buckets
            ],
        )
        for sec in contract
    ]

    # Fill in day offsets from each phase's `weeks` so later reads can tell
    # which phase "today" falls into without re-parsing free text.
    phases = []
    cursor = 0
    for p in out.phases:
        span_days = max(1, round(p.weeks * 7))
        phases.append(TargetExamPhase(
            label=p.label, weeks=p.weeks, description=p.description, focusTopics=p.focusTopics,
            startDay=cursor, endDay=cursor + span_days,
        ))
        cursor += span_days

    return TargetExamPlan(
        phases=phases, focusDistribution=out.focusDistribution, dailyHoursEstimate=out.dailyHoursEstimate,
        topicContract=topic_contract,
    )


@app.post("/target-exam/accept", response_model=TargetExamState)
def accept_target_exam_plan(body: TargetExamAcceptRequest, email: str = Depends(require_premium)):
    now = int(time.time() * 1000)
    item = {
        "userId": email,
        "exam": body.exam,
        "stage": body.stage,
        "examDate": body.examDate,
        "targetCutoff": body.targetCutoff,
        "totalMarks": body.totalMarks,
        "sectionConfidence": [c.model_dump() for c in body.sectionConfidence],
        "createdAt": now,
        "acceptedAt": now,
        "plan": body.plan.model_dump(),
        "adaptiveLog": [],
    }
    target_exam_table.put_item(Item=_to_decimal(item))
    return _target_exam_state(email, item)


@app.get("/target-exam", response_model=TargetExamState)
def get_target_exam(email: str = Depends(require_premium)):
    item = target_exam_table.get_item(Key={"userId": email}).get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="No target exam plan set yet.")
    item = _from_decimal(item)
    return _target_exam_state(email, item)


handler = Mangum(app)
