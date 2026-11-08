import { useEffect, useMemo, useState } from "react";
import * as api from "../../shared/api";
import type { BankQuestion, BankSectionSummary } from "../../shared/types";

/** Ungraded, browse-only practice - for source material with no written
 * answer key anywhere (e.g. a PDF whose every solution is a video link).
 * No scoring, no timer, no Paper/Exam/Report - just question, options, and
 * a "watch solution" link, one at a time. The user self-checks. */
export default function DrillBrowse({ section }: { section: string }) {
  const [chapters, setChapters] = useState<BankSectionSummary[] | null>(null);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.fetchBankSections(true).then((all) => {
      const rows = all.filter((s) => s.section === section);
      setChapters(rows);
      if (rows.length && !activeChapter) setActiveChapter(rows[0].chapter);
    }).catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (!activeChapter) return;
    setQuestions(null);
    setIdx(0);
    api.fetchBankQuestions(section, [activeChapter], undefined, true).then(setQuestions).catch((e) => setLoadError(e.message));
  }, [section, activeChapter]);

  const total = questions?.length ?? 0;
  const q = questions?.[idx];

  const totalCount = useMemo(() => (chapters ?? []).reduce((n, c) => n + c.count, 0), [chapters]);

  if (loadError) return <pre className="error">{loadError}</pre>;

  if (chapters !== null && chapters.length === 0) {
    return (
      <div className="card">
        <p className="muted">No browse-only practice content in {section} yet.</p>
      </div>
    );
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="cardIconRow">
          <span className="cardIcon purple">?</span>
          <h2>Browse practice — {section}</h2>
        </div>
        <p className="muted small" style={{ margin: "0 0 14px" }}>
          {totalCount.toLocaleString()} questions, no written answers — each has a link to a worked-solution video.
          Read, attempt mentally, then check yourself.
        </p>
        <div className="mvSectionTabs">
          {(chapters ?? []).map((c) => (
            <button
              key={c.chapter}
              type="button"
              className={`mvSectionTab ${activeChapter === c.chapter ? "active" : ""}`}
              onClick={() => setActiveChapter(c.chapter)}
            >
              {c.chapter} <small>{c.count}</small>
            </button>
          ))}
        </div>
      </section>

      {questions === null && <p className="muted">Loading…</p>}

      {questions !== null && total === 0 && <p className="muted">Nothing here.</p>}

      {q && (
        <section className="card drillCard">
          <div className="drillHead">
            <span className="drillPos">{idx + 1} / {total}</span>
            <div className="drillNav">
              <button type="button" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>← Prev</button>
              <button type="button" disabled={idx >= total - 1} onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}>Next →</button>
            </div>
          </div>
          <div className="drillText">{q.text}</div>
          <div className="drillOptions">
            {(q.options ?? []).map((opt, i) => (
              <div className="drillOption" key={i}>
                <span className="drillOptLetter">{String.fromCharCode(97 + i)}</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
          {q.solutionLink && (
            <a className="drillSolutionBtn" href={q.solutionLink} target="_blank" rel="noreferrer">
              Watch solution ↗
            </a>
          )}
        </section>
      )}
    </>
  );
}
