import { useState } from "react";
import * as api from "../../shared/api";
import Logo from "./Logo";

interface Props {
  onDone: (session: api.Session) => void;
  onBack: () => void;
}

export default function Login({ onDone, onBack }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="authSplit">
      <div className="authPanel">
        <div className="authBrand">
          <span className="authLogoChip"><Logo size={36} /></span>
          <span className="authBrandName">Pariksha</span>
        </div>

        <h2 className="authHeadline">Your prep,<br />wherever you log in.</h2>
        <p className="authSub">One account, any exam, every attempt.</p>

        <ul className="authBenefits">
          <li>Progress tracked across every device</li>
          <li>Any exam &mdash; JEE, NEET, CAT, IBPS and more</li>
          <li>Bring your own paper, any format</li>
        </ul>

        <div className="authPanelFoot">
          <span className="authTagline">Practise &middot; Perform &middot; Pass</span>
        </div>
      </div>

      <div className="authForm">
        <button className="authBack" onClick={onBack}>&larr; Back to Pariksha</button>

        <div className="authTabs">
          <button
            className={`authTab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            className={`authTab ${mode === "signup" ? "active" : ""}`}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <h1 className="authTitle">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="authSubtitle">
          {mode === "login" ? "Log in to pick up right where you left off." : "Takes under a minute, and it's free."}
        </p>

        <label className="fieldLabel" htmlFor="email">EMAIL</label>
        <input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="fieldLabel" htmlFor="password">PASSWORD</label>
        <div className="authPasswordRow">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "at least 8 characters" : ""}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <button type="button" className="authShowBtn" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? "hide" : "show"}
          </button>
        </div>

        {error && <pre className="error">{error}</pre>}

        <button className="btn primary wide" disabled={busy || !email || !password} onClick={submit}>
          {mode === "login" ? "Log in" : "Sign up"}
        </button>

        <p className="authSwitch">
          {mode === "login" ? (
            <>New here? <button className="authLink" onClick={() => setMode("signup")}>Create an account</button></>
          ) : (
            <>Have an account? <button className="authLink" onClick={() => setMode("login")}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
