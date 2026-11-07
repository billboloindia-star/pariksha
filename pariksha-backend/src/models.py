"""Request/response shapes. AttemptRecord mirrors src/types.ts on the frontend."""

from typing import Dict, List, Optional

from pydantic import BaseModel


class Credentials(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    email: str
    plan: str = "free"
    name: Optional[str] = None
    avatarUrl: Optional[str] = None


class MeResponse(BaseModel):
    email: str
    plan: str = "free"
    name: Optional[str] = None
    avatarUrl: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None


class AvatarUpload(BaseModel):
    fileBase64: str
    fileType: str


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


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
    # Set on every response. On the paginated list endpoint `paper` itself is
    # omitted (a full item can embed 30-50 questions - sending all of a
    # user's items with their full papers inline blew past a few MB and
    # made the page time out), so the list view needs these two fields to
    # know whether a paper exists and how big it is without the payload.
    hasPaper: bool = False
    questionCount: Optional[int] = None
    # A real render of the first PDF page (page.get_pixmap - same pixel-crop
    # approach already used for the DI chart images, never a drawn mock),
    # uploaded to the public bank-images bucket. None for image uploads or
    # if rendering failed - the frontend falls back to a generic icon then.
    thumbnailUrl: Optional[str] = None


class LibraryListResponse(BaseModel):
    items: List[LibraryItem]
    nextCursor: Optional[str] = None


class LibraryFileLink(BaseModel):
    fileName: str
    url: str


class BankTableSpec(BaseModel):
    head: List[str]
    rows: List[List[object]]


class BankQuestionIn(BaseModel):
    # Mirrors shared/types.ts's RawQuestion field conventions (answer_index for
    # "mc", answer for "num"), plus the bank-specific tagging fields that make
    # a question filterable/browsable instead of fixed to one Paper.
    section: str
    chapter: str
    difficulty: str = "medium"
    type: str = "mc"
    text: str
    options: Optional[List[str]] = None
    answer_index: Optional[int] = None
    answer: Optional[float] = None
    solution: Optional[str] = None
    table: Optional[BankTableSpec] = None
    image: Optional[str] = None


class BankQuestion(BankQuestionIn):
    questionId: str
    createdAt: int


class BankIngestRequest(BaseModel):
    questions: List[BankQuestionIn]


class BankIngestResult(BaseModel):
    ingested: int
    errors: List[str] = []


class DifficultyCount(BaseModel):
    easy: int = 0
    medium: int = 0
    hard: int = 0


class BankSectionSummary(BaseModel):
    section: str
    chapter: str
    count: int
    byDifficulty: DifficultyCount


class PracticePaperRequest(BaseModel):
    section: str
    chapters: List[str]
    difficulty: Optional[str] = None
    count: int = 20
    durationMinutes: int = 20
    negativeMarking: float = 0.25


class TargetExamPhase(BaseModel):
    label: str
    weeks: float
    description: str
    focusTopics: List[str] = []
    # Computed server-side from `weeks` once a plan is accepted (day offsets
    # from acceptedAt) - not set by Gemini, filled in by /target-exam/accept.
    startDay: int = 0
    endDay: int = 0


class TopicContractChapter(BaseModel):
    chapter: str
    reason: str


class TopicContractBucket(BaseModel):
    label: str
    weightNote: str
    chapters: List[TopicContractChapter]


class TopicContractSection(BaseModel):
    section: str
    buckets: List[TopicContractBucket]
    unmatched: List[str] = []


class TargetExamPlan(BaseModel):
    phases: List[TargetExamPhase]
    focusDistribution: Dict[str, float]
    dailyHoursEstimate: float
    # Deterministic chapter-allocation contract this plan was built around -
    # see src/topic_contract.py. Empty for sections/exams it couldn't compute
    # one for (falls back to the AI's own judgment there).
    topicContract: List[TopicContractSection] = []


class SectionConfidence(BaseModel):
    section: str
    level: str  # "very_low" | "average" | "excellent"
    diagnosticAccuracy: Optional[float] = None
    chapterAccuracy: Optional[Dict[str, float]] = None
    chapterLevels: Optional[Dict[str, str]] = None


class TargetExamGenerateRequest(BaseModel):
    exam: str
    stage: str
    examDate: str  # ISO date, "2026-12-19"
    # targetCutoff is always the PERCENTAGE of totalMarks (0-100) - every
    # readiness/gap calculation downstream works in percent, since that's
    # also the scale currentAvgAccuracy is already on. totalMarks is purely
    # so the UI can show "62 / 80" instead of a bare, exam-agnostic "62%"
    # (not every exam is out of 100 - RRB Prelims is out of 80, etc.).
    targetCutoff: float
    totalMarks: float = 100
    sectionConfidence: List[SectionConfidence] = []


class TargetExamAcceptRequest(BaseModel):
    exam: str
    stage: str
    examDate: str
    targetCutoff: float
    totalMarks: float = 100
    sectionConfidence: List[SectionConfidence] = []
    plan: TargetExamPlan


class AdaptiveLogEntry(BaseModel):
    date: int
    message: str
    detail: str
    kind: str = "info"  # info | warning | good


class TargetExamTask(BaseModel):
    topic: str
    label: str
    meta: str
    done: bool


class CalendarDay(BaseModel):
    date: str  # "2026-11-07"
    level: str  # "0" | "1" | "2" | "3" | "miss"


class TargetExamState(BaseModel):
    exam: str
    stage: str
    examDate: str
    targetCutoff: float
    totalMarks: float = 100
    sectionConfidence: List[SectionConfidence] = []
    createdAt: int
    acceptedAt: int
    plan: TargetExamPlan
    adaptiveLog: List[AdaptiveLogEntry] = []
    # Computed fresh on every GET, never persisted.
    daysLeft: int
    currentAvgAccuracy: float
    readiness: int
    readinessStatus: str  # "ahead" | "on_track" | "behind"
    streak: int
    currentPhaseIndex: int
    todayTasks: List[TargetExamTask]
    calendar: List[CalendarDay]
    missedDaysThisWeek: int


class TopicResolveRequest(BaseModel):
    topic: str


class TopicCandidate(BaseModel):
    section: str
    chapter: str


class TopicResolveResponse(BaseModel):
    section: Optional[str] = None
    chapter: Optional[str] = None
    source: Optional[str] = None  # "cache" | "ai" - absent when falling back to `candidates`
    candidates: List[TopicCandidate] = []


class TopicConfirmRequest(BaseModel):
    topic: str
    section: str
    chapter: str
