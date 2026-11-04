# Handoff — RRB PO exam app

A local exam app for IBPS RRB PO (Officer Scale I) practice. You load a paper file (JSON or YAML),
write it in an interface modelled on the real IBPS exam screen, and get a full analysis afterwards.

Stack: **React 19 + TypeScript + Vite**. No UI library, no state library, no backend, no network calls.
Everything runs on the user's own machine.

---

## 1. What works today

- **Paper loading** — file picker or paste box, `.json` / `.yml` / `.yaml` / `.txt`, validated with named errors.
- **Instructions screen** with an "I have read the instructions" gate.
- **Exam interface** — navy top bar (paper title, live clock, candidate block), section tabs,
  question panel with marks line, five-option MCQ and typed-answer questions, DI tables,
  action bar (Mark for Review & Next · Clear Response · Previous · Save & Next), question palette
  with the five IBPS statuses, submit confirmation modal.
- **Timing** — one overall clock, *or* per-section clocks (`section_duration_minutes`); a section locks
  when its time ends and the paper moves on by itself.
- **Per-question timing** accumulated across revisits.
- **Analysis** — net score with negative marking, correct/wrong/skipped/attempted, accuracy,
  average seconds per question, pace, topic-wise table (attempts, right, accuracy, avg time),
  five slowest answers, **question-by-question review** (every question: your answer, right answer,
  time, solution), attempt history in `localStorage`, **CSV export** of the question log.
- **Keyboard** — `1`–`5` pick an MCQ option, `Enter` saves and advances, `←` `→` move between questions.

---

## 2. Run it

```bash
npm install      # once, needs internet
npm run dev      # http://localhost:5173
npm run build    # -> dist/index.html, one self-contained file
```

Launchers are included for people who don't use a terminal: `start.bat` (Windows) and
`start.command` (macOS/Linux). Both run `npm install` on first use, then `npm run dev`, then open the browser.

Node 20+ is required. The build inlines JS and CSS into `dist/index.html`, which opens from
`file://` with no server — that is why the demo paper is embedded at build time rather than fetched.

---

## 3. Layout

```
exam-app/
  index.html              Vite entry, mounts #root
  package.json            deps + scripts
  vite.config.ts          react plugin + viteSingleFile (single-file build)
  tsconfig.json           strict TypeScript
  demo_paper.yml          demo paper, also imported into the bundle with ?raw
  paper_format.md         user-facing spec of the paper file
  HANDOFF.md              this document
  src/
    main.tsx              React root
    App.tsx               phase machine: home -> instructions -> exam -> report
    types.ts              all types, status derivation, ExamResult
    yaml.ts               minimal YAML reader (subset: maps, lists of maps, inline JSON, scalars)
    paper.ts              parse + validate a paper file into Paper
    useExam.ts            exam state: navigation, clocks, per-question timing, submit
    components/
      Home.tsx            file picker, paste box, demo loader
      Instructions.tsx    pre-exam instructions + agree checkbox
      Exam.tsx            the exam interface
      Report.tsx          the analysis screen + CSV export
    styles.css            all styling, CSS variables at the top
```

---

## 4. Data flow

```
file / paste ──► parsePaper()  (paper.ts)
                    │  JSON.parse or parseYaml(), then normalise + validate every question
                    ▼
                 Paper { title, durationMinutes, negativeMarking, sections[], questions[] }
                    ▼
              Instructions ──► Exam (useExam) ──► buildResult() ──► Report
                                                     │
                                                     └─► localStorage history, CSV export
```

`Paper.questions` is flat; `Paper.sections` holds `{name, from, to, minutes?}` index ranges into it.
`ExamResult` carries the paper, the per-question `states`, and all aggregates, so `Report` needs
nothing but that object.

---

## 5. Paper format

```yaml
title: "Demo paper - mixed quant"
duration_minutes: 10          # overall clock
negative_marking: 0.25        # deducted per wrong answer

sections:
  - name: "Arithmetic"
    section_duration_minutes: 8   # OPTIONAL — gives this section its own clock
    questions:
      - id: A1                    # optional
        topic: "Simplification"   # optional, defaults to section name; drives the topic table
        type: num                 # num (typed) or mc (options)
        question: "12 × 5 + 84 ÷ 7 − 30 = ?"
        answer: 42
        solution: "60 + 12 − 30 = 42"     # optional, shown in the review
        table:                            # optional, rendered above the question (DI)
          head: ["Shop", "Pens sold"]
          rows: [["P", 40], ["Q", 75]]

      - id: Q2
        topic: "Quadratic"
        type: mc
        question: "Larger root of x² − 13x + 42 = 0 ?"
        options: ["6", "7", "13", "42", "None of these"]   # any count; letters are generated
        answer_index: 1                                     # 0-based; or use answer: "7"
```

Rules enforced by `parsePaper`: `duration_minutes` required; every question needs `question` text;
`num` needs a numeric `answer`; `mc` needs ≥2 `options` and a valid `answer_index` or matching `answer`.
A flat `questions:` list is also accepted and wrapped in a single section called *Paper*.

