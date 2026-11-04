# RRB PO exam interface — React + TypeScript

A local exam app: load a paper (`.json` / `.yml`), write it in a proper exam interface, then read a full analysis.

## Run it

**Windows:** double-click `start.bat`. That is all — it installs what it needs on the first run
and opens the app in your browser.

**macOS / Linux:** double-click `start.command` (first time, if macOS refuses, right-click it and
choose *Open*). If it says permission denied, run `chmod +x start.command` once in a terminal.

**By hand, any system:**

```bash
npm install
npm run dev      # development, opens http://localhost:5173
npm run build    # production build -> dist/index.html (single self-contained file)
```

You need Node.js 20 or newer from nodejs.org. If you only want to *use* the app and not change it,
open the prebuilt single file instead — no Node needed at all.

`npm run build` produces **one** file, `dist/index.html`, with all JS and CSS inlined.
You can copy that file anywhere and open it by double-clicking — no server, no internet.

## Handing this to someone else (or another AI)

Read **`HANDOFF.md`** — it documents the architecture, the data flow, the domain rules, the testing
recipe, what is deliberately not built, and a suggested order for the next changes.

## The paper format

See `paper_format.md`. Short version:

```yaml
title: "My paper"
duration_minutes: 20
negative_marking: 0.25
sections:
  - name: "Quant"
    questions:
      - id: Q1
        topic: "Simplification"
        type: num
        question: "12 × 5 + 84 ÷ 7 − 30 = ?"
        answer: 42
        solution: "60 + 12 − 30 = 42"
      - id: Q2
        topic: "Quadratic"
        type: mc
        question: "Larger root of x² − 13x + 42 = 0 ?"
        options: ["6", "7", "13", "42"]
        answer_index: 1
        table:                        # optional, for DI questions
          head: ["Shop", "Pens sold"]
          rows: [["P", 40], ["Q", 75]]
```

Load it with the file picker on the home screen, or paste the text and press *Read pasted paper*.
`demo_paper.yml` ships with the project as a working example (also embedded behind *Load the demo paper*).

## What the analysis gives you

- net score with negative marking applied
- correct / wrong / skipped / attempted, accuracy, average seconds per question
- a topic-wise table: attempts, right answers, accuracy, average time
- your five slowest answers, flagged right or wrong
- every wrong answer with your value against the correct one, plus its `solution`
- **question-by-question review**: every question with your answer, the right answer, the time it took and its solution
- **CSV export** of that log, for your own records
- attempt history, kept in `localStorage` on your machine

The exam interface also supports **per-section clocks** (`section_duration_minutes` in the paper):
a section locks when its time is up and the paper moves on, the way the real prelims works.
Keyboard: `1`–`5` pick an option, `Enter` saves and advances, `←` `→` move between questions.

## Layout

```
src/
  main.tsx            entry
  App.tsx             phase switch: home -> instructions -> exam -> report
  types.ts            paper + state types, status derivation
  yaml.ts             minimal YAML reader for the paper format
  paper.ts            parse + validate a paper into the internal shape
  useExam.ts          exam state: navigation, timing per question, clock
  components/
    Home.tsx          file picker / paste box
    Instructions.tsx  pre-exam instructions with the agree checkbox
    Exam.tsx          the exam interface (top bar, tabs, question, palette)
    Report.tsx        the analysis screen
  styles.css          all styling
```

## Editing it

The exam interface is deliberately plain React state — no external UI library. To change colours,
edit the CSS variables at the top of `src/styles.css`. To change the exam rules (button behaviour,
marking), look in `src/useExam.ts` and `src/components/Exam.tsx`.
