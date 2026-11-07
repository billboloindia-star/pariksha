import { useCallback, useEffect, useState } from "react";
import Home from "./components/Home";
import Login from "./components/Login";
import Marketing from "./components/Marketing";
import HubLayout from "./components/HubLayout";
import type { HubPhase } from "./components/Sidebar";
import Review from "./components/Review";
import SystemCheck from "./components/SystemCheck";
import Instructions from "./components/Instructions";
import Exam from "./components/Exam";
import Report from "./components/Report";
import Progress from "./components/Progress";
import Library from "./components/Library";
import MasterVault from "./components/MasterVault";
import Profile from "./components/Profile";
import * as api from "../shared/api";
import type { ExamResult, ExamSettings } from "../shared/types";
import type { Paper } from "../shared/types";
import { clearInProgress, loadInProgress } from "../shared/examPersist";
import type { ExamProgress } from "../shared/examPersist";

type Phase = "home" | "login" | "review" | "syscheck" | "instructions" | "exam" | "report" | "progress" | "library" | "vault" | "profile";
const HUB_PHASES: Phase[] = ["home", "progress", "library", "vault", "profile"];

const DEFAULT_SETTINGS: ExamSettings = { monitorTabSwitches: true, simulateZoom: false, simulateLaggyCursor: false, examCenterSkin: false };

export default function App() {
  const [session, setSession] = useState<api.Session | null>(() => api.getSession());
  const resumed = useState(() => loadInProgress())[0];
  const [phase, setPhase] = useState<Phase>(resumed ? "exam" : "home");
  const [paper, setPaper] = useState<Paper | null>(resumed?.paper ?? null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [examSettings, setExamSettings] = useState<ExamSettings>(resumed?.settings ?? DEFAULT_SETTINGS);
  const [initialProgress] = useState<ExamProgress | undefined>(resumed?.progress);
  const [vaultSeed, setVaultSeed] = useState<{ section: string; chapters: string[] } | null>(null);

  // Refresh `plan` from the backend once at startup when a cached session
  // exists — the JWT itself doesn't carry plan, so a stale localStorage
  // session could still show "free" right after an admin flips someone to
  // premium. Session-shaped failures (expired token etc.) are left alone;
  // existing api calls already handle that per-request.
  useEffect(() => {
    if (!api.backendEnabled() || !session) return;
    api.me().then((m) => setSession((prev) => (prev ? { ...prev, plan: m.plan, name: m.name, avatarUrl: m.avatarUrl } : prev))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onLogout = useCallback(() => {
    api.setSession(null);
    setSession(null);
  }, []);

  const onSessionChange = useCallback((s: api.Session) => {
    api.setSession(s);
    setSession(s);
  }, []);

  const onPracticeTopic = useCallback((section: string, chapter: string) => {
    setVaultSeed({ section, chapters: [chapter] });
    setPhase("vault");
  }, []);

  const onBrowseBank = useCallback(() => {
    setVaultSeed(null);
    setPhase("vault");
  }, []);

  const isHubPhase = HUB_PHASES.includes(phase);
  const showMarketing = isHubPhase && api.backendEnabled() && !session;

  return (
    <div className="app">
      {showMarketing && <Marketing onLogin={() => setPhase("login")} />}
      {isHubPhase && !showMarketing && (
        <HubLayout active={phase as HubPhase} onNavigate={(p) => setPhase(p)} session={session} onLogout={onLogout}>
          {phase === "home" && <Home onLoaded={onLoaded} session={session} onLogin={() => setPhase("login")} onPastAttempts={() => setPhase("progress")} />}
          {phase === "progress" && <Progress session={session} onPracticeTopic={onPracticeTopic} onBrowseBank={onBrowseBank} />}
          {phase === "library" && <Library onLoaded={onLoaded} />}
          {phase === "vault" && <MasterVault onLoaded={onLoaded} seed={vaultSeed} />}
          {phase === "profile" && session && <Profile session={session} onSessionChange={onSessionChange} onLogout={onLogout} />}
        </HubLayout>
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
        <Instructions paper={paper} onBack={again} onStart={() => setPhase("exam")} settings={examSettings} />
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
