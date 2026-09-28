---
id: T-0102
title: OpenAPI v1 for Edge Functions (schemas, auth, errors, engine I/O components) and generated packages/shared types; priority_areas array_lower fix
lane: data
screens: [UF-03.3, UF-05.1, UF-08.1, UF-08.2, UF-08.3, UF-08.4, UF-09.3, UF-09.4, UF-09.8, UF-10.1, UF-10.2, UF-11.1, UF-11.3]
decisions: [D-0001, D-0013, D-0015, D-0017, D-0020, D-0022, D-0023, D-0024, D-0025, D-0026, D-0027, D-0030, D-0034, D-0035, D-0037]
deps: [T-0100a, T-0100b, T-0101]
status: ready
---
<!-- Groomed 2026-09-28 by product-owner. Build flow: wl-build-data. Proposed split into T-0102a / T-0102b at the end. -->

## Why
`api/openapi.yaml` is a v0.1 stub: no schemas, no auth, no errors (gap B2). It still lists five CRUD
paths that D-0001 routes through supabase-js + RLS, and it cites v1 screen IDs (`UF-04` on
`/workouts/suggest`). Every consumer waits on these shapes: the engine tickets need one agreed
input/output vocabulary (D-0034 §1), T-0203 implements the Edge Functions, and T-0300…T-0308
render engine output without recomputing it (principle 3). `sessions.plan` (D-0035) has no JSON
shape yet, and focus-mode trimming (UF-09.8, rule 8) depends on it. `packages/shared` still
holds only the bootstrap placeholder test (D-0016, D-0023). D-0037 fixes every shape this ticket
needs.

**Folded-in follow-ups (board, Phase 0):**
- `/balance` response per `docs/specs/uf-10-balance.md` + rule 11 incl. `targetSource`/`targetUpdatedAt` (D-0027): AC9.
- Check-in evaluation response (`evaluateCheckin`, rule 9): AC11.
- `sessionInput`, `Workout`, reason codes, swap reason enum, `rankSwaps`, `timeCheck` (rules 7, 8, 10, 12, 13, 14): AC6–AC8, AC11.
- Fix the v1 `UF-04` in the `/suggest` summary → UF-08.1: AC3.
- Engine types from D-0034 §1, ISO-8601 instants, `YYYY-MM-DD` local dates: AC12.
- D-0035 columns (`exercises.kind/increment_kg/default_duration_s/external_load`, `sessions.warmup_in_budget/plan`, `session_sets.backoff`) + routines/routine_items/plan_checkins in the generated DB types: AC15. `SessionPlan` JSON (items + `startDeficits`): AC7, AC16, AC17.
- Replace the `@placeholder T-0102` test in `packages/shared` (D-0023): AC14.
- Data follow-up: `profiles_priority_areas_valid` requires `array_lower = 1` (migration 3 + pgTAP). It fits (one constraint), so it's here, not in a new ticket: AC19, AC20.
- **Not folded:** "require `default_duration_s` when timed". Per D-0037 §11 it goes to the content validator (follow-up), not a DB check.

## Scope
- In:
  - `api/openapi.yaml` v1.0.0 per D-0037 §1–§9: three paths, `bearerAuth`, the `ApiError` envelope, and every component schema listed in D-0037, each with at least one `example` taken from the engine-rules fixtures below.
  - `packages/shared`: `src/api.gen.ts` (openapi-typescript, script `gen:api`), `src/database.gen.ts` (Supabase CLI, script `gen:db`), `src/index.ts` with named re-exports and the `sessions.plan` override, `parseSessionPlan()`, row→engine mappers (`toHistorySet`, `toLibraryExercise`, `toAreaTarget`, `toEngineProfile`, `toPlanCheckin`), and tests.
  - Migration 3 (`supabase/migrations/2026092812xxxx_priority_areas_lower_bound.sql`), a pgTAP file, and the `docs/data-model.md` wording (check + `sessions.plan` → `SessionPlan` v1).
- Out: implementing the Edge Functions (T-0203); engine code or the engine adopting the shared types (engine follow-up); a path for check-in, swaps or time check (D-0037 §2); CI drift job for `database.gen.ts` (infra follow-up); the `default_duration_s` rule (content follow-up); client code (T-0300+).

