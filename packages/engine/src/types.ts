// Engine input and output types (D-0034 §1). camelCase mirrors of the data-model names.
// T-0102 generates matching `packages/shared` types; if they differ, the engine adapts.

/** Fixed area order (docs/engine-rules.md, "Fixed area order"). */
export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export type Area = (typeof AREAS)[number];

/** ISO-8601 instant with an offset or `Z`, e.g. `2026-09-27T12:00:00+02:00` (D-0034 §2). */
export type Instant = string;
/** Local calendar date `YYYY-MM-DD` (D-0034 §2). */
export type LocalDate = string;
/** IANA time-zone name, e.g. `Europe/Stockholm`. */
export type TimeZone = string;

/** One logged set: a server row or a queued offline row (`pending: true`). */
export interface HistorySet {
  clientId: string;
  sessionId: string;
  exerciseId: string;
  isWarmup: boolean;
  completedAt: Instant;
  editedAt: Instant;
  deletedAt: Instant | null;
  pending?: boolean;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
}

export type ExerciseKind = "exercise" | "warmup";
export type ExerciseType = "compound" | "isolation";
export type Level = "beginner" | "intermediate" | "advanced";

/** Area weights: 1 = primary, 0.5 = secondary (rule 1, D-0022). */
export type AreaWeights = Partial<Record<Area, number>>;

export interface LibraryExercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  type: ExerciseType;
  level: Level;
  equipment: readonly string[];
  areas: AreaWeights;
  /** Timed sets use `defaultDurationS` as work instead of 45 s (rule 7.1, D-0040 §3). */
  timed: boolean;
  defaultDurationS: number | null;
  /** Weight step in kg; null for bodyweight (D-0040 §3). */
  incrementKg: number | null;
  /** False for bodyweight: the first-time pre-filled weight is 0, not null (D-0040 §4). */
  externalLoad: boolean;
}

export type TargetSource = "default" | "adapted" | "manual";

export interface AreaTarget {
  area: Area;
  setsPer14d: number;
  source: TargetSource;
  updatedAt: Instant;
}

export interface TargetInput {
  rhythmMin: number;
  rhythmMax: number;
  priorityAreas: readonly Area[];
}

export type AreaNumbers = Record<Area, number>;

export interface Window {
  windowStart: LocalDate;
  windowEnd: LocalDate;
}

export interface Contributor {
  exerciseId: string;
  weightedSets: number;
  lastDate: LocalDate;
}

export type CoverageStep = 0 | 1 | 2 | 3 | 4;

export interface AreaBalance {
  area: Area;
  load: number;
  target: number;
  targetSource: TargetSource;
  targetUpdatedAt: Instant;
  deficit: number;
  coverageStep: CoverageStep;
  needsAttention: boolean;
  recovering: boolean;
  lastTrainedDate: LocalDate | null;
  /** `days[0]` = D−13 … `days[13]` = D. */
  days: number[];
  contributors: Contributor[];
}

/** Rule 11 output (UF-10.1, UF-10.2, C-01 on UF-02.1). */
export interface BalanceResult {
  windowStart: LocalDate;
  windowEnd: LocalDate;
  computedAt: Instant;
  areas: AreaBalance[];
}

// ---- Session building (rules 7, 10; D-0037 §6–§7, D-0040) ----

export type Goal = "build_muscle" | "get_stronger" | "general_fitness";

/** D-0037 §6. `suggest` reads `level` and `equipment`; the rest is for rules 4 and 9. */
export interface EngineProfile {
  goal: Goal;
  level: Level;
  equipment: readonly string[];
  rhythmMin: number;
  rhythmMax: number;
  priorityAreas: readonly Area[];
  onboardedAt: Instant;
  planUpdatedAt: Instant;
}

export type Energy = "low" | "normal" | "high";

/** D-0037 §7. `budgetMin` is an integer 1–480. */
export interface SessionInput {
  budgetMin: number;
  warmupInBudget: boolean;
  energy: Energy;
  shuffle: number;
  mainLiftId: string | null;
  pinnedIds: readonly string[];
  excludeIds: readonly string[];
}

export type PrefillKind =
  | "first_time"
  | "carry"
  | "reentry"
  | "hold_after_break"
  | "increase"
  | "deload"
  | "hold"
  | "add_rep";

export type SwapReason = "equipment_taken" | "discomfort" | "variety" | "short_on_time";

/** Machine-readable reasons (rule 10, D-0037 §7). Never prose. */
export type Reason =
  | { code: "main_lift" }
  | { code: "area_deficit"; area: Area; deficit: number }
  | { code: "days_since"; area: Area; days: number | null }
  | { code: "recovering_skipped"; area: Area }
  | { code: "energy_low_trim" }
  | { code: "energy_high_backoff" }
  | { code: "swap"; reason: SwapReason | null }
  | { code: "prefill"; kind: PrefillKind };

export interface PrefillResult {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  kind: PrefillKind;
}

export interface Backoff {
  weightKg: number | null;
  reps: number;
}

export interface WorkoutItem {
  exerciseId: string;
  isMain: boolean;
  /** 1–4; never counts the back-off set (D-0040 §5). */
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationS: number | null;
  costS: number;
  backoff: Backoff | null;
  prefill: PrefillResult;
  reasons: Reason[];
}

export interface WarmupEntry {
  exerciseId: string;
  durationS: number;
}

/** The `sessions.plan` JSON (D-0035, D-0037 §7). */
export interface SessionPlan {
  version: 1;
  mainLiftId: string | null;
  warmup: WarmupEntry[];
  items: WorkoutItem[];
  /** Rule 5 deficit at session start for all 9 areas (rule 8 trims by it). */
  startDeficits: AreaNumbers;
}

export interface Workout {
  plan: SessionPlan;
  budgetMin: number;
  warmupInBudget: boolean;
  energy: Energy;
  itemsTotalS: number;
  totalS: number;
  unusedS: number;
  sessionReasons: Reason[];
}
