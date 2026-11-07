import { useEffect, useMemo, useState } from "react";
import type {
  BankSectionSummary,
  ConfidenceLevel,
  Paper,
  SectionConfidence,
  TargetExamName,
  TargetExamPlan,
  TargetExamStage,
  TargetExamState,
} from "../../shared/types";
import * as api from "../../shared/api";
import Spinner from "./Spinner";
import DatePicker from "./DatePicker";

interface Props {
  onPracticeTopic: (section: string, chapter: string) => void;
}

const EXAMS: { name: TargetExamName; label: string; desc: string; gradient: string }[] = [
  { name: "IBPS PO", label: "IBPS PO", desc: "Probationary Officer · Public Sector Banks", gradient: "linear-gradient(135deg,#1a73c7,#12395f)" },
  { name: "SBI PO", label: "SBI PO", desc: "Probationary Officer · State Bank of India", gradient: "linear-gradient(135deg,#6f42c1,#4a2a8a)" },
  { name: "IBPS Clerk", label: "IBPS Clerk", desc: "Clerk · Public Sector Banks", gradient: "linear-gradient(135deg,#2f8f4e,#1e6b3a)" },
  { name: "SBI Clerk", label: "SBI Clerk", desc: "Junior Associate · State Bank of India", gradient: "linear-gradient(135deg,#b4740e,#8a5b12)" },
  { name: "RRB PO", label: "RRB PO", desc: "Officer Scale I · Regional Rural Banks", gradient: "linear-gradient(135deg,#1a9b8f,#0e6a61)" },
  { name: "RRB Clerk", label: "RRB Clerk", desc: "Office Assistant · Regional Rural Banks", gradient: "linear-gradient(135deg,#c0392b,#8a2a1f)" },
];

const GEN_STEPS = [
  "Reading your recent attempts",
  "Mapping weak topics against your question bank",
  "Calculating days-to-exam vs target cutoff gap",
  "Drafting phased study plan",
];

const FOCUS_COLORS: Record<string, string> = {
  Reasoning: "#6f42c1",
  Quant: "#1a73c7",
  "Mock tests": "#2f8f4e",
  English: "#b4740e",
};
const FOCUS_FALLBACK = ["#1a73c7", "#6f42c1", "#2f8f4e", "#b4740e", "#c0392b"];

// Approximate Prelims/Mains totals per exam - not every exam shares
// IBPS/SBI's 100-mark Prelims (RRB's is out of 80). These are just a
// sensible starting point; the field stays editable since exact totals
// can shift year to year.
const DEFAULT_TOTAL_MARKS: Record<TargetExamName, { prelims: number; mains: number }> = {
  "IBPS PO": { prelims: 100, mains: 200 },
  "SBI PO": { prelims: 100, mains: 250 },
  "IBPS Clerk": { prelims: 100, mains: 200 },
  "SBI Clerk": { prelims: 100, mains: 200 },
  "RRB PO": { prelims: 80, mains: 200 },
  "RRB Clerk": { prelims: 80, mains: 200 },
};

function defaultTotalMarks(exam: TargetExamName | null, stage: TargetExamStage): number {
  if (!exam) return 100;
  const t = DEFAULT_TOTAL_MARKS[exam];
  return stage === "prelims" ? t.prelims : t.mains;
}

const LEVEL_META: Record<ConfidenceLevel, { label: string; color: string }> = {
  very_low: { label: "Very low", color: "#c0392b" },
  average: { label: "Average", color: "#b4740e" },
  excellent: { label: "Excellent", color: "#2f8f4e" },
};

function levelFromAccuracy(accuracy: number): ConfidenceLevel {
  if (accuracy < 40) return "very_low";
  if (accuracy < 70) return "average";
  return "excellent";
}

/** Strips a topic bucket's trailing parenthetical hint ("Arithmetic
 * (Average/Ratio/...)" -> "Arithmetic") - the real chapters are already
 * shown as chips below it, so the generic hint list is redundant clutter. */
function bucketLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function TargetExam({ onPracticeTopic }: Props) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<TargetExamState | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);

  // ---- wizard state ----
  const [step, setStep] = useState(1);
  const [selectedExam, setSelectedExam] = useState<TargetExamName | null>(null);
  const [stage, setStage] = useState<TargetExamStage>("prelims");
  const [examDate, setExamDate] = useState("");
  const [totalMarks, setTotalMarks] = useState(100);
  const [cutoffMarks, setCutoffMarks] = useState(75);
  const [genStepIndex, setGenStepIndex] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState<TargetExamPlan | null>(null);
  const [genError, setGenError] = useState("");
  const [accepting, setAccepting] = useState(false);

  // ---- starting-point self-assessment (step 3) ----
  const [sectionLevels, setSectionLevels] = useState<Record<string, ConfidenceLevel>>({});
  const [diagnosticAccuracy, setDiagnosticAccuracy] = useState<Record<string, number>>({});
  const [diagnosticChapterAccuracy, setDiagnosticChapterAccuracy] = useState<Record<string, Record<string, number>>>({});
  const [diagnosticSection, setDiagnosticSection] = useState<string | null>(null);
  const [diagnosticPaper, setDiagnosticPaper] = useState<Paper | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, number>>({});
  const [diagnosticScore, setDiagnosticScore] = useState<{ correct: number; total: number } | null>(null);
  const [chapterLevels, setChapterLevels] = useState<Record<string, Record<string, ConfidenceLevel>>>({});
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    const def = defaultTotalMarks(selectedExam, stage);
    setTotalMarks(def);
    setCutoffMarks(Math.round(def * 0.75));
  }, [selectedExam, stage]);

  const sectionNames = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const s of bankSections ?? []) {
      if (!seen.has(s.section)) { seen.add(s.section); order.push(s.section); }
    }
    return order;
  }, [bankSections]);

  const chaptersBySection = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of bankSections ?? []) (m[s.section] ??= []).push(s.chapter);
    return m;
  }, [bankSections]);

  useEffect(() => {
    setSectionLevels((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of sectionNames) {
        if (!(s in next)) { next[s] = "average"; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [sectionNames]);

  useEffect(() => {
    api.fetchTargetExam()
      .then((s) => setState(s))
      .catch(() => setState(null))
      .finally(() => setLoading(false));
    api.fetchBankSections().then(setBankSections).catch(() => {});
  }, []);

  const chapterToSection = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of bankSections ?? []) m[s.chapter] = s.section;
    return m;
  }, [bankSections]);

  const focusTopicsBySection = useMemo(() => {
    if (!generatedPlan) return [];
    const map: Record<string, Set<string>> = {};
    for (const p of generatedPlan.phases) {
      for (const t of p.focusTopics) {
        const section = chapterToSection[t] ?? "Other";
        (map[section] ??= new Set()).add(t);
      }
    }
    return Object.entries(map)
      .map(([section, topics]) => ({ section, topics: Array.from(topics) }))
      .sort((a, b) => b.topics.length - a.topics.length);
  }, [generatedPlan, chapterToSection]);

  function startTopic(topic: string) {
    const section = chapterToSection[topic];
    if (section) onPracticeTopic(section, topic);
  }

  function quickDate(weeks: number) {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    setExamDate(d.toISOString().split("T")[0]);
  }

  async function startDiagnostic(section: string) {
    setDiagnosticError("");
    setDiagnosticScore(null);
    setDiagnosticAnswers({});
    setDiagnosticLoading(true);
    setDiagnosticSection(section);
    try {
      const chapters = chaptersBySection[section] ?? [];
      // aim for ~2 questions per chapter (capped) so the per-chapter accuracy
      // breakdown below is actually meaningful, not just 0-or-1 samples.
      const count = Math.max(10, Math.min(20, chapters.length * 2));
      const paper = await api.generatePracticePaper({ section, chapters, count, durationMinutes: 10 });
      setDiagnosticPaper(paper);
    } catch (err) {
      setDiagnosticError(err instanceof Error ? err.message : "Couldn't load the quiz — try again.");
    } finally {
      setDiagnosticLoading(false);
    }
  }

  function closeDiagnostic() {
    setDiagnosticSection(null);
    setDiagnosticPaper(null);
    setDiagnosticAnswers({});
    setDiagnosticScore(null);
  }

  function submitDiagnostic() {
    if (!diagnosticPaper || !diagnosticSection) return;
    let correct = 0;
    const byChapter: Record<string, { ok: number; att: number }> = {};
    for (const q of diagnosticPaper.questions) {
      const ok = diagnosticAnswers[q.id] === q.ans;
      if (ok) correct++;
      const bucket = (byChapter[q.topic] ??= { ok: 0, att: 0 });
      bucket.att++;
      if (ok) bucket.ok++;
    }
    const total = diagnosticPaper.questions.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const chapterAccuracy: Record<string, number> = {};
    for (const [chapter, { ok, att }] of Object.entries(byChapter)) {
      chapterAccuracy[chapter] = Math.round((ok / att) * 100);
    }
    setSectionLevels((prev) => ({ ...prev, [diagnosticSection]: levelFromAccuracy(accuracy) }));
    setDiagnosticAccuracy((prev) => ({ ...prev, [diagnosticSection]: accuracy }));
    setDiagnosticChapterAccuracy((prev) => ({ ...prev, [diagnosticSection]: chapterAccuracy }));
    setDiagnosticScore({ correct, total });
  }

  function buildSectionConfidence(): SectionConfidence[] {
    return sectionNames.map((s) => ({
      section: s,
      level: sectionLevels[s] ?? "average",
      diagnosticAccuracy: diagnosticAccuracy[s],
      chapterAccuracy: diagnosticChapterAccuracy[s],
      // only send manual chapter ratings when no measured diagnostic exists
      // for this section - a real score always wins over a guess.
      chapterLevels: diagnosticChapterAccuracy[s] ? undefined : chapterLevels[s],
    }));
  }

  async function generate() {
    if (!selectedExam || !examDate) return;
    setStep(4);
    setGenError("");
    setGenStepIndex(0);
    const timer = setInterval(() => {
      setGenStepIndex((i) => Math.min(GEN_STEPS.length - 1, i + 1));
    }, 650);
    const targetCutoffPercent = Math.round((cutoffMarks / totalMarks) * 100);
    try {
      const plan = await api.generateTargetExamPlan({
        exam: selectedExam, stage, examDate, targetCutoff: targetCutoffPercent, totalMarks,
        sectionConfidence: buildSectionConfidence(),
      });
      clearInterval(timer);
      setGeneratedPlan(plan);
      setGenStepIndex(GEN_STEPS.length);
      setTimeout(() => setStep(5), 400);
    } catch (err) {
      clearInterval(timer);
      setGenError(err instanceof Error ? err.message : "Couldn't generate a plan — try again.");
    }
  }

  async function accept() {
    if (!selectedExam || !examDate || !generatedPlan) return;
    setAccepting(true);
    const targetCutoffPercent = Math.round((cutoffMarks / totalMarks) * 100);
    try {
      const s = await api.acceptTargetExamPlan({
        exam: selectedExam, stage, examDate, targetCutoff: targetCutoffPercent, totalMarks,
        sectionConfidence: buildSectionConfidence(), plan: generatedPlan,
      });
      setState(s);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Couldn't save your plan — try again.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="home"><div className="loadingBlock"><Spinner size={18} label="Loading your plan…" /></div></div>;
  }

  if (state) {
    return <TargetExamDashboard state={state} onStartTopic={startTopic} onRefresh={() => api.fetchTargetExam().then(setState)} />;
  }

  // ======================= SETUP WIZARD =======================
  return (
    <div className="home">
      <div className="texStepRow">
        {[1, 2, 3, 4].map((n) => {
          const displayStep = step >= 4 ? 4 : step;
          const label = n === 1 ? "Exam" : n === 2 ? "Target" : n === 3 ? "Starting point" : "Your plan";
          return (
            <div key={n} style={{ display: "flex", alignItems: "center" }}>
              <div className={`texStepItem ${displayStep === n ? "active" : ""} ${displayStep > n ? "done" : ""}`}>
                <span className="texStepDot">{displayStep > n ? "✓" : n}</span>
                <span className="texStepLabel">{label}</span>
              </div>
              {n < 4 && <div className={`texStepLine ${displayStep > n ? "done" : ""}`} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="texPanel">
          <div className="texHeading">
            <h1>Which exam are you targeting?</h1>
            <p>We'll tailor your plan, countdown, and readiness score around this exam.</p>
          </div>
          <div className="texExamGrid">
            {EXAMS.map((e) => (
              <button
                key={e.name}
                className={`texExamCard ${selectedExam === e.name ? "selected" : ""}`}
                onClick={() => setSelectedExam(e.name)}
              >
                <div className="texExamBadge" style={{ background: e.gradient }}>
                  {e.name.includes("Clerk") ? "CL" : "PO"}
                </div>
                <div className="texExamName">{e.label}</div>
                <div className="texExamDesc">{e.desc}</div>
              </button>
            ))}
          </div>
          <div className="texFoot">
            <button className="btn primary" disabled={!selectedExam} onClick={() => setStep(2)}>Continue →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="texPanel">
          <div className="texHeading">
            <h1>Set your target</h1>
            <p>Your exam date and target score shape how aggressive the plan needs to be.</p>
          </div>
          <div className="texCard">
            <div className="texField">
              <div className="texFieldLabel">Exam stage</div>
              <p className="texFieldHint">Prelims is objective-only and comes first; Mains adds further rounds.</p>
              <div className="texToggleRow">
                {(["prelims", "mains", "both"] as TargetExamStage[]).map((s) => (
                  <button key={s} className={`texToggleBtn ${stage === s ? "active" : ""}`} onClick={() => setStage(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="texField">
              <div className="texFieldLabel">When is your exam?</div>
              <p className="texFieldHint">Don't know the exact date yet? Pick a typical window — we'll adjust once it's announced.</p>
              <DatePicker value={examDate} onChange={setExamDate} placeholder="Pick your exam date" />
              <div className="texQuickRow">
                {[6, 10, 16].map((w) => (
                  <button key={w} className="texQuickBtn" onClick={() => quickDate(w)}>{w} weeks away</button>
                ))}
              </div>
            </div>

            <div className="texField">
              <div className="texFieldLabel">Total marks</div>
              <input
                type="number"
                className="texMarksInput"
                min={1}
                value={totalMarks}
                onChange={(e) => {
                  const next = Math.max(1, Number(e.target.value) || 1);
                  setTotalMarks(next);
                  setCutoffMarks((c) => Math.min(c, next));
                }}
              />
            </div>

            <div className="texField mvSliderField" style={{ border: "none", padding: 0 }}>
              <div className="mvSliderHead">
                <span className="lb">Target cutoff</span>
                <span className="val">{cutoffMarks}<span> / {totalMarks} &middot; {Math.round((cutoffMarks / totalMarks) * 100)}%</span></span>
              </div>
              <p className="texFieldHint" style={{ marginTop: -4 }}>Your best estimate of what you'll need to clear this exam.</p>
              <input
                type="range"
                min={Math.round(totalMarks * 0.3)}
                max={Math.round(totalMarks * 0.95)}
                value={cutoffMarks}
                onChange={(e) => setCutoffMarks(Number(e.target.value))}
              />
              <div className="mvRangeHint"><span>{Math.round(totalMarks * 0.3)}</span><span>{Math.round(totalMarks * 0.95)}</span></div>
            </div>
          </div>
          <div className="texFoot">
            <button className="btn" onClick={() => setStep(1)}>← Back</button>
            <button className="btn primary" disabled={!examDate} onClick={() => setStep(3)}>Continue →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="texPanel">
          <div className="texHeading">
            <h1>How much do you already know?</h1>
            <p>Rate each section, or take a quick diagnostic and let your answers decide — your plan weighs this heavily when you have little or no practice history yet.</p>
          </div>
          <div className="texCard">
            {sectionNames.length === 0 ? (
              <p className="texFieldHint">No bank sections found yet — the plan will lean on attempt history alone.</p>
            ) : (
              sectionNames.map((s) => {
                const level = sectionLevels[s] ?? "average";
                const accuracy = diagnosticAccuracy[s];
                const hasDiagnostic = accuracy !== undefined;
                const chapters = chaptersBySection[s] ?? [];
                const sectionChapterLevels = chapterLevels[s] ?? {};
                const ratedChapterCount = Object.keys(sectionChapterLevels).length;
                const expanded = expandedSection === s;
                return (
                  <div key={s} className="texConfRow">
                    <div className="texConfTop">
                      <span className="texConfName">{s}</span>
                      {hasDiagnostic && (
                        <span className="texConfDiagBadge">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l9-12.5H12.5L13 2z" /></svg>
                          Diagnostic-calibrated · {accuracy}%
                        </span>
                      )}
                    </div>
                    <div className="texConfBody">
                      <div className="texLevelRow">
                        {(["very_low", "average", "excellent"] as ConfidenceLevel[]).map((lv) => (
                          <button
                            key={lv}
                            className={`texLevelBtn ${level === lv ? "active" : ""}`}
                            style={level === lv ? { borderColor: LEVEL_META[lv].color, color: LEVEL_META[lv].color, background: `${LEVEL_META[lv].color}14` } : undefined}
                            onClick={() => setSectionLevels((prev) => ({ ...prev, [s]: lv }))}
                          >
                            {LEVEL_META[lv].label}
                          </button>
                        ))}
                      </div>
                      <button className="texDiagBtn" onClick={() => startDiagnostic(s)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l9-12.5H12.5L13 2z" /></svg>
                        {hasDiagnostic ? "Retake diagnostic" : "Quick diagnostic"}
                      </button>
                    </div>

                    {chapters.length > 0 && !hasDiagnostic && (
                      <button
                        className="texChapterToggle"
                        onClick={() => setExpandedSection(expanded ? null : s)}
                      >
                        <svg className={`texChapterChevron ${expanded ? "open" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        {ratedChapterCount > 0 ? `${ratedChapterCount} of ${chapters.length} chapters rated individually` : `Rate individual chapters instead →`}
                      </button>
                    )}

                    {expanded && chapters.length > 0 && (
                      <div className="texChapterList">
                        {chapters.map((c) => {
                          const cLevel = sectionChapterLevels[c];
                          return (
                            <div key={c} className="texChapterRow">
                              <span className="texChapterName">{c}</span>
                              <div className="texLevelRow sm">
                                {(["very_low", "average", "excellent"] as ConfidenceLevel[]).map((lv) => (
                                  <button
                                    key={lv}
                                    className={`texLevelBtn sm ${cLevel === lv ? "active" : ""}`}
                                    style={cLevel === lv ? { borderColor: LEVEL_META[lv].color, color: LEVEL_META[lv].color, background: `${LEVEL_META[lv].color}14` } : undefined}
                                    onClick={() => setChapterLevels((prev) => ({
                                      ...prev,
                                      [s]: { ...prev[s], [c]: lv },
                                    }))}
                                  >
                                    {LEVEL_META[lv].label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="texFoot">
            <button className="btn" onClick={() => setStep(2)}>← Back</button>
            <button className="btn primary" onClick={generate}>Generate my plan →</button>
          </div>
        </div>
      )}

      {diagnosticSection && (
        <div className="modalWrap" onClick={closeDiagnostic}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="texDiagTitle">Quick diagnostic — {diagnosticSection}</h2>
            {diagnosticLoading ? (
              <div className="loadingBlock"><Spinner size={18} label="Building your quiz…" /></div>
            ) : diagnosticError ? (
              <>
                <p className="error">{diagnosticError}</p>
                <div className="texFoot">
                  <button className="btn" onClick={closeDiagnostic}>Close</button>
                  <button className="btn primary" onClick={() => startDiagnostic(diagnosticSection)}>Try again</button>
                </div>
              </>
            ) : diagnosticScore ? (
              <>
                <div className="texDiagResult">
                  <div className="texDiagScore">{diagnosticScore.correct}/{diagnosticScore.total}</div>
                  <div className="texDiagScorePct">{Math.round((diagnosticScore.correct / Math.max(1, diagnosticScore.total)) * 100)}% accuracy</div>
                  <p>We've set <b>{diagnosticSection}</b> to "{LEVEL_META[levelFromAccuracy(Math.round((diagnosticScore.correct / Math.max(1, diagnosticScore.total)) * 100))].label}" based on this — you can still override it manually.</p>
                </div>
                {diagnosticChapterAccuracy[diagnosticSection] && (
                  <div className="texDiagChapterBreakdown">
                    <div className="texFieldLabel" style={{ marginBottom: 2 }}>Chapter-by-chapter, from this quiz</div>
                    <p className="texFieldHint">This is what actually drives which {diagnosticSection} chapters your plan focuses on — not just the overall score above.</p>
                    {Object.entries(diagnosticChapterAccuracy[diagnosticSection])
                      .sort((a, b) => a[1] - b[1])
                      .map(([chapter, acc]) => (
                        <div key={chapter} className="texDiagChapterRow">
                          <span className="texDiagChapterName">{chapter}</span>
                          <span className="texDiagChapterTrack"><span className="texDiagChapterFill" style={{ width: `${acc}%`, background: LEVEL_META[levelFromAccuracy(acc)].color }} /></span>
                          <span className="texDiagChapterPct" style={{ color: LEVEL_META[levelFromAccuracy(acc)].color }}>{acc}%</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="texFoot">
                  <button className="btn primary" onClick={closeDiagnostic}>Done</button>
                </div>
              </>
            ) : diagnosticPaper ? (
              <>
                <p className="texFieldHint">{diagnosticPaper.questions.length} questions, no timer — answer as best you can.</p>
                <div className="texDiagQList">
                  {diagnosticPaper.questions.map((q, qi) => (
                    <div key={q.id} className="texDiagQ">
                      <div className="texDiagQText"><b>{qi + 1}.</b> {q.text}</div>
                      <div className="texDiagOpts">
                        {(q.options ?? []).map((opt, oi) => (
                          <button
                            key={oi}
                            className={`texDiagOpt ${diagnosticAnswers[q.id] === oi ? "active" : ""}`}
                            onClick={() => setDiagnosticAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="texFoot">
                  <button className="btn" onClick={closeDiagnostic}>Cancel</button>
                  <button
                    className="btn primary"
                    disabled={Object.keys(diagnosticAnswers).length < diagnosticPaper.questions.length}
                    onClick={submitDiagnostic}
                  >
                    Submit diagnostic
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="texGenWrap">
          <div className="texGenRing">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" fill="none" stroke="#e2ebf5" strokeWidth="7" />
              <circle cx="44" cy="44" r="38" fill="none" stroke="#1a73c7" strokeWidth="7" strokeLinecap="round" strokeDasharray="180 240" className="texSpin" />
            </svg>
          </div>
          <h2 className="texGenTitle">Building your {selectedExam} plan…</h2>
          <p className="texGenSub">Gemini is cross-referencing your topic accuracy and question bank coverage to build a plan that targets your actual weak spots.</p>
          {genError ? (
            <>
              <p className="error">{genError}</p>
              <button className="btn primary" onClick={generate}>Try again</button>
            </>
          ) : (
            <div className="texGenSteps">
              {GEN_STEPS.map((label, i) => (
                <div key={label} className={`texGenStep ${i === genStepIndex ? "active" : ""} ${i < genStepIndex ? "done" : ""}`}>
                  <span>{i < genStepIndex ? "●" : i === genStepIndex ? "◉" : "○"}</span>{label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 5 && generatedPlan && selectedExam && (
        <div className="texPanel">
          <div className="texPlanHero">
            <div className="texBlob" />
            <div className="texPlanEyebrow">Your personalized plan</div>
            <h1 className="texPlanTitle">{selectedExam} — {stage[0].toUpperCase() + stage.slice(1)}</h1>
            <div className="texPlanStats">
              <div className="texPlanStat"><b>{Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000))}</b><span>Days left</span></div>
              <div className="texPlanStat"><b>~{generatedPlan.dailyHoursEstimate}h</b><span>Daily target</span></div>
              <div className="texPlanStat"><b>{cutoffMarks}/{totalMarks}</b><span>Target cutoff</span></div>
            </div>
          </div>

          <div className="texCard">
            {generatedPlan.topicContract?.length ? (
              <>
                <h2 className="texCardH2">Your topic contract</h2>
                <p className="texCardSub">
                  Built from {selectedExam}'s real exam pattern and your own weak-topic / confidence state — this is
                  exactly what the plan below is based on.
                </p>
                <div className="texContractGroups">
                  {generatedPlan.topicContract.map((sec, i) => {
                    const accent = FOCUS_COLORS[sec.section] ?? FOCUS_FALLBACK[i % FOCUS_FALLBACK.length];
                    const maxWeight = Math.max(1, ...sec.buckets.map((b) => b.weightCount));
                    return (
                      <div key={sec.section} className="texContractSection">
                        <div className="texFocusGroupHead">
                          <span className="texFocusGroupDot" style={{ background: accent }} />
                          <span className="texFocusGroupName">{sec.section}</span>
                          <span className="texContractSectionNote">
                            — a real {sec.section} paper has {sec.buckets[0]?.sectionTotal ?? "?"} questions; the numbers below are how many typically come from each topic
                          </span>
                        </div>
                        {sec.buckets.map((b) => (
                          <div key={b.label} className="texContractBucket">
                            <div className="texContractBucketHead">
                              <span className="texContractBucketLabel" title={b.weightNote}>{bucketLabel(b.label)}</span>
                              <span className="texContractBucketBadge" title={b.weightNote}>~{Math.round(b.weightCount)} of {b.sectionTotal} Qs</span>
                            </div>
                            <div className="texContractBar">
                              <span className="texContractBarFill" style={{ width: `${(b.weightCount / maxWeight) * 100}%`, background: accent }} />
                            </div>
                            <div className="texFocusChips">
                              {b.chapters.map((c) => (
                                <span key={c.chapter} className="texFocusChip" title={c.reason}>{c.chapter}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className="texCardH2">What you'll actually practice</h2>
                <p className="texCardSub">Every real topic this plan covers, grouped by section — not an abstract percentage split.</p>
                {focusTopicsBySection.length === 0 ? (
                  <p className="texFieldHint">This plan is revision + mocks only — no new topics to list.</p>
                ) : (
                  <div className="texFocusGroups">
                    {focusTopicsBySection.map(({ section, topics }, i) => (
                      <div key={section} className="texFocusGroup">
                        <div className="texFocusGroupHead">
                          <span className="texFocusGroupDot" style={{ background: FOCUS_COLORS[section] ?? FOCUS_FALLBACK[i % FOCUS_FALLBACK.length] }} />
                          <span className="texFocusGroupName">{section}</span>
                          <span className="texFocusGroupCount">{topics.length} topic{topics.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="texFocusChips">
                          {topics.map((t) => <span key={t} className="texFocusChip">{t}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="texCard">
            <h2 className="texCardH2">Your {Math.round(generatedPlan.phases.reduce((s, p) => s + p.weeks, 0))}-week path</h2>
            <div className="texPhaseTimeline">
              {generatedPlan.phases.map((p, i) => (
                <div key={i} className={`texPhaseItem ${i === 0 ? "current" : ""}`}>
                  <span className="texPhaseDot" />
                  <div className="texPhaseWhen">Week {Math.round(p.startDay / 7) + 1}–{Math.round(p.endDay / 7)}{i === 0 ? " · now" : ""}</div>
                  <div className="texPhaseName">{p.label}{i === 0 && <span className="texPhaseTag">You are here</span>}</div>
                  <div className="texPhaseDesc">{p.description}</div>
                </div>
              ))}
            </div>
          </div>

          {genError && <p className="error">{genError}</p>}
          <div className="texFoot">
            <button className="btn" onClick={generate}>↺ Regenerate</button>
            <button className="btn primary lg" disabled={accepting} onClick={accept}>
              {accepting ? "Saving…" : "Accept & start tracking →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= ONGOING DASHBOARD =======================

function readinessColor(status: TargetExamState["readinessStatus"]): string {
  return status === "ahead" ? "#4fd18b" : status === "behind" ? "#ffb0b0" : "#ffd98a";
}

function DashboardTooltip({ label }: { label: string }) {
  return <span className="texTt">{label}</span>;
}

function TargetExamDashboard({
  state,
  onStartTopic,
  onRefresh,
}: {
  state: TargetExamState;
  onStartTopic: (topic: string) => void;
  onRefresh: () => void;
}) {
  const [tasksDoneLocal, setTasksDoneLocal] = useState<Set<string>>(new Set());
  const [calTip, setCalTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const ring = useMemo(() => {
    const r = 44;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, state.readiness));
    return { c, offset: c - (pct / 100) * c };
  }, [state.readiness]);

  const doneCount = state.todayTasks.filter((t) => t.done || tasksDoneLocal.has(t.topic)).length;
  const totalTasks = Math.max(1, state.todayTasks.length);

  const currentPhase = state.plan.phases[state.currentPhaseIndex];
  const gap = Math.round(state.targetCutoff - state.currentAvgAccuracy);
  const targetCutoffMarks = Math.round((state.targetCutoff / 100) * state.totalMarks);

  const showWarning = state.missedDaysThisWeek >= 2;

  function calLabel(day: typeof state.calendar[number]): string {
    if (day.level === "miss") return "Missed — no study logged";
    if (day.level === "0") return "No activity";
    if (day.level === "1") return "Partial — a little practice";
    if (day.level === "2") return "Mostly done";
    return "Full day completed";
  }

  return (
    <div className="home pgWide">
      {showWarning && (
        <div className="texWarnBanner">
          <span className="texWarnIcon">⚠️</span>
          <div className="texWarnBody">
            <b>You've missed {state.missedDaysThisWeek} days this week</b>
            <span>{state.daysLeft} days left — a short gap now is recoverable, a longer one isn't.</span>
          </div>
          <div className="texWarnBtns">
            <button className="texWarnBtn primary" onClick={() => currentPhase?.focusTopics[0] && onStartTopic(currentPhase.focusTopics[0])}>Catch up now →</button>
          </div>
        </div>
      )}

      <div className="texHero">
        <div className="texBlob" style={{ background: "#38bdf8" }} />
        <div className="texHeroPill"><i />Target Exam — tracking since {new Date(state.acceptedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
        <div className="texHeroGrid">
          <div>
            <div className="texHeroNameRow"><b>{state.exam}</b><span className="texStageTag">{state.stage}</span></div>
            <div className="texCountdown">{state.daysLeft}<small>days left</small></div>
            <div className="texCountdownSub">Exam date: {fmtDate(state.examDate)}</div>
          </div>

          <div className="texReadyWrap">
            <div className="texReadyRing">
              <svg width="104" height="104" viewBox="0 0 104 104">
                <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="10" />
                <circle cx="52" cy="52" r="44" fill="none" stroke={readinessColor(state.readinessStatus)} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={ring.c} strokeDashoffset={ring.offset} transform="rotate(-90 52 52)" />
              </svg>
              <div className="texReadyRingLabel"><b>{state.readiness}%</b><span>Ready</span></div>
            </div>
            <div>
              <div className="texReadyStatus" style={{ color: readinessColor(state.readinessStatus) }}>
                {state.readinessStatus === "ahead" ? "✓ Ahead of pace" : state.readinessStatus === "behind" ? "⚠ Behind pace" : "On track"}
              </div>
              <div className="texReadyDesc">
                You're averaging {state.currentAvgAccuracy}% accuracy against a {state.targetCutoff}% target
                {state.totalMarks !== 100 ? ` (${targetCutoffMarks}/${state.totalMarks} marks)` : ""}.
              </div>
            </div>
          </div>

          <div className="texGapRow">
            <div className="texGapStat"><b>{state.currentAvgAccuracy}%</b><span>Current avg</span></div>
            <div className="texGapStat"><b>{targetCutoffMarks}/{state.totalMarks}</b><span>Target cutoff</span></div>
            <div className="texGapStat warn"><b>{gap > 0 ? `-${gap}` : `+${-gap}`}</b><span>Gap to close</span></div>
          </div>
        </div>
      </div>

      <div className="texMainGrid">
        <div className="card">
          <div className="texCardHead">
            <span className="texCardTitle">📋 Today's plan</span>
            <span className="texCardSub">{currentPhase?.label ?? "—"}</span>
          </div>
          {state.todayTasks.length === 0 ? (
            <p className="muted small">Nothing scheduled today — this phase is light revision only.</p>
          ) : (
            <div>
              {state.todayTasks.map((t) => {
                const done = t.done || tasksDoneLocal.has(t.topic);
                return (
                  <div key={t.topic} className={`texTaskRow ${done ? "done" : ""}`}>
                    <span
                      className={`texTaskCheck ${done ? "done" : ""}`}
                      onClick={() => setTasksDoneLocal((prev) => { const n = new Set(prev); if (n.has(t.topic)) n.delete(t.topic); else n.add(t.topic); return n; })}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <div className="texTaskBody">
                      <div className="texTaskName">{t.topic}</div>
                      <div className="texTaskMeta">{t.meta}</div>
                    </div>
                    {!done && <button className="texTaskGo" onClick={() => onStartTopic(t.topic)}>Start →</button>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="texTaskProgress">
            <span className="texTaskProgressTrack"><span className="texTaskProgressFill" style={{ width: `${(doneCount / totalTasks) * 100}%` }} /></span>
            <span className="texTaskProgressLbl">{doneCount} / {state.todayTasks.length} done</span>
          </div>
        </div>

        <div className="card">
          <div className="texCardHead">
            <span className="texCardTitle">📅 Consistency</span>
            <div className="texCalLegend">
              <span className="texLegDot" style={{ background: "#fdecea", border: "1px solid #f1c6c0" }} />missed
              <span className="texLegDot" style={{ background: "#f6f8fb" }} />none
              <span className="texLegDot" style={{ background: "#8fd4ab" }} />partial
              <span className="texLegDot" style={{ background: "#2f8f4e" }} />full
            </div>
          </div>
          <div className="texCalGrid">
            {state.calendar.map((d) => (
              <div
                key={d.date}
                className={`texCalCell ${d.level === "miss" ? "miss" : `l${d.level}`}`}
                onMouseMove={(e) => setCalTip({ x: e.clientX + 12, y: e.clientY + 12, text: `${new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${calLabel(d)}` })}
                onMouseLeave={() => setCalTip(null)}
              />
            ))}
          </div>
          <div className="texCalStatsRow">
            <div className="texCalStat"><b>{state.streak}</b><span>Day streak</span></div>
            <div className="texCalStat"><b>{state.calendar.filter((d) => d.level !== "0" && d.level !== "miss").length}/{state.calendar.length}</b><span>Days on plan</span></div>
            <div className="texCalStat"><b style={{ color: "var(--red)" }}>{state.missedDaysThisWeek}</b><span>Missed this week</span></div>
          </div>
        </div>
      </div>

      <div className="texMainGrid">
        <div className="card">
          <div className="texCardHead">
            <span className="texCardTitle">📈 Plan progress</span>
            <span className="texCardSub">Phase {state.currentPhaseIndex + 1} of {state.plan.phases.length}</span>
          </div>
          <div className="texPhaseStrip">
            {state.plan.phases.map((p, i) => (
              <div key={i} className={`texPhaseSeg ${i < state.currentPhaseIndex ? "done" : ""} ${i === state.currentPhaseIndex ? "current" : ""}`} title={p.label}>
                Wk {Math.round(p.startDay / 7) + 1}
              </div>
            ))}
          </div>
          {currentPhase && (
            <p className="texPhaseNote">
              Currently in <b>{currentPhase.label}</b>.{" "}
              {state.currentPhaseIndex < state.plan.phases.length - 1
                ? `Next phase in ${Math.max(0, currentPhase.endDay - Math.round((Date.now() - state.acceptedAt) / 86400000))} days.`
                : "This is your final phase before the exam."}
            </p>
          )}
        </div>

        <div className="card">
          <div className="texCardHead">
            <span className="texCardTitle">🔄 Plan adjustments</span>
            <span className="texCardSub">auto-tuned from your results</span>
          </div>
          {state.adaptiveLog.length === 0 ? (
            <p className="muted small">No adjustments yet — check back as you build up attempt history.</p>
          ) : (
            <div className="texAdaptLog">
              {[...state.adaptiveLog].reverse().map((e, i) => (
                <div key={i} className="texAdaptItem">
                  <span className={`texAdaptDot ${e.kind}`} />
                  <div>
                    <b>{e.message}</b>
                    <p>{e.detail.replace(/\s*\[[^\]]+\]\s*$/, "")}</p>
                    <span className="texAdaptDate">{new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="texRefreshRow">
        <button className="btn" onClick={onRefresh}>↺ Refresh</button>
      </div>

      {calTip && <div className="texCalTip show" style={{ left: calTip.x, top: calTip.y }}>{calTip.text}</div>}
    </div>
  );
}
