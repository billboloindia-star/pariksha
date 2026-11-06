/** The handful of environment-specific hooks useExam.ts needs that have no
 * shared implementation — web uses document/window events, React Native uses
 * NetInfo/AppState. Everything else about the exam engine (timers, section
 * locking, scoring bookkeeping, persistence) is identical on both platforms
 * and lives directly in useExam.ts. */
export interface ExamPlatform {
  /** Subscribe to "the candidate appears to have left the exam" (tab switch /
   * fullscreen exit on web, app backgrounded on RN) — used for violation
   * counting while monitoring is enabled. Returns an unsubscribe function. */
  onAway(cb: () => void): () => void;
  /** Subscribe to connectivity changes, for the offline auto-pause/resume
   * behavior. Must invoke cb once immediately with the current state, then
   * again on every change. Returns an unsubscribe function. */
  onConnectivity(cb: (online: boolean) => void): () => void;
  /** Subscribe to "about to exit" (web: pagehide/beforeunload/tab-hidden; RN:
   * app backgrounded) for a final progress-save flush. Returns an unsubscribe
   * function. */
  onWillExit(cb: () => void): () => void;
  /** Called once right as the exam finishes (web exits fullscreen; RN no-ops). */
  cleanupOnFinish(): void;
}
