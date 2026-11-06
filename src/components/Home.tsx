import { useEffect, useRef, useState } from "react";
import { parsePaper } from "../../shared/paper";
import type { AttemptRecord, Paper } from "../../shared/types";
import demoPaper from "../../demo_paper.yml?raw";
import demoPaperJee from "../../demo_paper_jee.yml?raw";
import { aiConversionPrompt } from "../../shared/aiPrompt";
import * as api from "../../shared/api";
import { loadHistory } from "../../shared/history";
import { computeStreak } from "./Sidebar";

interface Props {
  onLoaded: (p: Paper) => void;
  session: api.Session | null;
  onLogin: () => void;
  onPastAttempts: () => void;
}

function stats(history: AttemptRecord[]) {
  const attempts = history.length;
  const accuracies = history.map((h) => h.accuracy).filter((a): a is number => typeof a === "number");
  const bestAccuracy = accuracies.length ? Math.round(Math.max(...accuracies)) : null;
  const exams = new Set(history.map((h) => h.exam || "General")).size;
  return { attempts, bestAccuracy, exams };
}

const RECENT_COLORS = ["c1", "c2", "c3"];

function initialsOf(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "PA";
}

type SourceTab = "upload" | "paste" | "demo";

export default function Home({ onLoaded, session, onLogin, onPastAttempts }: Props) {
  const [error, setError] = useState<string>("");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageFiles, setImageFiles] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [tab, setTab] = useState<SourceTab>("upload");
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);

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

  function scrollToSource(nextTab?: SourceTab) {
    if (nextTab) setTab(nextTab);
    sourceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const { attempts, bestAccuracy, exams } = stats(history ?? []);
  const streak = computeStreak((history ?? []).map((h) => h.when));
  const latest = history && history.length > 0 ? history[0] : null;
  const recent = (history ?? []).slice(0, 3);

  return (
    <div className="home">
      <section className="hm-hero">
        <div className="hm-heroBlob1" />
        <div className="hm-heroBlob2" />
        <div className="hm-heroGrid">
          <div>
            <div className="hm-eyebrow"><i />Ready when you are</div>
            <h1 className="hm-h1">Start a new<br /><span className="hm-g1">mock test</span></h1>
            <p className="hm-lead">Pick a paper from your files, paste one, or use a demo — then sit it exactly like exam day, down to the last detail.</p>

            <div className="hm-ctas">
              <button className="hm-ctaPrimary" onClick={() => scrollToSource()}>Start now &rarr;</button>
              <button className="hm-ctaGhost" onClick={() => scrollToSource("demo")}>Try a demo</button>
            </div>

            {attempts > 0 && (
              <div className="hm-statsRow">
                <div className="hm-statGlass"><b>{attempts}</b><span>Attempts</span></div>
                {bestAccuracy !== null && <div className="hm-statGlass up"><b>{bestAccuracy}%</b><span>Best accuracy</span></div>}
                <div className="hm-statGlass"><b>{exams}</b><span>Exam{exams === 1 ? "" : "s"} covered</span></div>
              </div>
            )}
          </div>

          {latest && (
            <div className="hm-heroVisual">
              <div className="hm-examCardFloat">
                <div className="hm-ecfTop">
                  <span className="hm-ecfTitle">{latest.title.length > 26 ? latest.title.slice(0, 25) + "…" : latest.title}</span>
                  <span className="hm-ecfTimer">net {latest.net.toFixed(2)}</span>
                </div>
                <div className="hm-ecfQ">
                  {latest.accuracy !== undefined ? `${latest.accuracy}% accuracy on your last attempt.` : "Your last attempt is in."}
                  {" "}Keep the streak alive today.
                </div>
                <div className="hm-ecfOpt sel"><i /> {latest.correct} correct</div>
                <div className="hm-ecfOpt"><i /> {latest.wrong} wrong</div>
                <div className="hm-ecfOpt"><i /> {latest.skipped} skipped</div>
              </div>
              {streak > 0 && (
                <div className="hm-floatBadge hm-b1">
                  <span className="hm-floatBadgeIcon hm-green">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <div><b>{streak}-day streak</b><span>keep going</span></div>
                </div>
              )}
              <div className="hm-floatBadge hm-b2">
                <span className="hm-floatBadgeIcon hm-purple">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.2H22l-6 4.4L18 21l-6-4.5L6 21l2-7.4-6-4.4h7.6z" /></svg>
                </span>
                <div><b>Last attempt</b><span>{bestAccuracy !== null ? `${bestAccuracy}% best` : "view report"}</span></div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="hm-sourceWrap" ref={sourceRef}>
        <div className="hm-segmentRow">
          <div className={`hm-segment ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
            Upload file
          </div>
          <div className={`hm-segment ${tab === "paste" ? "active" : ""}`} onClick={() => setTab("paste")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6l5 5v13H4V3z" /></svg>
            Paste text
          </div>
          <div className={`hm-segment ${tab === "demo" ? "active" : ""}`} onClick={() => setTab("demo")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z" /></svg>
            Try a demo
          </div>
        </div>

        <div className="hm-sourceCard">
          {tab === "upload" && (
            <>
              <div className="hm-dropZone">
                <input
                  ref={fileRef}
                  className="dropZoneInput"
                  type="file"
                  accept=".json,.yml,.yaml,.txt"
                  onChange={onFile}
                  aria-label="Choose the paper file"
                />
                <div className="hm-dzIconGlow">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
                </div>
                <h3>Drag your paper here</h3>
                <p>or click to browse your files</p>
                <div className="hm-dzFormats"><span>.json</span><span>.yml</span><span>.txt</span></div>
                <span className="hm-dzBtn">Choose file</span>
                {fileName && <p className="muted small hm-dzFileName">selected: {fileName}</p>}
              </div>

              <div className="hm-dzImagesRow">
                <div className="hm-dzImagesIcon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                </div>
                <div className="hm-dzImagesText">
                  <b>Attach diagram images</b>
                  <span>Only needed if your paper references a filename &middot; optional</span>
                </div>
                <div className="hm-dzImagesBtnWrap">
                  <input className="miniDropInput" id="images" type="file" accept="image/*" multiple onChange={onImages} aria-label="Attach diagram images" />
                  <span className="hm-dzImagesBtn">Choose files</span>
                </div>
              </div>
              {Object.keys(imageFiles).length > 0 && (
                <p className="muted small">attached: {Object.keys(imageFiles).join(", ")}</p>
              )}
            </>
          )}

          {tab === "paste" && (
            <>
              <p className="hm-sourceHint">Paste JSON or YAML directly &mdash; handy for AI-converted text.</p>
              <textarea
                className="hm-pasteArea"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                spellCheck={false}
                placeholder="paste JSON or YAML here..."
              />
              <button className="hm-readBtn" onClick={() => load(pasted)} disabled={!pasted.trim()}>
                Read pasted paper
              </button>
            </>
          )}

          {tab === "demo" && (
            <>
              <p className="hm-sourceHint">Try the app instantly with a ready-made paper.</p>
              <div className="hm-demoGrid">
                <div className="hm-demoCard" onClick={() => loadDemo(demoPaper)}>
                  <span className="hm-demoCardIcon hm-ibps">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" /></svg>
                  </span>
                  <div><b>IBPS RRB demo</b><span>Mixed quant &amp; reasoning</span></div>
                </div>
                <div className="hm-demoCard" onClick={() => loadDemo(demoPaperJee)}>
                  <span className="hm-demoCardIcon hm-jee">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l2.4 7.2H22l-6 4.4L18 21l-6-4.5L6 21l2-7.4-6-4.4h7.6z" /></svg>
                  </span>
                  <div><b>JEE demo</b><span>Physics, chem &amp; maths</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <div className="hm-recentRow">
            <h2>Pick up where you left off</h2>
          </div>
          <div className="hm-recentScroll">
            {recent.map((h, i) => {
              const attempted = h.correct + h.wrong;
              const accuracy = h.accuracy ?? (attempted ? Math.round((h.correct / attempted) * 100) : null);
              return (
                <div className={`hm-recentCard ${RECENT_COLORS[i % RECENT_COLORS.length]}`} key={h.when}>
                  <div className="hm-recentCardTop">
                    <div className="hm-recentIcon">{initialsOf(h.title)}</div>
                    <div className="hm-recentTitle">{h.title}</div>
                  </div>
                  <div className="hm-recentMeta">{h.exam && h.exam !== "General" ? h.exam : "General"} &middot; {new Date(h.when).toLocaleDateString()}</div>
                  <div className="hm-recentScore">{h.net.toFixed(2)} / {h.total}{accuracy !== null ? ` · ${accuracy}% accuracy` : ""}</div>
                  <button className="hm-recentBtn" onClick={onPastAttempts}>View attempt</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <section className="hm-convertBanner">
        <div className="hm-convertLeft">
          <div className="hm-convertStep">&#10024; Step 3</div>
          <h2>Don&rsquo;t have a YAML yet?<br />Convert your own paper</h2>
          <p>
            Have a previous year paper as a PDF, photo, or text? Copy this prompt, paste it into
            ChatGPT, Gemini, or Claude along with your paper, and it will hand back a ready-to-upload
            file &mdash; for any exam, not just the ones above.
          </p>
          <div className="hm-convertAiRow">
            <span className="hm-convertAiChip gpt"><i />ChatGPT</span>
            <span className="hm-convertAiChip gem"><i />Gemini</span>
            <span className="hm-convertAiChip cla"><i />Claude</span>
          </div>
          <div className="hm-convertBtns">
            <button className="hm-convertBtn" onClick={copyPrompt}>
              {copied ? "Copied!" : "Copy prompt + example"}
            </button>
            <button className="hm-convertBtn ghost" onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? "Hide" : "Show"} the prompt
            </button>
          </div>
          {showPrompt && <pre className="promptPreview hm-promptPreview">{aiConversionPrompt}</pre>}
        </div>
        <div className="hm-convertRight">
          <div className="hm-convertRightStep"><span className="hm-convertRightNum">1</span> Copy the prompt we give you</div>
          <div className="hm-convertRightStep"><span className="hm-convertRightNum">2</span> Paste it with your paper into any AI</div>
          <div className="hm-convertRightStep"><span className="hm-convertRightNum">3</span> Upload the file it hands back</div>
        </div>
      </section>

      {error && <pre className="error">{error}</pre>}

      <footer className="homeFoot">
        <div className="tag"><i />Practise &middot; Perform &middot; Pass</div>
        <span className="right">json or yaml</span>
      </footer>
    </div>
  );
}
