import { useEffect, useMemo, useState } from "react";
import type {
  BankSectionSummary,
  TargetExamName,
  TargetExamPlan,
  TargetExamStage,
  TargetExamState,
} from "../../shared/types";
import * as api from "../../shared/api";
import Spinner from "./Spinner";

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
  const [cutoff, setCutoff] = useState(75);
  const [genStepIndex, setGenStepIndex] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState<TargetExamPlan | null>(null);
  const [genError, setGenError] = useState("");
  const [accepting, setAccepting] = useState(false);

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

  function startTopic(topic: string) {
    const section = chapterToSection[topic];
    if (section) onPracticeTopic(section, topic);
  }

  function quickDate(weeks: number) {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    setExamDate(d.toISOString().split("T")[0]);
  }

  async function generate() {
    if (!selectedExam || !examDate) return;
    setStep(3);
    setGenError("");
    setGenStepIndex(0);
    const timer = setInterval(() => {
      setGenStepIndex((i) => Math.min(GEN_STEPS.length - 1, i + 1));
    }, 650);
    try {
      const plan = await api.generateTargetExamPlan({ exam: selectedExam, stage, examDate, targetCutoff: cutoff });
      clearInterval(timer);
      setGeneratedPlan(plan);
      setGenStepIndex(GEN_STEPS.length);
      setTimeout(() => setStep(4), 400);
    } catch (err) {
      clearInterval(timer);
      setGenError(err instanceof Error ? err.message : "Couldn't generate a plan — try again.");
    }
  }

  async function accept() {
    if (!selectedExam || !examDate || !generatedPlan) return;
    setAccepting(true);
    try {
      const s = await api.acceptTargetExamPlan({ exam: selectedExam, stage, examDate, targetCutoff: cutoff, plan: generatedPlan });
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
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <div className={`texStepItem ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}>
              <span className="texStepDot">{step > n ? "✓" : n}</span>
              <span className="texStepLabel">{n === 1 ? "Exam" : n === 2 ? "Target" : "Your plan"}</span>
            </div>
            {n < 3 && <div className={`texStepLine ${step > n ? "done" : ""}`} />}
          </div>
        ))}
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
              <input type="date" className="texDateInput" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              <div className="texQuickRow">
                {[6, 10, 16].map((w) => (
                  <button key={w} className="texQuickBtn" onClick={() => quickDate(w)}>{w} weeks away</button>
                ))}
              </div>
            </div>

            <div className="texField">
              <div className="texFieldLabel">Target cutoff (out of 100)</div>
              <p className="texFieldHint">Your best estimate of what you'll need to clear this exam.</p>
              <div className="texSliderRow">
                <input type="range" min={40} max={95} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} />
                <span className="texSliderVal">{cutoff}</span>
              </div>
            </div>
          </div>
          <div className="texFoot">
            <button className="btn" onClick={() => setStep(1)}>← Back</button>
            <button className="btn primary" disabled={!examDate} onClick={generate}>Generate my plan →</button>
          </div>
        </div>
      )}

      {step === 3 && (
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

      {step === 4 && generatedPlan && selectedExam && (
        <div className="texPanel">
          <div className="texPlanHero">
            <div className="texBlob" />
            <div className="texPlanEyebrow">Your AI-generated plan</div>
            <h1 className="texPlanTitle">{selectedExam} — {stage[0].toUpperCase() + stage.slice(1)}</h1>
            <div className="texPlanStats">
              <div className="texPlanStat"><b>{Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000))}</b><span>Days left</span></div>
              <div className="texPlanStat"><b>~{generatedPlan.dailyHoursEstimate}h</b><span>Daily target</span></div>
              <div className="texPlanStat"><b>{cutoff}%</b><span>Target cutoff</span></div>
            </div>
          </div>

          <div className="texCard">
            <h2 className="texCardH2">Where your time goes</h2>
            <p className="texCardSub">Weighted toward your weakest topics — not an even split across the syllabus.</p>
            <div className="texFocusBars">
              {Object.entries(generatedPlan.focusDistribution).map(([name, pct], i) => (
                <div key={name} className="texFocusBarRow">
                  <span className="texFocusBarName">{name}</span>
                  <span className="texFocusBarTrack"><span className="texFocusBarFill" style={{ width: `${pct}%`, background: FOCUS_COLORS[name] ?? FOCUS_FALLBACK[i % FOCUS_FALLBACK.length] }} /></span>
                  <span className="texFocusBarPct">{Math.round(pct)}%</span>
                </div>
              ))}
            </div>
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
                You're averaging {state.currentAvgAccuracy}% accuracy against a {state.targetCutoff}% target.
              </div>
            </div>
          </div>

          <div className="texGapRow">
            <div className="texGapStat"><b>{state.currentAvgAccuracy}%</b><span>Current avg</span></div>
            <div className="texGapStat"><b>{state.targetCutoff}%</b><span>Target cutoff</span></div>
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
