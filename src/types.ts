export type QType = "num" | "mc";

export interface TableSpec {
  head: string[];
  rows: (string | number)[][];
}

export interface RawQuestion {
  id?: string;
  topic?: string;
  type?: string;
  question?: string;
  text?: string;
  answer?: number | string;
  options?: (string | number)[];
  answer_index?: number;
  table?: TableSpec;
  image?: string;
  solution?: string;
  explanation?: string;
}

export interface RawSection {
  name?: string;
  questions?: RawQuestion[];
}

export interface RawPaper {
  title?: string;
  exam?: string;
  duration_minutes?: number;
  negative_marking?: number;
  sections?: RawSection[];
  questions?: RawQuestion[];
}

export interface Question {
  id: string;
  section: string;
  topic: string;
  type: QType;
  text: string;
  table?: TableSpec;
  image?: string;
  solution?: string;
  options?: string[];
  ans: number;
}

export interface SectionInfo {
  name: string;
  from: number;
  to: number;
  /** optional: this section gets its own clock (minutes). */
  minutes?: number;
}

export interface Paper {
  title: string;
  exam: string;
  durationMinutes: number;
  negativeMarking: number;
  sections: SectionInfo[];
  questions: Question[];
}

export interface QState {
  given: number | null;
  marked: boolean;
  visited: boolean;
  timeMs: number;
}

export type Status = "notVisited" | "notAnswered" | "answered" | "marked" | "answeredMarked";

export function statusOf(q: QState): Status {
  if (q.given !== null && q.marked) return "answeredMarked";
  if (q.marked) return "marked";
  if (q.given !== null) return "answered";
  if (q.visited) return "notAnswered";
  return "notVisited";
}

export interface AttemptRecord {
  when: number;
  title: string;
  net: number;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  secs: number;
  accuracy?: number;
  avgSec?: number;
  byTopic?: Record<string, { ok: number; att: number }>;
  tabSwitches?: number;
  exam?: string;
}

export interface TopicStat {
  n: number;
  att: number;
  ok: number;
  ms: number;
}

export interface ExamResult {
  paper: Paper;
  states: QState[];
  elapsedSec: number;
  correct: number;
  wrong: number;
  skipped: number;
  attempted: number;
  net: number;
  accuracy: number;
  avgSec: number;
  byTopic: Record<string, TopicStat>;
  tabSwitches: number;
}

export interface TopicSummary {
  topic: string;
  attempted: number;
  total: number;
  correct: number;
  avgSec?: number;
}

export interface SlowAnswer {
  question: number;
  topic: string;
  seconds: number;
  correct: boolean;
}

export interface PerformanceInput {
  examTitle: string;
  examCategory: string;
  net: number;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  attempted: number;
  accuracy: number;
  avgSec: number;
  tabSwitches: number;
  topics: TopicSummary[];
  slowest: SlowAnswer[];
}

export interface ReviewPoint {
  title: string;
  detail: string;
}

export interface StudyPlanDay {
  day: string;
  title: string;
  detail: string;
  minutes: number;
}

export interface AiReview {
  summary: string;
  strengths: ReviewPoint[];
  weaknesses: ReviewPoint[];
  plan: StudyPlanDay[];
}

export interface ExamSettings {
  monitorTabSwitches: boolean;
  /** Renders the exam inside a small fixed "monitor" box, scaled up, so you must
   * scroll to see everything — like a real exam-center kiosk display. */
  simulateZoom: boolean;
  /** Replaces the cursor with one that eases toward the real pointer with a lag,
   * for practicing precise clicks on a sluggish exam-center mouse. */
  simulateLaggyCursor: boolean;
}
