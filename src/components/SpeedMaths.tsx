import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALL_SPEED_MATH_TYPES,
  SPEED_MATH_LABELS,
  generateSpeedMathQuestion,
  checkSpeedMathAnswer,
  summarizeSpeedMathSession,
  getTableRow,
  FRACTION_TABLE,
  type SpeedMathType,
  type SpeedMathQuestion,
  type SpeedMathRecord,
  type SpeedMathPaceMode,
  type SpeedMathSummary,
} from "../../shared/speedMaths";

type Phase = "setup" | "drill" | "results";
type Mode = "drill" | "reference";

const COUNT_OPTIONS = [10, 20, 30, 50];
const DURATION_OPTIONS = [2, 5, 10];

type RefMode = "tables" | "squares" | "cubes" | "sqrt" | "cbrt" | "fractions";

const REF_TAB_ORDER: RefMode[] = ["tables", "squares", "cubes", "sqrt", "cbrt", "fractions"];
const REF_TAB_LABELS: Record<RefMode, string> = {
  tables: "Tables", squares: "Squares", cubes: "Cubes", sqrt: "Square Root", cbrt: "Cube Root", fractions: "Fractions",
};
const REF_START: Record<RefMode, number> = { tables: 7, squares: 12, cubes: 7, sqrt: 12, cbrt: 7, fractions: 2 };
const REF_MAX: Record<RefMode, number> = { tables: 25, squares: 50, cubes: 30, sqrt: 50, cbrt: 30, fractions: 20 };
const REF_MIN: Record<RefMode, number> = { tables: 1, squares: 1, cubes: 1, sqrt: 1, cbrt: 1, fractions: 2 };

interface RefRow { l: string; r: string | number; hi?: boolean }

function refRows(mode: RefMode, n: number): RefRow[] {
  if (mode === "tables") return getTableRow(n).map((r) => ({ l: `${n} × ${r.multiple}`, r: r.product }));
  if (mode === "fractions") {
    return FRACTION_TABLE.filter((f) => f.den === n).map((f) => ({ l: `${f.num}/${f.den}`, r: `${f.truncPct.toFixed(2)}%` }));
  }
  const max = mode === "cubes" || mode === "cbrt" ? 30 : 50;
  const out: RefRow[] = [];
  for (let k = Math.max(1, n - 3); k <= Math.min(max, n + 3); k++) {
    if (mode === "squares") out.push({ l: `${k}²`, r: k * k, hi: k === n });
    else if (mode === "cubes") out.push({ l: `${k}³`, r: k * k * k, hi: k === n });
    else if (mode === "sqrt") out.push({ l: `√${k * k}`, r: k, hi: k === n });
    else if (mode === "cbrt") out.push({ l: `∛${k * k * k}`, r: k, hi: k === n });
  }
  return out;
}

function refLabel(mode: RefMode, n: number): string {
  if (mode === "tables") return `Table of ${n}`;
  if (mode === "fractions") return `Denominator ${n}`;
  if (mode === "squares") return `${n}²`;
  if (mode === "cubes") return `${n}³`;
  if (mode === "sqrt") return `√${n * n} = ?`;
  return `∛${n * n * n} = ?`;
}

function refBig(mode: RefMode, n: number): string {
  if (mode === "tables" || mode === "fractions") return "";
  if (mode === "squares") return `${n * n}`;
  if (mode === "cubes") return `${n * n * n}`;
  return `${n}`;
}

