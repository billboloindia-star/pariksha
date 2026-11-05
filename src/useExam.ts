import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Paper, QState, Status } from "./types";
import { statusOf } from "./types";
import type { ExamProgress } from "./examPersist";
import { clearInProgress, savePaper, saveProgress } from "./examPersist";

export interface ExamApi {
  paper: Paper;
  states: QState[];
  idx: number;
  remaining: number;
  sectionIdx: number;
  sectionTimed: boolean;
  lockedSections: number[];
  finished: boolean;
  paused: boolean;
  pause: () => void;
  resume: () => void;
  setIdx: (i: number) => void;
  setGiven: (i: number, v: number | null) => void;
  clear: (i: number) => void;
  toggleMark: (i: number) => void;
  saveAndNext: () => void;
  markAndNext: () => void;
  previous: () => void;
  submit: () => void;
  status: (i: number) => Status;
  counts: Record<Status, number>;
  elapsedSec: number;
  tabSwitches: number;
}

export function useExam(
  paper: Paper,
  onFinish: () => void,
  monitorTabSwitches = true,
  initialProgress?: ExamProgress
): ExamApi {
  const total = paper.questions.length;
  const sectionTimed = paper.sections.some((s) => typeof s.minutes === "number" && (s.minutes ?? 0) > 0);

  const [idx, setIdxRaw] = useState(initialProgress?.idx ?? 0);
  const [sectionIdx, setSectionIdx] = useState(initialProgress?.sectionIdx ?? 0);
  const [lockedSections, setLockedSections] = useState<number[]>(initialProgress?.lockedSections ?? []);
  const [finished, setFinished] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(initialProgress?.tabSwitches ?? 0);
  const [remaining, setRemaining] = useState(
    initialProgress?.remaining ??
      (sectionTimed ? (paper.sections[0]?.minutes ?? paper.durationMinutes) * 60 : paper.durationMinutes * 60)
  );
  const [states, setStates] = useState<QState[]>(
    () =>
      initialProgress?.states ??
      Array.from({ length: total }, (_, i) => ({ given: null, marked: false, visited: i === 0, timeMs: 0 }))
  );
  const [paused, setPaused] = useState(!!initialProgress);

  // Seeded so that (Date.now() - startedAt.current) already equals the true elapsed
  // time carried over from before a reload, instead of restarting the clock at 0.
  const startedAt = useRef(Date.now() - (initialProgress?.elapsedBeforePause ?? 0) * 1000);
  const sectionStartedAt = useRef(Date.now() - (initialProgress?.sectionElapsedBeforePause ?? 0) * 1000);
  const visitStart = useRef(Date.now());
  const idxRef = useRef(initialProgress?.idx ?? 0);
  const sectionRef = useRef(initialProgress?.sectionIdx ?? 0);
  const lockedRef = useRef<number[]>(initialProgress?.lockedSections ?? []);
  const finishedRef = useRef(false);
  const pausedRef = useRef(!!initialProgress);
  const pausedAt = useRef(Date.now());

  // kept in sync so the unload/visibility save handler always reads the latest values
  const statesRef = useRef(states);
  const tabSwitchesRef = useRef(tabSwitches);
  const remainingRef = useRef(remaining);
  useEffect(() => { statesRef.current = states; }, [states]);
  useEffect(() => { tabSwitchesRef.current = tabSwitches; }, [tabSwitches]);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);

  const sectionOf = useCallback(
    (i: number) => {
      const found = paper.sections.findIndex((s) => i >= s.from && i <= s.to);
      return found < 0 ? 0 : found;
    },
    [paper.sections]
  );

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    clearInProgress();
    document.exitFullscreen?.().catch(() => {});
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (!monitorTabSwitches) return;
    const bump = () => {
      if (!finishedRef.current && !pausedRef.current) setTabSwitches((n) => n + 1);
    };
    const onVisibility = () => { if (document.hidden) bump(); };
    const onFullscreenChange = () => { if (!document.fullscreenElement) bump(); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [monitorTabSwitches]);

  const enterSection = useCallback(
    (si: number) => {
      sectionRef.current = si;
      setSectionIdx(si);
      sectionStartedAt.current = Date.now();
      const sec = paper.sections[si];
      if (sec && typeof sec.minutes === "number") setRemaining(sec.minutes * 60);
    },
    [paper.sections]
  );

  useEffect(() => {
    const t = window.setInterval(() => {
      if (finishedRef.current || pausedRef.current) return;
      if (sectionTimed) {
        const sec = paper.sections[sectionRef.current];
        const limit = (sec?.minutes ?? paper.durationMinutes) * 60;
        const left = limit - (Date.now() - sectionStartedAt.current) / 1000;
        setRemaining(left <= 0 ? 0 : left);
        if (left <= 0) {
          const si = sectionRef.current;
          lockedRef.current = [...lockedRef.current, si];
          setLockedSections(lockedRef.current);
          const next = si + 1;
          if (next < paper.sections.length) {
            enterSection(next);
            setIdxRaw(paper.sections[next].from);
            idxRef.current = paper.sections[next].from;
            visitStart.current = Date.now();
            setStates((prev) => {
              const copy = prev.slice();
              const qi = paper.sections[next].from;
              copy[qi] = { ...copy[qi], visited: true };
              return copy;
            });
          } else {
            finish();
          }
        }
      } else {
        const left = paper.durationMinutes * 60 - (Date.now() - startedAt.current) / 1000;
        setRemaining(left <= 0 ? 0 : left);
        if (left <= 0) finish();
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [paper.durationMinutes, paper.sections, sectionTimed, enterSection, finish]);

  const flushTime = useCallback(() => {
    const now = Date.now();
    const spent = now - visitStart.current;
    visitStart.current = now;
    setStates((prev) => {
      const next = prev.slice();
      const cur = next[idxRef.current];
      next[idxRef.current] = { ...cur, timeMs: cur.timeMs + spent };
      return next;
    });
  }, []);

  const pause = useCallback(() => {
    if (finishedRef.current || pausedRef.current) return;
    flushTime();
    pausedRef.current = true;
    pausedAt.current = Date.now();
    setPaused(true);
  }, [flushTime]);

  const resume = useCallback(() => {
    if (!pausedRef.current || finishedRef.current) return;
    const delta = Date.now() - pausedAt.current;
    startedAt.current += delta;
    sectionStartedAt.current += delta;
    visitStart.current = Date.now();
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const setIdx = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || finishedRef.current || pausedRef.current) return;
      const si = sectionOf(i);
      if (lockedRef.current.indexOf(si) >= 0) return;
      // Sectional timing is strict: only the current section is navigable. A
      // section is reachable only by its own clock expiring (which locks the
      // one being left) - never by jumping ahead or back manually.
      if (sectionTimed && si !== sectionRef.current) return;
      flushTime();
      idxRef.current = i;
      setIdxRaw(i);
      setStates((prev) => {
        if (prev[i].visited) return prev;
        const next = prev.slice();
        next[i] = { ...next[i], visited: true };
        return next;
      });
    },
    [flushTime, total, sectionOf, sectionTimed]
  );

  const setGiven = useCallback((i: number, v: number | null) => {
    setStates((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], given: v };
      return next;
    });
  }, []);

  const clear = useCallback((i: number) => setGiven(i, null), [setGiven]);

  const toggleMark = useCallback((i: number) => {
    setStates((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], marked: !next[i].marked };
      return next;
    });
  }, []);

  const nextUnlocked = useCallback(
    (from: number) => {
      for (let i = from + 1; i < total; i++) {
        if (lockedRef.current.indexOf(sectionOf(i)) < 0) return i;
      }
      return -1;
    },
    [total, sectionOf]
  );

  const saveAndNext = useCallback(() => {
    flushTime();
    const n = nextUnlocked(idxRef.current);
    if (n >= 0) setIdx(n);
  }, [flushTime, nextUnlocked, setIdx]);

  const markAndNext = useCallback(() => {
    toggleMark(idxRef.current);
    flushTime();
    const n = nextUnlocked(idxRef.current);
    if (n >= 0) setIdx(n);
  }, [flushTime, nextUnlocked, setIdx, toggleMark]);

  const previous = useCallback(() => {
    const target = idxRef.current - 1;
    if (target >= 0 && lockedRef.current.indexOf(sectionOf(target)) < 0) setIdx(target);
  }, [setIdx, sectionOf]);

  const submit = useCallback(() => {
    flushTime();
    setTimeout(finish, 30);
  }, [flushTime, finish]);

  const status = useCallback((i: number) => statusOf(states[i]), [states]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
    states.forEach((s) => { c[statusOf(s)] += 1; });
    return c;
  }, [states]);

  // write the (static) paper once, at the start of a fresh attempt only - a
  // hydrated/resumed attempt already has it persisted.
  useEffect(() => {
    if (!initialProgress) savePaper({ paper, monitorTabSwitches });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // progress snapshot on any meaningful change - deliberately NOT keyed on
  // `remaining`, which ticks 4x/sec; the unload/visibility handler below
  // covers capturing a fresh `remaining` right before an actual exit.
  useEffect(() => {
    if (finishedRef.current) return;
    saveProgress({
      idx, states, sectionIdx, lockedSections, tabSwitches, remaining,
      elapsedBeforePause: (Date.now() - startedAt.current) / 1000,
      sectionElapsedBeforePause: (Date.now() - sectionStartedAt.current) / 1000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, states, sectionIdx, lockedSections, tabSwitches, paused]);

  useEffect(() => {
    function saveNow() {
      if (finishedRef.current) return;
      saveProgress({
        idx: idxRef.current,
        states: statesRef.current,
        sectionIdx: sectionRef.current,
        lockedSections: lockedRef.current,
        tabSwitches: tabSwitchesRef.current,
        remaining: remainingRef.current,
        elapsedBeforePause: (Date.now() - startedAt.current) / 1000,
        sectionElapsedBeforePause: (Date.now() - sectionStartedAt.current) / 1000,
      });
    }
    function onVisibility() { if (document.hidden) saveNow(); }
    window.addEventListener("pagehide", saveNow);
    window.addEventListener("beforeunload", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      window.removeEventListener("beforeunload", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return {
    paper, states, idx, remaining, sectionIdx, sectionTimed, lockedSections, finished,
    paused, pause, resume,
    setIdx, setGiven, clear, toggleMark, saveAndNext, markAndNext, previous, submit,
    status, counts,
    elapsedSec: (Date.now() - startedAt.current) / 1000,
    tabSwitches,
  };
}
