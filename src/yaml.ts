/* Minimal YAML reader for the paper format: nested maps, lists of maps,
   inline JSON arrays, quoted and plain scalars. */

type Line = { ind: number; text: string };

function stripComment(s: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      out += c;
      if (c === quote && s[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#" && (i === 0 || s[i - 1] === " ")) break;
    out += c;
  }
  return out.replace(/\s+$/, "");
}

function parseScalar(v: string): unknown {
  const s = v.trim();
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (s[0] === '"' && s[s.length - 1] === '"') {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  if (s[0] === "[" || s[0] === "{") {
    try { return JSON.parse(s.replace(/'/g, '"')); } catch { return s; }
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/* Block-scalar indicator: "|" (literal, keeps line breaks) or ">" (folded,
   joins lines with spaces), with an optional chomping flag (-/+) and/or an
   explicit indent digit, e.g. "|-", ">+", "|2". Common for multi-line
   question text (seating-arrangement puzzles, passages). */
function blockScalarStyle(val: string): "|" | ">" | null {
  return /^[|>][+-]?\d*$/.test(val) ? (val[0] as "|" | ">") : null;
}

export function parseYaml(src: string): unknown {
  const raw = src.replace(/\r/g, "").split("\n");
  const lines: Line[] = [];
  for (const l of raw) {
    const clean = stripComment(l);
    if (clean.trim() === "" || clean.trim() === "---") continue;
    lines.push({ ind: clean.match(/^ */)![0].length, text: clean.trim() });
  }
  let pos = 0;

  function parseBlockScalar(style: "|" | ">", indent: number): string {
    const collected: string[] = [];
    while (pos < lines.length && lines[pos].ind > indent) {
      collected.push(lines[pos].text);
      pos++;
    }
    return collected.join(style === "|" ? "\n" : " ");
  }

  function resolveValue(val: string, indent: number): unknown {
    const style = blockScalarStyle(val);
    if (style) return parseBlockScalar(style, indent);
    if (val === "") {
      if (pos >= lines.length) return null;
      const next = lines[pos];
      if (next.ind > indent) return parseBlock(next.ind);
      /* A block sequence is allowed to sit at the SAME indent as its parent
         key, e.g. "sections:" followed by "- name: ..." at column 0 — don't
         mistake that for "no value". */
      if (next.ind === indent && (next.text.slice(0, 2) === "- " || next.text === "-")) return parseBlock(next.ind);
      return null;
    }
    return parseScalar(val);
  }

  function putKV(obj: Record<string, unknown>, text: string, indent: number): void {
    const idx = text.indexOf(":");
    if (idx < 0) { pos++; return; }
    const key = text.slice(0, idx).trim().replace(/^["']|["']$/g, "");
    const val = text.slice(idx + 1).trim();
    pos++;
    obj[key] = resolveValue(val, indent);
  }

  function parseBlock(indent: number): unknown {
    const first = lines[pos];
    if (!first) return null;
    const isList = first.text.slice(0, 2) === "- " || first.text === "-";
    if (isList) {
      const arr: unknown[] = [];
      while (
        pos < lines.length &&
        lines[pos].ind === indent &&
        (lines[pos].text.slice(0, 2) === "- " || lines[pos].text === "-")
      ) {
        const t = lines[pos].text;
        const rest = t === "-" ? "" : t.slice(2).trim();
        pos++;
        if (rest === "") {
          arr.push(parseBlock(indent + 2));
        } else if (/^[A-Za-z0-9_"'\-]+:(\s|$)/.test(rest)) {
          const obj: Record<string, unknown> = {};
          const ci = rest.indexOf(":");
          const k0 = rest.slice(0, ci).trim().replace(/^["']|["']$/g, "");
          const v0 = rest.slice(ci + 1).trim();
          obj[k0] = resolveValue(v0, indent);
          /* Sibling keys of a list-item mapping should be indented past the
             dash, but some AI output instead aligns them flush with the dash
             (e.g. "- name: X" followed by "questions:" at the same column).
             Accept that too — only a new "- " at this exact column ends the
             item. */
          while (
            pos < lines.length &&
            lines[pos].ind >= indent &&
            !(lines[pos].ind === indent && (lines[pos].text.slice(0, 2) === "- " || lines[pos].text === "-"))
          ) {
            putKV(obj, lines[pos].text, lines[pos].ind);
          }
          arr.push(obj);
        } else {
          arr.push(parseScalar(rest));
        }
      }
      return arr;
    }

    const map: Record<string, unknown> = {};
    while (pos < lines.length && lines[pos].ind === indent) {
      putKV(map, lines[pos].text, lines[pos].ind);
    }
    return map;
  }

  if (!lines.length) return {};
  return parseBlock(lines[0].ind);
}
