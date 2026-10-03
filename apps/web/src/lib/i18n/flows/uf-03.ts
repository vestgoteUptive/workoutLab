// UF-03 strings (D-0071 §1). Owned by the UF-03 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
//
// UF-03.3 Summary (T-0419, D-0068 §1, D-0142 §4). No judgement copy: the time reads next to the
// budget with no "over", "under" or "within" (principle 3, AC-3).
export const uf03 = {
  /** No readable session row for this id on this device (D-0142 §4). Never a redirect. */
  notOnDevice: "This workout isn't on this device",
  /** The link to `/` on the "isn't on this device" state. */
  goHome: "Go to Today",
  /** A row whose `ended_at` is null (D-0142 §4: the summary never ends a workout). */
  stillRunning: "This workout is still running",
  backToWorkout: "Back to workout",

  /** The stat labels on the ended summary. */
  timeLabel: "Time",
  exercisesLabel: "Exercises",
  setsLabel: "Sets",
  /** "52 min": `ended_at − started_at`, in whole minutes, rounded down (D-0068 §1). */
  minutes: (m: string) => `${m} min`,
  /** "45 min budget": the session's `time_budget_min`. */
  budget: (m: string) => `${m} min budget`,

  /** The heading over the before → after rows. */
  balanceHeading: "14-day balance",
  /** "Quads 2 → 6 / 20" (D-0068 §1, numbers in the D-0013 format). */
  areaRow: (area: string, before: string, after: string, target: string) =>
    `${area} ${before} → ${after} / ${target}`,
  /** "Next up: Calves, Chest": the first ≤ 2 areas below target, in engine order. */
  nextUp: (areas: string) => `Next up: ${areas}`,
  nextUpSeparator: ", ",
  allOnTarget: "Every area is on target",
  /** The one link to UF-10.1, only on an ended session (D-0142 §4). */
  seeBalance: "See balance",

  // UF-03.3 effort and Save (T-0420, D-0030, D-0068 §2 §3). No "tune next week" copy (D-0068 §3).
  /** The radiogroup's name. */
  effortName: "How hard was it?",
  /** The five chips, D-0030's 1–5 scale, in order. */
  effort: {
    1: "Very easy",
    2: "Easy",
    3: "About right",
    4: "Hard",
    5: "Very hard",
  },
  save: "Save workout",
  /** The polite text after a Save that didn't reach IndexedDB. */
  saveFailed: "Couldn't save. Try again.",
  // UF-03.1 List view (T-0416, D-0142 §3). The two UF-09.9 seam labels live here (D-0071 §4).
  howToAction: "How to",
  listViewAction: "List view",
  /** The screen's accessible name (no visible title: the header is the one task bar). */
  listViewName: "List view",
  /** "Elapsed 23:10". */
  elapsed: (clock: string) => `Elapsed ${clock}`,
  focusMode: "Focus mode",
  finish: "Finish",
  finishQuestion: "Finish workout?",
  keepGoing: "Keep going",
  finishError: "Couldn't finish. Try again.",
  /** The target line: a label, then `itemSummary` as its own element. */
  targetLabel: "Target",
  /** The table's column headings. */
  colSet: "Set",
  colPrevious: "Previous",
  colWeight: "kg",
  colReps: "Reps",
  colSeconds: "Seconds",
  colDone: "Done",
  backoffRow: "Back-off",
  /** The unit after a seconds field. */
  secondsUnit: "s",
  /** A "Previous" cell with nothing to show. */
  noPrevious: "\u2014",
  /** "97.5 × 8" (weight text from `formatKg`'s number; reps). */
  previousLoad: (kg: string, reps: number) => `${kg} \u00D7 ${reps}`,
  previousReps: (reps: number) => `${reps}`,
  previousSeconds: (s: number) => `${s} s`,
  /** "0 / 3 sets" on a collapsed card. */
  cardSets: (done: number, sets: number) => `${done} / ${sets} sets`,
  /** The fields' names; `n` is the 1-based set number. */
  weightLabel: (n: number) => `Set ${n} weight in kg`,
  repsLabel: (n: number) => `Set ${n} reps`,
  secondsLabel: (n: number) => `Set ${n} seconds`,
  markDone: (n: number) => `Mark set ${n} done`,
  markNotDone: (n: number) => `Mark set ${n} not done`,
} as const;
