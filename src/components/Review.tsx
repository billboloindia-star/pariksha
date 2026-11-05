import { useEffect, useRef, useState } from "react";
import type { Paper, Question, SectionInfo } from "../types";
import Logo from "./Logo";

interface Props {
  paper: Paper;
  onConfirm: (paper: Paper, monitorTabSwitches: boolean) => void;
  onBack: () => void;
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 2h6M12 2v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M4 7h3M4 12h3M4 17h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 7h10M10 12h10M10 17h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <circle cx="9" cy="6" r="1.6" fill="currentColor" />
      <circle cx="15" cy="6" r="1.6" fill="currentColor" />
      <circle cx="9" cy="12" r="1.6" fill="currentColor" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" />
      <circle cx="9" cy="18" r="1.6" fill="currentColor" />
      <circle cx="15" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}

export default function Review({ paper, onConfirm, onBack }: Props) {
  const [duration, setDuration] = useState(paper.durationMinutes > 0 ? String(paper.durationMinutes) : "");
  const [negativeMarking, setNegativeMarking] = useState(String(paper.negativeMarking));
  const [sectionTimers, setSectionTimers] = useState(
    paper.sections.map((s) => ({ enabled: typeof s.minutes === "number", minutes: s.minutes ? String(s.minutes) : "" }))
  );
  const [sectionNames, setSectionNames] = useState(paper.sections.map((s) => s.name));
  const [order, setOrder] = useState(paper.sections.map((_, i) => i));
  const [monitorTabSwitches, setMonitorTabSwitches] = useState(true);
  const [error, setError] = useState("");

  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dragPos, setDragPos] = useState<number | null>(null);

  useEffect(() => {
    if (dragPos === null) return;
    function onMove(e: PointerEvent) {
      const idx = rowRefs.current.findIndex((el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (idx >= 0) {
        setDragPos((cur) => {
          if (cur === null || idx === cur) return cur;
          setOrder((prev) => {
            const next = prev.slice();
            const [item] = next.splice(cur, 1);
            next.splice(idx, 0, item);
            return next;
          });
          return idx;
        });
      }
    }
    function onUp() {
      setDragPos(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragPos]);

  function moveUp(visualIdx: number) {
    if (visualIdx === 0) return;
    setOrder((prev) => {
      const next = prev.slice();
      [next[visualIdx - 1], next[visualIdx]] = [next[visualIdx], next[visualIdx - 1]];
      return next;
    });
  }

  function moveDown(visualIdx: number) {
    setOrder((prev) => {
      if (visualIdx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[visualIdx], next[visualIdx + 1]] = [next[visualIdx + 1], next[visualIdx]];
      return next;
    });
  }

  function updateSection(origIdx: number, patch: Partial<{ enabled: boolean; minutes: string }>) {
    setSectionTimers((prev) => prev.map((s, j) => (j === origIdx ? { ...s, ...patch } : s)));
  }

  function renameSection(origIdx: number, name: string) {
    setSectionNames((prev) => prev.map((s, j) => (j === origIdx ? name : s)));
  }

  function confirm() {
    const d = Number(duration);
    if (!duration.trim() || !isFinite(d) || d <= 0) {
      setError('Enter a duration in minutes — this paper didn\'t come with one.');
      return;
    }
    for (const origIdx of order) {
      const t = sectionTimers[origIdx];
      if (t.enabled && (!t.minutes.trim() || !isFinite(Number(t.minutes)) || Number(t.minutes) <= 0)) {
        setError(`Enter a timer length (minutes) for "${sectionNames[origIdx] || paper.sections[origIdx].name}", or turn its timer off.`);
        return;
      }
    }
    setError("");

    const neg = Number(negativeMarking);
    let offset = 0;
    const newQuestions: Question[] = [];
    const newSections: SectionInfo[] = [];
    for (const origIdx of order) {
      const s = paper.sections[origIdx];
      const name = sectionNames[origIdx].trim() || s.name;
      const slice = paper.questions.slice(s.from, s.to + 1).map((q) => ({ ...q, section: name }));
      newQuestions.push(...slice);
      const count = slice.length;
      newSections.push({
        name,
        from: offset,
        to: offset + count - 1,
        minutes: sectionTimers[origIdx].enabled ? Number(sectionTimers[origIdx].minutes) : undefined,
      });
      offset += count;
    }

    const updated: Paper = {
      ...paper,
      durationMinutes: d,
      negativeMarking: isFinite(neg) && neg >= 0 ? neg : paper.negativeMarking,
      questions: newQuestions,
      sections: newSections,
    };
    onConfirm(updated, monitorTabSwitches);
  }

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <Logo size={52} />
          <div>
            <h1>Review &amp; configure</h1>
            <p>{paper.title} &middot; {paper.questions.length} questions &middot; {paper.sections.length} section{paper.sections.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      </header>

      <div className="homeGrid">
        <section className="card">
          <div className="cardIconRow">
            <span className="cardIcon blue"><ClockIcon /></span>
            <h2>Timing &amp; marking</h2>
          </div>
          <label className="fieldLabel" htmlFor="duration">Duration (minutes)</label>
          <input
            id="duration"
            type="number"
            min="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 60"
          />
          <label className="fieldLabel" htmlFor="negmark">Negative marking (per wrong answer)</label>
          <input
            id="negmark"
            type="number"
            min="0"
            step="0.25"
            value={negativeMarking}
            onChange={(e) => setNegativeMarking(e.target.value)}
          />

          <label className="reviewCheckRow">
            <input
              type="checkbox"
              checked={monitorTabSwitches}
              onChange={(e) => setMonitorTabSwitches(e.target.checked)}
            />
            <span>Monitor tab switches &amp; fullscreen exits during the exam</span>
          </label>
        </section>

        <section className="card">
          <div className="cardIconRow">
            <span className="cardIcon purple"><ListIcon /></span>
            <h2>Sectional timers &amp; order</h2>
          </div>
          <p className="muted small">
            Rename a section if it got parsed wrong, drag to reorder which one the candidate sits
            first, and turn on a timer to lock it when it runs out, like the real IBPS screen.
          </p>
          {order.map((origIdx, visualIdx) => {
            const s = paper.sections[origIdx];
            const count = s.to - s.from + 1;
            const t = sectionTimers[origIdx];
            const dragging = dragPos === visualIdx;
            return (
              <div
                className={`reviewSectionRow ${dragging ? "dragging" : ""}`}
                key={origIdx}
                ref={(el) => { rowRefs.current[visualIdx] = el; }}
              >
                {paper.sections.length > 1 && (
                  <span
                    className="dragHandle"
                    onPointerDown={(e) => { e.preventDefault(); setDragPos(visualIdx); }}
                    aria-label="Drag to reorder"
                  >
                    <DragHandleIcon />
                  </span>
                )}

                <div className="reviewSectionMain">
                  <div className="reviewSectionNameRow">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={(e) => updateSection(origIdx, { enabled: e.target.checked })}
                    />
                    <input
                      type="text"
                      className="sectionNameInput"
                      value={sectionNames[origIdx]}
                      onChange={(e) => renameSection(origIdx, e.target.value)}
                    />
                  </div>
                  <div className="reviewSectionMeta">
                    <span className="muted small">{count} question{count === 1 ? "" : "s"}</span>
                    {t.enabled && (
                      <input
                        type="number"
                        min="1"
                        className="reviewSectionMinutes"
                        value={t.minutes}
                        onChange={(e) => updateSection(origIdx, { minutes: e.target.value })}
                        placeholder="minutes"
                      />
                    )}
                  </div>
                </div>

                {paper.sections.length > 1 && (
                  <div className="reviewSectionOrderBtns">
                    <button
                      type="button"
                      className="orderBtn"
                      disabled={visualIdx === 0}
                      onClick={() => moveUp(visualIdx)}
                      aria-label="Move section up"
                    >&uarr;</button>
                    <button
                      type="button"
                      className="orderBtn"
                      disabled={visualIdx === order.length - 1}
                      onClick={() => moveDown(visualIdx)}
                      aria-label="Move section down"
                    >&darr;</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {error && <pre className="error">{error}</pre>}

      <div className="rowBtns">
        <button className="btn" onClick={onBack}>Choose another paper</button>
        <button className="btn primary" onClick={confirm}>Continue</button>
      </div>
    </div>
  );
}
