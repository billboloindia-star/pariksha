import { useEffect, useState, type ReactElement } from "react";
import * as api from "../../shared/api";
import { computeStreak } from "../../shared/history";
import Logo from "./Logo";

export type HubPhase = "home" | "progress" | "library" | "vault" | "profile" | "speedmaths" | "targetexam";

interface Props {
  active: HubPhase;
  onNavigate: (phase: HubPhase) => void;
  session: api.Session | null;
  onLogout: () => void;
}

export function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export { computeStreak };

export function HomeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M4 11.5L12 4l8 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function PastIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
export function VaultIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
export function MasterVaultIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}
export function LogoutIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function ProfileIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
export function SpeedMathsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
export function TargetExamIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>;
}

export function hubItems(session?: api.Session | null): { phase: HubPhase; label: string; icon: ReactElement }[] {
  return [
    { phase: "home", label: "Home", icon: <HomeIcon /> },
    { phase: "progress", label: "Progress", icon: <PastIcon /> },
    ...(api.backendEnabled() ? [{ phase: "library" as const, label: "Paper vault", icon: <VaultIcon /> }] : []),
    ...(api.backendEnabled() && api.canUseBankFeature(session ?? null)
      ? [{ phase: "vault" as const, label: "Master Vault", icon: <MasterVaultIcon /> }]
      : []),
    ...(api.backendEnabled() && api.canUseBankFeature(session ?? null)
      ? [{ phase: "speedmaths" as const, label: "Speed Maths", icon: <SpeedMathsIcon /> }]
      : []),
    ...(api.backendEnabled() && api.canUseBankFeature(session ?? null)
      ? [{ phase: "targetexam" as const, label: "Target Exam", icon: <TargetExamIcon /> }]
      : []),
  ];
}

export default function Sidebar({ active, onNavigate, session, onLogout }: Props) {
  const items = hubItems(session);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    if (!api.backendEnabled() || !session) return;
    api.fetchAttempts().then((a) => setStreak(computeStreak(a.map((r) => r.when)))).catch(() => {});
  }, [session]);

  return (
    <aside className="sidebar">
      <div className="sidebarInner">
        <div className="sidebarBrand">
          <span className="sidebarLogo"><Logo size={32} /></span>
          <div className="sidebarBrandText">
            <b>Pariksha</b>
            <span>Mock exam practice</span>
          </div>
        </div>

        {streak !== null && streak > 0 && (
          <div className="sidebarStreak">
            <span className="sidebarStreakIcon">&#128293;</span>
            <div className="sidebarStreakText">
              <b>{streak}-day streak</b>
              <span>Keep it going today</span>
            </div>
          </div>
        )}

        <div className="sidebarSectionLabel">Menu</div>
        <nav className="sidebarNav">
          {items.map((it) => (
            <button
              key={it.phase}
              className={`sidebarItem ${active === it.phase ? "active" : ""}`}
              onClick={(e) => { onNavigate(it.phase); e.currentTarget.blur(); }}
              title={it.label}
            >
              <span className="sidebarIconChip">{it.icon}</span>
              <span className="sidebarItemLabel">{it.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebarPromo">
          <div className="sidebarPromoIcon">&#10024;</div>
          <b>Try AI review</b>
          <p>Get a personalized breakdown of your weak areas after your next mock.</p>
          <button onClick={() => onNavigate("progress")}>Learn more</button>
        </div>

        {api.backendEnabled() && session && (
          <div className="sidebarFoot">
            <button
              className={`sidebarAcct sidebarAcctBtn ${active === "profile" ? "active" : ""}`}
              onClick={(e) => { onNavigate("profile"); e.currentTarget.blur(); }}
              title="Profile"
            >
              {session.avatarUrl ? (
                <img className="acctAvatarImg" src={session.avatarUrl} alt="" />
              ) : (
                <span className="acctAvatar">{initials(session.email)}</span>
              )}
              <span className="sidebarItemLabel">{session.name || session.email}</span>
            </button>
            <button className="sidebarItem sidebarLogout" onClick={(e) => { onLogout(); e.currentTarget.blur(); }} title="Log out">
              <LogoutIcon />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
