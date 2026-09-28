// @workoutlab/shared: API and engine I/O types generated from api/openapi.yaml (D-0037 §10).
// Edit the spec, then run `pnpm --filter @workoutlab/shared gen:api`. Never edit api.gen.ts.
// DB types (database.gen.ts), parseSessionPlan() and the row→engine mappers land in T-0102b.
import type { components, operations, paths } from "./api.gen.js";

export type { components, operations, paths };

type S = components["schemas"];

// Scalars and enums
export type Instant = S["Instant"];
export type LocalDate = S["LocalDate"];
export type TimeZone = S["TimeZone"];
export type ExerciseId = S["ExerciseId"];
export type Area = S["Area"];
export type Goal = S["Goal"];
export type Level = S["Level"];
export type ExerciseType = S["ExerciseType"];
export type ExerciseKind = S["ExerciseKind"];
export type Energy = S["Energy"];
export type TargetSource = S["TargetSource"];
export type SwapReason = S["SwapReason"];
export type PrefillKind = S["PrefillKind"];
export type AreaDeficits = S["AreaDeficits"];
export type AreaSetCounts = S["AreaSetCounts"];
export type AreaWeights = S["AreaWeights"];

// Errors (D-0037 §4)
export type ApiError = S["ApiError"];
export type ApiErrorCode = ApiError["error"]["code"];

// Requests (D-0037 §9)
export type SessionInput = S["SessionInput"];
export type SuggestRequest = S["SuggestRequest"];
export type FinishRequest = S["FinishRequest"];

// Reasons (rule 10)
export type Reason = S["Reason"];
export type ReasonCode = Reason["code"];

// Workout and session plan (D-0037 §7)
export type PrefillResult = S["PrefillResult"];
export type Backoff = S["Backoff"];
export type WorkoutItem = S["WorkoutItem"];
export type WarmupMove = S["WarmupMove"];
export type SessionPlan = S["SessionPlan"];
export type Workout = S["Workout"];

// Balance (rule 11) and finish
export type Contributor = S["Contributor"];
export type AreaBalance = S["AreaBalance"];
export type BalanceResult = S["BalanceResult"];
export type SessionSummary = S["SessionSummary"];

// Engine inputs (D-0034 §1, D-0037 §6)
export type HistorySet = S["HistorySet"];
export type LibraryExercise = S["LibraryExercise"];
export type AreaTarget = S["AreaTarget"];
export type EngineProfile = S["EngineProfile"];
export type CheckinSession = S["CheckinSession"];
export type PlanCheckin = S["PlanCheckin"];

// Device-only engine outputs (D-0037 §2)
export type CheckinPeriod = S["CheckinPeriod"];
export type PreviewTarget = S["PreviewTarget"];
export type CheckinProposal = S["CheckinProposal"];
export type CheckinEvaluation = S["CheckinEvaluation"];
export type SwapCandidate = S["SwapCandidate"];
export type TimeCheckProgress = S["TimeCheckProgress"];
export type TimeCheckOption = S["TimeCheckOption"];
export type TimeCheckResult = S["TimeCheckResult"];

/** The 9 areas in the fixed order (docs/engine-rules.md). Matches the `Area` enum. */
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
] as const satisfies readonly Area[];
