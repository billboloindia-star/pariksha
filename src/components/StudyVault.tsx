import { useState } from "react";

type Group = "A" | "B" | "C" | "D";

interface FormulaEntry {
  n: string;
  eq: string;
  note?: string;
}

interface ExampleEntry {
  label: string;
  lines: string[];
}

interface ConceptEntry {
  title: string;
  body: string;
}

interface ChapterEntry {
  group: Group;
  label: string;
  isSpeedMaths?: boolean;
  intro?: string;
  concept?: ConceptEntry;
  formulas?: FormulaEntry[];
  example?: ExampleEntry;
}

const CHAPTERS: Record<string, ChapterEntry> = {
  speedmaths: { group: "A", label: "Speed Maths", isSpeedMaths: true },

  ratio: {
    group: "B", label: "Ratio & Proportion",
    intro: "A ratio compares two quantities of the same kind; a proportion says two ratios are equal.",
    concept: { title: "Scale before you combine", body: "Most ratio mistakes come from combining two ratios that share a term with different values (e.g. b=3 in one, b=4 in another) without scaling first. Always make the shared term equal before writing a:b:c." },
    formulas: [
      { n: "Basic ratio", eq: "a : b = a/b", note: "Always simplify to lowest terms." },
      { n: "Proportion (cross-multiply)", eq: "a:b :: c:d  ⇒  a×d = b×c", note: "The product of extremes = product of means." },
      { n: "Combining two ratios", eq: "a:b=p:q, b:c=q:r ⇒ a:b:c = p:q:r", note: "If the shared term (b) isn't already equal in both, scale each ratio so it matches first." },
      { n: "Duplicate / sub-duplicate", eq: "Duplicate: a²:b²<br>Sub-duplicate: √a : √b", note: "Triplicate ratio is a³:b³." },
      { n: "Componendo-dividendo", eq: "x:y = a:b  ⇒  (x+y):(x−y) = (a+b):(a−b)", note: "Useful when a question gives you a sum/difference condition directly." },
    ],
    example: { label: "Worked example", lines: [
      "a:b = 2:3 and b:c = 4:5 — find a:b:c",
      '<span class="svStep">b is 3 in the first, 4 in the second</span> → scale to LCM(3,4)=12',
      "a:b = 2:3 → ×4 → <b>8:12</b>",
      "b:c = 4:5 → ×3 → <b>12:15</b>",
      "→ a:b:c = <b>8 : 12 : 15</b>",
    ]},
  },

  percentage: {
    group: "B", label: "Percentage",
    intro: '"Per cent" = per hundred. Almost every arithmetic chapter (profit/loss, SI/CI, DI) is percentage underneath.',
    concept: { title: "Use fraction equivalents, not long division", body: 'Converting a percentage to its fraction form is almost always faster than computing it directly: 50%=1/2, 33.33%=1/3, 25%=1/4, 20%=1/5, 16.67%=1/6, 12.5%=1/8, 11.11%=1/9 — see the Fraction ↔ % reference in Speed Maths for the full set. "20% of 85" as 85/5 is faster than 0.2×85.' },
    formulas: [
      { n: "x% of y", eq: "x% of y = (x × y) / 100" },
      { n: "% change", eq: "% change = (change / original value) × 100" },
      { n: "Successive % changes", eq: "Net% = a + b + (a×b)/100", note: "Use negative values for a decrease. This is the single most tested percentage pattern." },
      { n: "Increase then equal decrease", eq: "Net change = −(x² / 100) %", note: "A number that goes up x% then down x% is always NET NEGATIVE — a very common trap option." },
      { n: "A is x% more than B", eq: "then B is [x / (100+x)] × 100 % less than A", note: "The reverse direction is NOT the same percentage — classic trap." },
    ],
    example: { label: "Worked example", lines: [
      "Price rises 20%, then falls 20% — net change?",
      '<span class="svStep">Net% = 20 − 20 + (20×−20)/100</span>',
      "= 0 − 4 = <b>−4%</b> (a net loss, not back to original)",
    ]},
  },

  profitloss: {
    group: "B", label: "Profit & Loss",
    intro: "CP = cost price, SP = selling price, MP = marked price (before discount).",
    concept: { title: "Assume CP = 100", body: "When a question gives you percentages but no actual price, just set CP=100. Every profit/loss/discount instantly becomes that many rupees, and multi-step chains (marked up, then discounted, then resold) stay simple whole numbers instead of fractions of an unknown." },
    formulas: [
      { n: "Profit / Loss", eq: "Profit = SP − CP<br>Loss = CP − SP" },
      { n: "Profit% / Loss%", eq: "Profit% = (Profit/CP)×100<br>Loss% = (Loss/CP)×100", note: "Always over CP, never over SP." },
      { n: "Finding SP from %", eq: "SP = CP × (100 ± Profit%or Loss%) / 100" },
      { n: "Discount", eq: "SP = MP × (100 − Discount%) / 100" },
      { n: "Successive discounts", eq: "Net discount% = d₁ + d₂ − (d₁×d₂)/100", note: "Same shape as successive percentage change — two 10% discounts are NOT a 20% discount." },
    ],
    example: { label: "Worked example", lines: [
      "MP=1000, successive discounts of 10% and 20% — final SP?",
      '<span class="svStep">Net discount = 10+20−(10×20)/100 = 28%</span>',
      "SP = 1000 × (100−28)/100 = <b>720</b>",
    ]},
  },

  timework: {
    group: "B", label: "Time & Work",
    intro: 'Think in terms of "work done per day" (a rate), not total days — rates add, days don\'t.',
    concept: { title: "The LCM method (skip fractions entirely)", body: "Instead of working with 1/12, 1/18 etc., set TOTAL WORK = LCM of all the given days. Each person's daily efficiency becomes a whole number (total work ÷ their days), and you just add efficiencies — no fraction arithmetic anywhere." },
    formulas: [
      { n: "1-day work", eq: "A finishes in a days ⇒ A does 1/a of the work per day" },
      { n: "Combined work", eq: "(A+B) per day = 1/a + 1/b<br>Together they finish in ab/(a+b) days" },
      { n: "Three workers", eq: "(A+B+C) per day = 1/a + 1/b + 1/c" },
      { n: "Wages split (same time)", eq: "Wages ratio = ratio of work done" },
      { n: "Men-Days-Hours", eq: "M₁D₁H₁/W₁ = M₂D₂H₂/W₂", note: "The go-to formula whenever a question changes the number of workers, days, AND hours at once." },
    ],
    example: { label: "Worked example — LCM method", lines: [
      "A finishes in 12 days, B in 18 days — together?",
      '<span class="svStep">Total work = LCM(12,18) = 36 units</span>',
      "A's efficiency = 36/12 = <b>3/day</b>, B's = 36/18 = <b>2/day</b>",
      "Together = 5 units/day → Time = 36/5 = <b>7.2 days</b>",
    ]},
  },

  pipes: {
    group: "B", label: "Pipes & Cisterns",
    intro: "Exactly Time & Work, except an outlet pipe (drain) counts as NEGATIVE work.",
    concept: { title: "Same LCM method, just signed", body: "Use the Time & Work LCM trick unchanged — set total work (tank capacity) = LCM of all given times, give each inlet a POSITIVE efficiency and each outlet a NEGATIVE one, then just add." },
    formulas: [
      { n: "Inlet rate", eq: "Fills in a hrs ⇒ rate = +1/a" },
      { n: "Outlet rate", eq: "Empties in b hrs ⇒ rate = −1/b" },
      { n: "Net rate (opened together)", eq: "Net rate = sum of all individual rates (inlets positive, outlets negative)" },
      { n: "Time to fill/empty", eq: "Time = 1 / |net rate|", note: "If net rate is negative, the tank is draining overall, not filling." },
    ],
    example: { label: "Worked example — LCM method", lines: [
      "Pipe A fills in 6 hrs, pipe B (outlet) empties in 8 hrs — opened together",
      '<span class="svStep">Tank capacity = LCM(6,8) = 24 units</span>',
      "A fills <b>+4/hr</b>, B drains <b>−3/hr</b> → net <b>+1/hr</b>",
      "Time to fill = 24/1 = <b>24 hours</b>",
    ]},
  },

  sici: {
    group: "B", label: "Simple & Compound Interest",
    intro: "SI grows linearly; CI grows on the growing amount (interest earns interest).",
    concept: { title: "CI−SI shortcuts beat computing both in full", body: "When a question only asks for the DIFFERENCE between CI and SI, never compute both amounts separately — use the 2-year or 3-year difference formula directly." },
    formulas: [
      { n: "Simple Interest", eq: "SI = (P × R × T) / 100" },
      { n: "Amount (SI)", eq: "A = P + SI = P × (1 + RT/100)" },
      { n: "Compound Interest", eq: "A = P × (1 + R/100)ᵀ<br>CI = A − P" },
      { n: "CI − SI (2 years)", eq: "CI − SI = P × (R/100)²", note: "A very common shortcut question — skip computing both in full." },
      { n: "CI − SI (3 years)", eq: "CI − SI = P × (R/100)² × (3 + R/100)" },
    ],
    example: { label: "Worked example", lines: [
      "P=1000, R=10%, T=2 years — CI−SI?",
      '<span class="svStep">CI−SI = P×(R/100)² = 1000×0.01</span>',
      "= <b>10</b> (check: SI=200, CI=210, diff=10 ✓)",
    ]},
  },

  average: {
    group: "B", label: "Average",
    intro: 'The "typical" value of a set — but exam questions mostly test what happens when the set CHANGES.',
    concept: { title: "The deviation method", body: 'Instead of summing every value and dividing, guess a round "assumed average," find how far each value deviates from it (+/−), and average just the deviations. Add that to your assumed average.' },
    formulas: [
      { n: "Basic average", eq: "Average = (Sum of values) / (Number of values)" },
      { n: "Replacing one value", eq: "New average = Old average + (new value − old value)/n" },
      { n: "Average speed (equal distance)", eq: "2ab / (a+b)", note: "NOT (a+b)/2 — that's only correct for equal TIME, not equal distance. Classic trap." },
    ],
    example: { label: "Worked example — deviation method", lines: [
      "Average of 42, 45, 48, 51, 54?",
      '<span class="svStep">Assume average = 48 → deviations: −6,−3,0,+3,+6</span>',
      "Sum of deviations = 0 → average = 48 + 0/5 = <b>48</b>",
    ]},
  },

  partnership: {
    group: "B", label: "Partnership",
    intro: "Profit is split in proportion to how much capital each partner put in, and for how long.",
    concept: { title: "It's always capital × time", body: 'Even "simple" partnership (same duration) is just the compound formula with time cancelled out — don\'t memorize two separate rules, just always multiply capital by time invested and take the ratio.' },
    formulas: [
      { n: "Simple partnership (same duration)", eq: "Profit ratio = ratio of capitals invested" },
      { n: "Compound partnership (different duration)", eq: "Profit ratio = capital × time, for each partner" },
    ],
    example: { label: "Worked example", lines: [
      "A invests 5000 for 12 months, B invests 6000 for 8 months — profit ratio?",
      '<span class="svStep">A: 5000×12=60000   B: 6000×8=48000</span>',
      "Ratio = 60000:48000 = <b>5:4</b>",
    ]},
  },

  mixture: {
    group: "B", label: "Mixture & Alligation",
    intro: "The fast way to find how much of two things to mix to hit a target average/concentration.",
    concept: { title: "Draw the cross", body: "Write the two CPs/concentrations at the top-left and bottom-left, the mean in the middle, then cross-subtract diagonally to get the ratio directly — faster than setting up an equation." },
    formulas: [
      { n: "Alligation rule", eq: "(Qty cheaper) / (Qty dearer) = (CP dearer − Mean) / (Mean − CP cheaper)" },
    ],
    example: { label: "Worked example", lines: [
      "Mix tea at ₹20/kg and ₹30/kg to get a mix worth ₹24/kg — ratio?",
      '<span class="svStep">(30−24) : (24−20) = 6 : 4</span>',
      "= <b>3 : 2</b> (cheaper : dearer)",
    ]},
  },

  std: {
    group: "C", label: "Speed, Time & Distance",
    intro: "The base chapter that Trains and Boats & Streams are both built on top of.",
    concept: { title: "Convert units before anything else", body: "The #1 error source: mixing km/h and m/s mid-calculation. Convert everything to the same unit FIRST, then plug into the formula." },
    formulas: [
      { n: "Core relation", eq: "Speed = Distance / Time" },
      { n: "km/h → m/s", eq: "multiply by 5/18" },
      { n: "m/s → km/h", eq: "multiply by 18/5" },
      { n: "Relative speed — same direction", eq: "Relative speed = difference of the two speeds" },
      { n: "Relative speed — opposite directions", eq: "Relative speed = sum of the two speeds" },
    ],
    example: { label: "Worked example", lines: [
      "A car covers 90 km in 2 hours — speed in m/s?",
      '<span class="svStep">Speed = 90/2 = 45 km/h</span>',
      "45 × 5/18 = <b>12.5 m/s</b>",
    ]},
  },

  trains: {
    group: "C", label: "Trains",
    intro: "A special case of relative speed — the train's own LENGTH has to be covered too.",
    concept: { title: "Always convert to m/s first", body: "Train lengths are in meters but speeds are given in km/h — convert the speed to m/s before anything else, every single time." },
    formulas: [
      { n: "Crossing a pole / standing person", eq: "Time = (length of train) / (speed of train)" },
      { n: "Crossing a platform / bridge", eq: "Time = (length of train + length of platform) / speed" },
      { n: "Two trains, opposite directions", eq: "Time = (sum of lengths) / (sum of speeds)" },
      { n: "Two trains, same direction", eq: "Time = (sum of lengths) / (difference of speeds)" },
    ],
    example: { label: "Worked example", lines: [
      "Trains of 120m & 180m, speeds 54 km/h & 36 km/h, opposite directions — time to cross?",
      '<span class="svStep">Convert: 54→15 m/s, 36→10 m/s</span>',
      "Time = (120+180)/(15+10) = 300/25 = <b>12 seconds</b>",
    ]},
  },

  boats: {
    group: "C", label: "Boats & Streams",
    intro: "The current either helps you (downstream) or fights you (upstream).",
    concept: { title: "Direction confusion is the only real trap", body: "Downstream = with the current = faster. Upstream = against the current = slower. Once you have both speeds, boat speed and stream speed are just their average and half-difference." },
    formulas: [
      { n: "Downstream speed", eq: "Boat speed + Stream speed" },
      { n: "Upstream speed", eq: "Boat speed − Stream speed" },
      { n: "Boat speed (still water)", eq: "(Downstream + Upstream) / 2" },
      { n: "Stream speed", eq: "(Downstream − Upstream) / 2" },
    ],
    example: { label: "Worked example", lines: [
      "Downstream speed 16 km/h, upstream speed 8 km/h — boat & stream speed?",
      '<span class="svStep">Boat = (16+8)/2 = 12 km/h</span>',
      "Stream = (16−8)/2 = <b>4 km/h</b>",
    ]},
  },

  mensuration2d: {
    group: "D", label: "2D Mensuration",
    intro: "Area and perimeter of flat shapes.",
    concept: { title: "Heron's formula is a fallback, not a first choice", body: "Only reach for Heron's formula (needs all 3 sides) when you don't have a base and height. If you do, ½×base×height is always faster." },
    formulas: [
      { n: "Square", eq: "Area = a²<br>Perimeter = 4a" },
      { n: "Rectangle", eq: "Area = l×b<br>Perimeter = 2(l+b)" },
      { n: "Triangle", eq: "Area = ½ × base × height" },
      { n: "Triangle (Heron's)", eq: "Area = √[s(s−a)(s−b)(s−c)]<br>s = (a+b+c)/2", note: "Use only when you have all 3 sides and no height." },
      { n: "Circle", eq: "Area = πr²<br>Circumference = 2πr" },
      { n: "Parallelogram", eq: "Area = base × height" },
      { n: "Trapezium", eq: "Area = ½ × (sum of parallel sides) × height" },
    ],
    example: { label: "Worked example — Heron's check", lines: [
      "Triangle with sides 3, 4, 5 — area two ways",
      '<span class="svStep">Direct: ½×3×4 = 6</span> (right triangle, legs 3 & 4)',
      "Heron's: s=6 → √(6×3×2×1) = √36 = <b>6</b> ✓ matches",
    ]},
  },

  mensuration3d: {
    group: "D", label: "3D Mensuration",
    intro: "Volume and surface area of solids.",
    concept: { title: "Melting & recasting = EQUATE VOLUMES, never surface area", body: 'The classic trap question: "a cube is melted and recast into spheres" — the material is conserved, so volumes are equal, NOT surface areas. Set Volume(before) = Volume(after) and solve.' },
    formulas: [
      { n: "Cube", eq: "Volume = a³<br>Surface area = 6a²<br>Diagonal = a√3" },
      { n: "Cuboid", eq: "Volume = l×b×h<br>Surface area = 2(lb+bh+hl)" },
      { n: "Cylinder", eq: "Volume = πr²h<br>Curved SA = 2πrh<br>Total SA = 2πr(r+h)" },
      { n: "Cone", eq: "Volume = ⅓πr²h<br>Curved SA = πrl,  l = √(r²+h²)<br>Total SA = πr(r+l)" },
      { n: "Sphere", eq: "Volume = 4/3 πr³<br>Surface area = 4πr²" },
      { n: "Hemisphere", eq: "Volume = 2/3 πr³<br>Curved SA = 2πr²<br>Total SA = 3πr²" },
    ],
    example: { label: "Worked example — melting & recasting", lines: [
      "A cylinder r=7, h=10 (π=22/7) — volume?",
      '<span class="svStep">Volume = 22/7 × 49 × 10</span>',
      "= <b>1540</b> (if melted into another shape, THIS number is what you equate to)",
    ]},
  },
};

