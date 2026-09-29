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

// ---- Swap ranking (rule 12, UF-08.3, UF-05.1; D-0037 §2, D-0056) ----

/** One `rankSwaps` entry; mirrors `api/openapi.yaml` `SwapCandidate`. */
export interface SwapCandidate {
  exerciseId: string;
  /** `Σ min(w_cur, w_alt) / Σ w_cur`, rounded to 3 decimals (D-0056 §1). */
  muscleMatch: number;
  /** `itemCostS(candidate, slot sets)` (D-0056 §3). */
  timeCostS: number;
  equipment: string[];
  /** Replacing the slot keeps the plan inside `availableS` (D-0056 §3). */
  fitsBudget: boolean;
  /** True at index 0 only (D-0056 §4). */
  bestMatch: boolean;
}

// ---- Running over time (rule 8, UF-09.8; D-0037 §8, D-0040 §10) ----

/** D-0037 §2. `elapsedS` excludes paused time, and the warm-up when it is off-budget. */
export interface TimeCheckProgress {
  /** Integer seconds ≥ 0. */
  elapsedS: number;
  /** The first not-started item, 0 … items.length. */
  nextItemIndex: number;
}

export interface TimeCheckOption {
  items: WorkoutItem[];
  projectedS: number;
}

/** D-0037 §8. */
export interface TimeCheckResult {
  behindS: number;
  show: boolean;
  /** `ceil(behindS / 60)` when `show`, otherwise null. */
  minutesBehind: number | null;
  projectedS: number;
  trim: TimeCheckOption;
  skipNext: TimeCheckOption;
}

// ---- Adaptive targets / plan check-in (rule 9, UF-11; D-0037 §6 and §8, D-0041) ----

/** D-0037 §6. A session as rule 9 counts it: completed when `hardSetCount ≥ 1`. */
export interface CheckinSession {
  id: string;
  startedAt: Instant;
  /** Integer ≥ 0 (D-0041 §6). */
  hardSetCount: number;
}

/** A `sessions` row as `checkinSessions` reads it (D-0041 §3). */
export interface CheckinSessionRef {
  id: string;
  startedAt: Instant;
}

/** D-0041 §2: the `EngineProfile` subset rule 9 reads, so a full `EngineProfile` fits. */
export interface CheckinProfile {
  rhythmMin: number;
  rhythmMax: number;
  priorityAreas: readonly Area[];
  onboardedAt: Instant;
  /** Maps from `profiles.plan_changed_at` (D-0035, D-0037 §6, D-0041 §1). */
  planUpdatedAt: Instant;
}

/** D-0041 §2: the `PlanCheckin` subset rule 9 reads. Null = shown but not answered. */
export interface CheckinAnswer {
  answeredAt: Instant | null;
}

export type CheckinStatus = "under" | "on_plan" | "over";
export type CheckinDirection = "down" | "up";

/** D-0037 §8. Period `index` counts from 0 at the onboarding date (rule 9). */
export interface CheckinPeriod {
  index: number;
  start: LocalDate;
  end: LocalDate;
  completed: number;
  status: CheckinStatus;
}

/** D-0037 §8 `previewTargets` entry. */
export interface PreviewTarget {
  area: Area;
  setsPer14d: number;
}

/** D-0037 §8. `rhythmMin`/`rhythmMax` are 1–7; `previewTargets` lists 9 areas in the fixed order. */
export interface CheckinProposal {
  direction: CheckinDirection;
  rhythmMin: number;
  rhythmMax: number;
  previewTargets: PreviewTarget[];
}

/** Rule 9 output (UF-11.1, UF-11.2), D-0037 §8. */
export interface CheckinEvaluation {
  periods: CheckinPeriod[];
  proposal: CheckinProposal | null;
  nextCheckinDate: LocalDate;
}
