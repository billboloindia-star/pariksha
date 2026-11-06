"""Pariksha backend: email/password accounts + attempt history, on AWS Lambda."""

import base64
import time
import uuid
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
from src.db import attempts_table, library_table, s3, users_table
from src.models import (
    AttemptRecord,
    AuthResponse,
    Credentials,
    LibraryFileLink,
    LibraryItem,
    LibrarySavePaper,
    LibraryUpload,
    QuestionNoteUpdate,
)

MAX_LIBRARY_FILE_BYTES = 6 * 1024 * 1024
MAX_LIBRARY_FILES_PER_UPLOAD = 20

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


@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: Credentials):
    email = _normalise_email(body.email)
    existing = users_table.get_item(Key={"email": email}).get("Item")
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    users_table.put_item(Item={"email": email, "passwordHash": hash_password(body.password)})
    return AuthResponse(token=create_jwt(email), email=email)


@app.post("/auth/login", response_model=AuthResponse)
def login(body: Credentials):
    email = _normalise_email(body.email)
    item = users_table.get_item(Key={"email": email}).get("Item")
    if not item or not verify_password(body.password, item["passwordHash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return AuthResponse(token=create_jwt(email), email=email)


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


@app.get("/library", response_model=List[LibraryItem])
def list_library(email: str = Depends(get_current_email)):
    res = library_table.query(KeyConditionExpression=Key("userId").eq(email), ScanIndexForward=False)
    return [_from_decimal(item) for item in res.get("Items", [])]


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
    return _from_decimal({k: v for k, v in updated.items() if k != "userId"})


@app.delete("/library/{item_id}")
def delete_library_item(item_id: str, email: str = Depends(get_current_email)):
    item = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
    if item:
        for f in item.get("files", []):
            key = _library_key(email, item_id, f["fileName"])
            s3.delete_object(Bucket=settings.library_bucket, Key=key)
    library_table.delete_item(Key={"userId": email, "itemId": item_id})
    return {"ok": True}


handler = Mangum(app)
