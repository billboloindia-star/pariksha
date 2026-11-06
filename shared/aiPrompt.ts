/* Inlined from demo_paper.yml (rather than imported via Vite's `?raw` loader)
 * so this file has no bundler dependency and works unchanged under Metro/RN.
 * Keep this in sync with demo_paper.yml by hand if that file ever changes. */
const demoPaper = `title: "Demo paper - mixed quant"
exam: "IBPS RRB PO"
duration_minutes: 10
negative_marking: 0.25

sections:
  - name: "Arithmetic"
    questions:
      - id: A1
        topic: "Simplification"
        type: num
        question: "12 × 5 + 84 ÷ 7 − 30 = ?"
        answer: 42
        solution: "Resolve the × and ÷ first: 60 + 12 − 30 = 42"

      - id: A2
        topic: "Percentage"
        type: num
        question: "What is 37.5% of 640?"
        answer: 240
        solution: "37.5% = 3/8, and 3/8 of 640 = 240"

      - id: A3
        topic: "Average"
        type: num
        question: "The average of five numbers is 40. One of them is 24. What is the average of the other four?"
        answer: 44
        solution: "Total = 200. Remaining total = 176. 176 ÷ 4 = 44"

      - id: A4
        topic: "Ratio"
        type: num
        question: "₹1,800 is divided between A and B in the ratio 4 : 5. What is B's share (in ₹)?"
        answer: 1000
        solution: "9 parts = 1800, so 1 part = 200. B = 5 × 200 = 1000"

      - id: A5
        topic: "Time and Work"
        type: num
        question: "A can finish a work in 12 days and B in 24 days. Working together, in how many days will they finish it?"
        answer: 8
        solution: "(12 × 24) ÷ 36 = 8"

  - name: "Reasoning with numbers"
    questions:
      - id: R1
        topic: "Quadratic"
        type: mc
        question: "What is the larger root of x² − 13x + 42 = 0 ?"
        options: ["6", "7", "13", "42", "None of these"]
        answer_index: 1
        solution: "(x − 6)(x − 7) = 0, so the roots are 6 and 7"

      - id: R2
        topic: "Fractions"
        type: mc
        question: "Which fraction is equal to 62.5% ?"
        options: ["3/8", "5/8", "7/8", "2/3", "None of these"]
        answer_index: 1
        solution: "1/8 = 12.5%, so 5/8 = 62.5%"

      - id: R4
        topic: "Percentage"
        type: mc
        question: "20% of 350 is what percent of 280 ?"
        options: ["20%", "25%", "30%", "35%", "None of these"]
        answer_index: 1
        solution: "20% of 350 = 70, and 70 is 25% of 280"

      - id: R3
        topic: "Number Series"
        type: num
        question: "Find the missing term: 7, 12, 19, 28, ?, 52"
        answer: 39
        solution: "Differences are 5, 7, 9, 11, 13 — so 28 + 11 = 39"

  - name: "Data Interpretation"
    questions:
      - id: D1
        topic: "Data Interpretation"
        type: num
        question: "What is the total number of pens sold by all three shops?"
        table:
          head: ["Shop", "Pens sold", "Pencils sold"]
          rows: [["P", 40, 55], ["Q", 75, 30], ["R", 60, 45]]
        answer: 175
        solution: "40 + 75 + 60 = 175"

      - id: D2
        topic: "Data Interpretation"
        type: num
        question: "By how much do the pencils sold by shop P exceed those sold by shop Q?"
        table:
          head: ["Shop", "Pens sold", "Pencils sold"]
          rows: [["P", 40, 55], ["Q", 75, 30], ["R", 60, 45]]
        answer: 25
        solution: "55 − 30 = 25"
`;

const BASE_PROMPT = `exactly this YAML format. Keep every question, option, and the correct answer faithful to the source — don't invent or skip anything. Set "exam" to the name of the exam or subject (e.g. "NEET", "CAT", "CA Foundation", "GATE CSE"). Use type "mc" for multiple choice and "num" for a typed numeric answer. Output only the YAML, nothing else — no commentary, no markdown code fences.

For bank/government competitive exams (IBPS, SBI, RRB, SSC, RBI, insurance exams, etc.) that test the usual broad subjects: each "section" must be one of those broad subjects only — typically "Reasoning Ability", "Quantitative Aptitude" (or "Numerical Ability"), "English Language", and "General/Financial Awareness" if present — matching however the source paper itself labels them. Do NOT create a separate section per sub-skill (e.g. don't make "Syllogism", "Circular Seating Arrangement", "Coding-Decoding", "Simplification" their own sections) — those go in the per-question "topic" field instead, so a 35-question Reasoning portion stays one section with each question tagged by its actual sub-topic. For any other kind of exam, use whatever sections the source paper itself defines.

If a question depends on a diagram (a labelled structure, a circuit, a ray diagram, anything that can't be written as text or a table): if you can see the image and can output it, add an "image" field set to a base64 data URI, e.g. image: "data:image/png;base64,iVBORw0KG...". If you can't extract the actual image, instead set "image" to a short filename you'll provide separately, e.g. image: "q5.png" — the person converting the paper will attach that file in the app afterward.

Here is a worked example of the exact format to follow:

${demoPaper}`;

export const aiConversionPrompt = `Convert the attached exam paper into ${BASE_PROMPT}`;

/**
 * Builds a conversion prompt that embeds direct links to the file(s) already
 * sitting in the user's vault, so they can paste it straight into an AI that
 * can fetch URLs (web-enabled ChatGPT/Claude, Gemini) without re-uploading
 * the file by hand. Links are presigned and time-limited — generate them
 * right before copying, not ahead of time.
 */
export function aiConversionPromptWithLinks(fileLinks: { fileName: string; url: string }[]): string {
  if (fileLinks.length === 0) return aiConversionPrompt;
  const linkList = fileLinks.map((f) => `- ${f.fileName}: ${f.url}`).join("\n");
  return `Open and read the exam paper at the link(s) below (fetch the URL directly — don't ask me to upload or attach anything), then convert it into ${BASE_PROMPT}

The file(s) to fetch:
${linkList}

Note: these links expire shortly, so fetch them now rather than later.`;
}
