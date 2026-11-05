import { useEffect, useMemo, useRef, useState } from "react";
import { useExam } from "../useExam";
import * as api from "../api";
import type { ExamResult, Paper, Status, TopicStat } from "../types";

interface Props {
  paper: Paper;
  onFinish: (r: ExamResult) => void;
  monitorTabSwitches?: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  notVisited: "Not Visited",
  notAnswered: "Not Answered",
  answered: "Answered",
  marked: "Marked for Review",
  answeredMarked: "Answered & Marked",
};

function clock(s: number) {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function candidateDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Exam({ paper, onFinish, monitorTabSwitches = true }: Props) {
  const noop = useRef(() => {});
  const exam = useExam(paper, noop.current, monitorTabSwitches);
  const session = api.getSession();
  const candidateName = session ? candidateDisplayName(session.email) : "Guest candidate";
  const candidateInitials = (session ? candidateName : "G").slice(0, 2).toUpperCase();
  const q = paper.questions[exam.idx];
  const st = exam.states[exam.idx];
  const [draft, setDraft] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dismissedSwitches, setDismissedSwitches] = useState(0);
  const doneRef = useRef(false);

  // keep the typed box in sync with the stored answer
  useEffect(() => {
    setDraft(st.given === null ? "" : String(st.given));
  }, [exam.idx, st.given]);

  const activeSection = useMemo(
    () => paper.sections.find((s) => exam.idx >= s.from && exam.idx <= s.to),
    [paper.sections, exam.idx]
  );

  useEffect(() => {
    if (!exam.finished || doneRef.current) return;
    doneRef.current = true;
    onFinish(buildResult(paper, exam.states, paper.durationMinutes * 60 - exam.remaining, exam.tabSwitches));
  }, [exam.finished, exam.states, exam.remaining, exam.tabSwitches, paper, onFinish]);

  function commitDraft() {
    if (q.type === "mc") return;
    const clean = draft.replace(/[^0-9.\-]/g, "");
    if (clean === "" || clean === "." || clean === "-") {
      exam.setGiven(exam.idx, null);
      return;
    }
    exam.setGiven(exam.idx, Number(clean));
  }

  function onSaveNext() {
    commitDraft();
    exam.saveAndNext();
  }

  function onMarkNext() {
    commitDraft();
    exam.markAndNext();
  }

  function onClear() {
    exam.clear(exam.idx);
    setDraft("");
  }

  function jumpSection(from: number) {
    exam.setIdx(from);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (q.type === "mc" && /^[1-9]$/.test(e.key)) {
        const pick = Number(e.key) - 1;
        if (pick < (q.options?.length ?? 0)) {
          e.preventDefault();
          exam.setGiven(exam.idx, pick);
        }
      }
      if (e.key === "ArrowRight") { e.preventDefault(); onSaveNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); exam.previous(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, exam]);

  return (
    <div className="examWrap">
      <header className="examBar">
        <div className="examBarLeft">
          <span className="examTitle">{paper.title}</span>
          <span className="examSub">Question Paper</span>
        </div>
        <div className="examBarRight">
          <div className={`clockBox ${exam.remaining < 120 ? "urgent" : ""}`}>
            <span className="clockLabel">
              {exam.sectionTimed && paper.sections[exam.sectionIdx]
                ? `${paper.sections[exam.sectionIdx].name} · left`
                : "Time Left"}
            </span>
            <span className="clockValue">{clock(exam.remaining)}</span>
          </div>
          <div className="candMini">
            <span className="avatar">{candidateInitials}</span>
            <div>
              <b>{candidateName}</b>
              <small>{paper.exam}</small>
            </div>
          </div>
        </div>
      </header>

      {paper.sections.length > 1 && (
        <nav className="sectionBar">
          {paper.sections.map((s, si) => {
            const locked = exam.lockedSections.indexOf(si) >= 0;
            return (
              <button
                key={s.name}
                className={`sectionTab ${activeSection?.name === s.name ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => jumpSection(s.from)}
                disabled={locked}
                title={locked ? "time over for this section" : s.name}
              >
                {s.name}
                {typeof s.minutes === "number" && <span className="secMins">{s.minutes}m</span>}
                {locked && <span className="secLock">locked</span>}
              </button>
            );
          })}
        </nav>
      )}

      {exam.tabSwitches > dismissedSwitches && (
        <div className="warnBanner">
          <span>
            You left the exam window or exited full screen — {exam.tabSwitches} time
            {exam.tabSwitches === 1 ? "" : "s"}. This would count against you in the real exam.
          </span>
          <button className="btn smallBtn" onClick={() => setDismissedSwitches(exam.tabSwitches)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="examBody">
        <main className="qPanel">
          <div className="qTop">
            <span className="qNo">
              Question No. <b>{exam.idx + 1}</b>
            </span>
            <span className="marks">
              Marks <b>+1.0</b> <i>|</i> Negative <b>-{paper.negativeMarking}</b>
            </span>
          </div>

          <div className="qTypeRow">
            <span className="chip">{q.topic}</span>
            {q.type === "mc" && <span className="chip ghost">multiple choice</span>}
            {st.marked && <span className="chip purple">marked for review</span>}
          </div>

          <div className="qText">{q.text}</div>

          {q.table && (
            <table className="diTable">
              <thead>
                <tr>{q.table.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {q.table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => <td key={j} className={j === 0 ? "" : "num"}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {q.image && (
            <img
              key={q.id}
              className="qImage"
              src={q.image}
              alt=""
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}

          {q.type === "mc" ? (
            <div className="options">
              {q.options?.map((o, i) => (
                <button
                  key={i}
                  className={`option ${st.given === i ? "sel" : ""}`}
                  onClick={() => exam.setGiven(exam.idx, i)}
                >
                  <span className="optKey">{String.fromCharCode(65 + i)}</span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="numBox">
              <label htmlFor="ans">Your answer</label>
              <input
                id="ans"
                value={draft}
                inputMode="decimal"
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9.\-]/g, ""))}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onSaveNext(); }
                }}
                placeholder="type a number"
              />
            </div>
          )}

          <div className="qActions">
            <button className="btn markBtn" onClick={onMarkNext}>Mark for Review &amp; Next</button>
            <button className="btn" onClick={onClear}>Clear Response</button>
            <button className="btn" onClick={exam.previous} disabled={exam.idx === 0}>Previous</button>
            <button className="btn primary" onClick={onSaveNext}>Save &amp; Next</button>
          </div>
        </main>

        <aside className="sidePanel">
          <div className="sideHead">Question Palette</div>

          <div className="legend">
            {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (
              <div className="legendRow" key={k}>
                <i className={`sw ${k}`} />
                <span>{STATUS_LABEL[k]}</span>
                <b>{exam.counts[k]}</b>
              </div>
            ))}
          </div>

          <div className="palette">
            {paper.questions.map((_, i) => {
              const secOf = paper.sections.findIndex((sec) => i >= sec.from && i <= sec.to);
              const locked = exam.lockedSections.indexOf(secOf) >= 0;
              return (
                <button
                  key={i}
                  className={`pCell ${exam.status(i)} ${i === exam.idx ? "current" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => exam.setIdx(i)}
                  disabled={locked}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <button className="btn submitBtn" onClick={() => setConfirmOpen(true)}>Submit Paper</button>
        </aside>
      </div>

      {confirmOpen && (
        <div className="modalWrap" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Submit the paper?</h3>
            <div className="modalGrid">
              <div><span>Answered</span><b>{exam.counts.answered + exam.counts.answeredMarked}</b></div>
              <div><span>Not answered</span><b>{exam.counts.notAnswered + exam.counts.marked}</b></div>
              <div><span>Not visited</span><b>{exam.counts.notVisited}</b></div>
              <div><span>Marked</span><b>{exam.counts.marked + exam.counts.answeredMarked}</b></div>
            </div>
            <p className="muted small">Once submitted you cannot change your answers.</p>
            <div className="rowBtns">
              <button className="btn" onClick={() => setConfirmOpen(false)}>Keep writing</button>
              <button className="btn primary" onClick={() => { setConfirmOpen(false); exam.submit(); }}>Submit now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function buildResult(
  paper: Paper,
  states: import("../types").QState[],
  elapsedSec: number,
  tabSwitches: number
): ExamResult {
  const byTopic: Record<string, TopicStat> = {};
  let correct = 0, wrong = 0, skipped = 0, attempted = 0, timeAtt = 0;

  paper.questions.forEach((q, i) => {
    const t = (byTopic[q.topic] ||= { n: 0, att: 0, ok: 0, ms: 0 });
    t.n += 1;
    const s = states[i];
    if (s.given === null) { skipped += 1; return; }
    attempted += 1;
    t.att += 1;
    timeAtt += s.timeMs;
    t.ms += s.timeMs;
    if (s.given === q.ans) { correct += 1; t.ok += 1; } else { wrong += 1; }
  });

  const net = correct - paper.negativeMarking * wrong;
  return {
    paper, states, elapsedSec,
    correct, wrong, skipped, attempted, net,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    avgSec: attempted ? timeAtt / attempted / 1000 : 0,
    byTopic,
    tabSwitches,
  };
}
