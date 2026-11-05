import { useEffect, useState } from "react";
import type { AiReview as AiReviewData, AttemptRecord, PerformanceInput } from "../types";
import { loadHistory } from "../history";
import ScoreDonut from "./ScoreDonut";
import TopicBars from "./TopicBars";
import type { TopicBarRow } from "./TopicBars";
import AiReview from "./AiReview";
import Logo from "./Logo";
import * as api from "../api";


function fmt(s: number) {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function PastAttempts() {
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  const [aiState, setAiState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);

  async function requestAiReview(record: AttemptRecord) {
    setAiState("loading");
    const attempted = record.total - record.skipped;
    const input: PerformanceInput = {
      examTitle: record.title,
      examCategory: record.exam ?? "General",
      net: record.net, total: record.total, correct: record.correct, wrong: record.wrong,
      skipped: record.skipped, attempted,
      accuracy: record.accuracy ?? (attempted ? Math.round((record.correct / attempted) * 100) : 0),
      avgSec: record.avgSec ?? 0,
      tabSwitches: record.tabSwitches ?? 0,
      topics: Object.entries(record.byTopic ?? {}).map(([topic, t]) => ({
        topic, attempted: t.att, total: t.att, correct: t.ok,
      })),
      slowest: [],
    };
    try {
      const review = await api.analyzePerformance(input);
      setAiReview(review);
      setAiState("done");
    } catch {
      setAiState("error");
    }
  }

  if (aiState === "done" && aiReview && selected) {
    return <AiReview review={aiReview} paperTitle={selected.title} onBack={() => setAiState("idle")} />;
  }

  if (selected) {
    const topicRows: TopicBarRow[] = Object.entries(selected.byTopic ?? {}).map(([topic, t]) => ({
      topic, att: t.att, ok: t.ok, acc: t.att ? Math.round((t.ok / t.att) * 100) : null,
    }));
    const attempted = selected.total - selected.skipped;

    return (
      <div className="home">
        <header className="homeHead">
          <div className="brand">
            <Logo size={52} />
            <div>
              <h1>{selected.title}</h1>
              <p>
                {selected.exam && selected.exam !== "General" ? `${selected.exam} · ` : ""}
                {new Date(selected.when).toLocaleDateString()} · time used {fmt(selected.secs)}
              </p>
            </div>
          </div>
          <button className="btn" onClick={() => setSelected(null)}>&larr; All attempts</button>
        </header>

        {api.backendEnabled() && api.getSession() && (
          <div className="aiCta">
            <span className="aiCtaIcon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#ffffff" />
              </svg>
            </span>
            <div className="aiCtaText">
              <b>Let AI review this attempt</b>
              <p>Powered by Gemini &mdash; a personalized breakdown of your weak areas and a study plan for next time.</p>
            </div>
            {aiState === "loading" ? (
              <button className="aiCtaBtn" disabled>Reviewing&hellip;</button>
            ) : aiState === "error" ? (
              <button className="aiCtaBtn" onClick={() => requestAiReview(selected)}>Couldn&rsquo;t generate a review &mdash; retry</button>
            ) : (
              <button className="aiCtaBtn" onClick={() => requestAiReview(selected)}>Review my performance</button>
            )}
          </div>
        )}

        <div className="ovGrid">
          <div className="ovCard ovDonutCard">
            <span className="ovLabel">SCORE BREAKDOWN</span>
            <ScoreDonut correct={selected.correct} wrong={selected.wrong} skipped={selected.skipped} total={selected.total} net={selected.net} />
          </div>
          <div className="ovChip">
            <span className="ovLabel">ACCURACY</span>
            <span className="ovBig">{selected.accuracy ?? "—"}{selected.accuracy !== undefined ? "%" : ""}</span>
          </div>
          <div className="ovChip">
            <span className="ovLabel">AVG / QUESTION</span>
            <span className="ovBig">{selected.avgSec !== undefined ? `${selected.avgSec.toFixed(1)}s` : "—"}</span>
          </div>
          <div className="ovChip">
            <span className="ovLabel">ATTEMPTED</span>
            <span className="ovBig">{attempted}<small> / {selected.total}</small></span>
          </div>
          <div className="ovChip">
            <span className="ovLabel">TAB SWITCHES</span>
            <span className="ovBig">{selected.tabSwitches ?? "—"}</span>
          </div>
        </div>

        {topicRows.length > 0 && (
          <section className="repSection">
            <h3>By topic</h3>
            <TopicBars rows={topicRows} />
          </section>
        )}

        <p className="muted small">
          Full question-by-question review is only available right after you submit &mdash; past
          attempts show this summary.
        </p>

        <button className="btn primary wide" onClick={() => setSelected(null)}>&larr; All attempts</button>
      </div>
    );
  }

  return (
    <div className="home">
      <div className="hubPageHead">
        <h1>Past attempts</h1>
        <p>Every mock test you&rsquo;ve submitted, with its score and topic breakdown.</p>
      </div>

      {history === null && <p className="muted">Loading&hellip;</p>}

      {history !== null && history.length === 0 && (
        <p className="muted">No attempts yet &mdash; write your first mock test to see it here.</p>
      )}

      {history !== null && history.length > 0 && (
        <section className="repSection">
          {history.map((h, i) => {
            const d = new Date(h.when);
            const stamp = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return (
              <button className="pastAttemptRow" key={i} onClick={() => setSelected(h)}>
                <div className="pastAttemptInfo">
                  {h.exam && h.exam !== "General" && <span className="chip historyExamChip">{h.exam}</span>}
                  <b>{h.title}</b>
                  <span className="muted small">{stamp}</span>
                </div>
                <div className="pastAttemptStats">
                  <span>net {h.net.toFixed(2)}/{h.total}</span>
                  {h.accuracy !== undefined && <span className="muted small">{h.accuracy}% accuracy</span>}
                </div>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