const GROUP_LABELS: Record<Group, string> = { A: "Speed Maths", B: "Arithmetic", C: "Speed, Time & Distance", D: "Mensuration" };
const GROUPS: Group[] = ["A", "B", "C", "D"];

// ============== Speed Maths shortcuts, embedded here ==============
const SQRT_LAST_DIGIT_MAP: Record<number, number[]> = { 0: [0], 1: [1, 9], 4: [2, 8], 5: [5], 6: [4, 6], 9: [3, 7] };
const IMPOSSIBLE_SQUARE_ENDINGS = [2, 3, 7, 8];
const CBRT_LAST_DIGIT_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 8, 3: 7, 4: 4, 5: 5, 6: 6, 7: 3, 8: 2, 9: 9 };

function findSquareExample(d: number): number {
  for (let n = 11; n < 60; n++) if ((n * n) % 10 === d) return n;
  return 11;
}
function findCubeExample(d: number): number {
  for (let n = 11; n < 60; n++) if ((n * n * n) % 10 === d) return n;
  return 11;
}
function squareRootSteps(n: number) {
  const sq = n * n;
  const lastDigit = sq % 10;
  const remaining = Math.floor(sq / 100);
  let k = 0;
  while ((k + 1) * (k + 1) <= remaining) k++;
  const candidates = SQRT_LAST_DIGIT_MAP[lastDigit];
  const chosen = candidates.length === 1 ? candidates[0] : (remaining > k * (k + 1) ? Math.max(...candidates) : Math.min(...candidates));
  return { sq, remaining, k, candidates, chosen, ans: k * 10 + chosen };
}
function cubeRootSteps(n: number) {
  const cu = n * n * n;
  const last3 = cu % 1000;
  const rest = Math.floor(cu / 1000);
  const unitDigit = CBRT_LAST_DIGIT_MAP[last3 % 10];
  let k = 0;
  while ((k + 1) ** 3 <= rest) k++;
  return { cu, last3, rest, unitDigit, k, ans: k * 10 + unitDigit };
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
  const nums = kind === "sqrt" ? [50, 100, 150, 200, 250, 300] : [10, 20, 30, 40, 50, 60, 70, 80, 90];
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

export default function StudyVault() {
  const keys = Object.keys(CHAPTERS);
  const [active, setActive] = useState(keys[0]);
  const ch = CHAPTERS[active];

  return (
    <div className="svPage">
      <div className="svEyebrow">Study Vault</div>
      <h1 className="svTitle">Formulas, concepts & approach — by chapter</h1>
      <p className="svSub">Pulled from real RRB PO paper analysis — these are the chapters that actually show up.</p>

      {GROUPS.map((g) => (
        <div key={g}>
          <div className="svGroupLabel">{GROUP_LABELS[g]}</div>
          <div className="svChapterRow">
            {keys.filter((k) => CHAPTERS[k].group === g).map((k) => (
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
            {ch.example && (
              <div className="svExampleBox">
                <div className="svElbl">{ch.example.label}</div>
                <div className="svEwork" dangerouslySetInnerHTML={{ __html: ch.example.lines.join("<br>") }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
