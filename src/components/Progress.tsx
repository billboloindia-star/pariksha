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
  onBrowseBank: () => void;
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

function accOf(a: AttemptRecord): number {
  if (a.accuracy !== undefined) return a.accuracy;
  const attempted = a.total - a.skipped;
  return attempted ? Math.round((a.correct / attempted) * 100) : 0;
}

export default function Progress({ session, onPracticeTopic, onBrowseBank }: Props) {
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);
  const [mistakesExpanded, setMistakesExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const canPractice = api.backendEnabled() && api.canUseBankFeature(session);

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
    <div className="home">
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
                    <button className="pgFocusBtn pgFocusBtnGhost" onClick={onBrowseBank} title="No exact chapter match in your bank - browse it instead">
                      Browse bank &rarr;
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="cardIconRow">
          <span className="cardIcon blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>
          </span>
          <h2>All topics</h2>
        </div>
        <div className="pgTopicCols">
          {weakTopics.length === 0 ? (
            <p className="muted small">No attempted questions yet.</p>
          ) : (
            [0, 1].map((col) => (
              <div key={col}>
                {weakTopics.filter((_, i) => i % 2 === col).map((t) => (
                  <div className="pgTopicRow" key={t.topic}>
                    <span className="nm">{t.topic}</span>
                    <div className="pgPerfTrack"><div className={`pgPerfFill ${tier(t.acc)}`} style={{ width: `${Math.max(3, t.acc)}%` }} /></div>
                    <div className="pgTopicMeta"><i className={`pgSdot ${tier(t.acc)}`} />{t.acc}%</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="cardIconRow">
          <span className="cardIcon green">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>
          </span>
          <div>
            <h2>Recent mistakes</h2>
            {attemptsWithDetail < history.length && (
              <p className="muted small" style={{ margin: "2px 0 0" }}>
                Only attempts since this feature shipped have question-level detail ({attemptsWithDetail} of {history.length})
              </p>
            )}
          </div>
        </div>
        {mistakes.length === 0 ? (
          <p className="muted small">No wrong answers recorded yet.</p>
        ) : (
          <>
            {mistakes.slice(0, mistakesExpanded ? 40 : 3).map((m, i) => {
              const d = new Date(m.when);
              const stamp = `${d.getDate()}/${d.getMonth() + 1}`;
              return (
                <div className="pgMistakeRow" key={i}>
                  <span className="pgMistakeDot" />
                  <div>
                    <div className="pgMpHead">
                      <span className="pgTopicChip">{m.topic}</span>
                      <span className="pgMpMeta">{m.title} &middot; {stamp} &middot; {secs(m.timeMs)}</span>
                    </div>
                    <div className="pgMpText">{m.text}</div>
                    <div className="pgMpAns">
                      <span className="bad">{m.yourAnswer}</span> &rarr; <span className="good">{m.correct}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {mistakes.length > 3 && (
              <button className="pgViewAllLink" onClick={() => setMistakesExpanded((v) => !v)}>
                {mistakesExpanded ? "Show fewer" : `View all ${mistakes.length} mistakes`} &rarr;
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <div className="cardIconRow">
          <span className="cardIcon blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" /></svg>
          </span>
          <h2>Activity log</h2>
        </div>
        <table className="pgLogTable">
          <thead>
            <tr><th>Exam</th><th>Paper</th><th>Date</th><th className="r">Accuracy</th><th className="r">Net</th></tr>
          </thead>
          <tbody>
            {recentFirst.slice(0, logExpanded ? 100 : 8).map((h, i) => {
              const d = new Date(h.when);
              const stamp = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              const acc = accOf(h);
              return (
                <tr key={i} onClick={() => setSelected(h)}>
                  <td>{h.exam && h.exam !== "General" ? <span className="pgLogTag">{h.exam}</span> : null}</td>
                  <td><span className="pgLogTitle">{h.title}</span><br /><span className="pgLogDate">{stamp}</span></td>
                  <td className="pgLogDate">{stamp}</td>
                  <td className="r"><i className={`pgSdot ${tier(acc)}`} />{acc}%</td>
                  <td className="r">{h.net.toFixed(2)}/{h.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {recentFirst.length > 8 && (
          <button className="pgViewAllLink" onClick={() => setLogExpanded((v) => !v)}>
            {logExpanded ? "Show fewer" : `View all ${recentFirst.length} attempts`} &rarr;
          </button>
        )}
      </section>
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
