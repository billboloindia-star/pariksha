import { parseYaml } from "./yaml";
import type { Paper, Question, RawPaper, RawQuestion, RawSection, SectionInfo, TableSpec } from "./types";

export type ParseResult = { paper: Paper; error?: undefined } | { paper?: undefined; error: string };

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

function normaliseTable(t: unknown): TableSpec | undefined {
  if (!t || typeof t !== "object") return undefined;
  const obj = t as { head?: unknown; rows?: unknown };
  const head = Array.isArray(obj.head) ? obj.head.map(String) : [];
  const rows = Array.isArray(obj.rows)
    ? obj.rows.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => (typeof c === "number" ? c : String(c))))
    : [];
  if (!head.length || !rows.length) return undefined;
  return { head, rows };
}

function buildQuestion(raw: RawQuestion, section: string, index: number): Question | { error: string } {
  if (!raw || typeof raw !== "object") return { error: `Question ${index + 1} in ${section} is not an object.` };
  const type = String(raw.type ?? "num").toLowerCase() === "mc" ? "mc" : "num";
  const text = String(raw.question ?? raw.text ?? "").trim();
  const id = String(raw.id ?? `${section}-${index + 1}`);
  if (!text) return { error: `Question ${index + 1} in ${section} has no "question" text.` };

  const base = {
    id,
    section,
    topic: String(raw.topic ?? section),
    type: type as "num" | "mc",
    text,
    table: normaliseTable(raw.table),
    solution: raw.solution ? String(raw.solution) : raw.explanation ? String(raw.explanation) : undefined,
  };

  if (type === "mc") {
    const options = Array.isArray(raw.options) ? raw.options.map(String) : [];
    if (options.length < 2) return { error: `MC question ${id} needs at least two "options".` };
    let ai = typeof raw.answer_index === "number" ? raw.answer_index : -1;
    if (ai < 0 && typeof raw.answer === "string") {
      ai = options.findIndex((o) => o.trim() === String(raw.answer).trim());
    }
    if (ai < 0 || ai >= options.length) {
      return { error: `MC question ${id} needs "answer_index" (0-based) or an "answer" that matches an option.` };
    }
    return { ...base, options, ans: ai };
  }

  const ans = asNumber(raw.answer);
  if (ans === null) return { error: `Question ${id} needs a numeric "answer".` };
  return { ...base, ans };
}

export function parsePaper(text: string): ParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { error: "The file is empty." };

  let obj: RawPaper;
  try {
    obj = (trimmed[0] === "{" || trimmed[0] === "[" ? JSON.parse(trimmed) : parseYaml(trimmed)) as RawPaper;
  } catch (e) {
    return { error: `Could not read the file: ${(e as Error).message}` };
  }
  if (!obj || typeof obj !== "object") return { error: "No paper object found in the file." };

  const errors: string[] = [];
  const title = String(obj.title ?? "Untitled paper");
  const duration = asNumber(obj.duration_minutes);
  if (duration === null || duration <= 0) errors.push('"duration_minutes" is missing or not a positive number.');
  const neg = asNumber(obj.negative_marking);

  let sectionsRaw: RawSection[] = [];
  if (Array.isArray(obj.sections) && obj.sections.length) sectionsRaw = obj.sections;
  else if (Array.isArray(obj.questions)) sectionsRaw = [{ name: "Paper", questions: obj.questions }];
  else errors.push('No "sections" or "questions" list found.');

  const questions: Question[] = [];
  const sections: SectionInfo[] = [];
  sectionsRaw.forEach((sec, si) => {
    const name = String(sec?.name ?? `Section ${si + 1}`);
    if (!sec || !Array.isArray(sec.questions) || !sec.questions.length) {
      errors.push(`Section "${name}" has no questions.`);
      return;
    }
    const from = questions.length;
    sec.questions.forEach((raw, qi) => {
      const built = buildQuestion(raw, name, qi);
      if ("error" in built) errors.push(built.error);
      else questions.push(built);
    });
    const mins = asNumber((sec as { section_duration_minutes?: unknown }).section_duration_minutes);
    if (questions.length > from) {
      sections.push({ name, from, to: questions.length - 1, ...(mins && mins > 0 ? { minutes: mins } : {}) });
    }
  });

  if (!questions.length) errors.push("No questions were read.");
  if (errors.length) return { error: errors.slice(0, 5).join("\n") };

  return {
    paper: {
      title,
      durationMinutes: duration as number,
      negativeMarking: neg === null ? 0.25 : neg,
      sections,
      questions,
    },
  };
}
