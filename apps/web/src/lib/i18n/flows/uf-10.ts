// UF-10 strings (D-0071 §1). Owned by the UF-10 feature ticket (T-0307a): it is the only ticket
// that edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
//
// Deliberately NOT duplicated here (AC-A21): the nine area names (`en.bodyMap.areas`), the
// `load / target` label (`en.bodyMap.loadOfTarget`), the offline line (`en.offline.*`) and the
// coverage/attention legend copy (`coverageLegend`/`attentionLegend` in
// @workoutlab/design-tokens). UF-10 reuses all of those.
export const uf10 = {
  /** UF-10.1 header, e.g. "Last 14 days · 14–27 Sep". The range arrives already formatted. */
  window: (range: string) => `Last 14 days · ${range}`,
  /** The link to UF-11.2 in the UF-10.1 header. */
  planLink: "Plan",
  /** Accessible name of the nine-row list on UF-10.1. */
  areaListName: "Areas, last 14 days",

  // --- Zero history (AC-A1) ---
  emptyState: "Nothing logged in the last 14 days. Your first workout fills this in.",
  /** D-0197 §3: no cached targets and no way to load them (T-0350). */
  noData: "No balance on this device yet. Connect to the internet to load it.",
  startWorkout: "Start workout",

  /** The engine's rule-6 tag, on both screens (AC-A11). */
  recovering: "Recovering",
  /** The rule-6 explanation, UF-10.2 only (AC-A11). */
  recoveringWhy: "≥ 6 weighted hard sets in the last 48 h",

  /**
   * Accessible name of a UF-10.1 row link (AC-A14, NFR-A11Y-3):
   * "Hamstrings, 6 of 16 hard sets, needs attention". `load`/`target` arrive already formatted.
   *
   * Deliberately not `en.bodyMap.areaName`: C-01's name also carries the coverage step's
   * srLabel, and AC-A14 pins the row's name to the shorter form.
   */
  rowName: (area: string, load: string, target: string, needsAttention: boolean) =>
    needsAttention
      ? `${area}, ${load} of ${target} hard sets, needs attention`
      : `${area}, ${load} of ${target} hard sets`,

  // --- UF-10.2 area detail ---
  /** The engine's `deficit` as a whole percent, e.g. "75 %". The number arrives formatted. */
  deficit: (percent: string) => `${percent} %`,
  /** Accessible label for the deficit figure, so the bare percentage is never unlabelled. */
  deficitLabel: "Below target",

  /** `targetSource: "default"`. */
  targetFromPlan: "From your plan",
  /** `targetSource: "adapted"`, with `targetUpdatedAt` formatted as "20 Sep". */
  targetAdapted: (date: string) => `Adapted ${date}`,
  /**
   * `targetSource: "manual"`. The UF-10 spec lists only `default` and `adapted`; the engine's
   * `TargetSource` has three members, so T-0307a takes the superset (ticket §"Ambiguity
   * resolved"). A copy change here is a one-string fix.
   */
  targetManual: "Set by you",

  lastTrainedToday: "Last trained today",
  lastTrainedYesterday: "Last trained yesterday",
  lastTrainedDaysAgo: (days: string) => `Last trained ${days} days ago`,
  /** `lastTrainedDate === null`. */
  neverTrained: "Not trained yet",

  /** Accessible name of the 14-day strip (D−13…D). */
  stripName: "Last 14 days, hard sets per day",
  /** Accessible name of one strip cell, e.g. "17 Sep, 4 hard sets". */
  stripCell: (date: string, sets: string) => `${date}, ${sets} hard sets`,
  /** Accessible name of a strip cell whose value is 0 (rendered blank, AC-A7). */
  stripCellEmpty: (date: string) => `${date}, no hard sets`,

  contributorsHeading: "Exercises in this window",
  /** No exercise contributed to this area in the window. */
  contributorsEmpty: "No exercises logged for this area in the last 14 days.",
  /** One contributor row, e.g. "Romanian deadlift 4 · 20 Sep". Both values arrive formatted. */
  contributor: (name: string, weightedSets: string, lastDate: string) =>
    `${name} ${weightedSets} · ${lastDate}`,
} as const;
