"""Pariksha backend: email/password accounts + attempt history, on AWS Lambda."""

import base64
import json
import random
import time
import uuid
from collections import defaultdict
from decimal import Decimal
from typing import List

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from src.ai_review import GeminiReviewer, PerformanceInput, PerformanceReview
from src.auth import create_jwt, get_current_email, hash_password, verify_password
from src.config import settings
from src.db import attempts_table, bank_table, library_table, s3, users_table
from src.models import (
    AttemptRecord,
    AuthResponse,
    AvatarUpload,
    BankIngestRequest,
    BankIngestResult,
    BankQuestion,
    BankQuestionIn,
    BankSectionSummary,
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
)

MAX_LIBRARY_FILE_BYTES = 6 * 1024 * 1024
MAX_LIBRARY_FILES_PER_UPLOAD = 20
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

_reviewer = GeminiReviewer()

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


handler = Mangum(app)