### Edge cases that are in scope
- **Offline:** the device runs `rankSwaps`, `timeCheck`, `evaluateCheckin`, `balance` and `suggest` with no network, so their inputs and outputs are components the client can type against without a path (AC11). `HistorySet.pending` is optional and typed (AC12). `parseSessionPlan` never throws on a plan written by an older or newer app version (AC17).
- **Time running out:** `budgetMin 7` is a valid request (AC6). A finish 95 min into a 45-min budget is a 200 with `withinBudget: false`, and the budget + 120 s boundary counts as within (AC10). `TimeCheckResult` for 105 s behind and 59 s behind (AC11).
- **Zero history:** a `BalanceResult` with 9 zero areas, `lastTrainedDate: null` and empty contributors validates (AC9). A `Workout` whose `startDeficits` are all 1 validates (AC7). A `CheckinEvaluation` with `periods: []` and `proposal: null` validates (AC11).
- **Returning after 10 days off:** a `BalanceResult` area with load 0, 14 zero days and `lastTrainedDate: 2026-09-17` validates (AC9, R11-E3). `PrefillKind` includes `hold_after_break` and `reentry` (AC8).

## Acceptance criteria
Every AC is at least one automated test: Vitest in `packages/shared/test/` (AC1–AC18) or pgTAP in `supabase/tests/database/` (AC19–AC20). Schema checks compile the OpenAPI components with Ajv (JSON Schema 2020-12, `strict: true`, `ajv-formats`). **[a]** and **[b]** tag the proposed split.

Fixtures: F-tz, F-profile, F-targets, F-input and L1 from `docs/engine-rules.md`. "Valid" = Ajv returns true against the named component. "Invalid" = Ajv returns false.

### OpenAPI document [a]
- **AC1 [a] (valid 3.1)** Given `api/openapi.yaml`, When `@redocly/openapi-core` lints it with the `recommended` ruleset, Then there are 0 errors, `openapi` is `3.1.0` and `info.version` is `1.0.0`.
- **AC2 [a] (paths, gap B2)** Given the parsed document, Then the operations are exactly `POST /workouts/suggest`, `GET /balance` and `POST /sessions/{id}/finish`, and `/profile`, `/exercises`, `/exercises/{id}`, `POST /sessions` and `/sessions/{id}/sets` are absent.
- **AC3 [a] (v2 screen IDs)** Given the parsed document, Then the `summary` of `/workouts/suggest` contains `UF-08.1` and not `UF-04`, the `/balance` summary contains `UF-10.1` and not `UF-03` or `UF-08`, the finish summary contains `UF-03.3` and not `UF-07`, and every `UF-NN(.n)` in the file exists in the flow index of `Design-docs/docs/product/user-flows.md` (D-0023 §1).
- **AC4 [a] (auth)** Given the document, Then `components.securitySchemes.bearerAuth` is `{type: http, scheme: bearer, bearerFormat: JWT}`, the root `security` is `[{bearerAuth: []}]`, no operation sets `security: []`, and every operation has a `401` response that `$ref`s `#/components/responses/Unauthorized`.
- **AC5 [a] (errors, NFR-PRIV-7)** Given `ApiError`, Then `{error: {code: "not_found", message: "Session not found", requestId: "req_01"}}` is valid; `code: "forbidden"` is invalid; an extra top-level key `email` is invalid. Every operation has `400`, `401` and `500` responses with `ApiError`. Finish also has `404`. Suggest and balance also have `422` with an example whose code is `profile_missing`. No error example contains `@`.

