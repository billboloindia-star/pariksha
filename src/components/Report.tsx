import { useEffect, useMemo, useState } from "react";
import type { AttemptRecord, ExamResult, Question } from "../types";
import TrendChart from "./TrendChart";
import type { Series } from "./TrendChart";
import * as api from "../api";

interface Props {
  result: ExamResult;
  onAgain: () => void;
}

const HKEY = "exam_app_history";

function fmt(s: number) {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function secs(ms: number) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}
function answerText(q: Question) {
  return q.type === "mc" ? q.options?.[q.ans] ?? "" : String(q.ans);
}
function givenText(q: Question, given: number | null) {
  if (given === null) return "—";
  return q.type === "mc" ? q.options?.[given] ?? String(given) : String(given);
}

export default function Report({ result, onAgain }: Props) {
  const { paper, states, correct, wrong, skipped, attempted, net, accuracy, avgSec, byTopic, elapsedSec, tabSwitches } = result;
  const total = paper.questions.length;

  const verdict = useMemo(() => {
    const pct = total ? net / total : 0;
    if (pct >= 0.85 && avgSec <= 34) return "Exam-ready — high net score inside the clock.";
    if (pct >= 0.75) return "Solid. The next gain is three seconds a question, not more accuracy.";
    if (accuracy >= 90 && attempted < total * 0.85) return "Accurate but slow — you are leaving marks unattempted.";
    if (accuracy < 80) return "Pace is fine, accuracy is not. Slow down before you speed up.";
    return "Keep going: raise attempts first, then trim the seconds.";
  }, [net, total, avgSec, accuracy, attempted]);

  const [history, setHistory] = useState<AttemptRecord[]>([]);

  useEffect(() => {
    const rec: AttemptRecord = {
      when: Date.now(), title: paper.title, net: Number(net.toFixed(2)), total,
      correct, wrong, skipped, secs: Math.round(elapsedSec),
      accuracy: Number(accuracy.toFixed(1)),
      avgSec: Number(avgSec.toFixed(1)),
      byTopic: Object.fromEntries(Object.entries(byTopic).map(([k, t]) => [k, { ok: t.ok, att: t.att }])),
      tabSwitches,
    };

    let local: AttemptRecord[] = [];
    try {
      const prev = JSON.parse(localStorage.getItem(HKEY) || "[]") as AttemptRecord[];
      local = [rec, ...prev].slice(0, 10);
      localStorage.setItem(HKEY, JSON.stringify(local));
    } catch { /* storage may be blocked */ }
    setHistory(local);

    const session = api.getSession();
    if (api.backendEnabled() && session) {
      api
        .saveAttempt(rec)
        .then(() => api.fetchAttempts())
        .then(setHistory)
        .catch(() => { /* keep the local-only history already shown */ });
    }
  }, [paper.title, net, total, correct, wrong, skipped, elapsedSec, accuracy, avgSec, byTopic, tabSwitches]);

  const slowest = useMemo(
    () =>
      paper.questions
        .map((q, i) => ({ q, i, s: states[i] }))
        .filter((o) => o.s.given !== null)
        .sort((a, b) => b.s.timeMs - a.s.timeMs)
        .slice(0, 5),
    [paper.questions, states]
  );

  const chrono = useMemo(() => history.slice().reverse(), [history]);

  const netSeries = useMemo<Series[]>(
    () => [{ name: "Net score", points: chrono.map((h, i) => ({ x: i, y: h.net })) }],
    [chrono]
  );
  const accuracySeries = useMemo<Series[]>(
    () => [{ name: "Accuracy %", points: chrono.map((h, i) => ({ x: i, y: h.accuracy ?? null })) }],
    [chrono]
  );
  const avgSecSeries = useMemo<Series[]>(
    () => [{ name: "Avg sec / question", points: chrono.map((h, i) => ({ x: i, y: h.avgSec ?? null })) }],
    [chrono]
  );
  const topicSeries = useMemo<Series[]>(() => {
    const topics = new Set<string>();
    chrono.forEach((h) => Object.keys(h.byTopic ?? {}).forEach((t) => topics.add(t)));
    return Array.from(topics).map((topic) => ({
      name: topic,
      points: chrono.map((h, i) => {
        const t = h.byTopic?.[topic];
        return { x: i, y: t && t.att ? Math.round((t.ok / t.att) * 100) : null };
      }),
    }));
  }, [chrono]);

  function exportCsv() {
    const head = ["Q", "Section", "Topic", "Type", "Question", "Your answer", "Correct answer", "Result", "Seconds", "Solution"];
    const rows = paper.questions.map((q, i) => {
      const s = states[i];
      const res = s.given === null ? "skipped" : s.given === q.ans ? "correct" : "wrong";
      return [
        String(i + 1), q.section, q.topic, q.type, q.text.replace(/\s+/g, " "),
        givenText(q, s.given), answerText(q), res, (s.timeMs / 1000).toFixed(1), q.solution ?? "",
      ];
    });
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attempt-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="report">
      <header className="examBar">
        <div className="examBarLeft">
          <span className="examTitle">{paper.title}</span>
          <span className="examSub">Performance analysis</span>
        </div>
        <div className="examBarRight">
          <div className="clockBox">
            <span className="clockLabel">Time used</span>
            <span className="clockValue">{fmt(elapsedSec)}</span>
          </div>
        </div>
      </header>

      <div className="reportBody">
        <div className="verdict">{verdict}</div>

        <div className="statGrid">
          <div className="statCard hero">
            <span className="k">Net score</span>
            <span className="v">{net.toFixed(2)}<small> / {total}</small></span>
          </div>
          <div className="statCard"><span className="k">Correct</span><span className="v">{correct}</span></div>
          <div className="statCard"><span className="k">Wrong</span><span className="v">{wrong}</span></div>
          <div className="statCard"><span className="k">Skipped</span><span className="v">{skipped}</span></div>
          <div className="statCard"><span className="k">Accuracy</span><span className="v">{accuracy}%</span></div>
          <div className="statCard"><span className="k">Avg / question</span><span className="v">{avgSec.toFixed(1)}s</span></div>
          <div className="statCard"><span className="k">Attempted</span><span className="v">{attempted}</span></div>
          <div className="statCard"><span className="k">Pace</span><span className="v">{attempted ? fmt(elapsedSec / attempted) : "—"}</span></div>
          <div className="statCard"><span className="k">Tab switches</span><span className="v">{tabSwitches}</span></div>
        </div>

        <section className="repSection">
          <h3>By topic</h3>
          <table className="repTable">
            <thead>
              <tr><th>Topic</th><th>Att</th><th>Right</th><th>Acc</th><th>Avg</th></tr>
            </thead>
            <tbody>
              {Object.entries(byTopic).map(([topic, t]) => (
                <tr key={topic}>
                  <td>{topic}</td>
                  <td className="num">{t.att}/{t.n}</td>
                  <td className="num">{t.ok}</td>
                  <td className="num">{t.att ? `${Math.round((t.ok / t.att) * 100)}%` : "—"}</td>
                  <td className="num">{t.att ? `${(t.ms / t.att / 1000).toFixed(1)}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {slowest.length > 0 && (
          <section className="repSection">
            <h3>Slowest answers</h3>
            {slowest.map((o) => {
              const ok = o.s.given === o.q.ans;
              return (
                <div className="listRow" key={o.i}>
                  <span className="muted">Q{o.i + 1} · {o.q.topic}</span>
                  <span className={ok ? "good" : "bad"}>{secs(o.s.timeMs)} · {ok ? "right" : "wrong"}</span>
                </div>
              );
            })}
          </section>
        )}

        <section className="repSection">
          <div className="repHead">
            <h3>Question by question</h3>
            <button className="btn smallBtn" onClick={exportCsv}>Export CSV</button>
          </div>
          <p className="muted small">Every question with your answer, the right answer, the time it took and the solution.</p>

          {paper.questions.map((q, i) => {
            const s = states[i];
            const res = s.given === null ? "skipped" : s.given === q.ans ? "correct" : "wrong";
            return (
              <div className={`reviewRow ${res}`} key={i}>
                <div className="reviewTop">
                  <span className="qTag">Q{i + 1}</span>
                  <span className="muted small">{q.topic}</span>
                  <span className={`resTag ${res}`}>{res}</span>
                  <span className="muted small timeTag">{s.given === null ? "—" : secs(s.timeMs)}</span>
                </div>
                <div className="reviewText">{q.text.length > 140 ? q.text.slice(0, 139) + "…" : q.text}</div>
                <div className="reviewVals">
                  {s.given !== null && (
                    <>
                      <span className="muted">your answer</span>
                      <b className={res === "correct" ? "good" : "bad"}>{givenText(q, s.given)}</b>
                      <span className="arrow">→</span>
                    </>
                  )}
                  <span className="muted">correct</span>
                  <b className="good">{answerText(q)}</b>
                </div>
                {q.solution && <div className="solution">{q.solution}</div>}
              </div>
            );
          })}
        </section>

        {history.length > 1 && (
          <section className="repSection">
            <h3>Progress</h3>
            <div className="repGrid2">
              <TrendChart title="Net score" series={netSeries} />
              <TrendChart title="Accuracy %" series={accuracySeries} yFormat={(v) => `${Math.round(v)}%`} />
            </div>
            <div className="repGrid2">
              <TrendChart title="Avg seconds / question" series={avgSecSeries} yFormat={(v) => `${Math.round(v)}s`} />
              <TrendChart title="Topic accuracy" series={topicSeries} yFormat={(v) => `${Math.round(v)}%`} />
            </div>
          </section>
        )}

        {history.length > 1 && (
          <section className="repSection">
            <h3>Recent attempts</h3>
            {history.map((h, i) => {
              const d = new Date(h.when);
              const stamp = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              return (
                <div className="listRow" key={i}>
                  <span className="muted">{h.title.length > 26 ? h.title.slice(0, 25) + "…" : h.title} · {stamp}</span>
                  <span>net {h.net.toFixed(2)}/{h.total} · {fmt(h.secs)}</span>
                </div>
              );
            })}
          </section>
        )}

        <button className="btn primary wide" onClick={onAgain}>Write another paper</button>
      </div>
    </div>
  );
}
