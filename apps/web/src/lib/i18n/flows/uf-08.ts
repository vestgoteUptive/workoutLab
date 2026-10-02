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

  // --- UF-08.2 placeholder (D-0107 §2). T-0303b replaces the body. ---
  suggestedTitle: "Your workout",
  back: "Back",
} as const;