### Requests and workout [a]
- **AC6 [a] (SuggestRequest, UF-08.1)** Given `{sessionInput: {budgetMin: 30, warmupInBudget: true, energy: "normal", shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}, tz: "Europe/Stockholm"}`, Then it is valid. `budgetMin` 7 and 480 are valid; `budgetMin` 0, 481 and 30.5 are invalid; `energy: "medium"` is invalid; `shuffle: -1` is invalid; the object without `tz` is invalid; an extra key `now` is invalid (the server supplies `now`, D-0037 §9).
- **AC7 [a] (Workout + SessionPlan, R7-E4 zero history)** Given the R7-E4 result as a JSON fixture (plan `{version: 1, mainLiftId: "bench-press", warmup: [wu-scap-push-up, wu-band-pull-apart, wu-bodyweight-squat, wu-arm-circle] × 40 s (R7-E10), items: bench-press × 4 isMain costS 720 prefill {weightKg: null, reps: 6, kind: first_time}, inverted-row × 3 costS 555 prefill {weightKg: 0, reps: 8, kind: first_time}, leg-extension × 2 costS 270 prefill {weightKg: null, reps: 10, kind: first_time}, startDeficits: all 9 areas = 1}`, `itemsTotalS 1545`, `totalS 1725`, `unusedS 75`, `sessionReasons` = `area_deficit` for chest, back, quads), Then `Workout` is valid and `workout.plan` is a valid `SessionPlan`. Invalid: `startDeficits` without `calves`; a deficit of 1.2; an item with `sets: 0` or `sets: 5`; 9 items; 5 warm-up moves; `version: 2`.
- **AC8 [a] (reason codes and enums)** Given `Reason`, Then the discriminator is `code` with exactly the 8 codes of rule 10: `main_lift`, `area_deficit`, `days_since`, `recovering_skipped`, `energy_low_trim`, `energy_high_backoff`, `swap`, `prefill`. `{code: "area_deficit", area: "chest", deficit: 1}` and `{code: "days_since", area: "hamstrings", days: null}` are valid; `{code: "bored"}` and `{code: "area_deficit", area: "neck", deficit: 1}` are invalid. `SwapReason` is exactly `[equipment_taken, discomfort, variety, short_on_time]`, and `{code: "swap", reason: null}` is valid. `PrefillKind` is exactly `[first_time, carry, reentry, hold_after_break, increase, deload, hold, add_rep]`.

### Engine outputs [a]
- **AC9 [a] (BalanceResult, UF-10, rule 11)** Given the zero-history result `{windowStart: "2026-09-14", windowEnd: "2026-09-27", computedAt: "2026-09-27T12:00:00+02:00", areas: 9 × {load 0, target from F-targets, targetSource "default", targetUpdatedAt "2026-08-02T09:00:00Z", deficit 1, coverageStep 0, needsAttention false, recovering false, lastTrainedDate null, days: 14 × 0, contributors: []}}`, Then it is valid. The R11-E2 hamstrings entry (load 6, target 16, deficit 0.625, contributors `[{romanian-deadlift, 4, 2026-09-20}, {back-squat, 2, 2026-09-25}]`, days[6] = 4, days[11] = 2, lastTrainedDate 2026-09-25) is valid. The R11-E3 entry (load 0, 14 zero days, lastTrainedDate 2026-09-17) is valid. Invalid: 8 areas; `days` with 13 entries; `coverageStep: 5`; `windowStart: "14/09/2026"`; `computedAt: "2026-09-27T12:00:00"` (no offset); `targetSource: "auto"`; a negative `load`.
- **AC10 [a] (finish, UF-03.3, time running out)** Given `FinishRequest {endedAt: "2026-09-27T11:35:00+02:00", effortRating: 4, tz: "Europe/Stockholm"}`, Then it is valid; without `effortRating` it is valid; `effortRating: 6` is invalid. Given a `SessionSummary` for budget 45, `startedAt 10:00+02:00`, `endedAt 11:35+02:00`, `durationS 5700`, `withinBudget: false`, Then it is valid. The finish operation's `description` states that a repeat finish returns 200 (idempotent) and gives the `timeBudgetMin × 60 + 120` boundary. A test asserts both strings.
- **AC11 [a] (device-only components, offline)** Each component below has `x-engine-function` and is referenced by no path:
  - `CheckinEvaluation` (UF-11.1) for UF-11 AC1 is valid: onboarded 2026-08-02; periods `{2, 2026-08-30, 2026-09-12, 4, under}` and `{3, 2026-09-13, 2026-09-26, 3, under}`; proposal `{down, 2, 3, previewTargets: chest/back/glutes/quads 14, shoulders/hamstrings 11, arms/core/calves 9}`; `nextCheckinDate 2026-10-11`. The zero-history evaluation (onboarded 2026-09-20, `periods: []`, `proposal: null`, `nextCheckinDate 2026-10-04`) is valid. Invalid: `status: "late"`, `rhythmMin: 0`, `rhythmMax: 8`, 8 `previewTargets`.
  - `SwapCandidate[]` (UF-08.3, UF-05.1) for R12-E1 is valid: db-row, inverted-row, lat-pulldown, seated-cable-row at `timeCostS 555` and straight-arm-pulldown at `375`, all `muscleMatch 0.667`, `fitsBudget true`, `bestMatch` true only at index 0. `muscleMatch: 1.2` is invalid.
  - `TimeCheckResult` (UF-09.8): R8-E1 `{behindS 105, show true, minutesBehind 2, trim.projectedS 2700}` and R8-E3 `{behindS 59, show false, minutesBehind null}` are valid. `TimeCheckProgress {elapsedS: -1, nextItemIndex: 1}` is invalid.

