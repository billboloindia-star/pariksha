import { useCallback, useState } from "react";
import Home from "./components/Home";
import Login from "./components/Login";
import SystemCheck from "./components/SystemCheck";
import Instructions from "./components/Instructions";
import Exam from "./components/Exam";
import Report from "./components/Report";
import * as api from "./api";
import type { ExamResult } from "./types";
import type { Paper } from "./types";

type Phase = "home" | "login" | "syscheck" | "instructions" | "exam" | "report";

export default function App() {
  const [phase, setPhase] = useState<Phase>("home");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [session, setSession] = useState<api.Session | null>(() => api.getSession());

  const onLoaded = useCallback((p: Paper) => {
    setPaper(p);
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
          onLogout={() => { api.setSession(null); setSession(null); }}
        />
      )}
      {phase === "login" && (
        <Login onDone={(s) => { if (s) setSession(s); setPhase("home"); }} />
      )}
      {phase === "syscheck" && paper && (
        <SystemCheck paper={paper} onBack={again} onProceed={() => setPhase("instructions")} />
      )}
      {phase === "instructions" && paper && (
        <Instructions paper={paper} onBack={again} onStart={() => setPhase("exam")} />
      )}
      {phase === "exam" && paper && <Exam paper={paper} onFinish={onFinish} />}
      {phase === "report" && result && <Report result={result} onAgain={again} />}
    </div>
  );
}
