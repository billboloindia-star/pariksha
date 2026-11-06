import type { AttemptRecord } from "./types";
import * as api from "./api";
import { getStorage } from "./storage";

export const HISTORY_KEY = "exam_app_history";

export function loadLocalHistory(): AttemptRecord[] {
  try {
    return JSON.parse(getStorage().getItem(HISTORY_KEY) || "[]") as AttemptRecord[];
  } catch {
    return [];
  }
}

export function saveLocalHistory(records: AttemptRecord[]): void {
  try {
    getStorage().setItem(HISTORY_KEY, JSON.stringify(records));
  } catch { /* storage may be blocked */ }
}

/** Local history, replaced with the backend's copy when logged in (falls back to local on error). */
export async function loadHistory(): Promise<AttemptRecord[]> {
  const local = loadLocalHistory();
  if (api.backendEnabled() && api.getSession()) {
    try {
      return await api.fetchAttempts();
    } catch {
      return local;
    }
  }
  return local;
}

export function computeStreak(whens: number[]): number {
  if (whens.length === 0) return 0;
  const days = new Set(whens.map((w) => new Date(w).toDateString()));
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
