import type { ReactNode } from "react";
import type { HubPhase } from "./Sidebar";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import * as api from "../api";

interface Props {
  active: HubPhase;
  onNavigate: (phase: HubPhase) => void;
  session: api.Session | null;
  onLogout: () => void;
  children: ReactNode;
}

export default function HubLayout({ active, onNavigate, session, onLogout, children }: Props) {
  return (
    <div className="hubShell">
      <Sidebar active={active} onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <MobileNav active={active} onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <div className="hubContent">{children}</div>
    </div>
  );
}
