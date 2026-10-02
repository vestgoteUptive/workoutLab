// UF-08 strings (D-0071 §1). Owned by the UF-08 feature tickets (T-0303a–d): they are the only
// tickets that edit this file, so the Phase 3 feature lanes never collide in `en.ts`.
//
// Deliberately NOT duplicated here: the offline indicator's label (`en.offline.ariaLabel`, used
// by `<OfflineStatus variant="icon">`).
export const uf08 = {
  // --- UF-08.1 Time & energy (T-0303a, D-0065 §2-§3, D-0107) ---
  title: "How long do you have?",
  /** The × in the top corner; it leaves setup for `/`. */
  close: "Close",
  minutesLess: "5 minutes less",
  minutesMore: "5 minutes more",
  minutesUnit: "minutes",
  /** "done by 12:45". `time` arrives formatted by `lib/format` `formatTime`. */
  doneBy: (time: string) => `done by ${time}`,
  /** Accessible name of the 20/30/45/60/90 chip group. */
  chipsName: "Quick picks",
  /** Accessible name of one chip, e.g. "30 minutes". `minutes` arrives formatted. */
  chipName: (minutes: string) => `${minutes} minutes`,
  setFinishTime: "Set a finish time",
  finishBy: "Finish by",
  finishRejected: "Pick a time later today",
  warmupToggle: "Warm-up counts in this time (3 min)",
  energyName: "Energy",
  energy: {
    low: "Low",
    normal: "Normal",
    high: "High",
  },
  energyHint: {
    low: "Fewer sets, same weights.",
    normal: "Your plan as written.",
    high: "Adds a back-off set to the main lift if time allows.",
  },
  /** The fit line before the first `Workout` exists (D-0107 §7). */
  checking: "Checking what fits…",
  /**
   * The live fit line (D-0065 §3, D-0107 §5): "Fits: 3 exercises, 9 sets + warm-up". Singular
   * at 1. The " + warm-up" suffix shows whether or not the warm-up counts in the budget.
   */
  fits: (exercises: number, sets: number) =>
    `Fits: ${exercises} ${exercises === 1 ? "exercise" : "exercises"}, ${sets} ${
      sets === 1 ? "set" : "sets"
    } + warm-up`,
  /** n = 0 (D-0107 §5). */
  nothingFits: (budgetMin: number) => `Nothing fits in ${budgetMin} min`,
  suggest: "Suggest my workout",
  /** No profile or fewer than 9 targets in the cache (D-0107 §9). */
  missing: "Connect to finish setting up your plan",
  missingLink: "Back to Today",

  // --- UF-08.2 Suggested workout (T-0303b, D-0065 §4, D-0109) ---
  suggestedTitle: "Your workout",
  back: "Back",
  /** Accessible name of the session "why" chip list (D-0106 §4). */
  sessionChipsName: "Why this workout",
  /** Accessible name of the plan list. */
  rowsName: "Exercises",
  /** The warm-up row's title (D-0109 §4). */
  warmupRow: "Warm-up",
  /** Joins the warm-up move names. */
  warmupMoves: (names: readonly string[]) => names.join(", "),
  /** A row's detail line: the summary, the weight part and the minutes, " · "-joined. */
  rowDetail: (parts: readonly string[]) => parts.join(" · "),
  /** "12 min". `minutes` is a whole number of minutes (ceil of the engine's seconds). */
  rowMinutes: (minutes: number) => `${minutes} min`,
  /** The weight part for an exercise without external load (D-0109 §4). */
  bodyweight: "Bodyweight",
  /** "80 kg". `weight` arrives formatted with `Intl.NumberFormat` (D-0109 §4). */
  weightKg: (weight: string) => `${weight} kg`,
  /** "+ 1 back-off 70 × 6". `weight` arrives formatted. */
  backoff: (weight: string, reps: number) => `+ 1 back-off ${weight} × ${reps}`,
  /** The back-off line when the engine has no weight for it (D-0057: null means ask). */
  backoffSet: "+ 1 back-off set",
  /** "Remove Bench press". */
  remove: (name: string) => `Remove ${name}`,
  shuffle: "Shuffle",
  /** Accessible name of UF-08.2's 20/30/45/60/90 chip group (D-0109 §3). */
  timeChipsName: "Time",
  /** Within the budget: "About 29 of 30 min", with " + warm-up" when it doesn't count. */
  budgetWithin: (minutes: number, budgetMin: number, warmupOutside: boolean) =>
    `About ${minutes} of ${budgetMin} min${warmupOutside ? " + warm-up" : ""}`,
  /** Over the budget: "34 min, 4 over", with " + warm-up" when it doesn't count. */
  budgetOver: (minutes: number, over: number, warmupOutside: boolean) =>
    `${minutes} min, ${over} over${warmupOutside ? " + warm-up" : ""}`,
  looksGood: "Looks good",

  // --- UF-08.4 placeholder (D-0107 §2 pattern). T-0303d replaces the body. ---
  readyTitle: "Ready",
} as const;
