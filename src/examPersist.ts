import type { Paper, QState } from "./types";

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
  monitorTabSwitches: boolean;
}

/** An exit from the exam screen — pause, reload, or closing the tab — is always
 * recoverable from exactly where it left off; the clock never runs while away. */
export function loadInProgress(): { paper: Paper; monitorTabSwitches: boolean; progress: ExamProgress } | null {
  try {
    const paperRaw = localStorage.getItem(PAPER_KEY);
    const progressRaw = localStorage.getItem(PROGRESS_KEY);
    if (!paperRaw || !progressRaw) return null;
    const saved = JSON.parse(paperRaw) as PersistedPaper;
    const progress = JSON.parse(progressRaw) as ExamProgress;
    if (!saved?.paper || !progress) return null;
    return { paper: saved.paper, monitorTabSwitches: saved.monitorTabSwitches, progress };
  } catch {
    return null;
  }
}

export function savePaper(p: PersistedPaper) {
  try {
    localStorage.setItem(PAPER_KEY, JSON.stringify(p));
  } catch { /* storage may be blocked or full */ }
}

export function saveProgress(p: ExamProgress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch { /* storage may be blocked or full */ }
}

export function clearInProgress() {
  try {
    localStorage.removeItem(PAPER_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  } catch { /* ignore */ }
}
