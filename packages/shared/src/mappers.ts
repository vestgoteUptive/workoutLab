// Row → engine mappers (T-0102 AC18, D-0034 §1, D-0035, D-0037 §6, D-0041 §2).
// They rename snake_case DB columns to the camelCase engine inputs and nothing else: no
// filtering, no rounding, no clock. The engine applies its own rules (rule 0 drops tombstones).
//
// What the engine reads (D-0041 §2):
// - `evaluateCheckin` reads only `answeredAt` from each PlanCheckin. `toPlanCheckin` still maps
//   the whole row so one type serves UF-11 screens too; any PlanCheckin superset may be passed.
// - `evaluateCheckin` takes a `CheckinProfile = {rhythmMin, rhythmMax, priorityAreas, onboardedAt,
//   planUpdatedAt}`, a subset of EngineProfile, so `toEngineProfile(row)` can be passed as is.
import type {
  AreaTarget,
  EngineProfile,
  HistorySet,
  LibraryExercise,
  PlanCheckin,
} from "./index.js";
import type { Tables } from "./index.js";
import { AREAS } from "./index.js";
import type { Area, AreaWeights, ExerciseKind, ExerciseType, Goal, Level } from "./index.js";

type SessionSetRow = Tables<"session_sets">;
type ExerciseRow = Tables<"exercises">;
type ExerciseAreaRow = Pick<Tables<"exercise_areas">, "area_id" | "weight">;
type AreaTargetRow = Tables<"area_targets">;
type ProfileRow = Tables<"profiles">;
type PlanCheckinRow = Tables<"plan_checkins">;

/** Narrows a DB text value to a known literal. DB checks make a miss impossible; throw if not. */
function oneOf<T extends string>(value: string, allowed: readonly T[], column: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new RangeError(`${column}: unexpected value ${JSON.stringify(value)}`);
}

const TYPES = ["compound", "isolation"] as const satisfies readonly ExerciseType[];
const LEVELS = ["beginner", "intermediate", "advanced"] as const satisfies readonly Level[];
const KINDS = ["exercise", "warmup"] as const satisfies readonly ExerciseKind[];
const GOALS = [
  "build_muscle",
  "get_stronger",
  "general_fitness",
] as const satisfies readonly Goal[];
const SOURCES = ["default", "adapted", "manual"] as const satisfies readonly AreaTarget["source"][];
const ANSWERS = ["accepted", "kept", "withdrawn"] as const satisfies readonly NonNullable<
  PlanCheckin["answer"]
>[];

/** A history set as the engine reads it: `HistorySet` plus the optional RIR (D-0259 §14). The
 *  openapi `HistorySet` has no `rir`; the contract is unchanged, so the field is added here. */
export type HistorySetWithRir = HistorySet & { rir?: number | null };

/** An integer 0-5 passes; anything else (absent, fractional, out of range, not a number) is null. */
function validRir(rir: unknown): number | null {
  return typeof rir === "number" && Number.isInteger(rir) && rir >= 0 && rir <= 5 ? rir : null;
}

/**
 * `session_sets` (or a `session_sets_live` row read as one) → HistorySet. `pending` is set only
 * when the caller passes it (a set still queued on the device, D-0017); a synced row has no key.
 * `deletedAt` is kept: the engine drops tombstones itself (rule 0).
 */
export function toHistorySet(
  row: Pick<
    SessionSetRow,
    | "client_id"
    | "session_id"
    | "exercise_id"
    | "is_warmup"
    | "completed_at"
    | "edited_at"
    | "deleted_at"
    | "reps"
    | "weight_kg"
    | "duration_s"
  > & { rir?: number | null },
  options: { pending?: boolean } = {},
): HistorySetWithRir {
  const set: HistorySetWithRir = {
    clientId: row.client_id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    isWarmup: row.is_warmup,
    completedAt: row.completed_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    reps: row.reps,
    weightKg: row.weight_kg,
    durationS: row.duration_s,
    rir: validRir(row.rir),
  };
  if (options.pending !== undefined) set.pending = options.pending;
  return set;
}

/** `exercises` + its `exercise_areas` rows → LibraryExercise (D-0034 §1, D-0037 §6). */
export function toLibraryExercise(
  row: ExerciseRow,
  areas: readonly ExerciseAreaRow[],
): LibraryExercise {
  const weights: AreaWeights = {};
  for (const a of areas) {
    const area = oneOf(a.area_id, AREAS, "exercise_areas.area_id");
    if (a.weight !== 1 && a.weight !== 0.5) {
      throw new RangeError(`exercise_areas.weight: unexpected value ${a.weight}`);
    }
    weights[area] = a.weight;
  }
  const unilateral = toUnilateral(row);
  return {
    id: row.id,
    name: row.name,
    kind: oneOf(row.kind, KINDS, "exercises.kind"),
    type: oneOf(row.type, TYPES, "exercises.type"),
    level: oneOf(row.level, LEVELS, "exercises.level"),
    equipment: row.equipment,
    areas: weights,
    timed: row.timed,
    incrementKg: row.increment_kg,
    defaultDurationS: row.default_duration_s,
    externalLoad: row.external_load,
    // Only for a flagged row: an unflagged row's object is identical to before (D-0268 §3).
    ...(unilateral ? { unilateral } : {}),
  };
}

