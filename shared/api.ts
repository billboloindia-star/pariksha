import type { AttemptRecord, AiReview, LibraryFileLink, LibraryItem, Paper, PerformanceInput } from "./types";
import { getStorage } from "./storage";

const SESSION_KEY = "pariksha_session";

let API_URL: string | undefined;

/** Call once at app startup (web: pass import.meta.env.VITE_API_URL; RN: pass
 * whatever env/config mechanism that platform uses). */
export function configureApi(apiUrl: string | undefined): void {
  API_URL = apiUrl;
}

export interface Session { token: string; email: string }

export function backendEnabled(): boolean {
  return Boolean(API_URL);
}

export function getSession(): Session | null {
  try {
    const raw = getStorage().getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null): void {
  try {
    if (s) getStorage().setItem(SESSION_KEY, JSON.stringify(s));
    else getStorage().removeItem(SESSION_KEY);
  } catch { /* storage may be blocked */ }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error("No backend configured.");
  const session = getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `Request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export function signup(email: string, password: string): Promise<Session> {
  return request<Session>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<Session> {
  return request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function fetchAttempts(): Promise<AttemptRecord[]> {
  return request<AttemptRecord[]>("/attempts");
}

export function saveAttempt(rec: AttemptRecord): Promise<AttemptRecord> {
  return request<AttemptRecord>("/attempts", { method: "POST", body: JSON.stringify(rec) });
}

export function updateQuestionNote(when: number, qIndex: number, note: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/attempts/${when}/questions/${qIndex}/note`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export function analyzePerformance(input: PerformanceInput): Promise<AiReview> {
  return request<AiReview>("/analyze", { method: "POST", body: JSON.stringify(input) });
}

export function fetchLibrary(): Promise<LibraryItem[]> {
  return request<LibraryItem[]>("/library");
}

export interface LibraryUploadFile { fileName: string; fileType: string; fileBase64: string }

export function uploadLibraryFiles(files: LibraryUploadFile[], title?: string): Promise<LibraryItem> {
  return request<LibraryItem>("/library", { method: "POST", body: JSON.stringify({ files, title }) });
}

export function getLibraryFileLinks(itemId: string): Promise<LibraryFileLink[]> {
  return request<LibraryFileLink[]>(`/library/${itemId}/files`);
}

export function saveLibraryPaper(itemId: string, paper: Paper): Promise<LibraryItem> {
  return request<LibraryItem>(`/library/${itemId}`, { method: "PUT", body: JSON.stringify({ paper }) });
}

export function deleteLibraryItem(itemId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/library/${itemId}`, { method: "DELETE" });
}
