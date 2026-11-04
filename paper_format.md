# Paper format for the runner

The app reads one paper file — either **JSON** or **YAML** (JSON is a subset of YAML, so the same content works in both). Load it with the file picker, or paste the text into the box and press *Read pasted text*. This format works for any exam — IBPS, JEE, NEET, CAT, GATE, CA, law, whatever you're preparing for.

Don't have a paper in this format yet? The home screen has a ready-to-copy prompt (with a worked example built in) that you can hand to any AI chat assistant along with your own PDF or photo of a previous paper, and it will convert it for you.

---

## The shape

```yaml
title: "Demo paper - mixed quant"      # any text, shown on the exam screen
exam: "IBPS RRB PO"                    # optional; shown as a badge. Defaults to "General"
duration_minutes: 10                   # whole minutes; the clock counts down from this
negative_marking: 0.25                 # marks deducted per wrong answer (0 disables it)

sections:                              # one or more; they group the questions and the report
  - name: "Arithmetic"
    questions:
      - id: A1                         # optional; used in error messages
        topic: "Simplification"        # optional; defaults to the section name
        type: num                      # num = typed answer, mc = multiple choice
        question: "12 × 5 + 84 ÷ 7 − 30 = ?"
        answer: 42                     # the number the candidate must type
        solution: "60 + 12 − 30 = 42"  # optional; shown in the report for missed questions
```

## Question types

**Numeric (`type: num`)** — the candidate types a number.

| field | required | notes |
|---|---|---|
| `question` | yes | the text shown |
| `answer` | yes | number; decimals allowed |
| `topic` | no | report grouping |
| `solution` | no | one line, shown for wrong/skipped questions |
| `table` | no | see below, for DI |
| `image` | no | see below, for diagrams |

**Multiple choice (`type: mc`)** — the candidate taps one option.

| field | required | notes |
|---|---|---|
| `question` | yes | |
| `options` | yes | at least two strings |
| `answer_index` | yes* | 0-based index of the right option |
| `answer` | yes* | alternative: the exact text of the right option |

\* give either `answer_index` or `answer`.

**Data Interpretation** — any question can carry a table above it:

```yaml
        table:
          head: ["Shop", "Pens sold", "Pencils sold"]
          rows: [["P", 40, 55], ["Q", 75, 30], ["R", 60, 45]]
```

The first column is rendered left-aligned, the rest right-aligned.

**Diagrams** (NEET, BDS/MDS, circuits, ray diagrams...) — any question can carry an image above it:

```yaml
        image: "data:image/png;base64,iVBORw0KG..."   # embedded directly, or:
        image: "q5.png"                                 # a filename, attached separately in the app
```

If the AI converting your paper can see and output the actual image, ask it to embed it as a
`data:` URI directly — zero extra steps. If it can't, use a short filename instead and attach the
matching image file in the "Attach diagram images" box on the home screen; the app encodes it for
you. The ready-to-copy prompt on the home screen already explains both paths.

---

## Same thing in JSON

```json
{
  "title": "Demo paper",
  "duration_minutes": 10,
  "negative_marking": 0.25,
  "sections": [
    {
      "name": "Arithmetic",
      "questions": [
        { "id": "A1", "topic": "Simplification", "type": "num",
          "question": "12 × 5 + 84 ÷ 7 − 30 = ?", "answer": 42,
          "solution": "60 + 12 − 30 = 42" }
      ]
    }
  ]
}
```

You can also skip `sections` entirely and give a flat `questions:` list — the app wraps it in a single section called *Paper*.

---

## What the app checks before starting

It refuses to start and tells you what is wrong if:

- `duration_minutes` is missing
- a section has no `questions` list
- a question has no `question` text
- a `num` question has no numeric `answer`
- an `mc` question has fewer than two `options`, or no valid `answer_index` / matching `answer`

Errors name the section and the question, so a 40-question paper is quick to fix.

---

## Writing maths so it reads well

Use these characters directly in `question` — they render cleanly and avoid ambiguity:

| use | not |
|---|---|
| `×` | `x` or `*` |
| `÷` | `/` |
| `−` | `-` (for subtraction) |
| `²` `³` | `^2` `^3` |
| `₹` | `Rs.` |
| `≈` | `~` |

Keep `solution` to one line — it appears under each missed question in the report.

---

## Tips for building a good paper

- **One topic label per question type you want to see in the report.** The report's *by topic* table is only as useful as your `topic` values: `Simplification`, `Number Series`, `Quadratic`, `Arithmetic`, `Data Interpretation` give you exactly the five rows you want to compare.
- **Reuse a table across its questions.** Give every question in a DI set the same `table` block; the app shows it above each one.
- **Aim for the real ratio.** For an RRB PO Quant paper: 5 series, 5 simplification, 5 quadratic, 15 arithmetic, 10 DI.
- **Keep answers exact.** Every answer should be a whole number unless the question genuinely has a decimal.
