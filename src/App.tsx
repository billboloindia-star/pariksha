import { useCallback, useState } from "react";
import Home from "./components/Home";
import Login from "./components/Login";
import Review from "./components/Review";
import SystemCheck from "./components/SystemCheck";
import Instructions from "./components/Instructions";
import Exam from "./components/Exam";
import Report from "./components/Report";
import * as api from "./api";
import type { ExamResult } from "./types";
import type { Paper } from "./types";

type Phase = "home" | "login" | "review" | "syscheck" | "instructions" | "exam" | "report";

export default function App() {
  const [session, setSession] = useState<api.Session | null>(() => api.getSession());
  const [phase, setPhase] = useState<Phase>("home");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [monitorTabSwitches, setMonitorTabSwitches] = useState(true);

  const onLoaded = useCallback((p: Paper) => {
    setPaper(p);
    setPhase("review");
  }, []);

  const onReviewConfirm = useCallback((p: Paper, monitor: boolean) => {
    setPaper(p);
    setMonitorTabSwitches(monitor);
    setPhase("syscheck");
  }, []);

  const onFinish = useCallback((r: ExamResult) => {
    setResult(r);
    setPhase("report");
  }, []);

  const again = useCallback(() => {
    setResult(null);
    setPaper(null);
    setPhase("home");
  }, []);

  return (
    <div className="app">
      {phase === "home" && (
        <Home
          onLoaded={onLoaded}
          session={session}
          onLogin={() => setPhase("login")}
          onLogout={() => {
            api.setSession(null);
            setSession(null);
          }}
        />
      )}
      {phase === "login" && (
        <Login onDone={(s) => { setSession(s); setPhase("home"); }} onBack={() => setPhase("home")} />
      )}
      {phase === "review" && paper && (
        <Review paper={paper} onBack={again} onConfirm={onReviewConfirm} />
      )}
      {phase === "syscheck" && paper && (
        <SystemCheck paper={paper} onBack={again} onProceed={() => setPhase("instructions")} />
      )}
      {phase === "instructions" && paper && (
        <Instructions paper={paper} onBack={again} onStart={() => setPhase("exam")} monitorTabSwitches={monitorTabSwitches} />
      )}
      {phase === "exam" && paper && <Exam paper={paper} onFinish={onFinish} monitorTabSwitches={monitorTabSwitches} />}
      {phase === "report" && result && <Report result={result} onAgain={again} />}
    </div>
  );
}
