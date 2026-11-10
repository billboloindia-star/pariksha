import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ALL_SPEED_MATH_TYPES,
  SPEED_MATH_LABELS,
  generateSpeedMathQuestion,
  checkSpeedMathAnswer,
  summarizeSpeedMathSession,
  getTableRow,
  getSquaresList,
  getCubesList,
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
const REF_ACCENT: Record<RefMode, string> = {
  tables: "#0ea5a0", squares: "#2f6fed", cubes: "#d63d6e", sqrt: "#8b5cf6", cbrt: "#f0883e", fractions: "#16a34a",
};
const REF_ACCENT_RGB: Record<RefMode, [number, number, number]> = {
  tables: [14, 165, 160], squares: [47, 111, 237], cubes: [214, 61, 110],
  sqrt: [139, 92, 246], cbrt: [240, 136, 62], fractions: [22, 163, 74],
};
const REF_SUB: Record<RefMode, string> = {
  tables: "One heatmap, every table at once — darker means bigger.",
  squares: "1² to 50², log-scaled so every bar stays readable while you still feel the acceleration.",
  cubes: "1³ to 30³ — watch how fast the bars run away past n=10.",
  sqrt: "Perfect squares 1 to 50 — tap a card to flip, or turn on Quiz me to test yourself first.",
  cbrt: "Perfect cubes 1 to 30 — tap a card to flip, or turn on Quiz me to test yourself first.",
  fractions: "Every denominator 2–20 with all its multiples — search a fraction or a % and it finds the match either way.",
};

