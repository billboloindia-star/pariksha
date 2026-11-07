import { useEffect, useMemo, useState } from "react";
import type { AiReview as AiReviewData, AttemptRecord, BankSectionSummary, PerformanceInput } from "../../shared/types";
import { loadHistory, computeStreak } from "../../shared/history";
import ScoreDonut from "./ScoreDonut";
import TopicBars from "./TopicBars";
import type { TopicBarRow } from "./TopicBars";
import AiReview from "./AiReview";
import Logo from "./Logo";
import Spinner from "./Spinner";
import * as api from "../../shared/api";

interface Props {
  session: api.Session | null;
  onPracticeTopic: (section: string, chapter: string) => void;
  onBrowseBank: (noMatchTopic?: string) => void;
}

function normalizeTopic(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s\b/g, "");
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

function tier(acc: number): "critical" | "warning" | "good" {
  return acc < 50 ? "critical" : acc < 75 ? "warning" : "good";
}

/** Brighter variant of the status palette for text/fills sitting directly on
 * the dark control-panel cards - the light-theme tier() colors (#d03b3b etc.)
 * don't have enough contrast against a dark gradient background. */
function tierColorHex(acc: number): string {
  return acc < 50 ? "#ff8d94" : acc < 75 ? "#ffd98a" : "#86efac";
}

function logTierColors(acc: number): { fg: string; bg: string } {
  if (acc < 50) return { fg: "var(--red)", bg: "#fdecea" };
  if (acc < 75) return { fg: "#b4740e", bg: "#fdf1de" };
  return { fg: "var(--green)", bg: "#e6f7ec" };
}

function accOf(a: AttemptRecord): number {
  if (a.accuracy !== undefined) return a.accuracy;
  const attempted = a.total - a.skipped;
  return attempted ? Math.round((a.correct / attempted) * 100) : 0;
}

/** Start-of-local-day timestamp, `offset` days before today (0 = today). */
function dayStart(offset: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

function relDateLabel(when: number): string {
  const itemDay = new Date(when).setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayStart(0) - itemDay) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  return "Earlier";
}

const LOG_PAGE_SIZE = 6;