---

## 6. Domain rules

**Statuses** (`statusOf` in `types.ts`), matching the IBPS palette:
`notVisited` grey · `notAnswered` red (visited, no answer) · `answered` green ·
`marked` purple · `answeredMarked` purple with a stripe.

**Marking** — one mark per correct answer, `negative_marking` deducted per wrong answer, nothing for skipped.
Net score is `correct − neg × wrong`.

**Timing** — every question accumulates `timeMs` while it is on screen; the value survives revisits
(`flushTime` on every navigation). With sectional timing, the clock shows the current section's
remaining time; at zero the section is added to `lockedSections`, its palette cells and tab are
disabled, and the paper jumps to the first question of the next section. After the last section the
paper submits itself.

**Submission** — manual via the modal, or automatic when the clock reaches zero. The current
question's time is flushed before the result is built.

---

## 7. Conventions

- No dependencies beyond `react`, `react-dom` and the Vite toolchain. Keep it that way — the app must
  build to one file and run offline.
- Styling is plain CSS with variables (`--navy`, `--blue`, `--green`, `--red`, `--purple`, `--line`…) at
  the top of `styles.css`. Change colours there, not in components.
- All exam state lives in `useExam`; components render it and call its actions. Don't put timing logic
  in components.
- TypeScript is `strict`; `npm run build` runs `tsc` first, so type errors fail the build.
- Every user-facing string is plain English, short, and never uses emoji.

---

## 8. Testing notes

There is no test suite; verification was done by driving the built app in headless Chromium and
reading the DOM back. If you change the engine, re-check these four things:

1. `npx tsc --noEmit` — clean.
2. `npx vite build` — produces `dist/index.html`.
3. **Full attempt** — load the demo paper, accept instructions, answer every question through the real
   inputs and option buttons, submit, and confirm the net score equals `correct − 0.25 × wrong`.
4. **Sectional timing** — load a paper with two sections of `0.12` minutes each; after roughly seven
   seconds the clock label must switch to the second section, its tab must be `disabled`, and the
   locked palette cells must equal the first section's question count.

Gotchas when driving React from a script:
- Setting `input.value` directly does **not** update React state. Use the native setter:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` then dispatch
  `new Event('input', {bubbles:true})`.
- React state updates are async — poll for the element you expect instead of reading immediately.
- `localStorage` may be unavailable on `file://` in some browsers; all access is wrapped in try/catch.
- On macOS, a downloaded `start.command` is quarantined: `chmod +x` and
  `xattr -d com.apple.quarantine start.command`.

---

## 9. Not built yet (deliberately)

- **Resume after refresh** — an in-progress attempt is lost on reload.
- **Reasoning section** — the engine is subject-agnostic, so a paper can contain any mix; only the
  content is missing.
- **Images in questions** (charts, figures) — `table` is the only structured content supported.
- **Per-question marks override** — every question is worth 1 mark.
- **Multiple correct answers / partial marking**.
- **PDF export** of the report (CSV exists).
- **Dark mode** (the palette is fixed to the light exam look on purpose).

---

## 10. Suggested next steps, in order of value

1. **Persist the in-progress attempt** to `localStorage` (state + startedAt + paper hash) and offer
   "Resume" on load. A 20-minute mock shouldn't be lost to a stray reload.
2. **Per-question marks** (`marks: 1.25`) — RRB Mains weights sections differently; the app assumes 1.
3. **Review mode after the report** — let the user click a question in the review and re-open it
   read-only, with the solution, rather than a flat list.
4. **Trend chart** — net score and average seconds across stored attempts, drawn with inline SVG.
5. **Paper library** — keep several papers in `localStorage` and let the user pick one from a list.
6. **Reasoning content** — same engine, just papers with puzzles; needs long-text question support.

---

## 11. Brief to paste into another AI

> This is a React 19 + TypeScript + Vite exam app for IBPS RRB PO practice. It loads a paper from a
> JSON/YAML file, runs it in an IBPS-style interface (section tabs, question palette with five
> statuses, per-question timing, optional per-section clocks), and produces an analysis screen with
> net score, accuracy, average time per question, topic-wise stats, slowest answers, a
> question-by-question review and CSV export.
>
> Read `HANDOFF.md` first, then `src/types.ts`, `src/paper.ts`, `src/useExam.ts`,
> `src/components/Exam.tsx` and `src/components/Report.tsx`. All exam state lives in `useExam`; keep it
> that way. No UI libraries, no new runtime dependencies, plain CSS with variables, strict TypeScript,
> and the build must stay a single self-contained `dist/index.html` that runs offline.
>
> The user is a student preparing for an exam on the 21st, on macOS. Prefer small, verified changes:
> run `npx tsc --noEmit` and `npx vite build` after every edit, and drive the built file in headless
> Chromium to confirm the flow still works.