### Types and package [a]
- **AC12 [a] (engine input types, D-0034 §1)** With Vitest `expectTypeOf`: `HistorySet` equals `{clientId: string; sessionId: string; exerciseId: string; isWarmup: boolean; completedAt: string; editedAt: string; deletedAt: string | null; pending?: boolean; reps: number | null; weightKg: number | null; durationS: number | null}`. `Area` equals the 9-literal union. `AreaTarget` equals `{area: Area; setsPer14d: number; source: "default" | "adapted" | "manual"; updatedAt: string}`. `LibraryExercise` has D-0034's fields plus `timed`, `incrementKg`, `defaultDurationS: number | null` and `externalLoad` (D-0037 §6). `EngineProfile` has `planUpdatedAt: string`. At runtime, `HistorySet` with `completedAt: "2026-09-20"` is invalid and with `"2026-09-20T10:00:00Z"` is valid.
- **AC13 [a] (generated, no drift)** Given the committed `packages/shared/src/api.gen.ts`, When the test runs `openapi-typescript` on `api/openapi.yaml` in-process, Then the output is byte-identical. `src/index.ts` exports the named types `Area, SessionInput, SuggestRequest, Workout, WorkoutItem, SessionPlan, Reason, SwapReason, PrefillKind, PrefillResult, BalanceResult, AreaBalance, CheckinEvaluation, SwapCandidate, TimeCheckResult, TimeCheckProgress, HistorySet, LibraryExercise, AreaTarget, EngineProfile, CheckinSession, PlanCheckin, FinishRequest, SessionSummary, ApiError`. A type test imports each one.
- **AC14 [a] (placeholder replaced, D-0023)** Given the branch, Then no file under `packages/shared` contains `@placeholder`, the `SHARED_VERSION` test is gone, `node .github/scripts/check-placeholder-tests.mjs` exits 0, and `pnpm -w typecheck lint test` is green.

### DB types, plan parsing, mappers [b]
- **AC15 [b] (DB types match data-model v1)** Given `packages/shared/src/database.gen.ts` (the committed output of `supabase gen types typescript --local`, CLI 2.118.0, after migrations 1–3), When the test parses every column table in `docs/data-model.md` under "Library" and "User-owned tables", Then each table appears in `Database["public"]["Tables"]` (`session_sets_live` under `Views`) with every documented column in `Row`, and each column with `null = yes` is typed `… | null`. That includes `exercises.kind/increment_kg/default_duration_s/external_load`, `sessions.warmup_in_budget/plan`, `session_sets.backoff`, `routines`, `routine_items` and `plan_checkins`. No `analytics` schema appears.
- **AC16 [b] (sessions.plan typed)** With `expectTypeOf`, `Tables<"sessions">["plan"]` exported from `@workoutlab/shared` is `SessionPlan | null`, both on `Row` and on `Insert`.
- **AC17 [b] (parseSessionPlan never throws)** Given the AC7 plan JSON, Then `parseSessionPlan(json)` returns `{ok: true, plan}` deep-equal to the input. Given `null`, Then `{ok: true, plan: null}`. Given `{version: 2, …}`, Then `{ok: false, error: "unsupported_version"}`. Given the plan without `startDeficits`, or the string `"{}"`, Then `{ok: false, error: "invalid"}`. No input in the test table throws.
- **AC18 [b] (row → engine mappers)** Given the `session_sets` row `{client_id: C1, session_id: S1, exercise_id: "back-squat", is_warmup: false, kind: "reps", reps: 8, weight_kg: 60, duration_s: null, rir: 2, backoff: false, completed_at: "2026-09-20T10:00:00+00:00", edited_at: "2026-09-20T10:05:00+00:00", deleted_at: null, …}`, Then `toHistorySet(row)` deep-equals the `HistorySet` with those camelCase values and **no** `pending` key, and `toHistorySet(row, {pending: true})` has `pending: true`. A tombstoned row keeps `deletedAt` (the engine filters it, rule 0). `toLibraryExercise(backSquatRow, [{area_id: "quads", weight: 1}, {area_id: "hamstrings", weight: 0.5}])` has `areas {quads: 1, hamstrings: 0.5}` and `externalLoad: true`. A profile row with `plan_changed_at: "2026-09-20T08:00:00+00:00"` maps to `planUpdatedAt` with that value (D-0035). Nine `area_targets` rows map to nine `AreaTarget`s in the fixed area order.

