import { useState } from "react";
import type { Paper } from "../types";

interface Props {
  paper: Paper;
  onConfirm: (paper: Paper, monitorTabSwitches: boolean) => void;
  onBack: () => void;
}

export default function Review({ paper, onConfirm, onBack }: Props) {
  const [duration, setDuration] = useState(paper.durationMinutes > 0 ? String(paper.durationMinutes) : "");
  const [negativeMarking, setNegativeMarking] = useState(String(paper.negativeMarking));
  const [sectionTimers, setSectionTimers] = useState(
    paper.sections.map((s) => ({ enabled: typeof s.minutes === "number", minutes: s.minutes ? String(s.minutes) : "" }))
  );
  const [monitorTabSwitches, setMonitorTabSwitches] = useState(true);
  const [error, setError] = useState("");

  function updateSection(i: number, patch: Partial<{ enabled: boolean; minutes: string }>) {
    setSectionTimers((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function confirm() {
    const d = Number(duration);
    if (!duration.trim() || !isFinite(d) || d <= 0) {
      setError('Enter a duration in minutes — this paper didn\'t come with one.');
      return;
    }
    for (let i = 0; i < sectionTimers.length; i++) {
      const s = sectionTimers[i];
      if (s.enabled && (!s.minutes.trim() || !isFinite(Number(s.minutes)) || Number(s.minutes) <= 0)) {
        setError(`Enter a timer length (minutes) for "${paper.sections[i].name}", or turn its timer off.`);
        return;
      }
    }
    setError("");

    const neg = Number(negativeMarking);
    const updated: Paper = {
      ...paper,
      durationMinutes: d,
      negativeMarking: isFinite(neg) && neg >= 0 ? neg : paper.negativeMarking,
      sections: paper.sections.map((s, i) =>
        sectionTimers[i].enabled ? { ...s, minutes: Number(sectionTimers[i].minutes) } : { ...s, minutes: undefined }
      ),
    };
    onConfirm(updated, monitorTabSwitches);
  }

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <span className="brandMark">R</span>
          <div>
            <h1>Review &amp; configure</h1>
            <p>{paper.title} &middot; {paper.questions.length} questions &middot; {paper.sections.length} section{paper.sections.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      </header>

      <div className="homeGrid">
        <section className="card">
          <h2>Timing &amp; marking</h2>
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
          <h2>Sectional timers</h2>
          <p className="muted small">
            Off by default — the paper runs on one overall clock. Turn a section on to give it its
            own timer that locks when it runs out, like the real IBPS screen.
          </p>
          {paper.sections.map((s, i) => {
            const count = s.to - s.from + 1;
            const t = sectionTimers[i];
            return (
              <div className="reviewSectionRow" key={s.name + i}>
                <label className="reviewCheckRow">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => updateSection(i, { enabled: e.target.checked })}
                  />
                  <span>{s.name} <i className="muted">&middot; {count} question{count === 1 ? "" : "s"}</i></span>
                </label>
                {t.enabled && (
                  <input
                    type="number"
                    min="1"
                    className="reviewSectionMinutes"
                    value={t.minutes}
                    onChange={(e) => updateSection(i, { minutes: e.target.value })}
                    placeholder="minutes"
                  />
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
