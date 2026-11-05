import { useCallback, useEffect, useState } from "react";
import type { Paper } from "../types";

interface Props {
  paper: Paper;
  onProceed: () => void;
  onBack: () => void;
}

type StepStatus = "pending" | "checking" | "ok";
interface Step { label: string; status: StepStatus }

const LABELS = ["Checking browser compatibility", "Checking screen resolution", "Checking webcam access"];

// Below this, a real exam portal would be unusable - pages/answers wouldn't
// save reliably. Measured by timing an actual no-cache fetch of this page,
// not just navigator.connection's (unreliable, Safari/Firefox don't expose it).
const MIN_KBPS = 150;
const SPEEDTEST_TIMEOUT_MS = 7000;

type NetStatus = "checking" | "ok" | "weak" | "failed";

async function measureKbps(): Promise<number> {
  const url = `${location.pathname}?speedtest=${Date.now()}-${Math.random()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEEDTEST_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const blob = await res.blob();
    const elapsedSec = (performance.now() - started) / 1000;
    const kbits = (blob.size * 8) / 1024;
    return elapsedSec > 0 ? kbits / elapsedSec : 0;
  } finally {
    clearTimeout(timer);
  }
}

export default function SystemCheck({ paper, onProceed, onBack }: Props) {
  const [steps, setSteps] = useState<Step[]>(LABELS.map((label) => ({ label, status: "pending" })));
  const [net, setNet] = useState<NetStatus>("checking");
  const [kbps, setKbps] = useState<number | null>(null);

  const runSpeedTest = useCallback(() => {
    setNet("checking");
    setKbps(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNet("failed");
      return;
    }
    measureKbps()
      .then((k) => {
        setKbps(k);
        setNet(k >= MIN_KBPS ? "ok" : "weak");
      })
      .catch((err) => {
        // an abort means the connection was too slow to even finish the test
        // within the timeout - that's "weak", not "no connection at all"
        setNet(err?.name === "AbortError" ? "weak" : "failed");
      });
  }, []);

  useEffect(() => { runSpeedTest(); }, [runSpeedTest]);

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

  const allDone = steps.every((s) => s.status === "ok") && net === "ok";

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
            <div className={`sysCheckRow ${net === "ok" ? "ok" : net === "checking" ? "checking" : "weak"}`}>
              <span className="sysCheckIcon">
                {net === "ok" ? "✓" : net === "checking" ? "…" : "!"}
              </span>
              <span>Checking internet connection</span>
              <span className="muted small sysCheckStatus">
                {net === "checking" && "checking"}
                {net === "ok" && kbps !== null && `OK · ${Math.round(kbps)} kbps`}
                {net === "weak" && (kbps !== null ? `too slow · ${Math.round(kbps)} kbps` : "too slow · timed out")}
                {net === "failed" && "no connection"}
              </span>
            </div>

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

          {(net === "weak" || net === "failed") && (
            <div className="sysCheckWarn">
              <span>
                {net === "weak"
                  ? "Your connection is too weak to start a timed exam reliably — your progress may not save properly. Try moving closer to your router or switching networks, then retry."
                  : "No internet connection detected. Connect to the internet, then retry."}
              </span>
              <button className="btn smallBtn" onClick={runSpeedTest}>Retry check</button>
            </div>
          )}

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