function ReferenceStage() {
  const [mode, setMode] = useState<RefMode>("tables");
  const [current, setCurrent] = useState(7);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = stripRef.current?.querySelector(".active");
    active?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [mode, current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(REF_MIN[mode], c - 1));
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(REF_MAX[mode], c + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const rows = refRows(mode, current);
  const big = refBig(mode, current);
  const values = mode === "fractions"
    ? Array.from({ length: REF_MAX.fractions - REF_MIN.fractions + 1 }, (_, i) => i + REF_MIN.fractions)
    : Array.from({ length: REF_MAX[mode] }, (_, i) => i + 1);

  return (
    <div>
      <div className="smModeRow">
        {REF_TAB_ORDER.map((m) => (
          <button
            key={m}
            className={`smModeBtn smRefTab ${mode === m ? "active" : ""}`}
            onClick={() => { setMode(m); setCurrent(REF_START[m]); }}
          >
            {REF_TAB_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="smRefStage">
        <div className="smRefGlow" />
        <div className="smRefPickRow">
          <button className="smRefPickArrow" onClick={() => setCurrent((c) => Math.max(REF_MIN[mode], c - 1))}>‹</button>
          <div className="smRefPickStrip" ref={stripRef}>
            {values.map((v) => (
              <button
                key={v}
                className={`smRefPickChip ${current === v ? "active" : ""}`}
                onClick={() => setCurrent(v)}
              >
                {mode === "fractions" ? `/${v}` : v}
              </button>
            ))}
          </div>
          <button className="smRefPickArrow" onClick={() => setCurrent((c) => Math.min(REF_MAX[mode], c + 1))}>›</button>
        </div>

        <div className="smRefBigAnswer">
          <div className={`smRefEq ${!big ? "noVal" : ""}`}>{refLabel(mode, current)}</div>
          {big && <div className="smRefVal">{big}</div>}
        </div>

        <div className="smRefMiniList">
          {rows.map((r) => (
            <div className={`smRefMiniRow ${r.hi ? "current" : ""}`} key={r.l}>
              <b>{r.l}</b><span>{r.r}</span>
            </div>
          ))}
        </div>

        <div className="smRefHint">Use ← → or tap the strip above to jump between numbers.</div>
      </div>
    </div>
  );
}

export default function SpeedMaths() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<Mode>("drill");
  const [types, setTypes] = useState<Set<SpeedMathType>>(new Set(ALL_SPEED_MATH_TYPES));
  const [paceMode, setPaceMode] = useState<SpeedMathPaceMode>("count");
  const [count, setCount] = useState(20);
  const [durationSec, setDurationSec] = useState(300);

  const [question, setQuestion] = useState<SpeedMathQuestion | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [records, setRecords] = useState<SpeedMathRecord[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [summary, setSummary] = useState<SpeedMathSummary | null>(null);

  const qStartRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTypesRef = useRef<SpeedMathType[]>([]);
  const recordsRef = useRef<SpeedMathRecord[]>([]);
  const timerRef = useRef<number | null>(null);

  function toggleType(t: SpeedMathType) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const endSession = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setSummary(summarizeSpeedMathSession(recordsRef.current));
    setPhase("results");
  }, []);

  const nextQuestion = useCallback(() => {
    setQuestion(generateSpeedMathQuestion(activeTypesRef.current));
    setInput("");
    setFeedback(null);
    qStartRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  function startSession() {
    const active = types.size ? Array.from(types) : ALL_SPEED_MATH_TYPES;
    activeTypesRef.current = active;
    recordsRef.current = [];
    setRecords([]);
    setSummary(null);
    if (paceMode === "timed") {
      setTimeLeft(durationSec);
      timerRef.current = window.setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            endSession();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    setPhase("drill");
    nextQuestion();
  }

  function submit() {
    if (!question || feedback) return;
    const correct = checkSpeedMathAnswer(question, input);
    const rec: SpeedMathRecord = { type: question.type, correct, timeMs: Date.now() - qStartRef.current };
    recordsRef.current = [...recordsRef.current, rec];
    setRecords(recordsRef.current);
    setFeedback(correct ? "correct" : "incorrect");

    window.setTimeout(() => {
      if (paceMode === "count" && recordsRef.current.length >= count) {
        endSession();
        return;
      }
      if (paceMode === "timed" && timeLeft <= 1) {
        endSession();
        return;
      }
      nextQuestion();
    }, 450);
  }

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  function practiceAgain() {
    setPhase("setup");
    setQuestion(null);
    setSummary(null);
  }

  const streak = (() => {
    let s = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (!records[i].correct) break;
      s++;
    }
    return s;
  })();

  // ---------------------------------------------------------------- setup

  if (phase === "setup") {
    return (
      <div className="smPage">
        <div className="smHero">
          <div className="smBlob b1" />
          <div className="smBlob b2" />
          <div className="smHeroText">
            <div className="smEyebrow">SPEED MATHS</div>
            <h1>Sharpen your mental math</h1>
            <p>Pick your drill types and pace — no options, just type the answer and go.</p>
          </div>
        </div>

        <div className="smModeRow">
          <button className={`smModeBtn ${mode === "drill" ? "active" : ""}`} onClick={() => setMode("drill")}>Drill</button>
          <button className={`smModeBtn ${mode === "reference" ? "active" : ""}`} onClick={() => setMode("reference")}>Study material</button>
        </div>

        {mode === "reference" ? (
          <ReferenceStage />
        ) : (
        <>
        <div className="smCard">
          <h2>What to practice</h2>
          <div className="smTypeGrid">
            {ALL_SPEED_MATH_TYPES.map((t) => (
              <button
                key={t}
                className={`smTypeChip ${types.has(t) ? "active" : ""}`}
                onClick={() => toggleType(t)}
              >
                {SPEED_MATH_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="smHint">Select one or more. Leave several selected for a mixed drill.</p>
        </div>

        <div className="smCard">
          <h2>Pace</h2>
          <div className="smPaceRow">
            <button className={`smPaceBtn ${paceMode === "count" ? "active" : ""}`} onClick={() => setPaceMode("count")}>
              No timer — fixed count
            </button>
            <button className={`smPaceBtn ${paceMode === "timed" ? "active" : ""}`} onClick={() => setPaceMode("timed")}>
              Timed session
            </button>
          </div>

          {paceMode === "count" ? (
            <div className="smOptRow">
              {COUNT_OPTIONS.map((c) => (
                <button key={c} className={`smOptChip ${count === c ? "active" : ""}`} onClick={() => setCount(c)}>
                  {c} questions
                </button>
              ))}
            </div>
          ) : (
            <div className="smOptRow">
              {DURATION_OPTIONS.map((m) => (
                <button
                  key={m}
                  className={`smOptChip ${durationSec === m * 60 ? "active" : ""}`}
                  onClick={() => setDurationSec(m * 60)}
                >
                  {m} min
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="smStartBtn" disabled={types.size === 0} onClick={startSession}>
          Start drill
        </button>
        </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- drill

  if (phase === "drill" && question) {
    const progress = paceMode === "count" ? `${records.length + 1} / ${count}` : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;
    return (
      <div className="smPage smDrillPage">
        <div className="smDrillTop">
          <span className="smDrillProgress">{progress}</span>
          <span className="smDrillType">{SPEED_MATH_LABELS[question.type]}</span>
          <span className="smDrillStreak">🔥 {streak}</span>
        </div>

        <div className={`smQuestionCard ${feedback ?? ""}`}>
          <div className="smPrompt">{question.prompt}</div>
          <input
            ref={inputRef}
            className="smAnswerInput"
            type="text"
            inputMode="decimal"
            placeholder="your answer"
            value={input}
            disabled={!!feedback}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          {feedback && (
            <div className={`smFeedback ${feedback}`}>
              {feedback === "correct" ? "Correct!" : `Correct answer: ${question.display}`}
            </div>
          )}
          <button className="smSubmitBtn" onClick={submit} disabled={!input.trim() || !!feedback}>
            Submit
          </button>
        </div>

        <div className="smScoreRow">
          <span>{records.filter((r) => r.correct).length} correct</span>
          <span>{records.length} answered</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- results

  if (phase === "results" && summary) {
    return (
      <div className="smPage">
        <div className="smHero">
          <div className="smBlob b1" />
          <div className="smBlob b2" />
          <div className="smHeroText">
            <div className="smEyebrow">SESSION COMPLETE</div>
            <h1>{summary.accuracy}% accuracy</h1>
            <p>{summary.correct} / {summary.total} correct &middot; avg {(summary.avgTimeMs / 1000).toFixed(1)}s per question</p>
          </div>
        </div>

        <div className="smCard">
          <h2>By type</h2>
          {summary.byType.map((b) => (
            <div className="smBreakdownRow" key={b.type}>
              <span className="smBreakdownLabel">{SPEED_MATH_LABELS[b.type]}</span>
              <div className="smBreakdownTrack">
                <div className="smBreakdownFill" style={{ width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }} />
              </div>
              <span className="smBreakdownStat">{b.correct}/{b.total}</span>
            </div>
          ))}
        </div>

        <button className="smStartBtn" onClick={practiceAgain}>Practice again</button>
      </div>
    );
  }

  return null;
}
