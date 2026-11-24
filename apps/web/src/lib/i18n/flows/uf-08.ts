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
  /** A plan emptied by Remove (T-0521, D-0191 §5). */
  noneLeft: "No exercises left. Pick a time to rebuild.",
  /** T-0538 (D-0199 §2): the Removed line under UF-08.2's list. */
  removedName: "Removed",
  neverSuggest: "Never suggest",
  /** Accessible name, unique per row. */
  neverSuggestName: (name: string) => `Never suggest ${name}`,
  wontBeSuggested: (name: string) => `${name} won't be suggested`,
  undo: "Undo",
  undoName: (name: string) => `Undo, ${name} won't be suggested`,
  suggest: "Suggest my workout",
  /** T-0940 (D-0236 §1): the secondary button under "Suggest my workout"; opens empty mode. */
  startEmpty: "Start empty",
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
  /** The exercise name on a UF-08.2 row: opens the how-to sheet (T-0581). */
  howTo: (name: string) => `How to do ${name}`,
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

  // --- UF-08.2 Focus mode disclosure (T-1009, D-0280 §3; the UF-08.4 Ready step is retired) ---
  focusModeSummary: "Focus mode",
  /** The status line while Start's session write is in flight (UF-08.2.md). */
  startPending: "Starting your workout.",
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
  start: "Start workout",
  /** Start's `upsertSession` rejected (D-0110 §3). */
  startFailed: "Couldn't start the workout. Try again.",

  // --- UF-08.5 Add exercise (T-0573, D-0205 §1-§4, UF-08.5.md) ---
  /** The UF-08.2 button and the sheet's title. */
  addExercise: "Add exercise",
  addLead: (minutes: number) => `The rest of your workout adjusts to fit ${minutes} min.`,
  searchLabel: "Search exercises",
  clearSearch: "Clear search",
  todaysAreas: "Today's areas",
  /** T-0577 (D-0205 §2): the stored favorites, first on the empty query, and the row tag. */
  favoritesHeading: "Favorites",
  favoriteTag: "Favorite",
  searchToFind: "Search to find an exercise.",
  noMatch: (query: string) => `No exercises match \u201C${query}\u201D.`,
  /** The visible text of a row's Add button; its accessible name is `addName`. */
  add: "Add",
  /** "Add Back squat", or "Add Back squat, Quads" when the name shows under several areas. */
  addName: (name: string, area?: string) => (area ? `Add ${name}, ${area}` : `Add ${name}`),
  inWorkout: "In this workout",
  /** The status line on UF-08.2 after a successful Add. */
  added: (name: string) => `${name} added.`,
  addedByYou: "Added by you",
  /** The sheet's refusal when the engine left the pin out for time. */
  noFitCompound: (name: string, minutes: number) =>
    `${name} doesn't fit in ${minutes} min. Start with it instead, or pick more time.`,
  noFitIsolation: (name: string, minutes: number) =>
    `${name} doesn't fit in ${minutes} min. Pick more time.`,
  /** UF-08.5 disabled-row reason lines (T-0574, D-0205 §3); the text is the only signal.
   *  `reasonLevel` points to Plan › Edit plan in text only, no link (T-0684, D-0231 §1). */
  reasonExcluded: "Excluded. Include it again in Plan \u203A Excluded exercises.",
  reasonEquipment: "Not available with your equipment",
  reasonLevel: "Above your level. Change it in Plan \u203A Edit plan.",
  reasonSkipping: (area: string) => `Skipping ${area} today`,
  reasonRecovering: (area: string) => `${area} is recovering`,
  /** UF-09.10 (T-0948, D-0243, D-0247 §3): the in-workout sheet. `m` is `floor(leftS / 60)`. */
  leftLead: (minutes: number) => (minutes >= 1 ? `${minutes} min left` : "No time left"),
  skippedInWorkout: "Skipped in this workout",
  reasonExcludedShort: "Excluded",
  reasonLevelShort: "Above your level",
  refuseTime: (name: string, minutes: number) =>
    minutes >= 1
      ? `${name} doesn't fit in the ${minutes} min left.`
      : `${name} doesn't fit. No time left.`,
  addFailed: (name: string) => `Couldn't add ${name}. Try again.`,
  /** UF-08.5 cap refusals (D-0205 §4). */
  capItems: (max: number) => `This workout has ${max} exercises, the most it can hold.`,
  capArea: (area: string) => `This workout already has two ${area} exercises.`,
  /** Start with this (T-0575, D-0205 §5): the row/sheet button text, its name, the status, the refusal. */
  startWith: "Start with this",
  startWithName: (name: string) => `Start with ${name}`,
  mainNow: (name: string) => `${name} is the main lift now.`,
  mainTag: "Main lift",
  noFitStart: (name: string, minutes: number) =>
    `${name} doesn't fit in ${minutes} min. Pick more time.`,
  /** Reorder mode (T-0576, D-0205 §7). */
  reorder: "Reorder",
  reorderDone: "Done",
  moveUp: "Move up",
  moveDown: "Move down",
  moveUpName: (name: string) => `Move ${name} up`,
  moveDownName: (name: string) => `Move ${name} down`,
  moved: (name: string, k: number, n: number) => `${name} moved to ${k} of ${n}.`,
  /** UF-08.2's line for added exercises a re-suggest left out. */
  doesntFit: (minutes: number, names: readonly string[]) =>
    `Doesn't fit in ${minutes} min: ${names.join(", ")}.`,

  // --- UF-08.2 empty mode (T-0940, D-0236, D-0239 §6-§13, UF-08.2.md › Empty mode) ---
  /** The visible list header in empty mode (not "Your workout", which is the page h1). */
  exercisesHeading: "Exercises",
  /** 0 items in empty mode, for any reason (D-0236 §4, D-0242 §3). */
  emptyPlan: "Nothing here yet. Pick from the suggestions or add an exercise.",
  /** "Looks good"'s `aria-describedby` reason at 0 items (D-0239 §11). */
  needOne: "Add at least one exercise.",
  /**
   * The running total (D-0239 §6-§7): "3 of 30 min · 27 min left", " + warm-up" after "{n} min"
   * when the warm-up is outside the budget.
   */
  budgetLeft: (used: number, budgetMin: number, left: number, warmupOutside: boolean) =>
    `${used} of ${budgetMin} min${warmupOutside ? " + warm-up" : ""} · ${left} min left`,
  /** Over the budget after a `fitsBudget: false` swap: "33 of 30 min · 3 min over". */
  budgetOverBy: (used: number, budgetMin: number, over: number, warmupOutside: boolean) =>
    `${used} of ${budgetMin} min${warmupOutside ? " + warm-up" : ""} · ${over} min over`,
  /** A successful Add in empty mode (D-0239 §9). */
  addedLeft: (name: string, left: number) => `${name} added. ${left} min left.`,
  /** UF-08.5's lead line in empty mode (UF-08.5.md): "27 of 30 min left.". */
  addLeadEmpty: (left: number, budgetMin: number) => `${left} of ${budgetMin} min left.`,
  /** Refusal 1 (D-0239 §13.1): the plan is already over budget. */
  overRefusal: (over: number) =>
    `Your workout is ${over} min over. Remove or swap an exercise first.`,
  /** Refusal 3 (D-0239 §13.3): the new item fits but pushes out a pick or the main lift. */
  pushesOut: (name: string, pick: string) =>
    `${name} would push out ${pick}. Pick more time or remove an exercise.`,

  // --- UF-08.2 empty mode: Suggestions (T-0941, D-0238, D-0239 §8-§13, UF-08.2.md › Suggestions) ---
  suggestionsHeading: "Suggestions",
  /** Under the h2 while there are rows: "For the areas that need work most. Fits your 27 min.". */
  suggestionsSub: (left: number) => `For the areas that need work most. Fits your ${left} min.`,
  /** Empty mode's Shuffle (rule 13): changes the suggestions only. */
  otherSuggestions: "Other suggestions",
  fillRest: "Fill the rest for me",
  /** List copy in place of the rows, first match wins (UF-08.2.md › Suggestions section). */
  suggestionsOver: (over: number, budgetMin: number) =>
    `Your workout is ${over} min over ${budgetMin} min. Remove or swap an exercise.`,
  suggestionsFull: (budgetMin: number) => `Your ${budgetMin} min are full.`,
  suggestionsNone: "No suggestions right now. Search to add an exercise.",

  // --- UF-08.2 Today's plan, by area (T-0996, D-0274 to D-0276, D-0280, D-0286, UF-08.2.md) ---
  /** The h1: the areas in the engine's priority order, " · "-joined. */
  areaTitle: (areas: readonly string[]) => `Today: ${areas.join(" · ")}`,
  /** The h1 with no areas (Start empty, everything removed). */
  areaTitleEmpty: "Today: pick your areas",
  /** Under the h1: now plus the plan's minutes. `time` arrives formatted by `formatTime`. */
  doneByLine: (time: string) => `Done by ${time}`,
  /** Under the h1 with no areas: the minutes chosen on UF-08.1. */
  minToFill: (minutes: number) => `${minutes} min to fill`,
  /** The time bar's line over the budget (words, no colour change, D-0211 §5). */
  areaBudgetOver: (minutes: number, budgetMin: number, over: number, warmupOutside: boolean) =>
    `About ${minutes} of ${budgetMin} min${warmupOutside ? " + warm-up" : ""}, ${over} min over`,
  /** Accessible name of the list of area rows. */
  areaRowsName: "Areas in today's plan",
  areaMinutes: (minutes: number) => `~${minutes} min`,
  exercisesCount: (n: number) => `${n} ${n === 1 ? "exercise" : "exercises"}`,
  /** The open button's name: it starts with the visible area name (WCAG 2.5.3). */
  areaOpenName: (area: string, minutes: number, exercises: number) =>
    `${area}, ~${minutes} min, ${exercises} ${exercises === 1 ? "exercise" : "exercises"}`,
  setsGroupName: (area: string) => `Sets for ${area}`,
  setsValue: (sets: number) => `${sets} ${sets === 1 ? "set" : "sets"}`,
  setLessName: (area: string) => `One set less for ${area}`,
  setMoreName: (area: string) => `One set more for ${area}`,
  /** At the 2-set minimum the minus becomes this (visible text); its name is `removeAreaName`. */
  removeAreaText: "Remove",
  removeAreaName: (area: string) => `Remove ${area}`,
  /** `load` and `target` arrive formatted by `formatSetCount`. */
  historyLine: (load: string, target: string) => `Last 14 days: ${load} of ${target} sets`,
  areaRefuseTime: "No time for another set. Pick more time or remove a set elsewhere.",
  areaRefuseFull: (area: string) => `${area} already has the most sets it can hold.`,
  /** The status line after a + or a - (the area's sets now and the minutes left). */
  areaSets: (area: string, sets: number, left: number) =>
    `${area}: ${sets} sets, ${left} min left.`,
  /** The - took out the area's second exercise rather than a set (D-0287 §1). */
  areaSecondGone: (area: string, sets: number, left: number) =>
    `${area}: ${sets} sets, second exercise removed. ${left} min left.`,
  areaRemoved: (area: string) => `${area} removed. Add it back below.`,
  areaAdded: (area: string, left: number) => `${area} added. ${left} min left.`,
  areasAdded: (count: number, left: number) => `${count} areas added. ${left} min left.`,
  /** After a time chip: the set edits and the added areas are dropped (D-0274 §8). */
  planRebuilt: (minutes: number) =>
    `Plan rebuilt for ${minutes} min. Your set changes were cleared.`,
  /** In place of the rows when no area can be added at all. */
  noAreasNow: (count: number) => `No areas right now. ${count} are recovering or skipped today.`,
  addAreaSummary: "Add an area",
  /** The four reasons an area can't be added, and the fifth (D-0286 §1). */
  reasonAreaRecovering: "Recovering",
  reasonAreaSkipping: "Skipping today",
  reasonAreaNoExercise: "No exercise available",
  reasonAreaNoTime: "No time left",
  reasonAreaFull: "Workout is full",
  /** "Start workout"'s reason at no areas (D-0280 §2). */
  needArea: "Add at least one area.",

  // --- T-0996 review follow-ups: feedback where a tap changed nothing ---
  /** A - (or Remove) the engine refused: the plan is unchanged. */
  areaChangeFailed: "Couldn't change that. Your plan is unchanged.",
  /** "Fill the rest for me" had nothing it could add. */
  fillNothing: "Nothing more fits.",

  // --- UF-08.6 Area detail (T-0997, D-0274 §5, D-0275 §8, D-0276, UF-08.6.md) ---
  /** "{k} sets · ~{m} min", read-only under the area title. */
  detailSets: (sets: number, minutes: number) => `${sets} sets · ~${minutes} min`,
  /** The exercises list of one area. */
  detailRowsName: (area: string) => `${area} exercises`,
  notToday: "Not today",
  howToText: "How to",
  removeText: "Remove",
  notTodayName: (name: string) => `Not today, ${name}`,
  /** "{old} · Not today · Undo": the line's text is `notTodayLine`, its button is `undo`. */
  notTodayLine: (old: string) => `${old} · Not today · `,
  notTodayUndoName: (old: string) => `Undo Not today, ${old}`,
  notTodayBack: (old: string) => `${old} is back.`,
  notTodayNone: (area: string) => `No other exercise for ${area} today. Use Swap.`,
  replacedBy: (old: string, now: string) => `${old} replaced by ${now}.`,
  removedStatus: (name: string) => `${name} removed.`,
  addedAreaIn: (name: string, area: string) => `${name} added. ${area} is in your plan now.`,
} as const;
