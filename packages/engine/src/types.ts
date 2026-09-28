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
