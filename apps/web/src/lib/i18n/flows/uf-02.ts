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
} as const;
