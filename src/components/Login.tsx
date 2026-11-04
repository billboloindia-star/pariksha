import { useState } from "react";
import * as api from "../api";

interface Props {
  onDone: (session: api.Session) => void;
}

export default function Login({ onDone }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const session = mode === "login" ? await api.login(email, password) : await api.signup(email, password);
      api.setSession(session);
      onDone(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <span className="brandMark">P</span>
          <div>
            <h1>{mode === "login" ? "Log in to Pariksha" : "Create your Pariksha account"}</h1>
            <p>An account is required to start a mock test, so your history stays with you.</p>
          </div>
        </div>
      </header>

      <div className="homeGrid">
        <section className="card">
          <label className="fieldLabel" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label className="fieldLabel" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "at least 8 characters" : ""}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />

          {error && <pre className="error">{error}</pre>}

          <div className="rowBtns">
            <button className="btn primary" disabled={busy || !email || !password} onClick={submit}>
              {mode === "login" ? "Log in" : "Sign up"}
            </button>
            <button className="btn" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
