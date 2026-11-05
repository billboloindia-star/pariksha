import { useState, type ReactElement } from "react";
import * as api from "../api";
import Logo from "./Logo";

export type HubPhase = "home" | "past" | "library";

interface Props {
  active: HubPhase;
  onNavigate: (phase: HubPhase) => void;
  session: api.Session | null;
  onLogout: () => void;
}

const COLLAPSE_KEY = "pariksha_sidebar_collapsed";

function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function HomeIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 11.5L12 4l8 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function PastIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function VaultIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" style={{ transform: collapsed ? "rotate(180deg)" : undefined }}>
      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar({ active, onNavigate, session, onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch { /* storage may be blocked */ }
      return next;
    });
  }

  const items: { phase: HubPhase; label: string; icon: ReactElement }[] = [
    { phase: "home", label: "Home", icon: <HomeIcon /> },
    { phase: "past", label: "Past attempts", icon: <PastIcon /> },
    ...(api.backendEnabled() ? [{ phase: "library" as const, label: "Paper vault", icon: <VaultIcon /> }] : []),
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebarBrand">
        <Logo size={36} />
        <span className="sidebarBrandLabel">Pariksha</span>
      </div>

      <nav className="sidebarNav">
        {items.map((it) => (
          <button
            key={it.phase}
            className={`sidebarItem ${active === it.phase ? "active" : ""}`}
            onClick={() => onNavigate(it.phase)}
            title={it.label}
          >
            {it.icon}
            <span className="sidebarItemLabel">{it.label}</span>
          </button>
        ))}
      </nav>

      <button className="sidebarCollapseBtn" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <ChevronIcon collapsed={collapsed} />
        <span className="sidebarItemLabel">Collapse</span>
      </button>

      {api.backendEnabled() && session && (
        <div className="sidebarFoot">
          <div className="sidebarAcct" title={session.email}>
            <span className="acctAvatar">{initials(session.email)}</span>
            <span className="sidebarItemLabel">{session.email}</span>
          </div>
          <button className="sidebarItem sidebarLogout" onClick={onLogout} title="Log out">
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="sidebarItemLabel">Log out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
