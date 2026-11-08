import { useState } from "react";
import * as api from "../../shared/api";
import type { Question } from "../../shared/types";

interface Props {
  q: Question;
  given?: number | null;
  wasCorrect?: boolean | null;
  sourceLabel: string;
  sourceWhen?: number;
}

/** A star button that bookmarks the current question - reused identically
 * on the live exam screen (correctness unknown yet) and the post-exam
 * Report review (correctness known). Fire-and-forget: starts unfilled each
 * render, no fetch-to-check-existing-bookmark, to stay cheap on a screen
 * that renders per question. */
export default function BookmarkStar({ q, given, wasCorrect, sourceLabel, sourceWhen }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (!api.backendEnabled() || !api.getSession()) return null;

  async function mark() {
    if (state !== "idle") return;
    setState("saving");
    try {
      await api.addBookmark({
        section: q.section, topic: q.topic, type: q.type, text: q.text,
        table: q.table, image: q.image, solution: q.solution, options: q.options, ans: q.ans,
        given: given ?? null, wasCorrect: wasCorrect ?? null,
        sourceLabel, sourceWhen,
      });
      setState("saved");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      className={`bkmStarBtn ${state === "saved" ? "active" : ""}`}
      onClick={mark}
      disabled={state !== "idle"}
      title={state === "saved" ? "Bookmarked" : "Bookmark this question"}
      type="button"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8">
        <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.7l7.1-.6Z" strokeLinejoin="round" />
      </svg>
      {state === "saved" && <span className="bkmStarLbl">Bookmarked</span>}
    </button>
  );
}
