import type { ExamSettings, Paper, QState } from "./types";
import { getStorage } from "./storage";

const PAPER_KEY = "exam_app_inprogress_paper";
const PROGRESS_KEY = "exam_app_inprogress_progress";

export interface ExamProgress {
  idx: number;
  states: QState[];
  sectionIdx: number;
  lockedSections: number[];
  tabSwitches: number;
  remaining: number;
  /** True elapsed seconds so far (pause time excluded), overall and within the current section. */
  elapsedBeforePause: number;
  sectionElapsedBeforePause: number;
}

export interface PersistedPaper {
  paper: Paper;
  settings: ExamSettings;
}

/** An exit from the exam screen — pause, reload, or closing the tab — is always
 * recoverable from exactly where it left off; the clock never runs while away. */
export function loadInProgress(): { paper: Paper; settings: ExamSettings; progress: ExamProgress } | null {
  try {
    const paperRaw = getStorage().getItem(PAPER_KEY);
    const progressRaw = getStorage().getItem(PROGRESS_KEY);
    if (!paperRaw || !progressRaw) return null;
    const saved = JSON.parse(paperRaw) as PersistedPaper;
    const progress = JSON.parse(progressRaw) as ExamProgress;
    if (!saved?.paper || !progress) return null;
    return { paper: saved.paper, settings: saved.settings, progress };
  } catch {
    return null;
  }
}

export function savePaper(p: PersistedPaper) {
  try {
    getStorage().setItem(PAPER_KEY, JSON.stringify(p));
  } catch { /* storage may be blocked or full */ }
}

export function saveProgress(p: ExamProgress) {
  try {
    getStorage().setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch { /* storage may be blocked or full */ }
}

export function clearInProgress() {
  try {
    getStorage().removeItem(PAPER_KEY);
    getStorage().removeItem(PROGRESS_KEY);
  } catch { /* ignore */ }
}
