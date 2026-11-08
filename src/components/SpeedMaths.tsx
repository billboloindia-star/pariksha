import { useCallback, useEffect, useRef, useState } from "react";
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

function ReferenceCharts() {
  const [open, setOpen] = useState<string | null>("tables");
  const squares = getSquaresList(50);
  const cubes = getCubesList(30);
  const fracByDen = new Map<number, typeof FRACTION_TABLE>();
  for (const f of FRACTION_TABLE) {
    if (!fracByDen.has(f.den)) fracByDen.set(f.den, []);
    fracByDen.get(f.den)!.push(f);
  }

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    const isOpen = open === id;
    return (
      <div className="smCard">
        <button className="smRefToggle" onClick={() => setOpen(isOpen ? null : id)}>
          <h2>{title}</h2>
          <span>{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen && <div className="smRefBody">{children}</div>}
      </div>
    );
  }

  return (
    <div>
      <Section id="tables" title="Tables (1-25)">
        <div className="smRefTableList">
          {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
            <div className="smRefTableRow" key={n}>
              <span className="smRefTableN">{n}</span>
              <div className="smRefTableValues">
                {getTableRow(n).map((r) => (
                  <span key={r.multiple}>{r.product}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="squares" title="Squares (1-50)">
        <div className="smRefGrid">
          {squares.map((s) => (
            <div className="smRefChip" key={s.n}><b>{s.n}</b><span>{s.square}</span></div>
          ))}
        </div>
      </Section>

      <Section id="cubes" title="Cubes (1-30)">
        <div className="smRefGrid">
          {cubes.map((c) => (
            <div className="smRefChip" key={c.n}><b>{c.n}</b><span>{c.cube}</span></div>
          ))}
        </div>
      </Section>

      <Section id="fractions" title="Fraction ↔ % table">
        <div className="smRefFracGroups">
          {Array.from(fracByDen.keys()).sort((a, b) => a - b).map((den) => (
            <div className="smRefFracGroup" key={den}>
              <div className="smRefFracDen">/{den}</div>
              <div className="smRefGrid">
                {fracByDen.get(den)!.map((f) => (
                  <div className="smRefChip" key={`${f.num}/${f.den}`}>
                    <b>{f.num}/{f.den}</b><span>{f.truncPct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
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
          <ReferenceCharts />
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
