// UF-09 strings (D-0071 §1). Owned by the UF-09 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
export const uf09 = {
  // The "Try again" button of the how-to and List view seams (T-0463, D-0167 §3).
  seamRetry: "Try again",
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
  // State captions (T-0619, D-0212 §1.2): the text fallback for lift/rest hue.
  liftingCaption: (n: number, total: number) => `Lifting · set ${n} of ${total}`,
  liftingBackoff: "Lifting · back-off set",
  load: (weight: string, reps: number) => `${weight} × ${reps}`,
  reps: (n: number) => (n === 1 ? "1 rep" : `${n} reps`),
  setWeight: "Set weight",
  doneSet: "Done",
  doneSetError: "Couldn't save. Tap Done again.",
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
  saveStartRest: "Save · start rest",
  saveError: "Couldn't save. Tap Save again.",
  // T-0621 (D-0212 §1.4): plain text when the reps in the field reach the item's top of range.
  targetHit: "Target hit.",
  // UF-09.1 Get ready (T-0304f, parent AC-B1).
  startNow: "Start now",
  skipWarmup: "Skip warm-up",
  go: "GO",
  // T-0621 (D-0212 §1.4): the first step under the countdown. D-0066 per-move time.
  firstUp: "First up",
  warmupSummary: (moves: number, seconds: number) =>
    `${moves === 1 ? "1 move" : `${moves} moves`} · ${seconds} s each`,
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
  // T-0621 (D-0212 §1.4): how the item just finished went, and the label of the set-up countdown.
  exerciseDone: (name: string, sets: number) =>
    sets === 1 ? `${name} done · 1 set` : `${name} done · ${sets} sets`,
  setupTime: "Set-up time",
  // The chrome announcer (T-0304f, D-0118 §10, NFR-A11Y-4).
  announceTen: "10 seconds",
  announceGo: "Go",
  // The UF-09.5 / UF-09.1 voice cue words (T-0304g, D-0119 §7), spoken by speechSynthesis.
  voiceThree: "3",
  voiceTwo: "2",
  voiceOne: "1",
  // UF-09.2 Warm-up (T-0304c, D-0066 §8, D-0119 §5).
  warmupCaption: (n: number, total: number) => `Warm-up · move ${n} of ${total}`,
  restartMove: "Restart",
  nextMove: "Next move",
  // UF-09.7 Timed set (T-0304c, D-0119 §1–§4, D-0062 §5).
  timedCaption: (n: number, total: number) => `Timed set · ${n} of ${total}`,
  getInPosition: "Get in position",
  holdPhase: "Hold",
  holdTarget: (clock: string) => `Hold ${clock}`,
  easingBackIn: "Easing back in",
  pauseTimer: "Pause timer",
  resumeTimer: "Resume timer",
  logHold: "Log hold",
  holdError: "Couldn't save. Tap Log hold to try again.",
  // The chrome announcer, when a hold is logged (D-0118 §10, NFR-A11Y-4).
  announceDone: "Done",
  // UF-09.8 Time check (T-0304d, D-0024, D-0120 §1 §2). Plurals live in the keys (D-0114 §3).
  minutesBehind: (n: number) => (n === 1 ? "1 min behind" : `${n} min behind`),
  plannedFinish: (time: string) => `You planned to finish by ${time}`,
  doneBy: (time: string) => `Done by ${time}`,
  continueOption: "Continue",
  trimOption: "Trim",
  skipNextOption: "Skip next",
  trimSets: (name: string, from: number, to: number) =>
    `${name} ${from} → ${to} ${to === 1 ? "set" : "sets"}`,
  trimDrop: (name: string) => `Drop ${name}`,
  skipItem: (name: string) => `Skip ${name}`,
  applyError: "Couldn't save the new plan. Try again.",
  // UF-09.9 Paused (T-0304d, D-0120 §6–§8).
  pausedCaption: "Workout paused · timers stopped",
  elapsed: (clock: string) => `${clock} elapsed`,
  left: (n: number) => (n === 1 ? "1 min left" : `${n} min left`),
  sets: (logged: number, planned: number) => `${logged} / ${planned} sets`,
  skipToNext: "Skip to next exercise",
  // T-0579 UF-09.9 "Do {name} later" (D-0205 §9, §11) and the UF-09.6 status line.
  doLater: (name: string) => `Do ${name} later`,
  doLaterError: (name: string) => `Couldn't move ${name}. Try again.`,
  movedLater: (name: string) => `${name} moved to later.`,
  endWorkout: "End workout",
  endQuestion: "End workout? Your sets are saved.",
  cancel: "Cancel",
  endError: "Couldn't end the workout. Try again.",
  // T-0395 UF-02.1: the Today "Resume workout" card (D-0139 §3).
  resumeTitle: "Workout in progress",
  resumeLine: (time: string, done: number, total: number) =>
    `Started ${time} · ${done} of ${total} sets`,
  resumeAction: "Resume workout",
} as const;
