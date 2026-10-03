// UF-02 strings (D-0071 §1). Owned by the UF-02 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
// Area names are reused from `en.bodyMap.areas`, the offline text from `OfflineStatus`.
export const uf02 = {
  /** UF-02.1 attention line (rule 5). `names` arrive already joined with `listSeparator`. */
  attention: (names: string) => `Needs attention: ${names}`,
  listSeparator: ", ",
  /** The gap between the attention names and the "+N more" link. */
  moreGap: " ",
  /** `n` arrives already formatted. */
  more: (n: string) => `+${n} more`,
  /** No hard set in the loaded history at all (AC-7). */
  noWorkouts: "No workouts yet. Start your first one.",
  /** A history, but nothing in the 14-day window (AC-7). */
  nothingRecent: "Nothing logged in the last 14 days. Start a workout to pick up again.",
  /** No cached profile or not all nine targets (AC-10). */
  noPlan: "Connect to finish setting up your plan",
  start: "Start workout",
  // T-0302c: the 45-min suggestion card (D-0065 §1). The reason words live in `lib/i18n/workout.ts`.
  /** The card's accessible name. */
  cardLabel: "Suggested workout",
  /** `minutes` arrives already formatted. */
  suggestedFor: (minutes: string) => `Suggested for ${minutes} min`,
  /** "3 exercises · ~29 min". `count` picks the noun; the texts arrive already formatted. */
  cardSummary: (count: number, countText: string, minutes: string) =>
    `${countText} ${count === 1 ? "exercise" : "exercises"} · ~${minutes} min`,
  /** One row: the library name, then `itemSummary`, e.g. "Bench press 4 × 6–8". */
  itemRow: (name: string, summary: string) => `${name} ${summary}`,
  /** The session-reason chips' accessible name. */
  chipsLabel: "Why these",
  seeAll: "See all",
  /** `plan.items` is empty. */
  nothingSuggested: "Nothing suggested yet",
  /** The skeleton's accessible name while the first read is pending. */
  cardLoading: "Loading the suggestion",
  // T-0302b: UF-02.2 Workout preview (/?view=preview). The engine's `suggest()` output in full.
  preview: {
    title: "Suggested for 45 min",
    back: "Back",
    /** `n` arrives already formatted. */
    minutes: (n: string) => `~${n} min`,
    /** `n` arrives already formatted. */
    sets: (n: string) => `${n} sets`,
    warmup: "Warm-up",
    /** `n` arrives already formatted. */
    warmupMinutes: (n: string) => `${n} min`,
    warmupNotCounted: "not counted",
    /** `label` is `restLabel`'s "m:ss". */
    rest: (label: string) => `rest ${label}`,
    /** The `<ol>`'s accessible name. */
    listName: "Suggested exercises",
  },
} as const;
