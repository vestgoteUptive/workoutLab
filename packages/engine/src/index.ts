// Deterministic workout-suggestion engine (docs/engine-rules.md). Pure functions only:
// no I/O, no clock, no randomness (rule 0, D-0024), so the same code runs in the browser
// and in the Deno Edge Function. T-0200 covers rules 0–6 and 11.

export * from "./types.js";
export { normalizeHistory, primaryAreas, isHardSet } from "./history.js";
export { localDate, windowOf, addDays, dayDiff, WINDOW_DAYS } from "./time.js";
export { areaLoads, recoveringAreas, RECOVERY_THRESHOLD, RECOVERY_WINDOW_MS } from "./load.js";
export { deriveTargets, BASE_TARGETS } from "./targets.js";
export {
  balance,
  deficitOf,
  coverageStepOf,
  ATTENTION_DEFICIT,
  ATTENTION_DAYS,
} from "./balance.js";
