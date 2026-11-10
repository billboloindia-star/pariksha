import { useEffect, useMemo, useState } from "react";
import type { AiReview as AiReviewData, Attachment, AttemptQuestionRecord, AttemptRecord, ExamResult, PerformanceInput, Question } from "../../shared/types";
import TrendChart from "./TrendChart";
import type { Series } from "./TrendChart";
import AiReview from "./AiReview";
import BookmarkStar from "./BookmarkStar";
import ScoreDonut from "./ScoreDonut";
import TopicBars from "./TopicBars";
import * as api from "../../shared/api";
import { loadLocalHistory, saveLocalHistory } from "../../shared/history";

interface Props {
  result: ExamResult;
  onAgain: () => void;
}

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
  const [savedWhen, setSavedWhen] = useState<number | null>(null);

  useEffect(() => {
    const when = Date.now();
    const questionRecords: AttemptQuestionRecord[] = paper.questions.map((q, i) => ({
      id: q.id, topic: q.topic, type: q.type,
      text: q.text.length > 400 ? q.text.slice(0, 399) + "…" : q.text,
      options: q.options,
      ans: q.ans, given: states[i].given, timeMs: states[i].timeMs,
    }));
    const rec: AttemptRecord = {
      when, title: paper.title, net: Number(net.toFixed(2)), total,
      correct, wrong, skipped, secs: Math.round(elapsedSec),
      accuracy: Number(accuracy.toFixed(1)),
      avgSec: Number(avgSec.toFixed(1)),
      byTopic: Object.fromEntries(Object.entries(byTopic).map(([k, t]) => [k, { ok: t.ok, att: t.att }])),
      tabSwitches,
      exam: paper.exam,
      questions: questionRecords,
    };

    let local: AttemptRecord[] = [];
    try {
      local = [rec, ...loadLocalHistory()].slice(0, 10);
      saveLocalHistory(local);
    } catch { /* storage may be blocked */ }
    setHistory(local);

    const session = api.getSession();
    if (api.backendEnabled() && session) {
      api
        .saveAttempt(rec)
        .then(() => { setSavedWhen(when); return api.fetchAttempts(); })
        .then(setHistory)
        .catch(() => { /* keep the local-only history already shown */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.title, paper.exam, net, total, correct, wrong, skipped, elapsedSec, accuracy, avgSec, byTopic, tabSwitches]);

  // Per-question time budget, derived from the paper's own pacing (sectional
  // papers budget within their section; everything else against the overall
  // duration) - used for the pacing breakdown and the fatigue curve below.
  const perQBudgetSec = useMemo(() => {
    if (paper.sections.length > 1) {
      return paper.questions.map((_, i) => {
        const sec = paper.sections.find((s) => i >= s.from && i <= s.to);
        const n = sec ? sec.to - sec.from + 1 : total;
        const mins = sec?.minutes ?? paper.durationMinutes;
        return (mins * 60) / Math.max(1, n);
      });
    }
    const budget = (paper.durationMinutes * 60) / Math.max(1, total);
    return paper.questions.map(() => budget);
  }, [paper, total]);

  const overBudget = useMemo(
    () =>
      paper.questions
        .map((q, i) => ({ q, i, s: states[i], budget: perQBudgetSec[i] }))
        .filter((o) => o.s.given !== null && o.s.timeMs / 1000 > o.budget * 1.5)
        .sort((a, b) => b.s.timeMs / 1000 - b.budget - (a.s.timeMs / 1000 - a.budget)),
    [paper.questions, states, perQBudgetSec]
  );

  const timeSeries = useMemo<Series[]>(
    () => [{
      name: "Seconds spent",
      points: paper.questions.map((_, i) => ({ x: i, y: states[i].given !== null || states[i].visited ? states[i].timeMs / 1000 : null })),
    }],
    [paper.questions, states]
  );

  const fatigueSeries = useMemo<Series[]>(() => {
    const window = Math.max(3, Math.round(total / 8));
    const points = paper.questions.map((q, i) => {
      if (i < window - 1) return { x: i, y: null };
      let ok = 0, att = 0;
      for (let k = i - window + 1; k <= i; k++) {
        if (states[k].given === null) continue;
        att += 1;
        if (states[k].given === paper.questions[k].ans) ok += 1;
      }
      return { x: i, y: att ? Math.round((ok / att) * 100) : null };
    });
    return [{ name: `Rolling accuracy % (last ${window} Qs)`, points }];
  }, [paper.questions, states, total]);

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

  const [tab, setTab] = useState<"overview" | "topics" | "review" | "pacing" | "progress">("overview");
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
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteSaving, setNoteSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [attachments, setAttachments] = useState<Record<number, Attachment[]>>({});
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploadingQ, setUploadingQ] = useState<number | null>(null);

  function saveNote(qIndex: number, text: string) {
    setNotes((prev) => ({ ...prev, [qIndex]: text }));
  }

  async function commitNote(qIndex: number, attachmentsOverride?: Attachment[]) {
    if (savedWhen === null) return;
    setNoteSaving("saving");
    try {
      await api.updateQuestionNote(savedWhen, qIndex, notes[qIndex] ?? "", attachmentsOverride ?? attachments[qIndex] ?? []);
      setNoteSaving("saved");
      setTimeout(() => setNoteSaving("idle"), 1200);
    } catch {
      setNoteSaving("idle");
    }
  }

  const MAX_ATTACHMENTS_PER_Q = 3;

  async function addAttachments(qIndex: number, files: FileList | File[]) {
    setAttachError(null);
    const existing = attachments[qIndex] ?? [];
    const room = MAX_ATTACHMENTS_PER_Q - existing.length;
    if (room <= 0) { setAttachError(`Max ${MAX_ATTACHMENTS_PER_Q} attachments per question.`); return; }
    const toUpload = Array.from(files).slice(0, room);
    setUploadingQ(qIndex);
    try {
      const uploaded: Attachment[] = [];
      for (const f of toUpload) uploaded.push(await api.uploadAttachment(f));
      const next = [...existing, ...uploaded];
      setAttachments((prev) => ({ ...prev, [qIndex]: next }));
      await commitNote(qIndex, next);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Couldn't attach that file.");
    } finally {
      setUploadingQ(null);
    }
  }

  function removeAttachment(qIndex: number, i: number) {
    const next = (attachments[qIndex] ?? []).filter((_, idx) => idx !== i);
    setAttachments((prev) => ({ ...prev, [qIndex]: next }));
    commitNote(qIndex, next);
  }

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

  async function shareResultCard() {
    const W2 = 1000, H2 = 560;
    const canvas = document.createElement("canvas");
    canvas.width = W2; canvas.height = H2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, W2, H2);
    grad.addColorStop(0, "#131f36");
    grad.addColorStop(1, "#1f3356");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W2, H2);

    ctx.fillStyle = "#ffd77a";
    ctx.font = "700 22px -apple-system, Segoe UI, Arial";
    ctx.fillText("PARIKSHA", 48, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 34px -apple-system, Segoe UI, Arial";
    const title = paper.title.length > 44 ? paper.title.slice(0, 43) + "…" : paper.title;
    ctx.fillText(title, 48, 115);

    ctx.fillStyle = "#b8cade";
    ctx.font = "600 16px -apple-system, Segoe UI, Arial";
    ctx.fillText(paper.exam !== "General" ? paper.exam : "Mock exam", 48, 145);

    ctx.fillStyle = "#4fd18b";
    ctx.font = "800 96px -apple-system, Segoe UI, Arial";
    ctx.fillText(net.toFixed(2), 48, 270);
    ctx.fillStyle = "#b8cade";
    ctx.font = "600 20px -apple-system, Segoe UI, Arial";
    ctx.fillText(`net score / ${total}`, 48, 300);

    const stats: [string, string][] = [
      ["Accuracy", `${accuracy}%`],
      ["Attempted", `${attempted}/${total}`],
      ["Avg / question", `${avgSec.toFixed(1)}s`],
      ["Time used", fmt(elapsedSec)],
    ];
    stats.forEach(([label, val], i) => {
      const x = 48 + i * 230;
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 28px -apple-system, Segoe UI, Arial";
      ctx.fillText(val, x, 400);
      ctx.fillStyle = "#8ba2c4";
      ctx.font = "600 13px -apple-system, Segoe UI, Arial";
      ctx.fillText(label.toUpperCase(), x, 425);
    });

    ctx.fillStyle = "#6b7585";
    ctx.font = "600 14px -apple-system, Segoe UI, Arial";
    ctx.fillText("pariksha.billbolo.in", 48, H2 - 36);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], "pariksha-result.png", { type: "image/png" });

    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: ShareData) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: "My Pariksha result" });
        return;
      } catch { /* fall through to download */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pariksha-result.png";
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
        <button className={`repTab ${tab === "pacing" ? "active" : ""}`} onClick={() => setTab("pacing")}>Pacing</button>
        <button className={`repTab ${tab === "progress" ? "active" : ""}`} onClick={() => setTab("progress")}>Progress</button>
      </nav>

      <div className="reportBody">
        {tab === "overview" && (
          <>
            <div className="verdict">{verdict}</div>
            <button className="btn shareResultBtn" onClick={shareResultCard}>
              <svg viewBox="0 0 24 24" width="15" height="15"><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .05 2.1L8.91 9.26a3 3 0 1 0 0 5.48l6.14 3.16A3 3 0 1 0 15 16a3 3 0 0 0 .05.59l-6.1-3.14a3 3 0 0 0 0-2.9l6.1-3.14A3 3 0 0 0 18 8z" fill="currentColor" /></svg>
              Share result card
            </button>

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
                <ScoreDonut correct={correct} wrong={wrong} skipped={skipped} total={total} net={net} />
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
              <TopicBars rows={topicRows.filter((r) => r.acc !== null).slice(0, 5)} />
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
            <TopicBars rows={topicRows} full />
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
                    <BookmarkStar
                      q={selected}
                      given={selectedState.given}
                      wasCorrect={selectedRes === "skipped" ? null : selectedRes === "correct"}
                      sourceLabel={paper.title}
                      key={selectedQ}
                    />
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

                  {api.backendEnabled() && api.getSession() && (
                    <div className="qNoteBox">
                      <label htmlFor="qnote">Your note on this question</label>
                      <textarea
                        id="qnote"
                        placeholder="e.g. remember: this formula, or silly mistake with signs&hellip;"
                        value={notes[selectedQ!] ?? ""}
                        onChange={(e) => saveNote(selectedQ!, e.target.value)}
                        onBlur={() => commitNote(selectedQ!)}
                        disabled={savedWhen === null}
                        rows={2}
                      />
                      <span className="muted small qNoteStatus">
                        {savedWhen === null ? "saving to your account…" : noteSaving === "saving" ? "saving…" : noteSaving === "saved" ? "saved" : " "}
                      </span>

                      <div className="noteAttachRow">
                        <label className="attachBtn">
                          {uploadingQ === selectedQ ? "Uploading…" : "📎 Attach image or PDF"}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            hidden
                            disabled={savedWhen === null || uploadingQ === selectedQ}
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length) addAttachments(selectedQ!, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {(attachments[selectedQ!] ?? []).length > 0 && (
                          <span className="muted small">{(attachments[selectedQ!] ?? []).length}/{MAX_ATTACHMENTS_PER_Q} attached</span>
                        )}
                      </div>
                      {attachError && <p className="muted small bad">{attachError}</p>}
                      {(attachments[selectedQ!] ?? []).length > 0 && (
                        <div className="attachGrid">
                          {(attachments[selectedQ!] ?? []).map((a, i) => (
                            <div className="attachCard" key={a.url}>
                              {a.fileType.startsWith("image/") ? (
                                <a href={a.url} target="_blank" rel="noreferrer"><img className="attachThumb" src={a.url} alt={a.fileName} /></a>
                              ) : (
                                <a href={a.url} target="_blank" rel="noreferrer" className="attachPdf">📄<span>PDF</span></a>
                              )}
                              <span className="attachName">{a.fileName}</span>
                              <button className="attachRemove" onClick={() => removeAttachment(selectedQ!, i)} title="Remove">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rowBtns">
                    <button className="btn" onClick={() => stepReview(-1)} disabled={selectedPos <= 0}>&larr; Prev</button>
                    <button className="btn primary" onClick={() => stepReview(1)} disabled={selectedPos < 0 || selectedPos >= filteredIndices.length - 1}>Next &rarr;</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "pacing" && (
          <>
            <section className="repSection">
              <h3>Time spent per question</h3>
              <p className="muted small">
                Budgeted {fmt(perQBudgetSec[0])} / question on this paper. Questions well past that are flagged below.
              </p>
              <TrendChart title="Seconds spent" series={timeSeries} yFormat={(v) => `${Math.round(v)}s`} />
            </section>

            <section className="repSection">
              <h3>Fatigue curve</h3>
              <p className="muted small">Rolling accuracy as the paper goes on &mdash; a falling line late in the paper means fatigue, not knowledge gaps.</p>
              <TrendChart title="Rolling accuracy %" series={fatigueSeries} yFormat={(v) => `${Math.round(v)}%`} />
            </section>

            <section className="repSection">
              <h3>Over-budget questions</h3>
              {overBudget.length === 0 ? (
                <p className="muted small">None &mdash; every attempted question stayed within 1.5&times; its time budget.</p>
              ) : (
                overBudget.slice(0, 8).map((o) => {
                  const ok = o.s.given === o.q.ans;
                  return (
                    <div className="listRow" key={o.i}>
                      <span className="muted">Q{o.i + 1} &middot; {o.q.topic}</span>
                      <span className={ok ? "good" : "bad"}>
                        {secs(o.s.timeMs)} spent vs {fmt(o.budget)} budget &middot; {ok ? "right" : "wrong"}
                      </span>
                    </div>
                  );
                })
              )}
            </section>
          </>
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
