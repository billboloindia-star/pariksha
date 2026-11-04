import { useRef, useState } from "react";
import { parsePaper } from "../paper";
import type { Paper } from "../types";
import demoPaper from "../../demo_paper.yml?raw";
import demoPaperJee from "../../demo_paper_jee.yml?raw";
import { aiConversionPrompt } from "../aiPrompt";
import * as api from "../api";

interface Props {
  onLoaded: (p: Paper) => void;
  session: api.Session | null;
  onLogin: () => void;
  onLogout: () => void;
}

export default function Home({ onLoaded, session, onLogin, onLogout }: Props) {
  const [error, setError] = useState<string>("");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageFiles, setImageFiles] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function load(text: string) {
    if (api.backendEnabled() && !session) {
      setError("");
      onLogin();
      return;
    }
    const res = parsePaper(text);
    if (res.error || !res.paper) {
      setError(res.error ?? "Could not read that paper.");
      return;
    }
    setError("");
    res.paper.questions.forEach((q) => {
      if (!q.image || /^(https?:|data:)/.test(q.image)) return;
      const match = imageFiles[q.image.toLowerCase()];
      if (match) q.image = match;
    });
    onLoaded(res.paper);
  }

  function onImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => {
        setImageFiles((prev) => ({ ...prev, [f.name.toLowerCase()]: String(rd.result) }));
      };
      rd.readAsDataURL(f);
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const rd = new FileReader();
    rd.onload = () => load(String(rd.result));
    rd.onerror = () => setError("Could not read that file.");
    rd.readAsText(f);
  }

  function loadDemo(text: string) {
    setPasted(text);
    load(text);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiConversionPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy automatically — select and copy the text below by hand.");
      setShowPrompt(true);
    }
  }

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <span className="brandMark">P</span>
          <div>
            <h1>Pariksha</h1>
            <p>Load any exam's paper, write it in timed conditions, then read the analysis.</p>
          </div>
        </div>
        {api.backendEnabled() && (
          <div className="accountRow">
            {session ? (
              <>
                <span className="muted small">Signed in as {session.email}</span>
                <button className="btn" onClick={onLogout}>Log out</button>
              </>
            ) : (
              <button className="btn primary" onClick={onLogin}>Log in / Sign up</button>
            )}
          </div>
        )}
      </header>

      {api.backendEnabled() && !session && (
        <div className="loginHint">
          <span>Log in or sign up to start a mock test — your history will follow your account.</span>
          <button className="btn primary" onClick={onLogin}>Log in / Sign up</button>
        </div>
      )}

      <div className="homeGrid">
        <section className="card">
          <h2>1 · Choose the paper file</h2>
          <p className="muted">A <code>.json</code> or <code>.yml</code> paper, built to the format in <code>paper_format.md</code>.</p>
          <input ref={fileRef} type="file" accept=".json,.yml,.yaml,.txt" onChange={onFile} />
          {fileName && <p className="muted small">selected: {fileName}</p>}

          <label className="fieldLabel imageAttachLabel" htmlFor="images">
            Attach diagram images (optional) — only needed if your paper references a filename
          </label>
          <input id="images" type="file" accept="image/*" multiple onChange={onImages} />
          {Object.keys(imageFiles).length > 0 && (
            <p className="muted small">attached: {Object.keys(imageFiles).join(", ")}</p>
          )}
        </section>

        <section className="card">
          <h2>2 · Or paste the paper</h2>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            placeholder="paste JSON or YAML here..."
          />
          <div className="rowBtns">
            <button className="btn primary" onClick={() => load(pasted)} disabled={!pasted.trim()}>
              Read pasted paper
            </button>
            <button className="btn" onClick={() => loadDemo(demoPaper)}>IBPS RRB demo</button>
            <button className="btn" onClick={() => loadDemo(demoPaperJee)}>JEE demo</button>
          </div>
        </section>
      </div>

      <section className="card promptCard">
        <h2>3 · Don't have a YAML yet? Convert your own paper</h2>
        <p className="muted">
          Have a previous year paper as a PDF, photo, or text? Copy this prompt, paste it into
          ChatGPT, Gemini, or Claude along with your paper, and it will hand back a ready-to-upload
          file — for any exam, not just the ones above.
        </p>
        <div className="rowBtns">
          <button className="btn primary" onClick={copyPrompt}>
            {copied ? "Copied!" : "Copy prompt + example"}
          </button>
          <button className="btn" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "Hide" : "Show"} the prompt
          </button>
        </div>
        {showPrompt && <pre className="promptPreview">{aiConversionPrompt}</pre>}
      </section>

      {error && <pre className="error">{error}</pre>}

      <footer className="homeFoot">
        <span>Practise &middot; Perform &middot; Pass</span>
        <span>json or yaml</span>
      </footer>
    </div>
  );
}
