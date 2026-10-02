// UF-09 strings (D-0071 §1). Owned by the UF-09 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
export const uf09 = {
  // Host-level states (D-0111 §3, §7): all render `data-screen-id="UF-09"`.
  loadingTitle: "Workout",
  notOnDeviceTitle: "This workout isn't on this device",
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
} as const;
