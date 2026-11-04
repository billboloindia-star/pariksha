import { useEffect, useState } from "react";
import type { Paper } from "../types";

interface Props {
  paper: Paper;
  onProceed: () => void;
  onBack: () => void;
}

type StepStatus = "pending" | "checking" | "ok";
interface Step { label: string; status: StepStatus }

const LABELS = ["Checking internet connection", "Checking browser compatibility", "Checking screen resolution", "Checking webcam access"];

export default function SystemCheck({ paper, onProceed, onBack }: Props) {
  const [steps, setSteps] = useState<Step[]>(LABELS.map((label) => ({ label, status: "pending" })));

  useEffect(() => {
    const timers: number[] = [];
    LABELS.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          setSteps((prev) => {
            const next = prev.slice();
            next[i] = { ...next[i], status: "checking" };
            return next;
          });
        }, i * 700)
      );
      timers.push(
        window.setTimeout(() => {
          setSteps((prev) => {
            const next = prev.slice();
            next[i] = { ...next[i], status: "ok" };
            return next;
          });
        }, i * 700 + 450)
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const allDone = steps.every((s) => s.status === "ok");

  return (
    <div className="instr">
      <header className="examBar">
        <div className="examBarLeft">
          <span className="examTitle">{paper.title}</span>
          <span className="examSub">System check</span>
        </div>
      </header>

      <div className="instrBody">
        <div className="card">
          <h2>Checking your system</h2>
          <p className="muted">This is a routine check before every real exam. Nothing here leaves your computer.</p>

          <div className="sysCheckList">
            {steps.map((s, i) => (
              <div className={`sysCheckRow ${s.status}`} key={i}>
                <span className="sysCheckIcon">
                  {s.status === "ok" ? "✓" : s.status === "checking" ? "…" : "·"}
                </span>
                <span>{s.label}</span>
                <span className="muted small sysCheckStatus">
                  {s.status === "ok" ? "OK" : s.status === "checking" ? "checking" : "pending"}
                </span>
              </div>
            ))}
          </div>

          <div className="rowBtns">
            <button className="btn" onClick={onBack}>Choose another paper</button>
            <button className="btn primary" disabled={!allDone} onClick={onProceed}>
              Proceed to instructions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
