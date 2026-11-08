import { useState, Fragment } from "react";
import {
  CHAPTERS, CHAPTER_ORDER, CHAPTER_GROUPS, CHAPTER_GROUP_LABELS, parseInlineMarkup,
  SQRT_LAST_DIGIT_MAP, IMPOSSIBLE_SQUARE_ENDINGS, CBRT_LAST_DIGIT_MAP,
  findSquareExample, findCubeExample, squareRootSteps, cubeRootSteps, landmarkNums,
  type ChapterKey, type SubConceptNote,
} from "../../shared/studyVault";

function renderInline(line: string, key: number) {
  return (
    <Fragment key={key}>
      {parseInlineMarkup(line).map((seg, i) =>
        seg.kind === "plain" ? seg.text : seg.kind === "step" ? <span className="svStep" key={i}>{seg.text}</span> : <b key={i}>{seg.text}</b>
      )}
      <br />
    </Fragment>
  );
}

function DigitRow({ active, impossible, onPick }: { active: number; impossible?: number[]; onPick: (d: number) => void }) {
  return (
    <div className="svDigitRow">
      {Array.from({ length: 10 }, (_, d) => (
        <button
          key={d}
          className={`svDigitChip ${d === active ? "active" : ""} ${impossible?.includes(d) ? "impossible" : ""}`}
          onClick={() => onPick(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function LandmarkBlock({ kind }: { kind: "sqrt" | "cbrt" }) {
  const nums = landmarkNums(kind);
  const label = kind === "sqrt"
    ? "Quick range check for big numbers: see which two landmarks your number sits between, then apply the method above on that narrower range."
    : "Quick range check for big numbers: cubes grow fast, so these tens-based landmarks narrow things down immediately.";
  return (
    <div className="svLandmarkBlock">
      <div className="svLandmarkLbl">{label}</div>
      <div className="svLandmarkRow">
        {nums.map((n) => {
          const v = kind === "sqrt" ? n * n : n * n * n;
          return <span className="svLandmarkChip" key={n}>{kind === "sqrt" ? `${n}²` : `${n}³`} = <b>{v.toLocaleString()}</b></span>;
        })}
      </div>
      {kind === "sqrt" ? (
        <div className="svWorkEx" style={{ marginTop: 12 }}>
          <b>How to use it</b> — finding √27,889:<br />
          <span className="svStep">22,500 (150²) &lt; 27,889 &lt; 40,000 (200²)</span> → root is between 150 and 200<br />
          Now apply the digit method just within that band → <b>√27,889 = 167</b>
        </div>
      ) : (
        <div className="svWorkEx" style={{ marginTop: 12 }}>
          <b>How to use it</b> — finding ∛103,823:<br />
          <span className="svStep">64,000 (40³) &lt; 103,823 &lt; 125,000 (50³)</span> → root is between 40 and 50<br />
          Last digit 3 → root ends in 7 → <b>∛103,823 = 47</b>
        </div>
      )}
    </div>
  );
}

type ShortcutMode = "squares" | "sqrt" | "cubes" | "cbrt";
const SHORTCUT_KEYS: ShortcutMode[] = ["squares", "sqrt", "cubes", "cbrt"];
const SHORTCUT_LABELS: Record<ShortcutMode, string> = { squares: "Find squares", sqrt: "Find square roots", cubes: "Find cubes", cbrt: "Find cube roots" };

function SpeedMathsShortcuts() {
  const [mode, setMode] = useState<ShortcutMode>("squares");
  const [digit, setDigit] = useState(1);

  return (
    <div>
      <div className="svSubTabRow">
        {SHORTCUT_KEYS.map((k) => (
          <button key={k} className={`svSubTabBtn ${mode === k ? "active" : ""}`} onClick={() => { setMode(k); setDigit(1); }}>
            {SHORTCUT_LABELS[k]}
          </button>
        ))}
      </div>

      {mode === "squares" && (
        <div>
          <div className="svShortcutHead"><h3>Finding a square fast</h3><p>Realistically, in 45-60 seconds per question, recall beats derivation — these only pay off because they're near-zero mental math. Use whichever base (50 or 100) is actually closer to your number.</p></div>
          <p className="svTrickNote"><b>Ends in 5</b> (genuinely instant): (a5)² = a × (a+1), then append 25.</p>
          <div className="svWorkEx">85² → <span className="svStep">8 × 9 = 72</span> → append 25 → <b>7225</b></div>
          <p className="svTrickNote" style={{ marginTop: 18 }}><b>Near 50</b> — write two blocks and join them: (50±a)² = <b>(25±a)</b> followed by <b>a²</b> (2 digits, carry overflow into the front block).</p>
          <div className="svWorkEx">
            47² → a=3 → front <span className="svStep">25−3=22</span>, back <span className="svStep">3²=09</span> → <b>2209</b><br />
            63² → a=13 → front <span className="svStep">25+13=38</span>, back <span className="svStep">13²=169</span> → carry 1 → 38+1=39, back 69 → <b>3969</b>
          </div>
          <p className="svTrickNote" style={{ marginTop: 18 }}><b>Near 100</b> — same idea: (100±a)² = <b>(100±2a)</b> followed by <b>a²</b>. Most useful for 3-digit numbers like 97 or 108.</p>
          <div className="svWorkEx">
            103² → a=3 → front <span className="svStep">100+6=106</span>, back <span className="svStep">3²=09</span> → <b>10609</b><br />
            108² → a=8 → front <span className="svStep">100+16=116</span>, back <span className="svStep">8²=64</span> → <b>11664</b>
          </div>
          <p className="svTrickNote" style={{ marginTop: 18 }}>For anything that doesn't fit one of these patterns — <b>just memorize squares 1-30</b>. Deriving an arbitrary square mid-exam is slower than recall.</p>
        </div>
      )}

      {mode === "cubes" && (
        <div>
          <div className="svShortcutHead"><h3>Finding a cube fast</h3><p>Honestly: there's no general algebraic shortcut fast enough for exam conditions. Here's what's actually worth it.</p></div>
          <p className="svTrickNote"><b>One more than a multiple of 10</b> (the only cubing pattern simple enough to use live): (10a+1)³ = 1000a³ + 300a² + 30a + 1.</p>
          <div className="svWorkEx">21³ → a=2 → <span className="svStep">8000 + 1200 + 60 + 1</span> → <b>9261</b></div>
          <p className="svTrickNote" style={{ marginTop: 18 }}>For everything else — <b>memorize cubes 1-20</b> and stop there. Bank exams almost never ask you to compute a cube from scratch; they ask for the <b>cube root</b> of one.</p>
        </div>
      )}

      {mode === "sqrt" && (() => {
        const impossible = IMPOSSIBLE_SQUARE_ENDINGS.includes(digit);
        const candidates = impossible ? [] : SQRT_LAST_DIGIT_MAP[digit];
        const s = impossible ? null : squareRootSteps(findSquareExample(digit));
        return (
          <div>
            <div className="svShortcutHead"><h3>Finding a square root fast</h3><p>The last digit of a perfect square narrows its root to 1 or 2 candidates — tap any digit below, including the impossible ones.</p></div>
            <DigitRow active={digit} impossible={IMPOSSIBLE_SQUARE_ENDINGS} onPick={setDigit} />
            {impossible ? (
              <div className="svRuleOut">
                <div className="svHeadline">Ends in {digit} <span className="svArrow">→</span> impossible</div>
                <div className="svSteps">No perfect square ever ends in 2, 3, 7 or 8.<br />If a number ends in <b className="svHl">{digit}</b>, it is <span className="svWin">definitely not</span> a perfect square.</div>
              </div>
            ) : (
              <div className="svRuleOut">
                <div className="svHeadline">
                  Ends in {digit} <span className="svArrow">→</span> root {candidates.length === 1 ? <>must end in <span className="svWin">{candidates[0]}</span></> : <>ends in <span className="svHl">{candidates[0]}</span> or <span className="svHl">{candidates[1]}</span></>}
                </div>
                {candidates.length > 1 && s ? (
                  <div className="svSteps">
                    Strip last 2 digits of <b>{s.sq}</b> → <span className="svHl">{s.remaining}</span><br />
                    {s.k}² ≤ {s.remaining} &lt; {s.k + 1}² → tens digit is <span className="svWin">{s.k}</span><br />
                    Compare {s.remaining} to {s.k}×{s.k + 1}={s.k * (s.k + 1)}: {s.remaining > s.k * (s.k + 1) ? "bigger" : "smaller"} → pick the {s.remaining > s.k * (s.k + 1) ? "larger" : "smaller"} candidate (<span className="svWin">{s.chosen}</span>)<br />
                    → <b>√{s.sq} = {s.ans}</b> ✓
                  </div>
                ) : s ? (
                  <div className="svSteps">Example: √{s.sq} = <b>{s.ans}</b> — no disambiguation needed, this ending is unique.</div>
                ) : null}
              </div>
            )}
            <LandmarkBlock kind="sqrt" />
          </div>
        );
      })()}

      {mode === "cbrt" && (() => {
        const n = findCubeExample(digit);
        const s = cubeRootSteps(n);
        return (
          <div>
            <div className="svShortcutHead"><h3>Finding a cube root fast</h3><p>Unlike squares, every last digit maps back to exactly one root digit.</p></div>
            <DigitRow active={digit} onPick={setDigit} />
            <div className="svRuleOut">
              <div className="svHeadline">Ends in {digit} <span className="svArrow">→</span> root ends in <span className="svWin">{CBRT_LAST_DIGIT_MAP[digit]}</span></div>
              <div className="svSteps">
                Every digit maps to exactly one cube-root digit — no ambiguity, unlike squares.<br /><br />
                <b>∛{s.cu}</b> (the standard 3-step method):<br />
                1. Split last 3 digits: <span className="svHl">{s.rest}</span> | <span className="svHl">{s.last3}</span><br />
                2. Ends in {digit} → root ends in <span className="svWin">{s.unitDigit}</span><br />
                3. {s.k}³ ≤ {s.rest} &lt; {s.k + 1}³ → tens digit is <span className="svWin">{s.k}</span><br />
                → <b>{s.ans}³ = {s.cu}</b> ✓
              </div>
            </div>
            <LandmarkBlock kind="cbrt" />
          </div>
        );
      })()}
    </div>
  );
}

function SubConceptPanel({ notes }: { notes: SubConceptNote[] }) {
  const [idx, setIdx] = useState(0);
  const note = notes[idx];
  return (
    <div className="svSubConcepts">
      <div className="svSubConceptLbl">Sub-concepts in this chapter</div>
      <div className="svSubConceptChips">
        {notes.map((n, i) => (
          <button
            key={n.name}
            className={`svSubConceptChip ${i === idx ? "active" : ""}`}
            onClick={() => setIdx(i)}
          >
            {n.name}
          </button>
        ))}
      </div>
      <div className="svSubConceptBody">
        <div className="svConceptTitle">{note.name}</div>
        <div className="svConceptBody">{note.body}</div>
        {note.formula && <div className="svFeq" dangerouslySetInnerHTML={{ __html: note.formula }} />}
      </div>
    </div>
  );
}

export default function StudyVault() {
  const [active, setActive] = useState<ChapterKey>(CHAPTER_ORDER[0]);
  const ch = CHAPTERS[active];

  return (
    <div className="svPage">
      <div className="svEyebrow">Study Vault</div>
      <h1 className="svTitle">Formulas, concepts & approach — by chapter</h1>
      <p className="svSub">Pulled from real RRB PO paper analysis — these are the chapters that actually show up.</p>

      {CHAPTER_GROUPS.map((g) => (
        <div key={g}>
          <div className="svGroupLabel">{CHAPTER_GROUP_LABELS[g]}</div>
          <div className="svChapterRow">
            {CHAPTER_ORDER.filter((k) => CHAPTERS[k].group === g).map((k) => (
              <button
                key={k}
                className={`svChapterBtn ${k === "speedmaths" ? "speedmaths" : ""} ${active === k ? "active" : ""}`}
                onClick={() => setActive(k)}
              >
                {CHAPTERS[k].label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="svStage">
        {ch.isSpeedMaths ? (
          <SpeedMathsShortcuts />
        ) : (
          <>
            <div className="svChHead"><h2>{ch.label}</h2><p>{ch.intro}</p></div>
            {ch.concept && (
              <div className="svConceptBox">
                <div className="svConceptLbl">Key concept</div>
                <div className="svConceptTitle">{ch.concept.title}</div>
                <div className="svConceptBody">{ch.concept.body}</div>
              </div>
            )}
            <div className="svFormulaList">
              {ch.formulas?.map((f) => (
                <div className="svFormulaCard" key={f.n}>
                  <div className="svFname">{f.n}</div>
                  <div className="svFeq" dangerouslySetInnerHTML={{ __html: f.eq }} />
                  {f.note && <div className="svFnote">{f.note}</div>}
                </div>
              ))}
            </div>
            {ch.subConcepts && <SubConceptPanel key={active} notes={ch.subConcepts} />}
            {ch.example && (
              <div className="svExampleBox">
                <div className="svElbl">{ch.example.label}</div>
                <div className="svEwork">{ch.example.lines.map((l, i) => renderInline(l, i))}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
