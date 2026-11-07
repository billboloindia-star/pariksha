import { useEffect, useRef, useState } from "react";

interface Props {
  /** ISO date "2026-12-19", or "" for no selection. */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** ISO date - days before this are not selectable. Defaults to today. */
  min?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtDisplay(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A small self-contained calendar popover, since the native <input
 * type="date"> hands control of the whole dropdown to the OS/browser and
 * can't be styled to match the rest of the app at all. */
export default function DatePicker({ value, onChange, placeholder = "Pick a date", min }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const minDate = parseIso(min ?? "") ?? new Date(new Date().setHours(0, 0, 0, 0));
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPicker() {
    setViewMonth(selected ?? new Date());
    setOpen(true);
  }

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const cells: { day: number; monthDelta: -1 | 0 | 1; date: Date }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, monthDelta: -1, date: new Date(y, m - 1, daysInPrevMonth - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, monthDelta: 0, date: new Date(y, m, d) });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ day: next.getDate(), monthDelta: 1, date: next });
  }

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  return (
    <div className="dpWrap" ref={wrapRef}>
      <button type="button" className="dpField" onClick={openPicker}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" /></svg>
        <span className={value ? "dpVal" : "dpPlaceholder"}>{value ? fmtDisplay(value) : placeholder}</span>
      </button>

      {open && (
        <div className="dpPopover">
          <div className="dpHead">
            <button type="button" className="dpNavBtn" onClick={() => setViewMonth(new Date(y, m - 1, 1))} aria-label="Previous month">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="dpHeadLabel">{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button type="button" className="dpNavBtn" onClick={() => setViewMonth(new Date(y, m + 1, 1))} aria-label="Next month">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <div className="dpWeekRow">
            {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
          </div>

          <div className="dpGrid">
            {cells.map((c, i) => {
              const disabled = c.date < minDate;
              const isSelected = selected && isSameDay(c.date, selected);
              const isToday = isSameDay(c.date, today);
              return (
                <button
                  type="button"
                  key={i}
                  disabled={disabled}
                  className={`dpCell ${c.monthDelta !== 0 ? "dpOutside" : ""} ${isSelected ? "dpSelected" : ""} ${isToday && !isSelected ? "dpToday" : ""}`}
                  onClick={() => { onChange(toIso(c.date)); setOpen(false); }}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="dpFoot">
            <button type="button" className="dpFootBtn" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
            <button
              type="button"
              className="dpFootBtn primary"
              onClick={() => { const t = new Date(); setViewMonth(t); onChange(toIso(t)); setOpen(false); }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