function InfoIcon({ title, body, dark }: { title: string; body: string; dark?: boolean }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  return (
    <span
      className={`infoIcon ${dark ? "dark" : ""}`}
      onMouseMove={(e) => {
        let left = e.clientX + 14;
        const top = e.clientY + 14;
        if (left + 240 > window.innerWidth) left = e.clientX - 254;
        setPos({ left, top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      ?
      {pos && (
        <span className="infoTip" style={{ left: pos.left, top: pos.top }}>
          <b>{title}</b>{body}
        </span>
      )}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 160, h = 24;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg className="pgTelSpark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export default function Progress({ session, onPracticeTopic, onBrowseBank }: Props) {
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);
  const [topicSearch, setTopicSearch] = useState("");
  const [topicSort, setTopicSort] = useState<"worst" | "best" | "attempts">("worst");
  const [logFilter, setLogFilter] = useState("all");
  const [logPage, setLogPage] = useState(1);
  const [resolvingTopic, setResolvingTopic] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<{ topic: string; candidates: { section: string; chapter: string }[] } | null>(null);

  const canPractice = api.backendEnabled() && api.canUseBankFeature(session);

  // Last resort for a topic findMatch() can't place: ask the backend to try
  // its own cache, then Gemini, before ever giving up to a plain "browse the
  // whole bank" fallback. See src/main.py's /bank/resolve-topic for the
  // three-tier design (deterministic match -> cache -> AI).
  async function resolveAndPractice(topic: string) {
    if (resolvingTopic) return;
    setResolvingTopic(topic);
    try {
      const res = await api.resolveTopicChapter(topic);
      if (res.section && res.chapter) {
        onPracticeTopic(res.section, res.chapter);
      } else if (res.candidates.length > 0) {
        setResolveModal({ topic, candidates: res.candidates });
      } else {
        onBrowseBank(topic);
      }
    } catch {
      onBrowseBank(topic);
    } finally {
      setResolvingTopic(null);
    }
  }

  async function confirmCandidate(section: string, chapter: string) {
    const topic = resolveModal?.topic;
    setResolveModal(null);
    if (!topic) return;
    try {
      await api.confirmTopicChapter(topic, section, chapter);
    } catch {
      // the practice session still works even if caching the pick failed -
      // worst case this topic just asks again next time.
    }
    onPracticeTopic(section, chapter);
  }

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  useEffect(() => {
    if (!canPractice) return;
    api.fetchBankSections().then(setBankSections).catch(() => {});
  }, [canPractice]);

  const chapterToSection = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of bankSections ?? []) m[s.chapter] = s.section;
    return m;
  }, [bankSections]);

  // Attempt topics rarely spell a chapter exactly how the bank does (an
  // AI-converted Paper Vault paper names its own topics freely) - so beyond
  // the exact lookup above, try a normalized/substring match before giving
  // up on finding a matching chapter entirely.
  const normalizedChapters = useMemo(
    () => (bankSections ?? []).map((s) => ({ section: s.section, chapter: s.chapter, norm: normalizeTopic(s.chapter) })),
    [bankSections]
  );

  function findMatch(topic: string): { section: string; chapter: string } | null {
    const exactSection = chapterToSection[topic];
    if (exactSection) return { section: exactSection, chapter: topic };
    const norm = normalizeTopic(topic);
    if (!norm) return null;
    const exact = normalizedChapters.find((c) => c.norm === norm);
    if (exact) return { section: exact.section, chapter: exact.chapter };
    const partial = normalizedChapters.find((c) => c.norm.includes(norm) || norm.includes(c.norm));
    if (partial) return { section: partial.section, chapter: partial.chapter };
    return null;
  }

  const chronological = useMemo(() => [...(history ?? [])].sort((a, b) => a.when - b.when), [history]);

  const recentWindow = useMemo(() => chronological.slice(-5), [chronological]);
  const priorWindow = useMemo(() => chronological.slice(-10, -5), [chronological]);
  const avgRecent = recentWindow.length ? Math.round(recentWindow.reduce((n, a) => n + accOf(a), 0) / recentWindow.length) : 0;
  const avgPrior = priorWindow.length ? Math.round(priorWindow.reduce((n, a) => n + accOf(a), 0) / priorWindow.length) : null;
  const trendDelta = avgPrior !== null ? avgRecent - avgPrior : null;
  const bestAcc = chronological.length ? Math.max(...chronological.map(accOf)) : 0;
  const streak = computeStreak((history ?? []).map((h) => h.when));

  const weakTopics = useMemo(() => {
    if (!history) return [];
    const byTopic: Record<string, { ok: number; att: number }> = {};
    for (const a of history) {
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
  }, [history]);

  const focusTopics = useMemo(() => weakTopics.slice(0, 3), [weakTopics]);

  const mistakes = useMemo(() => {
    if (!history) return [];
    const out: { when: number; title: string; topic: string; text: string; yourAnswer: string; correct: string; timeMs: number }[] = [];
    for (const a of history) {
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
  }, [history]);

  const attemptsWithDetail = useMemo(() => (history ?? []).filter((a) => a.questions && a.questions.length > 0).length, [history]);

  const recentFirst = useMemo(() => [...(history ?? [])].sort((a, b) => b.when - a.when), [history]);

  // ---- control-panel telemetry: 7-day windows + daily sparkline series ----
  const last7Start = dayStart(6);
  const prior7Start = dayStart(13);

  const attempts7 = useMemo(() => (history ?? []).filter((h) => h.when >= last7Start), [history, last7Start]);
  const attemptsPrior7 = useMemo(
    () => (history ?? []).filter((h) => h.when >= prior7Start && h.when < last7Start),
    [history, prior7Start, last7Start]
  );

  const accuracy7d = attempts7.length ? Math.round(attempts7.reduce((n, a) => n + accOf(a), 0) / attempts7.length) : null;
  const accuracyPrior7 = attemptsPrior7.length
    ? Math.round(attemptsPrior7.reduce((n, a) => n + accOf(a), 0) / attemptsPrior7.length)
    : null;
  const accDelta = accuracy7d !== null && accuracyPrior7 !== null ? accuracy7d - accuracyPrior7 : null;

  const mistakes7d = useMemo(() => mistakes.filter((m) => m.when >= last7Start).length, [mistakes, last7Start]);
  const mistakesPrior7 = useMemo(
    () => mistakes.filter((m) => m.when >= prior7Start && m.when < last7Start).length,
    [mistakes, prior7Start, last7Start]
  );
  const mistakesDelta = mistakes7d - mistakesPrior7;

  function avgSpeedSec(attempts: AttemptRecord[]): number | null {
    const times = attempts.flatMap((a) => (a.questions ?? []).map((q) => q.timeMs));
    if (times.length) return Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000);
    const withAvg = attempts.filter((a) => a.avgSec !== undefined);
    if (withAvg.length) return Math.round(withAvg.reduce((n, a) => n + (a.avgSec ?? 0), 0) / withAvg.length);
    return null;
  }
  const speed7d = avgSpeedSec(attempts7);
  const speedPrior7 = avgSpeedSec(attemptsPrior7);
  const speedDelta = speed7d !== null && speedPrior7 !== null ? speed7d - speedPrior7 : null;

  function activeDaysInRange(start: number, end: number): number {
    const days = new Set<string>();
    for (const a of history ?? []) if (a.when >= start && a.when < end) days.add(new Date(a.when).toDateString());
    return days.size;
  }
  const activeDays7 = activeDaysInRange(last7Start, Date.now() + 1);
  const activeDaysPrior7 = activeDaysInRange(prior7Start, last7Start);
  const streakDelta = activeDays7 - activeDaysPrior7;

  const dailySeries = useMemo(() => {
    const acc: number[] = [], mistakesSeries: number[] = [], speed: number[] = [], active: number[] = [];
    let lastAcc = 0, lastSpeed = 0;
    for (let i = 6; i >= 0; i--) {
      const s = dayStart(i), e = s + 86400000;
      const dayAttempts = (history ?? []).filter((h) => h.when >= s && h.when < e);
      const dayMistakes = mistakes.filter((m) => m.when >= s && m.when < e);
      if (dayAttempts.length) {
        lastAcc = Math.round(dayAttempts.reduce((n, a) => n + accOf(a), 0) / dayAttempts.length);
        const spd = avgSpeedSec(dayAttempts);
        if (spd !== null) lastSpeed = spd;
      }
      acc.push(lastAcc);
      mistakesSeries.push(dayMistakes.length);
      speed.push(lastSpeed);
      active.push(dayAttempts.length ? 1 : 0);
    }
    return { acc, mistakes: mistakesSeries, speed, active };
  }, [history, mistakes]);

  // ---- topic ranking: weakTopics + resolved bank section, searchable/sortable ----
  const rankedTopics = useMemo(
    () => weakTopics.map((t) => ({ ...t, match: findMatch(t.topic) })),
    [weakTopics, chapterToSection, normalizedChapters] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    let items = rankedTopics.filter((t) => t.topic.toLowerCase().includes(q));
    if (topicSort === "worst") items = [...items].sort((a, b) => a.acc - b.acc);
    else if (topicSort === "best") items = [...items].sort((a, b) => b.acc - a.acc);
    else items = [...items].sort((a, b) => b.att - a.att);
    return items;
  }, [rankedTopics, topicSearch, topicSort]);

  const topicGroups = useMemo(() => {
    const groups: Record<string, typeof filteredTopics> = {};
    for (const t of filteredTopics) (groups[t.match?.section ?? "Other"] ||= []).push(t);
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTopics]);

  function onTopicRowClick(t: { topic: string; match: { section: string; chapter: string } | null }) {
    if (!canPractice) return;
    if (t.match) onPracticeTopic(t.match.section, t.match.chapter);
    else resolveAndPractice(t.topic);
  }

  // ---- live feed: mistakes + session completions, merged and sorted ----
  interface FeedEvent {
    when: number;
    kind: "mistake" | "session";
    head: string;
    detail: string;
    attempt?: AttemptRecord;
  }
  const feedEvents = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];
    for (const m of mistakes) {
      events.push({
        when: m.when,
        kind: "mistake",
        head: `Missed ${m.topic}`,
        detail: `Answered "${m.yourAnswer}" — correct was "${m.correct}" · ${m.title} · ${secs(m.timeMs)}`,
      });
    }
    for (const h of history ?? []) {
      events.push({
        when: h.when,
        kind: "session",
        head: `Finished ${h.title}`,
        detail: `${accOf(h)}% accuracy · net ${h.net.toFixed(2)} / ${h.total}`,
        attempt: h,
      });
    }
    return events.sort((a, b) => b.when - a.when).slice(0, 30);
  }, [mistakes, history]);

  // ---- session log: filterable (by exam) + paginated ----
  const examKinds = useMemo(() => {
    const set = new Set<string>();
    for (const h of history ?? []) if (h.exam && h.exam !== "General") set.add(h.exam);
    return Array.from(set).sort();
  }, [history]);

  const logItems = useMemo(
    () => (logFilter === "all" ? recentFirst : recentFirst.filter((h) => h.exam === logFilter)),
    [recentFirst, logFilter]
  );
  const logPageCount = Math.max(1, Math.ceil(logItems.length / LOG_PAGE_SIZE));
  const clampedLogPage = Math.min(logPage, logPageCount);
  const logPageItems = logItems.slice((clampedLogPage - 1) * LOG_PAGE_SIZE, clampedLogPage * LOG_PAGE_SIZE);
  const logPageNumbers = Array.from(
    new Set([1, logPageCount, clampedLogPage - 1, clampedLogPage, clampedLogPage + 1].filter((n) => n >= 1 && n <= logPageCount))
  ).sort((a, b) => a - b);

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
          <button className="btn" onClick={() => setSelected(null)}>&larr; Back to progress</button>
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

        <button className="btn primary wide" onClick={() => setSelected(null)}>&larr; Back to progress</button>
      </div>
    );
  }

  if (history === null) {
    return (
      <div className="home">
        <div className="hubPageHead">
          <h1>Your progress</h1>
          <p>Where you stand, what&rsquo;s costing you marks, and exactly what to practice next.</p>
        </div>
        <div className="loadingBlock"><Spinner size={18} label="Loading your history…" /></div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="home">
        <div className="hubPageHead">
          <h1>Your progress</h1>
          <p>Where you stand, what&rsquo;s costing you marks, and exactly what to practice next.</p>
        </div>
        <p className="muted">Write a mock test to start seeing your progress here.</p>
      </div>
    );
  }

  const trendUp = trendDelta === null || trendDelta >= 0;

  return (
    <div className="home pgWide">
      <section className="pgHero">
        <div className="pgBlob1" />
        <div className="pgBlob2" />
        <div className="pgHeroGrid">
          <div>
            <div className="pgEyebrow"><i />Live &mdash; updates after every attempt</div>
            <div className="pgHeroVal">{avgRecent}<small>%</small></div>
            <div className={`pgHeroTrend ${trendUp ? "" : "down"}`}>
              {trendDelta === null
                ? "Keep going to see a trend"
                : trendDelta === 0
                ? "Holding steady vs prior 5"
                : `${trendUp ? "↑" : "↓"} ${trendUp ? "Improving" : "Dipping"} — ${trendUp ? "up" : "down"} ${Math.abs(trendDelta)}pts vs prior 5`}
            </div>
            <div className="pgHeroMeta">
              <div className="pgHeroStat"><b>{history.length}</b><span>Attempts</span></div>
              <div className="pgHeroStat"><b>{streak}</b><span>Streak</span></div>
              <div className="pgHeroStat"><b>{bestAcc}%</b><span>Best</span></div>
            </div>
          </div>
          <div>
            <div className="pgChartLbl">Accuracy trend, last {Math.min(chronological.length, 20)} attempts</div>
            <TrendChart data={chronological.slice(-20)} />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="cardIconRow">
          <span className="cardIcon amber">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>
          </span>
          <div>
            <h2>Focus next</h2>
            <p className="muted small" style={{ margin: "2px 0 0" }}>Your weakest topics, ready to drop straight into a practice session</p>
          </div>
        </div>
        {focusTopics.length === 0 ? (
          <p className="pgFocusEmpty">No attempted questions yet &mdash; your weak spots will show up here once you write a test.</p>
        ) : (
          <div className="pgFocusGrid">
            {focusTopics.map((t, i) => {
              const t2 = tier(t.acc);
              const match = findMatch(t.topic);
              return (
                <div className={`pgFocusCard ${t2 === "warning" ? "warn" : ""}`} key={t.topic}>
                  <div className="pgFocusTop">
                    <span className="pgFocusRank">{i === 0 ? "Weakest" : i === 1 ? "Weak" : "Needs work"}</span>
                    <span className="pgFocusIcon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M12 9v4M12 17h.01" strokeLinecap="round" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                    </span>
                  </div>
                  <div className="pgFocusTopic">{t.topic}</div>
                  <div className="pgFocusStat"><b>{t.acc}%</b> accuracy &middot; {t.att} attempt{t.att === 1 ? "" : "s"}</div>
                  {canPractice && match ? (
                    <button className="pgFocusBtn" onClick={() => onPracticeTopic(match.section, match.chapter)}>Practice now &rarr;</button>
                  ) : canPractice && bankSections && bankSections.length > 0 ? (
                    <button
                      className="pgFocusBtn pgFocusBtnGhost"
                      onClick={() => resolveAndPractice(t.topic)}
                      disabled={resolvingTopic === t.topic}
                      title="No exact chapter match - let AI find the right one"
                    >
                      {resolvingTopic === t.topic ? <Spinner size={13} inline /> : <>Find chapter &rarr;</>}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="pgSectionLabel">Control panel &mdash; mistakes &amp; activity</div>

      <div className="pgTelRow">
        <div className="pgPanelCard pgTelCard pgTelAcc">
          <div className="pgCardGlow g1" style={{ background: "#ffd98a" }} />
          <div className="pgCardGlow g2" style={{ background: "#ffd98a" }} />
          <div className="pgTelLabelRow">
            <span className="pgTelLabel">Accuracy &middot; 7d</span>
            <InfoIcon
              title="Accuracy, last 7 days"
              body="Average accuracy across every attempt in the past 7 days (not just the last 5 shown above) - a wider window, so a few recent slip-ups show up here even if the 5-attempt trend looks fine."
            />
          </div>
          <div className="pgTelValRow">
            <span className="pgTelVal">{accuracy7d ?? "—"}{accuracy7d !== null && <small>%</small>}</span>
            {accDelta !== null && accDelta !== 0 && (
              <span className="pgTelDelta">{accDelta > 0 ? "▲" : "▼"} {Math.abs(accDelta)}%</span>
            )}
          </div>
          <Sparkline values={dailySeries.acc} />
        </div>

        <div className="pgPanelCard pgTelCard pgTelStreak">
          <div className="pgCardGlow g1" style={{ background: "#9ef5c5" }} />
          <div className="pgCardGlow g2" style={{ background: "#38bdf8" }} />
          <div className="pgTelLabelRow">
            <span className="pgTelLabel">Active streak</span>
            <InfoIcon
              title="Active streak"
              body="Consecutive days with at least one attempt. The trend badge compares how many days you were active this week vs the week before."
            />
          </div>
          <div className="pgTelValRow">
            <span className="pgTelVal">{streak}<small>d</small></span>
            {streakDelta !== 0 && (
              <span className="pgTelDelta">{streakDelta > 0 ? "▲" : "▼"} {Math.abs(streakDelta)}d</span>
            )}
          </div>
          <Sparkline values={dailySeries.active} />
        </div>

        <div className="pgPanelCard pgTelCard pgTelMistakes">
          <div className="pgCardGlow g1" style={{ background: "#ffb0b0" }} />
          <div className="pgCardGlow g2" style={{ background: "#ffb0b0" }} />
          <div className="pgTelLabelRow">
            <span className="pgTelLabel">Mistakes tracked</span>
            <InfoIcon
              title="Mistakes tracked"
              body={`Wrong answers logged in the past 7 days across all attempts.${attemptsWithDetail < history.length ? " Only attempts since question-level tracking shipped have this detail." : ""}`}
            />
          </div>
          <div className="pgTelValRow">
            <span className="pgTelVal">{mistakes7d}</span>
            {mistakesDelta !== 0 && (
              <span className="pgTelDelta">{mistakesDelta > 0 ? "▲" : "▼"} {Math.abs(mistakesDelta)}</span>
            )}
          </div>
          <Sparkline values={dailySeries.mistakes} />
        </div>

        <div className="pgPanelCard pgTelCard pgTelSpeed">
          <div className="pgCardGlow g1" style={{ background: "#9ec5f2" }} />
          <div className="pgCardGlow g2" style={{ background: "#38bdf8" }} />
          <div className="pgTelLabelRow">
            <span className="pgTelLabel">Avg speed / q</span>
            <InfoIcon
              title="Avg speed per question"
              body="Average time spent per question across your last 7 days of attempts - lower is faster, but watch accuracy alongside this, not instead of it."
            />
          </div>
          <div className="pgTelValRow">
            <span className="pgTelVal">{speed7d ?? "—"}{speed7d !== null && <small>s</small>}</span>
            {speedDelta !== null && speedDelta !== 0 && (
              <span className="pgTelDelta">{speedDelta > 0 ? "▲" : "▼"} {Math.abs(speedDelta)}s</span>
            )}
          </div>
          <Sparkline values={dailySeries.speed} />
        </div>
      </div>

      <div className="pgMainGrid">
        <div className="pgPanelCard pgHeatHero">
          <div className="pgCardGlow g1" style={{ background: "#c6a8f5" }} />
          <div className="pgCardGlow g2" style={{ background: "#5fd4ff" }} />
          <div className="pgGlassPill"><i style={{ background: "#c6a8f5" }} />{weakTopics.length} topic{weakTopics.length === 1 ? "" : "s"} tracked &mdash; scrolls as this grows</div>
          <div className="pgPanelHead">
            <span className="pgPanelTitle">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h6" strokeLinecap="round" /></svg>
              TOPIC RANKING
            </span>
            <span className="pgPanelSub">{topicSort === "worst" ? "worst first" : topicSort === "best" ? "best first" : "most attempted"}</span>
          </div>
          <div className="pgHeatToolbar">
            <input
              className="pgHeatSearch"
              placeholder="Search topics&hellip;"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
            />
            <div className="pgHeatSort">
              <button className={`pgSortBtn ${topicSort === "worst" ? "active" : ""}`} onClick={() => setTopicSort("worst")}>Worst first</button>
              <button className={`pgSortBtn ${topicSort === "best" ? "active" : ""}`} onClick={() => setTopicSort("best")}>Best first</button>
              <button className={`pgSortBtn ${topicSort === "attempts" ? "active" : ""}`} onClick={() => setTopicSort("attempts")}>Most attempted</button>
            </div>
          </div>
          <div className="pgHeatListWrap">
            {filteredTopics.length === 0 ? (
              <div className="pgHeatEmpty">{weakTopics.length === 0 ? "No attempted questions yet." : `No topics match “${topicSearch}”.`}</div>
            ) : (
              topicGroups.map(([section, items]) => (
                <div key={section}>
                  <div className="pgHeatGroupLabel">{section} &middot; {items.length}</div>
                  {items.map((t, i) => {
                    const tc = tierColorHex(t.acc);
                    return (
                      <button key={t.topic} className="pgHeatRow" onClick={() => onTopicRowClick(t)} disabled={!canPractice || resolvingTopic === t.topic}>
                        <span className="pgHeatRank">{i + 1}</span>
                        <span className="pgHeatDot" style={{ background: tc }} />
                        <span className="pgHeatName">{t.topic}</span>
                        <span className="pgHeatBarTrack"><span className="pgHeatBarFill" style={{ width: `${t.acc}%`, background: tc }} /></span>
                        <span className="pgHeatPct" style={{ color: tc }}>{t.acc}%</span>
                        <span className="pgHeatAtt">{t.att} att</span>
                        {canPractice && (
                          <span className="pgHeatGo">
                            {resolvingTopic === t.topic ? <Spinner size={11} inline /> : <>{t.match ? "Practice" : "Find"} &rarr;</>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="pgHeatLegend">
            <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#ff8d94" }} />Critical &lt;50%</span>
            <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#ffd98a" }} />Warning 50&ndash;75%</span>
            <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#86efac" }} />Good 75%+</span>
          </div>
        </div>

        <div className="pgPanelCard pgFeedHero">
          <div className="pgCardGlow g1" style={{ background: "#38bdf8" }} />
          <div className="pgCardGlow g2" style={{ background: "#9ec5f2" }} />
          <div className="pgGlassPill"><i />Live &mdash; updates after every attempt</div>
          <div className="pgPanelHead">
            <span className="pgPanelTitle">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              LIVE FEED
            </span>
            <span className="pgPanelSub">
              mistakes + sessions{attemptsWithDetail < history.length ? ` · ${attemptsWithDetail}/${history.length} w/ full detail` : ""}
            </span>
          </div>
          <div className="pgFeedBox">
            {feedEvents.length === 0 ? (
              <div className="pgFeedEmpty">Nothing yet &mdash; write a test to start seeing activity here.</div>
            ) : (
              feedEvents.map((f, i) => {
                const glyph = f.kind === "mistake" ? { cls: "bad", g: "✕" } : (() => {
                  const acc = f.attempt ? accOf(f.attempt) : 0;
                  return acc >= 75 ? { cls: "good", g: "✓" } : acc >= 50 ? { cls: "info", g: "●" } : { cls: "bad", g: "✕" };
                })();
                const clickable = f.kind === "session" && !!f.attempt;
                const d = new Date(f.when);
                const stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                return (
                  <div
                    key={i}
                    className={`pgFeedRow ${clickable ? "clickable" : ""}`}
                    onClick={clickable ? () => setSelected(f.attempt!) : undefined}
                  >
                    <span className={`pgFeedGlyphWrap ${glyph.cls}`}>{glyph.g}</span>
                    <div className="pgFeedBody">
                      <div className="pgFeedTopLine">
                        <span className="pgFeedHead">{f.head}</span>
                        <span className="pgFeedTime">{stamp}</span>
                      </div>
                      <div className="pgFeedDetail">{f.detail}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="pgPanelCard pgWaveHero pgAttached">
        <div className="pgCardGlow g1" style={{ background: "#9ef5c5" }} />
        <div className="pgCardGlow g2" style={{ background: "#38bdf8" }} />
        <div className="pgGlassPill"><i />Live &mdash; updates after every attempt</div>
        <div className="pgPanelHead">
          <span className="pgPanelTitle">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h3l2-7 4 14 3-10 2 3h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            SESSION WAVEFORM
          </span>
          <span className="pgPanelSub">last {Math.min(chronological.length, 20)} sessions</span>
        </div>
        <TrendChart data={chronological.slice(-20)} />
        <div className="pgHeatLegend" style={{ marginTop: 12, paddingTop: 0, borderTop: "none" }}>
          <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#ff8d94" }} />Below 50%</span>
          <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#ffd98a" }} />50&ndash;75%</span>
          <span className="pgLegItem"><span className="pgLegDot" style={{ background: "#86efac" }} />75%+</span>
        </div>
      </div>

      <div className="pgLogCard">
        <div className="pgLogHead">
          <span className="pgLogTitle2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
            Session log
          </span>
          {examKinds.length > 0 && (
            <div className="pgLogFilters">
              <button className={`pgLogFilterBtn ${logFilter === "all" ? "active" : ""}`} onClick={() => { setLogFilter("all"); setLogPage(1); }}>All</button>
              {examKinds.map((k) => (
                <button key={k} className={`pgLogFilterBtn ${logFilter === k ? "active" : ""}`} onClick={() => { setLogFilter(k); setLogPage(1); }}>{k}</button>
              ))}
            </div>
          )}
        </div>
        {logPageItems.length === 0 ? (
          <div className="pgLogEmpty">No sessions match this filter.</div>
        ) : (
          (() => {
            let lastGroup = "";
            return logPageItems.map((h, i) => {
              const group = relDateLabel(h.when);
              const showGroup = group !== lastGroup;
              lastGroup = group;
              const acc = accOf(h);
              const col = logTierColors(acc);
              const d = new Date(h.when);
              const stamp = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              return (
                <div key={i}>
                  {showGroup && <div className="pgLogGroupLabel">{group}</div>}
                  <button className="pgLogRow" onClick={() => setSelected(h)}>
                    <span className="pgLogAccent" style={{ background: col.fg }} />
                    <span className="pgLogIconWrap" style={{ background: "var(--soft)", color: "var(--dim)" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
                    </span>
                    <div className="pgLogBody">
                      <div className="pgLogTopLine">
                        <span className="pgLogName">{h.title}</span>
                        {h.exam && h.exam !== "General" && <span className="pgExamBadge" style={{ background: "var(--soft)", color: "var(--dim)" }}>{h.exam}</span>}
                      </div>
                      <div className="pgLogMetaLine">{stamp}</div>
                    </div>
                    <div className="pgLogRight">
                      <div className="pgLogAccWrap">
                        <span className="pgAccPill" style={{ background: col.bg, color: col.fg }}>{acc}%</span>
                        <span className="pgAccBarTrack"><span className="pgAccBarFill" style={{ width: `${acc}%`, background: col.fg }} /></span>
                      </div>
                      <span className="pgLogNetVal"><b>{h.net.toFixed(2)}</b>/{h.total}</span>
                      <svg className="pgLogChev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </button>
                </div>
              );
            });
          })()
        )}
        {logItems.length > 0 && (
          <div className="pgLogFoot">
            <button className="pgLogPagerBtn" disabled={clampedLogPage === 1} onClick={() => setLogPage(clampedLogPage - 1)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="pgLogPagerPages">
              {logPageNumbers.map((n, i) => (
                <span key={n} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && n - logPageNumbers[i - 1] > 1 && <span className="pgLogPagerEllipsis">&hellip;</span>}
                  <button className={`pgLogPageBtn ${n === clampedLogPage ? "active" : ""}`} onClick={() => setLogPage(n)}>{n}</button>
                </span>
              ))}
            </div>
            <button className="pgLogPagerBtn" disabled={clampedLogPage === logPageCount} onClick={() => setLogPage(clampedLogPage + 1)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {resolveModal && (
        <div className="modalWrap" role="dialog" aria-modal="true" onClick={() => setResolveModal(null)}>
          <div className="modal pgResolveModal" onClick={(e) => e.stopPropagation()}>
            <div className="pgResolveBadge"><i />AI couldn&rsquo;t find an exact match</div>
            <h3>Which chapter matches &ldquo;{resolveModal.topic}&rdquo;?</h3>
            <p className="muted small" style={{ margin: "0 0 16px" }}>
              Pick one, and we&rsquo;ll remember it next time &mdash; no AI call needed.
            </p>
            <div className="pgCandidateList">
              {resolveModal.candidates.map((c) => (
                <button
                  key={`${c.section}-${c.chapter}`}
                  className="pgCandidateBtn"
                  onClick={() => confirmCandidate(c.section, c.chapter)}
                >
                  <span>{c.chapter}<span className="pgCandidateSection"> &middot; {c.section}</span></span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
            <button
              className="pgResolveManualBtn"
              onClick={() => { const topic = resolveModal.topic; setResolveModal(null); onBrowseBank(topic); }}
            >
              None of these &mdash; let me browse the bank myself
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ data }: { data: AttemptRecord[] }) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const W = 700, H = 150, padL = 20, padR = 10, top = 8, bottom = 142;
  const n = data.length;
  if (n < 2) return <p className="muted small" style={{ color: "#a7c9bb" }}>Write a few more attempts to see a trend.</p>;

  const accs = data.map(accOf);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => bottom - (v / 100) * (bottom - top);

  let d = `M ${x(0)} ${y(accs[0])}`;
  accs.forEach((v, i) => { if (i > 0) d += ` L ${x(i)} ${y(v)}`; });
  const areaD = `${d} L ${x(n - 1)} ${bottom} L ${x(0)} ${bottom} Z`;

  return (
    <div style={{ position: "relative" }}>
      <svg className="pgChartSvg" viewBox={`0 0 ${W} ${H}`}>
        <line className="pgGridLine" x1={padL} y1={top} x2={W} y2={top} />
        <line className="pgGridLine" x1={padL} y1={(top + bottom) / 2} x2={W} y2={(top + bottom) / 2} />
        <line className="pgGridLine" x1={padL} y1={bottom} x2={W} y2={bottom} />
        <text className="pgAxisLbl" x={0} y={top + 4}>100</text>
        <text className="pgAxisLbl" x={4} y={(top + bottom) / 2 + 4}>50</text>
        <text className="pgAxisLbl" x={8} y={bottom + 4}>0</text>
        <path className="pgTrendArea" d={areaD} />
        <path className="pgTrendLine" d={d} />
        {hoverI !== null && <line className="pgCrosshair" style={{ opacity: 1 }} x1={x(hoverI)} y1={top} x2={x(hoverI)} y2={bottom} />}
        {accs.map((v, i) => (
          <circle key={i} className="pgPt" r={3.5} cx={x(i)} cy={y(v)} />
        ))}
        {accs.map((v, i) => (
          <circle
            key={`hit-${i}`}
            className="pgPt pgHit"
            r={12}
            cx={x(i)}
            cy={y(v)}
            onPointerEnter={() => setHoverI(i)}
            onPointerMove={() => setHoverI(i)}
            onPointerLeave={() => setHoverI(null)}
          />
        ))}
      </svg>
      {hoverI !== null && (
        <div
          className="pgTooltip"
          style={{ opacity: 1, left: `${(x(hoverI) / W) * 100}%`, top: `${(y(accs[hoverI]) / H) * 100}%` }}
        >
          <b>{accs[hoverI]}% accuracy</b>
          <span>{new Date(data[hoverI].when).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
