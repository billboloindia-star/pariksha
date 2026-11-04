import demoPaper from "../demo_paper.yml?raw";

export const aiConversionPrompt = `Convert the attached exam paper into exactly this YAML format. Keep every question, option, and the correct answer faithful to the source — don't invent or skip anything. Set "exam" to the name of the exam or subject (e.g. "NEET", "CAT", "CA Foundation", "GATE CSE"). Use type "mc" for multiple choice and "num" for a typed numeric answer. Output only the YAML, nothing else — no commentary, no markdown code fences.

If a question depends on a diagram (a labelled structure, a circuit, a ray diagram, anything that can't be written as text or a table): if you can see the image and can output it, add an "image" field set to a base64 data URI, e.g. image: "data:image/png;base64,iVBORw0KG...". If you can't extract the actual image, instead set "image" to a short filename you'll provide separately, e.g. image: "q5.png" — the person converting the paper will attach that file in the app afterward.

Here is a worked example of the exact format to follow:

${demoPaper}`;
