import demoPaper from "../demo_paper.yml?raw";

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
