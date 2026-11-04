import type { AttemptRecord } from "./types";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const SESSION_KEY = "pariksha_session";

export interface Session { token: string; email: string }

export function backendEnabled(): boolean {
  return Boolean(API_URL);
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
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
