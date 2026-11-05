import { useCallback, useState } from "react";
import Home from "./components/Home";
import Login from "./components/Login";
import Review from "./components/Review";
import SystemCheck from "./components/SystemCheck";
import Instructions from "./components/Instructions";
import Exam from "./components/Exam";
import Report from "./components/Report";
import PastAttempts from "./components/PastAttempts";
import * as api from "./api";
import type { ExamResult, ExamSettings } from "./types";
import type { Paper } from "./types";
import { clearInProgress, loadInProgress } from "./examPersist";
import type { ExamProgress } from "./examPersist";

type Phase = "home" | "login" | "review" | "syscheck" | "instructions" | "exam" | "report" | "past";

const DEFAULT_SETTINGS: ExamSettings = { monitorTabSwitches: true, simulateZoom: false, simulateLaggyCursor: false };

export default function App() {
  const [session, setSession] = useState<api.Session | null>(() => api.getSession());
  const resumed = useState(() => loadInProgress())[0];
  const [phase, setPhase] = useState<Phase>(resumed ? "exam" : "home");
  const [paper, setPaper] = useState<Paper | null>(resumed?.paper ?? null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [examSettings, setExamSettings] = useState<ExamSettings>(resumed?.settings ?? DEFAULT_SETTINGS);
  const [initialProgress] = useState<ExamProgress | undefined>(resumed?.progress);

  const onLoaded = useCallback((p: Paper) => {
    setPaper(p);
    setPhase("review");
  }, []);

  const onReviewConfirm = useCallback((p: Paper, settings: ExamSettings) => {
    setPaper(p);
    setExamSettings(settings);
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
          onPastAttempts={() => setPhase("past")}
        />
      )}
      {phase === "past" && <PastAttempts onBack={() => setPhase("home")} />}
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
        <Instructions paper={paper} onBack={again} onStart={() => setPhase("exam")} monitorTabSwitches={examSettings.monitorTabSwitches} />
      )}
      {phase === "exam" && paper && (
        <Exam
          paper={paper}
          onFinish={onFinish}
          settings={examSettings}
          initialProgress={initialProgress}
          onDiscard={initialProgress ? () => { clearInProgress(); again(); } : undefined}
        />
      )}
      {phase === "report" && result && <Report result={result} onAgain={again} />}
    </div>
  );
}