### Migration 3 [b]
- **AC19 [b] (priority_areas lower bound, pgTAP)** Given the migrated DB, when A inserts or updates their profile: `priority_areas = '[2:3]={back,back}'` → `23514`; `'[0:1]={back,chest}'` → `23514`; `'{back,chest}'` succeeds; `'{}'` succeeds. Every T-0100 AC19 case (`'{back,hamstrings,arms}'` ok; 4 items, `'{neck}'`, `'{back,back}'` → `23514`) and the T-0100b one-dimensional case still pass. `docs/data-model.md` describes the check with `array_lower = 1` and cites D-0037.
- **AC20 [b] (real stack)** Given the draft PR, When the CI `supabase db tests` job runs `supabase db reset && supabase test db`, Then migrations 1–3 apply and every pgTAP file passes. `pnpm -w typecheck lint test` is green.

## Paths you may change
Data lane: `api/openapi.yaml`, `packages/shared/**`, `docs/data-model.md`, `supabase/migrations/**`. Extras for this ticket only:
- `supabase/tests/database/012_priority_areas_lower.test.sql` (backend-owned path; T-0203 hasn't started, so nothing overlaps).
- `pnpm-lock.yaml`, but only as the result of `pnpm install` after adding devDependencies to `packages/shared/package.json` (`openapi-typescript`, `@redocly/openapi-core`, `yaml`, `ajv`, `ajv-formats`; `ajv` + `ajv-formats` may be runtime deps for `parseSessionPlan`). No other root file.

Not `packages/engine/**`, `supabase/functions/**`, `supabase/seed.sql`, `.github/**`, `docs/engine-rules.md`.

## Contract impact
- `api/openapi.yaml` v0.1 → v1.0.0: paths reduced to three, all schemas, auth and errors added. Named by **D-0037** §1–§9.
- `docs/data-model.md`: `profiles_priority_areas_valid` adds `array_lower = 1`, and the `sessions.plan` note points at `SessionPlan` v1. Named by **D-0037** §7 and §11.
- `docs/engine-rules.md`, `tokens.json`: unchanged. **Cost (D-0012):** none; local and CI only.

## Definition of done
Tests for every AC pass (Vitest + `supabase test db` in CI) · `pnpm -w typecheck lint test` green · contracts changed only as D-0037 names · commit messages start with `T-0102a`/`T-0102b` and cite screen IDs where relevant (e.g. `T-0102a UF-09.8: TimeCheckResult schema`).

## Size and proposed split
This is **more than one day of agent work**: about 30 schemas with fixtures and negative cases, two code generators, a type-conformance suite, mappers, and a migration that needs the real-stack CI run. Proposed split (the orchestrator edits the board):
- **T-0102a (data, deps T-0100a, T-0101): OpenAPI v1 + API types.** AC1–AC14. It unblocks T-0203 and gives T-0201/T-0202/T-0204/T-0205 their output shapes. About one day.
- **T-0102b (data, deps T-0102a, T-0100b): DB types, plan parsing, mappers, migration 3.** AC15–AC20. Needs a draft PR for the real-stack run (Docker on the orchestrator host can't pull images). About half a day. It unblocks T-0300 (typed supabase-js, queued `pending` sets).

**Placeholder marker (D-0023 §4, TR-0015, D-0037 §12):** `packages/shared/test/index.test.ts` keeps `@placeholder T-0102`. The board keeps `T-0102` as the parent row (status `split → T-0102a, T-0102b`, never `done` while a child is open), so the checker accepts the marker on main and on `t/T-0102a-*`. No lane retags it. T-0102a deletes it (AC14). The orchestrator marks the parent `done` once both children are done.
