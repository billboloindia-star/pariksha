import { useEffect, useRef, useState } from "react";
import type { HubPhase } from "./Sidebar";
import { LogoutIcon, hubItems, initials } from "./Sidebar";
import * as api from "../../shared/api";
import Logo from "./Logo";

interface Props {
  active: HubPhase;
  onNavigate: (phase: HubPhase) => void;
  session: api.Session | null;
  onLogout: () => void;
}

export default function MobileNav({ active, onNavigate, session, onLogout }: Props) {
  const items = hubItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <>
      <header className="mobileTopBar">
        <div className="mobileTopBrand">
          <Logo size={30} />
          <span>Pariksha</span>
        </div>
        {api.backendEnabled() && session && (
          <div className="mobileAcctWrap" ref={menuRef}>
            <button className="mobileAcctBtn" onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu">
              <span className="acctAvatar">{initials(session.email)}</span>
            </button>
            {menuOpen && (
              <div className="mobileAcctMenu">
                <div className="mobileAcctEmail">{session.email}</div>
                <button
                  className="mobileAcctLogout"
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                >
                  <LogoutIcon />
                  Log out
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <nav className="mobileTabBar">
        {items.map((it) => (
          <button
            key={it.phase}
            className={`mobileTab ${active === it.phase ? "active" : ""}`}
            onClick={() => onNavigate(it.phase)}
          >
            {it.icon}
            <span>{it.label === "Past attempts" ? "Attempts" : it.label === "Paper vault" ? "Vault" : it.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
