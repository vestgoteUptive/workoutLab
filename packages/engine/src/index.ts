// Deterministic workout-suggestion engine (docs/engine-rules.md). Pure functions only:
// no I/O, no clock, no randomness (rule 0, D-0024), so the same code runs in the browser
// and in the Deno Edge Function. T-0200 covers rules 0–6 and 11; T-0201a adds rules 7.1–7.3 and 10;
// T-0201b adds rules 7.4 and 8.

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
export {
  suggest,
  isEligible,
  rankCandidates,
  itemCostS,
  setCostS,
  availableS,
  WORK_S,
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  TRANSITION_S,
  MAX_ITEMS,
  MAX_ITEMS_PER_AREA,
} from "./session.js";
export { generateWarmup, WARMUP_COST_S, WARMUP_MOVES, WARMUP_MOVE_S } from "./warmup.js";
export {
  floorInc,
  DEFAULT_INCREMENT_KG,
  BACKOFF_FACTOR,
  LOW_TRIM_FROM_SETS,
  LOW_TRIM_TO_SETS,
} from "./energy.js";
export { timeCheck, SHOW_BEHIND_S, TRIM_MIN_SETS } from "./timecheck.js";
