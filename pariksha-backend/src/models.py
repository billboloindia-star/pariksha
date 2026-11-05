"""Request/response shapes. AttemptRecord mirrors src/types.ts on the frontend."""

from typing import Dict, List, Optional

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


class AttemptQuestionRecord(BaseModel):
    id: str
    topic: str
    type: str
    text: str
    options: Optional[List[str]] = None
    ans: int
    given: Optional[int] = None
    timeMs: int
    note: Optional[str] = None


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
    questions: Optional[List[AttemptQuestionRecord]] = None


class QuestionNoteUpdate(BaseModel):
    note: str


class LibraryUploadFile(BaseModel):
    fileName: str
    fileType: str
    fileBase64: str


class LibraryUpload(BaseModel):
    # A paper is often several page-photos rather than one file - a single vault
    # entry can hold multiple files, uploaded together in one request.
    title: Optional[str] = None
    files: List[LibraryUploadFile]


class LibrarySavePaper(BaseModel):
    # Already parsed/validated client-side by src/paper.ts's parsePaper() - stored as-is.
    paper: Dict


class LibraryFile(BaseModel):
    fileName: str
    fileType: str
    fileSize: int


class LibraryItem(BaseModel):
    itemId: str
    title: str
    files: List[LibraryFile]
    createdAt: int
    paper: Optional[Dict] = None


class LibraryFileLink(BaseModel):
    fileName: str
    url: str
