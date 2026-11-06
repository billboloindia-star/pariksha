# Pariksha — Future Features

Brainstormed feature backlog. Tick a box once a feature is actually built and deployed.

## 1. Learning loop / analytics
- [ ] Weak-area analytics (topic-wise accuracy trend across attempts)
- [ ] Mistake journal (auto-collected wrong answers across all attempts)
- [ ] Per-question personal notes during report review
- [ ] Spaced-repetition revision sets from past wrong answers
- [ ] Time-management breakdown (budgeted vs. actual time per question)
- [ ] "Mark as guess" to separate guessed vs. confident-wrong answers
- [ ] Answer-change tracking ("flip-flopped on N questions, M wrong after changing")
- [ ] Elimination/strike-out tool for MCQs + correlation with mistakes
- [ ] Comparative report (overlay two attempts of the same paper side-by-side)
- [ ] Fatigue curve within a single attempt (accuracy/speed drop-off over time)
- [ ] Attempt heatmap by time-of-day
- [ ] Cross-paper topic transfer (merge topic stats across different papers)
- [ ] Cutoff/percentile prediction from aggregate scores
- [ ] Difficulty calibration flags for mistagged papers

## 2. AI-assist / content
- [ ] "Explain this question" one-click AI explanation in report review
- [ ] "Give me 5 more like this" for a wrong answer
- [ ] AI-generated full mocks from a topic list (no source PDF needed)
- [ ] Error-pattern-to-targeted-practice-set generation
- [ ] Auto-tagging papers by topic/difficulty

## 3. Paper Vault
- [ ] Custom paper builder (assemble a mock from saved questions)
- [ ] Opt-in shared/public paper pool, tagged by exam name/year
- [ ] Direct PDF→YAML conversion server-side (skip manual prompt-paste)
- [ ] WhatsApp/email-in ingestion straight into the vault
- [ ] OCR confidence scoring on converted papers
- [ ] Paper quality flags + "verified official source" badge

## 4. Exam-center realism
- [x] Exam-center zoom simulation (scaled-up screen, must scroll)
- [x] Laggy-cursor simulation
- [x] IBPS/TCS iON-style exam-center skin (paginated instructions, status-legend colors, keyboard-lock warning)
- [x] Auto-pause on connection loss, auto-resume when back online
- [x] Real internet-speed check gating exam start
- [ ] Lightweight proctoring flags (face-presence + audio, client-side only)
- [ ] Randomized "invigilator walk-by" interruptions
- [ ] CAT-style adaptive difficulty
- [ ] Advanced config: optional sub-topic timers nested inside a section (e.g. cap time on just the Syllogism questions within Reasoning), on top of the strict broad-section grouping used by the AI conversion prompt

## 5. Session/accessibility
- [ ] Pomodoro-style break prompts on long papers
- [ ] Multi-language UI (interface chrome, not just questions)
- [ ] Audio narration of questions (TTS)
- [ ] Typing-speed practice mode for descriptive exams
- [ ] Font-size/contrast + handedness palette options
- [ ] Attempt replay (click-by-click playback)

## 6. Psychology/metacognition
- [ ] Pre-exam breathing/focus ritual
- [ ] Panic-button "skip and flag" shortcut
- [ ] Post-exam confidence self-rating vs. actual score

## 7. Retention/habit
- [ ] Study streak + calendar heatmap, with catch-up drills to recover a broken streak
- [ ] Smart reminder timing based on a user's own productive hours
- [ ] Shareable result card
- [ ] Group challenges / mini leaderboard

## 8. Onboarding/trust
- [ ] Pre-loaded sample paper library
- [ ] Exam-day checklist tied to a saved date + travel logistics
- [ ] Parent/mentor read-only progress link
- [ ] Scoring methodology explainer
- [ ] In-app changelog/what's-new

## 9. Platform/infra
- [ ] PWA installability (home-screen app, offline shell)
- [ ] Cross-device resume (sync in-progress attempts to backend)
- [ ] True offline-first full mode
- [ ] Multi-exam profiles
- [ ] Attempt/data export

## 10. Business
- [ ] One-time "exam pack" purchase instead of subscription
- [ ] Institute batch-export (CSV) for coaching-center adoption

## Already built (for reference)
- [x] Paper Vault — personal file store, upload/save PDFs & images, AI-prompt-based YAML conversion, reattempt without reconverting
- [x] Collapsible/hover sidebar nav (desktop) + bottom tab bar (mobile/tablet)
- [x] Animated landing-page preview
- [x] Sectional timers, tab-switch monitoring, exam realism toggles
