// UF-09 strings (D-0071 §1). Owned by the UF-09 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
export const uf09 = {
  // Host-level states (D-0111 §3, §7): all render `data-screen-id="UF-09"`.
  loadingTitle: "Workout",
  notOnDeviceTitle: "This workout isn't on this device",
  // A stored plan that fails parseSessionPlan (D-0138 §3).
  unreadableTitle: "This workout's plan can't be read",
  endedTitle: "This workout has ended",
  staleTitle: (date: string) => `This workout was started on ${date}`,
  doneTitle: "Workout complete",
  homeLink: "Back to Today",
  // The chrome (D-0111 §10).
  pauseWorkout: "Pause workout",
  indexWarmup: "Warm-up",
  index: (k: number, n: number) => `${k} / ${n}`,
  // The per-state placeholder titles (D-0111 §9); T-0304b–d replace the views.
  titles: {
    getReady: "Get ready",
    warmup: "Warm-up",
    set: "Current set",
    confirm: "Confirm set",
    rest: "Rest",
    next: "Next exercise",
    timed: "Timed set",
    timeCheck: "Time check",
    paused: "Paused",
  },
  resume: "Resume",
  // UF-09.3 Current set (T-0304b, D-0118 §9).
  setOf: (n: number, total: number) => `Set ${n} of ${total}`,
  backoffSet: "Back-off set",
  load: (weight: string, reps: number) => `${weight} × ${reps}`,
  reps: (n: number) => (n === 1 ? "1 rep" : `${n} reps`),
  setWeight: "Set weight",
  doneSet: "Done set",
  doneSetError: "Couldn't save. Tap Done set again.",
  // UF-09.4 Confirm set (T-0304b, D-0118 §3–§6).
  repsLabel: "Reps",
  fewerReps: "Fewer reps",
  moreReps: "More reps",
  weightLabel: "Weight (kg)",
  lessWeight: "Less weight",
  moreWeight: "More weight",
  weightHint: (example: string) => `Enter a weight like ${example}`,
  rirLabel: "Reps in reserve",
  rirNone: "None",
  rirFew: "1–2",
  rirMany: "3+",
  autosaveIn: (s: number) => `Saving as planned in ${s} s… tap anything to edit`,
  autosaveOff: "Tap save when ready.",
  save: "Save",
  saveError: "Couldn't save. Tap Save again.",
  // UF-09.1 Get ready (T-0304f, parent AC-B1).
  startNow: "Start now",
  skipWarmup: "Skip warm-up",
  go: "GO",
  // UF-09.5 Rest (T-0304f, D-0066 §7, D-0118 §10).
  restLess: "−15 s",
  restMore: "+15 s",
  skipRest: "Skip rest",
  nextSet: (n: number, total: number) => `Next · set ${n} of ${total}`,
  nextBackoff: "Next · back-off set",
  nextItem: (name: string) => `Next · ${name}`,
  // UF-09.6 Next exercise (T-0304f, D-0066 §10, D-0118 §11).
  imReady: "I'm ready",
  separator: "·",
  // The chrome announcer (T-0304f, D-0118 §10, NFR-A11Y-4).
  announceTen: "10 seconds",
  announceGo: "Go",
} as const;
