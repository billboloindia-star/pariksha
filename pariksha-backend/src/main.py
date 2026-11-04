"""Pariksha backend: email/password accounts + attempt history, on AWS Lambda."""

from decimal import Decimal
from typing import List

from boto3.dynamodb.conditions import Key
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from src.auth import create_jwt, get_current_email, hash_password, verify_password
from src.db import attempts_table, users_table
from src.models import AttemptRecord, AuthResponse, Credentials

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


handler = Mangum(app)
