"""Request/response shapes. AttemptRecord mirrors src/types.ts on the frontend."""

from typing import Dict, Optional

from pydantic import BaseModel


class Credentials(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    email: str


class TopicTally(BaseModel):
    ok: int
    att: int


class AttemptRecord(BaseModel):
    when: int
    title: str
    net: float
    total: int
    correct: int
    wrong: int
    skipped: int
    secs: int
    accuracy: Optional[float] = None
    avgSec: Optional[float] = None
    byTopic: Optional[Dict[str, TopicTally]] = None
    tabSwitches: Optional[int] = None
    exam: Optional[str] = None
