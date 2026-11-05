import { useEffect, useRef, useState } from "react";
import { parsePaper } from "../paper";
import type { AttemptRecord, Paper } from "../types";
import demoPaper from "../../demo_paper.yml?raw";
import demoPaperJee from "../../demo_paper_jee.yml?raw";
import { aiConversionPrompt } from "../aiPrompt";
import * as api from "../api";
import { loadHistory } from "../history";
import Marketing from "./Marketing";
import Logo from "./Logo";

interface Props {
  onLoaded: (p: Paper) => void;
  session: api.Session | null;
  onLogin: () => void;
  onLogout: () => void;
  onPastAttempts: () => void;
}

function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function stats(history: AttemptRecord[]) {
  const attempts = history.length;
  const accuracies = history.map((h) => h.accuracy).filter((a): a is number => typeof a === "number");
  const bestAccuracy = accuracies.length ? Math.round(Math.max(...accuracies)) : null;
  const exams = new Set(history.map((h) => h.exam || "General")).size;
  return { attempts, bestAccuracy, exams };
}

export default function Home({ onLoaded, session, onLogin, onLogout, onPastAttempts }: Props) {
  const [error, setError] = useState<string>("");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageFiles, setImageFiles] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

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

  if (api.backendEnabled() && !session) {
    return <Marketing onLogin={onLogin} />;
  }

  const { attempts, bestAccuracy, exams } = stats(history ?? []);

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <Logo size={52} />
          <div>
            <h1>Pariksha</h1>
            <p>Load any exam's paper, write it in timed conditions, then read the analysis.</p>
          </div>
        </div>
        <div className="accountRow">
          <button className="pastBtn" onClick={onPastAttempts}>
            <svg width="15" height="15" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Past attempts
          </button>
          {api.backendEnabled() && session && (
            <>
              <div className="acctPill">
                <span className="acctAvatar">{initials(session.email)}</span>
                <span>{session.email}</span>
              </div>
              <button className="logoutBtn" onClick={onLogout}>Log out</button>
            </>
          )}
        </div>
      </header>

      <div className="heroStrip">
        <div>
          <h1>Start a new<br /><em>mock test</em></h1>
          <p>Pick a paper from your files, paste one, or use a demo — then sit it exactly like exam day.</p>
        </div>
        {attempts > 0 && (
          <div className="statRow">
            <div className="statChip"><b>{attempts}</b><span>Attempts</span></div>
            {bestAccuracy !== null && <div className="statChip"><b>{bestAccuracy}%</b><span>Best accuracy</span></div>}
            <div className="statChip"><b>{exams}</b><span>Exam{exams === 1 ? "" : "s"} covered</span></div>
          </div>
        )}
      </div>

      <div className="homeGrid">
        <section className="card stepCard">
          <div className="stepHead">
            <span className="stepNum">1</span>
            <h2>Choose the paper file</h2>
          </div>
          <p className="sub">A <code>.json</code> or <code>.yml</code> paper, built to the format in <code>paper_format.md</code>.</p>

          <div className="dropZone">
            <input
              ref={fileRef}
              className="dropZoneInput"
              type="file"
              accept=".json,.yml,.yaml,.txt"
              onChange={onFile}
              aria-label="Choose the paper file"
            />
            <span className="dzIcon">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 15V4M12 4l-4 4M12 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            <b>Drag your paper here</b>
            <span>or click to browse &mdash; .json / .yml / .txt</span>
            <div><span className="fileBtn">
              <svg width="13" height="13" viewBox="0 0 24 24"><path d="M12 15V4M12 4l-4 4M12 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Choose file
            </span></div>
            {fileName && <p className="muted small dzFileName">selected: {fileName}</p>}
          </div>

          <div className="imageAttach">
            <div className="lbl">
              <svg width="14" height="14" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Attach diagram images &middot; optional
            </div>
            <div className="miniDrop">
              <input className="miniDropInput" id="images" type="file" accept="image/*" multiple onChange={onImages} aria-label="Attach diagram images" />
              <svg width="18" height="18" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /></svg>
              <span>Only needed if your paper references a filename</span>
              <span className="chooseBtn">Choose files</span>
            </div>
            {Object.keys(imageFiles).length > 0 && (
              <p className="muted small">attached: {Object.keys(imageFiles).join(", ")}</p>
            )}
          </div>
        </section>

        <section className="card stepCard alt">
          <div className="stepHead">
            <span className="stepNum">2</span>
            <h2>Or paste the paper</h2>
          </div>
          <p className="sub">Paste JSON or YAML directly &mdash; handy for AI-converted text.</p>
          <textarea
            className="pasteBox"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            placeholder="paste JSON or YAML here..."
          />
          <div className="rowBtns">
            <button className="btn primary" onClick={() => load(pasted)} disabled={!pasted.trim()}>
              Read pasted paper
            </button>
          </div>
          <div className="demoRow">
            <button className="btn demoChip" onClick={() => loadDemo(demoPaper)}>
              <svg width="13" height="13" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor" /></svg>
              IBPS RRB demo
            </button>
            <button className="btn demoChip" onClick={() => loadDemo(demoPaperJee)}>
              <svg width="13" height="13" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor" /></svg>
              JEE demo
            </button>
          </div>
        </section>
      </div>

      <section className="card promptCard convertCard">
        <div className="grain" />
        <div className="convertTop">
          <span className="convertIcon">
            <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#fff" /></svg>
          </span>
          <div>
            <span>Step 3</span>
            <h2>Don&rsquo;t have a YAML yet? Convert your own paper</h2>
          </div>
        </div>
        <p>
          Have a previous year paper as a PDF, photo, or text? Copy this prompt, paste it into
          ChatGPT, Gemini, or Claude along with your paper, and it will hand back a ready-to-upload
          file &mdash; for any exam, not just the ones above.
        </p>
        <div className="rowBtns">
          <button className="btn primary" onClick={copyPrompt}>
            <svg width="14" height="14" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            {copied ? "Copied!" : "Copy prompt + example"}
          </button>
          <button className="btn" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "Hide" : "Show"} the prompt
          </button>
        </div>
        <div className="convertSteps">
          <div className="convertStep"><b>1</b> Copy the prompt</div>
          <div className="convertStep"><b>2</b> Paste with your paper into any AI chat</div>
          <div className="convertStep"><b>3</b> Upload the file it hands back</div>
        </div>
        {showPrompt && <pre className="promptPreview">{aiConversionPrompt}</pre>}
      </section>

      {error && <pre className="error">{error}</pre>}

      <footer className="homeFoot">
        <div className="tag"><i />Practise &middot; Perform &middot; Pass</div>
        <span className="right">json or yaml</span>
      </footer>
    </div>
  );
}