function mixColor(rgb: [number, number, number], t: number): string {
  const base = [15, 19, 28];
  const mix = base.map((c, i) => Math.round(c + (rgb[i] - c) * (0.18 + t * 0.82)));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

function TablesHeatmap({ quiz, revealed, onReveal }: { quiz: boolean; revealed: Set<string>; onReveal: (id: string) => void }) {
  const N = 20, M = 10, max = N * M;
  return (
    <div className="smRefHeatWrap">
      <div className="smRefHeatGrid" style={{ gridTemplateColumns: `44px repeat(${M}, 1fr)` }}>
        <div className="smRefHcell hdr" />
        {Array.from({ length: M }, (_, j) => (
          <div className="smRefHcell hdr" key={`h${j}`}>×{j + 1}</div>
        ))}
        {Array.from({ length: N }, (_, i) => {
          const n = i + 1;
          return (
            <Fragment key={n}>
              <div className="smRefHcell hdr">{n}</div>
              {Array.from({ length: M }, (_, j) => {
                const m = j + 1;
                const val = n * m;
                const id = `${n}x${m}`;
                const blank = quiz && !revealed.has(id);
                return (
                  <div
                    key={id}
                    className={`smRefHcell ${blank ? "blank" : ""}`}
                    style={{ background: mixColor(REF_ACCENT_RGB.tables, Math.pow(val / max, 0.62)) }}
                    title={`${n} × ${m} = ${val}`}
                    onClick={() => onReveal(id)}
                  >
                    {blank ? "" : val}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      <div className="smRefColorbar"><span>1</span><div className="smRefRamp" /><span>{max} (20×10)</span></div>
    </div>
  );
}

function GrowthBars({ mode, quiz, revealed, onReveal }: { mode: "squares" | "cubes"; quiz: boolean; revealed: Set<string>; onReveal: (id: string) => void }) {
  const list = mode === "squares" ? getSquaresList(50) : getCubesList(30);
  const values = list.map((r) => (mode === "squares" ? (r as { square: number }).square : (r as { cube: number }).cube));
  const maxLog = Math.log(values[values.length - 1] + 1);
  const power = mode === "squares" ? 2 : 3;
  return (
    <div className="smRefBars">
      {list.map((row, idx) => {
        const n = (row as { n: number }).n;
        const val = values[idx];
        const w = (Math.log(val + 1) / maxLog) * 100;
        const id = `${mode}${n}`;
        const blank = quiz && !revealed.has(id);
        return (
          <div className="smRefBarRow" key={id}>
            <div className="smRefBarN">{n}<sup>{power}</sup></div>
            <div className="smRefBarTrack"><div className="smRefBarFill" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${mixColor(REF_ACCENT_RGB[mode], 0.35)}, ${REF_ACCENT[mode]})` }} /></div>
            <div className={`smRefBarVal ${blank ? "blank" : ""}`} onClick={() => onReveal(id)}>{blank ? "" : val.toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

function FlipGrid({ mode, quiz, revealed, onReveal }: { mode: "sqrt" | "cbrt"; quiz: boolean; revealed: Set<string>; onReveal: (id: string) => void }) {
  const power = mode === "sqrt" ? 2 : 3;
  const n = mode === "sqrt" ? 50 : 30;
  const symbol = mode === "sqrt" ? "√" : "∛";
  return (
    <div className="smRefFlipGrid">
      {Array.from({ length: n }, (_, i) => i + 1).map((i) => {
        const val = Math.pow(i, power);
        const id = `${mode}${i}`;
        const blank = quiz && !revealed.has(id);
        return (
          <div className="smRefFlip" key={id} onClick={() => onReveal(id)}>
            <div className="smRefFlipQ">{symbol}{val.toLocaleString()}</div>
            <div className={`smRefFlipAns ${blank ? "blank" : ""}`}>{blank ? "" : i}</div>
            <div className="smRefFlipHint">tap to {blank ? "reveal" : "check"}</div>
          </div>
        );
      })}
    </div>
  );
}

function FractionsTable({ quiz, revealed, onReveal }: { quiz: boolean; revealed: Set<string>; onReveal: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const byDen = new Map<number, typeof FRACTION_TABLE>();
  for (const f of FRACTION_TABLE) {
    if (!byDen.has(f.den)) byDen.set(f.den, []);
    byDen.get(f.den)!.push(f);
  }
  return (
    <div>
      <div className="smRefSearch">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Type a fraction (e.g. 3/7) or a % (e.g. 42.86) to find it, works either way…' />
      </div>
      <div className="smRefFracList">
        {Array.from(byDen.entries()).map(([den, fracs]) => (
          <div className="smRefFracSection" key={den}>
            <div className="smRefFracHead">/{den}</div>
            <div className="smRefFracRow">
              {fracs.map((f) => {
                const fracStr = `${f.num}/${f.den}`;
                const pctStr = f.truncPct.toFixed(2);
                const id = fracStr;
                const blank = quiz && !revealed.has(id);
                const hit = !!q && (fracStr.includes(q) || pctStr.toLowerCase().startsWith(q.replace("%", "")));
                return (
                  <div
                    key={id}
                    className={`smRefFracChip ${q ? (hit ? "match" : "dim") : ""}`}
                    onClick={() => onReveal(id)}
                  >
                    <span className="fc-frac">{f.num}⁄{f.den}</span>
                    <span className="fc-eq">=</span>
                    <span className={`fc-pct ${blank ? "blank" : ""}`}>{blank ? "" : `${pctStr}%`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferenceStage() {
  const [mode, setMode] = useState<RefMode>("tables");
  const [quiz, setQuiz] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  function switchMode(m: RefMode) {
    setMode(m);
    setRevealed(new Set());
  }

  function toggleQuiz() {
    setQuiz((q) => !q);
    setRevealed(new Set());
  }

  function reveal(id: string) {
    if (!quiz) return;
    setRevealed((prev) => new Set(prev).add(id));
  }

  return (
    <div>
      <div className="smModeRow smRefTopRow">
        <div className="smRefTabsWrap">
          {REF_TAB_ORDER.map((m) => (
            <button
              key={m}
              className={`smModeBtn smRefTab ${mode === m ? "active" : ""}`}
              style={mode === m ? { background: REF_ACCENT[m], borderColor: REF_ACCENT[m] } : undefined}
              onClick={() => switchMode(m)}
            >
              {REF_TAB_LABELS[m]}
            </button>
          ))}
        </div>
        <button className={`smRefQuizToggle ${quiz ? "on" : ""}`} onClick={toggleQuiz}>
          <span className="knob" />
          <span>Quiz me</span>
        </button>
      </div>

      <div className="smRefStage2" style={{ ["--smRefAccent" as string]: REF_ACCENT[mode] }}>
        <div className="smRefStage2Glow" />
        <p className="smRefSub">{REF_SUB[mode]}</p>

        {mode === "tables" && <TablesHeatmap quiz={quiz} revealed={revealed} onReveal={reveal} />}
        {(mode === "squares" || mode === "cubes") && <GrowthBars mode={mode} quiz={quiz} revealed={revealed} onReveal={reveal} />}
        {(mode === "sqrt" || mode === "cbrt") && <FlipGrid mode={mode} quiz={quiz} revealed={revealed} onReveal={reveal} />}
        {mode === "fractions" && <FractionsTable quiz={quiz} revealed={revealed} onReveal={reveal} />}

        <div className="smRefHint">
          {quiz ? "Values are hidden — tap any cell/bar/card to reveal it." : 'Flip "Quiz me" on to test yourself before you look.'}
        </div>
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