/** One `area_targets` row → AreaTarget. */
export function toAreaTarget(row: AreaTargetRow): AreaTarget {
  return {
    area: oneOf(row.area_id, AREAS, "area_targets.area_id"),
    setsPer14d: row.sets_per_14d,
    source: oneOf(row.source, SOURCES, "area_targets.source"),
    updatedAt: row.updated_at,
  };
}

/** `area_targets` rows → AreaTargets in the fixed area order (chest … calves), whatever the row order. */
export function toAreaTargets(rows: readonly AreaTargetRow[]): AreaTarget[] {
  const order = (area: Area): number => AREAS.indexOf(area);
  return rows.map(toAreaTarget).sort((a, b) => order(a.area) - order(b.area));
}

/** `profiles` → EngineProfile. `plan_changed_at` is the engine's `planUpdatedAt` (D-0035, D-0041 §1). */
export function toEngineProfile(row: ProfileRow): EngineProfile {
  return {
    goal: oneOf(row.goal, GOALS, "profiles.goal"),
    level: oneOf(row.level, LEVELS, "profiles.level"),
    equipment: row.equipment,
    rhythmMin: row.rhythm_min,
    rhythmMax: row.rhythm_max,
    priorityAreas: row.priority_areas.map((a) => oneOf(a, AREAS, "profiles.priority_areas")),
    onboardedAt: row.onboarded_at,
    planUpdatedAt: row.plan_changed_at,
  };
}

/** UF-09.3 plate loading inputs (D-0218 §4). Not part of EngineProfile: the engine never reads them. */
export type Barbell = { barKg: number; platesKg: number[] };

/** Learn-from-edits settings of a profile (D-0281 §4). */
export type LearningPrefs = { learnFromEdits: boolean; learnResetAt: string | null };

/**
 * `profiles.learn_from_edits` + `profiles.learn_reset_at` → LearningPrefs. A profile cached before
 * T-1001 has neither field: a missing flag reads as true (the default), a missing epoch as null.
 */
export function toLearningPrefs(row: {
  learn_from_edits?: ProfileRow["learn_from_edits"] | null;
  learn_reset_at?: ProfileRow["learn_reset_at"] | null;
}): LearningPrefs {
  return {
    learnFromEdits: row.learn_from_edits ?? true,
    learnResetAt: row.learn_reset_at ?? null,
  };
}

/** A numeric column read as a number. PostgREST may send `numeric` as a string ("15.00"). */
function toKg(value: number | string, column: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n))
    throw new RangeError(`${column}: unexpected value ${JSON.stringify(value)}`);
  return n;
}

/**
 * `profiles.bar_kg` + `profiles.plates_kg` → Barbell (D-0218 §4): numbers, not strings, and plate
 * sizes largest first. The DB stores the sizes in any order; an empty list means bar only.
 */
export function toBarbell(row: {
  bar_kg: ProfileRow["bar_kg"] | string;
  plates_kg: readonly (ProfileRow["plates_kg"][number] | string)[];
}): Barbell {
  return {
    barKg: toKg(row.bar_kg, "profiles.bar_kg"),
    platesKg: row.plates_kg.map((p) => toKg(p, "profiles.plates_kg")).sort((a, b) => b - a),
  };
}

/**
 * `plan_checkins` → PlanCheckin. The engine reads only `answeredAt` (D-0041 §2). A null
 * `completed_prev` (one-period evaluation, D-0070 §6) stays null.
 */
export function toPlanCheckin(row: PlanCheckinRow): PlanCheckin {
  return {
    id: row.id,
    periodIndex: row.period_index,
    completedPrev: row.completed_prev,
    completedLast: row.completed_last,
    rhythmMinBefore: row.rhythm_min_before,
    rhythmMaxBefore: row.rhythm_max_before,
    proposedMin: row.proposed_min,
    proposedMax: row.proposed_max,
    proposedAt: row.proposed_at,
    answer: row.answer === null ? null : oneOf(row.answer, ANSWERS, "plan_checkins.answer"),
    answeredAt: row.answered_at,
  };
}

/** Which unit an exercise is trained in one side at a time (D-0260 §3). null = both sides. */
export type Unilateral = "arm" | "leg" | "side";

/** `exercises.unilateral` → Unilateral | null (D-0263 §1). Null, an unknown value (`'both'`) and a
 * missing field (a row cached before T-0972) all read as null: both sides, no label. */
export function toUnilateral(
  row: { unilateral?: string | null } | null | undefined,
): Unilateral | null {
  const v = row?.unilateral;
  return v === "arm" || v === "leg" || v === "side" ? v : null;
}
