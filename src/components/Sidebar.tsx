import type { ReactElement } from "react";
import * as api from "../api";
import Logo from "./Logo";

export type HubPhase = "home" | "past" | "library" | "insights";

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

export function HomeIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 11.5L12 4l8 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function PastIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
export function VaultIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
export function InsightsIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 19V10M10 19V5M16 19v-7M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function LogoutIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function hubItems(): { phase: HubPhase; label: string; icon: ReactElement }[] {
  return [
    { phase: "home", label: "Home", icon: <HomeIcon /> },
    { phase: "past", label: "Past attempts", icon: <PastIcon /> },
    ...(api.backendEnabled() ? [{ phase: "library" as const, label: "Paper vault", icon: <VaultIcon /> }] : []),
    ...(api.backendEnabled() ? [{ phase: "insights" as const, label: "Weak areas", icon: <InsightsIcon /> }] : []),
  ];
}

export default function Sidebar({ active, onNavigate, session, onLogout }: Props) {
  const items = hubItems();

  return (
    <aside className="sidebar">
      <div className="sidebarInner">
        <div className="sidebarBrand">
          <Logo size={36} />
          <span className="sidebarBrandLabel">Pariksha</span>
        </div>

        <nav className="sidebarNav">
          {items.map((it) => (
            <button
              key={it.phase}
              className={`sidebarItem ${active === it.phase ? "active" : ""}`}
              onClick={(e) => { onNavigate(it.phase); e.currentTarget.blur(); }}
              title={it.label}
            >
              {it.icon}
              <span className="sidebarItemLabel">{it.label}</span>
            </button>
          ))}
        </nav>

        {api.backendEnabled() && session && (
          <div className="sidebarFoot">
            <div className="sidebarAcct" title={session.email}>
              <span className="acctAvatar">{initials(session.email)}</span>
              <span className="sidebarItemLabel">{session.email}</span>
            </div>
            <button className="sidebarItem sidebarLogout" onClick={(e) => { onLogout(); e.currentTarget.blur(); }} title="Log out">
              <LogoutIcon />
              <span className="sidebarItemLabel">Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
