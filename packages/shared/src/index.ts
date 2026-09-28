// @workoutlab/shared: API and engine I/O types generated from api/openapi.yaml (D-0037 §10).
// Edit the spec, then run `pnpm --filter @workoutlab/shared gen:api`. Never edit api.gen.ts.
// DB types come from database.gen.ts (`supabase gen types`, script `gen:db`, D-0043); `Database`
// below overrides `sessions.plan` with SessionPlan (T-0102 AC16). Never edit the *.gen.ts files.
import type { components, operations, paths } from "./api.gen.js";
import type { Database as GeneratedDatabase, Json } from "./database.gen.js";

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

// ---------------------------------------------------------------------------------------------
// Database types (T-0102b, D-0037 §10, D-0043)
// ---------------------------------------------------------------------------------------------
export type { Json };
export type { GeneratedDatabase };

type GenPublic = GeneratedDatabase["public"];
type GenSessions = GenPublic["Tables"]["sessions"];

/** `sessions` with `plan` typed as SessionPlan v1 instead of Json (D-0035, D-0037 §7). */
type SessionsTable = {
  Row: Omit<GenSessions["Row"], "plan"> & { plan: SessionPlan | null };
  Insert: Omit<GenSessions["Insert"], "plan"> & { plan?: SessionPlan | null };
  Update: Omit<GenSessions["Update"], "plan"> & { plan?: SessionPlan | null };
  Relationships: GenSessions["Relationships"];
};

/** The typed schema for `createClient<Database>()`: the generated one with the `sessions.plan` override. */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GenPublic, "Tables"> & {
    Tables: Omit<GenPublic["Tables"], "sessions"> & { sessions: SessionsTable };
  };
};

type PublicSchema = Database["public"];
type Flatten<T> = { [K in keyof T]: T[K] };

/** Row type of a public table or view, e.g. `Tables<"sessions">`. */
export type Tables<Name extends keyof PublicSchema["Tables"] | keyof PublicSchema["Views"]> =
  Name extends keyof PublicSchema["Tables"]
    ? Flatten<PublicSchema["Tables"][Name]["Row"]>
    : Name extends keyof PublicSchema["Views"]
      ? Flatten<PublicSchema["Views"][Name]["Row"]>
      : never;

/** Insert type of a public table. */
export type TablesInsert<Name extends keyof PublicSchema["Tables"]> = Flatten<
  PublicSchema["Tables"][Name]["Insert"]
>;

/** Update type of a public table. */
export type TablesUpdate<Name extends keyof PublicSchema["Tables"]> = Flatten<
  PublicSchema["Tables"][Name]["Update"]
>;

export {
  parseSessionPlan,
  type SessionPlanParseError,
  type SessionPlanParseResult,
} from "./session-plan.js";
export {
  toAreaTarget,
  toAreaTargets,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
  toPlanCheckin,
} from "./mappers.js";
