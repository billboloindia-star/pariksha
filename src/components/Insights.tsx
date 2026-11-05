import { useEffect, useMemo, useState } from "react";
import type { AttemptRecord } from "../types";
import * as api from "../api";

function secs(ms: number) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

export default function Insights() {
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.fetchAttempts().then(setAttempts).catch(() => setError("Couldn't load your attempt history."));
  }, []);

  const weakTopics = useMemo(() => {
    if (!attempts) return [];
    const byTopic: Record<string, { ok: number; att: number }> = {};
    for (const a of attempts) {
      for (const [topic, t] of Object.entries(a.byTopic ?? {})) {
        const cur = (byTopic[topic] ||= { ok: 0, att: 0 });
        cur.ok += t.ok;
        cur.att += t.att;
      }
    }
    return Object.entries(byTopic)
      .filter(([, t]) => t.att > 0)
      .map(([topic, t]) => ({ topic, acc: Math.round((t.ok / t.att) * 100), att: t.att }))
      .sort((a, b) => a.acc - b.acc);
  }, [attempts]);

  const mistakes = useMemo(() => {
    if (!attempts) return [];
    const out: { when: number; title: string; topic: string; text: string; yourAnswer: string; correct: string; timeMs: number }[] = [];
    for (const a of attempts) {
      for (const q of a.questions ?? []) {
        if (q.given === null || q.given === q.ans) continue;
        out.push({
          when: a.when,
          title: a.title,
          topic: q.topic,
          text: q.text,
          yourAnswer: q.type === "mc" ? (q.options?.[q.given] ?? String(q.given)) : String(q.given),
          correct: q.type === "mc" ? (q.options?.[q.ans] ?? String(q.ans)) : String(q.ans),
          timeMs: q.timeMs,
        });
      }
    }
    return out.sort((a, b) => b.when - a.when);
  }, [attempts]);

  const attemptsWithDetail = useMemo(() => (attempts ?? []).filter((a) => a.questions && a.questions.length > 0).length, [attempts]);

  return (
    <div className="home">
      <div className="hubPageHead">
        <h1>Weak areas &amp; mistakes</h1>
        <p>Pulled from every past attempt &mdash; the topics costing you the most marks, and every wrong answer in one place.</p>
      </div>

      {error && <pre className="error">{error}</pre>}

      {!attempts && !error && <p className="muted">Loading your history&hellip;</p>}

      {attempts && attempts.length === 0 && (
        <p className="muted">Write a mock test to start seeing your weak areas here.</p>
      )}

      {attempts && attempts.length > 0 && (
        <>
          <section className="repSection">
            <h3>Weakest topics</h3>
            {weakTopics.length === 0 ? (
              <p className="muted small">No attempted questions yet.</p>
            ) : (
              weakTopics.slice(0, 10).map((t) => (
                <div className="listRow" key={t.topic}>
                  <span className="muted">{t.topic}</span>
                  <span className={t.acc < 50 ? "bad" : t.acc < 75 ? "" : "good"}>{t.acc}% &middot; {t.att} attempt{t.att === 1 ? "" : "s"}</span>
                </div>
              ))
            )}
          </section>

          <section className="repSection">
            <h3>Mistake journal</h3>
            {attemptsWithDetail < attempts.length && (
              <p className="muted small">
                Only attempts written since this feature shipped have question-level detail
                {attemptsWithDetail > 0 ? ` (${attemptsWithDetail} of ${attempts.length} attempts)` : ""} &mdash; older ones only count toward the topic stats above.
              </p>
            )}
            {mistakes.length === 0 ? (
              <p className="muted small">No wrong answers recorded yet &mdash; or your recent attempts haven&rsquo;t generated the detail this needs.</p>
            ) : (
              mistakes.slice(0, 40).map((m, i) => {
                const d = new Date(m.when);
                const stamp = `${d.getDate()}/${d.getMonth() + 1}`;
                return (
                  <div className="mistakeRow" key={i}>
                    <div className="mistakeMeta">
                      <span className="chip">{m.topic}</span>
                      <span className="muted small">{m.title} &middot; {stamp} &middot; {secs(m.timeMs)}</span>
                    </div>
                    <div className="mistakeText">{m.text}</div>
                    <div className="mistakeVals">
                      <span className="muted">your answer</span>
                      <b className="bad">{m.yourAnswer}</b>
                      <span className="arrow">&rarr;</span>
                      <span className="muted">correct</span>
                      <b className="good">{m.correct}</b>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
