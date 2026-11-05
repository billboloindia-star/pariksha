import { useEffect, useMemo, useState } from "react";
import type { AiReview as AiReviewData, AttemptRecord, ExamResult, PerformanceInput, Question } from "../types";
import TrendChart from "./TrendChart";
import type { Series } from "./TrendChart";
import AiReview from "./AiReview";
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
      exam: paper.exam,
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
  }, [paper.title, paper.exam, net, total, correct, wrong, skipped, elapsedSec, accuracy, avgSec, byTopic, tabSwitches]);

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

  const [aiState, setAiState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);

  const [tab, setTab] = useState<"overview" | "topics" | "review" | "progress">("overview");
  const [reviewFilter, setReviewFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");

  const topicRows = useMemo(() => {
    const rows = Object.entries(byTopic).map(([topic, t]) => ({
      topic, n: t.n, att: t.att, ok: t.ok,
      acc: t.att ? Math.round((t.ok / t.att) * 100) : null,
      avgSec: t.att ? t.ms / t.att / 1000 : null,
    }));
    rows.sort((a, b) => {
      if (a.acc === null && b.acc === null) return 0;
      if (a.acc === null) return 1;
      if (b.acc === null) return -1;
      return b.acc - a.acc;
    });
    return rows;
  }, [byTopic]);

  const weakestTopic = useMemo(() => {
    const attempted = topicRows.filter((r) => r.acc !== null);
    if (!attempted.length) return null;
    return attempted.reduce((worst, r) =>
      r.acc! < worst.acc! || (r.acc === worst.acc && r.att > worst.att) ? r : worst
    );
  }, [topicRows]);

  function questionStatus(i: number): "correct" | "wrong" | "skipped" {
    const s = states[i];
    if (s.given === null) return "skipped";
    return s.given === paper.questions[i].ans ? "correct" : "wrong";
  }

  const filteredIndices = useMemo(() => {
    const all = paper.questions.map((_, i) => i);
    if (reviewFilter === "all") return all;
    return all.filter((i) => questionStatus(i) === reviewFilter);
  }, [paper.questions, reviewFilter, states]);

  const [selectedQ, setSelectedQ] = useState<number | null>(null);

  useEffect(() => {
    if (tab !== "review") return;
    const firstWrong = paper.questions.findIndex((_, i) => questionStatus(i) === "wrong");
    const firstAttempted = states.findIndex((s) => s.given !== null);
    setSelectedQ(firstWrong >= 0 ? firstWrong : firstAttempted >= 0 ? firstAttempted : 0);
    setReviewFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function stepReview(dir: 1 | -1) {
    if (selectedQ === null) return;
    const pos = filteredIndices.indexOf(selectedQ);
    const next = filteredIndices[pos + dir];
    if (next !== undefined) setSelectedQ(next);
  }

  const circumference = 2 * Math.PI * 85;
  const correctLen = total ? (circumference * correct) / total : 0;
  const wrongLen = total ? (circumference * wrong) / total : 0;

  async function requestAiReview() {
    setAiState("loading");
    const input: PerformanceInput = {
      examTitle: paper.title,
      examCategory: paper.exam,
      net, total, correct, wrong, skipped, attempted, accuracy, avgSec, tabSwitches,
      topics: Object.entries(byTopic).map(([topic, t]) => ({
        topic, attempted: t.att, total: t.n, correct: t.ok,
        avgSec: t.att ? t.ms / t.att / 1000 : undefined,
      })),
      slowest: slowest.map((o) => ({
        question: o.i + 1, topic: o.q.topic, seconds: o.s.timeMs / 1000, correct: o.s.given === o.q.ans,
      })),
    };
    try {
      const review = await api.analyzePerformance(input);
      setAiReview(review);
      setAiState("done");
    } catch {
      setAiState("error");
    }
  }

  if (aiState === "done" && aiReview) {
    return <AiReview review={aiReview} paperTitle={paper.title} onBack={() => setAiState("idle")} />;
  }

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

  const selected = selectedQ !== null ? paper.questions[selectedQ] : null;
  const selectedState = selectedQ !== null ? states[selectedQ] : null;
  const selectedRes = selectedQ !== null ? questionStatus(selectedQ) : null;
  const selectedPos = selectedQ !== null ? filteredIndices.indexOf(selectedQ) : -1;

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

      <nav className="repTabs">
        <button className={`repTab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`repTab ${tab === "topics" ? "active" : ""}`} onClick={() => setTab("topics")}>By Topic</button>
        <button className={`repTab ${tab === "review" ? "active" : ""}`} onClick={() => setTab("review")}>Review Answers</button>
        <button className={`repTab ${tab === "progress" ? "active" : ""}`} onClick={() => setTab("progress")}>Progress</button>
      </nav>

      <div className="reportBody">
        {tab === "overview" && (
          <>
            <div className="verdict">{verdict}</div>

            {api.backendEnabled() && api.getSession() && (
              <div className="aiCta">
                <span className="aiCtaIcon">
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#ffffff" />
                  </svg>
                </span>
                <div className="aiCtaText">
                  <b>Let AI review your performance</b>
                  <p>Powered by Gemini &mdash; a personalized breakdown of your weak areas and a study plan for next time.</p>
                </div>
                {aiState === "loading" ? (
                  <button className="aiCtaBtn" disabled>Reviewing&hellip;</button>
                ) : aiState === "error" ? (
                  <button className="aiCtaBtn" onClick={requestAiReview}>Couldn&rsquo;t generate a review &mdash; retry</button>
                ) : (
                  <button className="aiCtaBtn" onClick={requestAiReview}>Review my performance</button>
                )}
              </div>
            )}

            <div className="ovGrid">
              <div className="ovCard ovDonutCard">
                <span className="ovLabel">SCORE BREAKDOWN</span>
                <div className="ovDonutRow">
                  <svg viewBox="0 0 220 220" width="150" height="150">
                    <circle cx="110" cy="110" r="85" fill="none" stroke="#e7ebef" strokeWidth="30" />
                    <circle cx="110" cy="110" r="85" fill="none" stroke="var(--green)" strokeWidth="30"
                      strokeDasharray={`${correctLen} ${circumference - correctLen}`} transform="rotate(-90 110 110)" />
                    <circle cx="110" cy="110" r="85" fill="none" stroke="var(--red)" strokeWidth="30"
                      strokeDasharray={`${wrongLen} ${circumference - wrongLen}`} strokeDashoffset={-correctLen}
                      transform="rotate(-90 110 110)" />
                    <text x="110" y="104" fontSize="28" fontWeight="800" fill="var(--ink)" textAnchor="middle">{net.toFixed(2)}</text>
                    <text x="110" y="126" fontSize="12.5" fill="var(--dim)" textAnchor="middle">net / {total}</text>
                  </svg>
                  <div className="ovLegend">
                    <div><i className="sw correct" />{correct} Correct<span>{total ? Math.round((correct / total) * 100) : 0}%</span></div>
                    <div><i className="sw wrong" />{wrong} Wrong<span>{total ? Math.round((wrong / total) * 100) : 0}%</span></div>
                    <div><i className="sw skipped" />{skipped} Skipped<span>{total ? Math.round((skipped / total) * 100) : 0}%</span></div>
                  </div>
                </div>
              </div>

              <div className="ovChip">
                <span className="ovLabel">ACCURACY</span>
                <span className="ovBig">{accuracy}%</span>
              </div>
              <div className="ovChip">
                <span className="ovLabel">AVG / QUESTION</span>
                <span className="ovBig">{avgSec.toFixed(1)}s</span>
              </div>
              <div className="ovChip">
                <span className="ovLabel">ATTEMPTED</span>
                <span className="ovBig">{attempted}<small> / {total}</small></span>
              </div>
              <div className="ovChip">
                <span className="ovLabel">TAB SWITCHES</span>
                <span className="ovBig">{tabSwitches}</span>
              </div>

              {slowest.length > 0 && (
                <div className="ovCard ovSlowCard">
                  <span className="ovLabel">SLOWEST ANSWERS</span>
                  {slowest.map((o) => {
                    const ok = o.s.given === o.q.ans;
                    return (
                      <div className="listRow" key={o.i}>
                        <span className="muted">Q{o.i + 1} &middot; {o.q.topic}</span>
                        <span className={ok ? "good" : "bad"}>{secs(o.s.timeMs)} &middot; {ok ? "right" : "wrong"}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {weakestTopic && (
                <div className="ovCard ovWeakCard">
                  <span className="ovLabel">WEAKEST TOPIC</span>
                  <b>{weakestTopic.topic}</b>
                  <span className="bad">{weakestTopic.acc}% accuracy &middot; {weakestTopic.att} attempt{weakestTopic.att === 1 ? "" : "s"}</span>
                </div>
              )}
            </div>

            <section className="repSection">
              <h3>Top topics by accuracy</h3>
              {topicRows.filter((r) => r.acc !== null).slice(0, 5).map((r) => (
                <div className="topicBarRow" key={r.topic}>
                  <span className="topicBarName">{r.topic}</span>
                  <div className="topicBarTrack">
                    <div className="topicBarFill" style={{ width: `${r.acc}%`, background: r.acc! >= 80 ? "var(--green)" : r.acc! >= 40 ? "#e8962a" : "var(--red)" }} />
                  </div>
                  <span className="topicBarPct">{r.acc}%</span>
                </div>
              ))}
              {topicRows.length > 5 && (
                <button className="aiLinkBtn" onClick={() => setTab("topics")}>View all {topicRows.length} topics &rarr;</button>
              )}
            </section>
          </>
        )}

        {tab === "topics" && (
          <section className="repSection">
            <h3>By topic</h3>
            <p className="muted small">Sorted by accuracy. Topics you haven&rsquo;t attempted sit at the bottom.</p>
            {topicRows.map((r) => (
              <div className={`topicBarRow ${r.acc === null ? "unattempted" : ""}`} key={r.topic}>
                <div className="topicBarInfo">
                  <span className="topicBarName">{r.topic}</span>
                  <span className="muted small">{r.acc !== null ? `${r.ok}/${r.att} right${r.avgSec !== null ? ` · ${r.avgSec.toFixed(1)}s avg` : ""}` : `0/${r.n} attempted`}</span>
                </div>
                <div className="topicBarTrack">
                  <div className="topicBarFill" style={{ width: `${r.acc ?? 2}%`, background: r.acc === null ? "var(--line-2)" : r.acc >= 80 ? "var(--green)" : r.acc >= 40 ? "#e8962a" : "var(--red)" }} />
                </div>
                <span className="topicBarPct">{r.acc !== null ? `${r.acc}%` : "not attempted"}</span>
              </div>
            ))}
          </section>
        )}

        {tab === "review" && (
          <section className="repSection">
            <div className="repHead">
              <h3>Review answers</h3>
              <button className="btn smallBtn" onClick={exportCsv}>Export CSV</button>
            </div>

            <div className="reviewFilters">
              <button className={`reviewFilterChip ${reviewFilter === "all" ? "active" : ""}`} onClick={() => setReviewFilter("all")}>All {total}</button>
              <button className={`reviewFilterChip ${reviewFilter === "correct" ? "active" : ""}`} onClick={() => setReviewFilter("correct")}>Correct {correct}</button>
              <button className={`reviewFilterChip ${reviewFilter === "wrong" ? "active" : ""}`} onClick={() => setReviewFilter("wrong")}>Wrong {wrong}</button>
              <button className={`reviewFilterChip ${reviewFilter === "skipped" ? "active" : ""}`} onClick={() => setReviewFilter("skipped")}>Skipped {skipped}</button>
            </div>

            <div className="reviewLayout">
              <div className="miniPalette">
                {filteredIndices.map((i) => (
                  <button
                    key={i}
                    className={`miniCell ${questionStatus(i)} ${i === selectedQ ? "current" : ""}`}
                    onClick={() => setSelectedQ(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                {filteredIndices.length === 0 && <p className="muted small">No questions in this filter.</p>}
              </div>

              {selected && selectedState && selectedRes && (
                <div className="reviewDetail">
                  <div className="reviewDetailTop">
                    <span className="qTag">Q{selectedQ! + 1}</span>
                    <span className="chip">{selected.topic}</span>
                    <span className={`resTag ${selectedRes}`}>{selectedRes}</span>
                    <span className="muted small timeTag">{selectedState.given === null ? "—" : secs(selectedState.timeMs)}</span>
                  </div>
                  <div className="reviewText">{selected.text}</div>
                  <div className="reviewVals">
                    {selectedState.given !== null && (
                      <>
                        <span className="muted">your answer</span>
                        <b className={selectedRes === "correct" ? "good" : "bad"}>{givenText(selected, selectedState.given)}</b>
                        <span className="arrow">→</span>
                      </>
                    )}
                    <span className="muted">correct</span>
                    <b className="good">{answerText(selected)}</b>
                  </div>
                  {selected.solution && <div className="solution">{selected.solution}</div>}
                  <div className="rowBtns">
                    <button className="btn" onClick={() => stepReview(-1)} disabled={selectedPos <= 0}>&larr; Prev</button>
                    <button className="btn primary" onClick={() => stepReview(1)} disabled={selectedPos < 0 || selectedPos >= filteredIndices.length - 1}>Next &rarr;</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "progress" && (
          <>
            {history.length > 1 ? (
              <>
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

                <section className="repSection">
                  <h3>Recent attempts</h3>
                  {history.map((h, i) => {
                    const d = new Date(h.when);
                    const stamp = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    return (
                      <div className="listRow" key={i}>
                        <span className="muted">
                          {h.exam && h.exam !== "General" && <span className="chip historyExamChip">{h.exam}</span>}
                          {h.title.length > 26 ? h.title.slice(0, 25) + "…" : h.title} · {stamp}
                        </span>
                        <span>net {h.net.toFixed(2)}/{h.total} · {fmt(h.secs)}</span>
                      </div>
                    );
                  })}
                </section>
              </>
            ) : (
              <p className="muted">Take another mock test to start seeing progress across attempts.</p>
            )}
          </>
        )}

        <button className="btn primary wide" onClick={onAgain}>Write another paper</button>
      </div>
    </div>
  );
}
