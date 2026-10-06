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
  /** "Skip today" group (T-0520, D-0191 §1). */
  skipName: "Skip today",
  skipHint: "Sore or busy? Skipped areas stay out of this workout.",
  /** UF-08.2's line under the why chips; `names` are the en area labels in the fixed order. */
  skipping: (names: readonly string[]) => `Skipping today: ${names.join(", ")}`,
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
  /** "+ 1 back-off 70 kg × 6". `weight` arrives formatted by `lib/format` `formatKg` (D-0124). */
  backoff: (weight: string, reps: number) => `+ 1 back-off ${weight} × ${reps}`,
  /** The back-off line when the engine has no weight for it (D-0057: null means ask). */
  backoffSet: "+ 1 back-off set",
  /** "Remove Bench press". */
  remove: (name: string) => `Remove ${name}`,
  shuffle: "Shuffle",
  // --- UF-08.3 Swap before starting (T-0303c, D-0071 §7) ---
  swap: "Swap",
  /** "Swap Barbell row". */
  swapItem: (name: string) => `Swap ${name}`,
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

  // --- UF-08.4 Ready (T-0303d, D-0065 §6-§7, D-0110) ---
  /**
   * The summary line (D-0110 §2): "29 min · warm-up + 3 exercises · 9 sets · done by 12:29".
   * Singular at 1. `doneBy` arrives formatted by `lib/format` `formatTime`. The "warm-up + "
   * part is left out when the plan has no warm-up moves.
   */
  readySummary: (
    minutes: number,
    warmup: boolean,
    exercises: number,
    sets: number,
    doneBy: string,
  ) =>
    `${minutes} min · ${warmup ? "warm-up + " : ""}${exercises} ${
      exercises === 1 ? "exercise" : "exercises"
    } · ${sets} ${sets === 1 ? "set" : "sets"} · done by ${doneBy}`,
  /** No items, warm-up moves only (D-0110 §2). */
  readyWarmupOnly: (minutes: number, doneBy: string) =>
    `${minutes} min · warm-up only · done by ${doneBy}`,
  /** No items and no warm-up (D-0110 §2). Start still works. */
  readyNothing: (doneBy: string) => `Nothing planned · done by ${doneBy}`,
  /** The 4-step explainer's heading. */
  explainerTitle: "How focus mode works",
  /** The 4 steps, in order (principle 1). */
  explainer: [
    { title: "One thing on screen", body: "The current set, its weight and reps. Nothing else." },
    {
      title: "Tap Done after each set",
      body: "Reps are pre-filled. Only change them if you missed.",
    },
    { title: "Rest counts down by itself", body: "Sound and vibration at 10 s and at zero." },
    {
      title: "Everything else is behind pause",
      body: "Swap, skip, list view or end workout.",
    },
  ],
  /** Accessible name of the 3 focus-mode switches (D-0110 §6). */
  prefsName: "Focus mode settings",
  prefSound: "Sound cues",
  prefVoice: "Voice countdown 3-2-1",
  prefKeepAwake: "Keep screen awake",
  start: "Start",
  /** Start's `upsertSession` rejected (D-0110 §3). */
  startFailed: "Couldn't start the workout. Try again.",
} as const;
