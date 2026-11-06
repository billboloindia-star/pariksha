import type { ExamPlatform } from "../shared/examPlatform";

/** Web implementation of the exam engine's environment hooks — document/window
 * events. A stable module-level singleton (not re-created per render) so the
 * shared useExam.ts's `[platform]`-keyed effects don't re-subscribe on every
 * render. */
export const webExamPlatform: ExamPlatform = {
  onAway(cb) {
    const onVisibility = () => { if (document.hidden) cb(); };
    const onFullscreenChange = () => { if (!document.fullscreenElement) cb(); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  },

  onConnectivity(cb) {
    const onOffline = () => cb(false);
    const onOnline = () => cb(true);
    cb(typeof navigator === "undefined" || navigator.onLine !== false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  },

  onWillExit(cb) {
    const onVisibility = () => { if (document.hidden) cb(); };
    window.addEventListener("pagehide", cb);
    window.addEventListener("beforeunload", cb);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", cb);
      window.removeEventListener("beforeunload", cb);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  },

  cleanupOnFinish() {
    document.exitFullscreen?.().catch(() => {});
  },
};
