import demoPaper from "../demo_paper.yml?raw";

export const aiConversionPrompt = `Convert the attached exam paper into exactly this YAML format. Keep every question, option, and the correct answer faithful to the source — don't invent or skip anything. Set "exam" to the name of the exam or subject (e.g. "NEET", "CAT", "CA Foundation", "GATE CSE"). Use type "mc" for multiple choice and "num" for a typed numeric answer. Output only the YAML, nothing else — no commentary, no markdown code fences.

Here is a worked example of the exact format to follow:

${demoPaper}`;
