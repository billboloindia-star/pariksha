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
