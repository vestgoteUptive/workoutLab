---
id: D-0133
title: api/openapi.yaml PrefillResult.durationS is 15..120 (TIMED_MIN_S..TIMED_MAX_S), because every engine pre-fill duration lies in that range
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0222)
area: api
builds-on: D-0062 §5, D-0057 §6, D-0117, D-0053 §1
---
## Context
`api/openapi.yaml` declares `PrefillResult.durationS` as `{type: [integer, "null"], minimum: 1}`. But the engine never emits a timed pre-fill outside 15..120 s:
- Every non-first-time timed result is clamped to `[TIMED_MIN_S, TIMED_MAX_S]` = [15, 120] (D-0062 §5).
- `first_time` echoes the library's `defaultDurationS`. Every timed row in `data/exercises/library` is 20–40 s today.

The wider schema lets a corrupt stored plan (for example `durationS: 3`) pass `parseSessionPlan` and reach UF-09. The T-0205 review asked for the contract to state the range.

## Decision
1. **Contract change (data lane):** `components.schemas.PrefillResult.properties.durationS` becomes
   `{ type: [integer, "null"], minimum: 15, maximum: 120 }`.
   The `PrefillResult` description gains one sentence: "A timed `durationS` is within 15..120 s (TIMED_MIN_S..TIMED_MAX_S, D-0062 §5). `first_time` echoes the library `defaultDurationS`, which content keeps within the same range (D-0133)."
2. **Unchanged:** `WorkoutItem.durationS`, `WarmupMove.durationS`, `LibraryExercise.defaultDurationS`, `SessionSet.durationS`, `docs/data-model.md` and the database checks. The item's planned duration (D-0092 §3) is the same number in practice, but narrowing it is not named here.
3. **Generated code follows.** `pnpm --filter @workoutlab/shared gen:api` regenerates `api.gen.ts`, `session-plan.schema.gen.ts` and `session-plan.validate.gen.ts` (D-0117). `node supabase/scripts/vendor.mjs` regenerates `supabase/functions/_shared/vendor/shared/**`. Both drift checks stay green.
4. **Agreement with the engine.** A shared test reads `packages/engine/src/prefill.ts` as text and checks that `TIMED_MIN_S = 15` and `TIMED_MAX_S = 120` equal the schema's `minimum` and `maximum`. It reads the file, it doesn't import it, so `@workoutlab/shared` gains no engine dependency.
5. **Effect on stored plans.** A stored `sessions.plan` with a timed `prefill.durationS` outside 15..120 now parses as `invalid`. No engine version since T-0205 writes one, and there is no production data before launch.

## Consequences
- data (T-0222): makes §1, §3 and §4, with tests.
- content: follow-up check that every `kind: exercise`, `timed: true` row has `default_duration_s` in 15..120. Without it, a future row outside the range would make the engine emit a `first_time` pre-fill that fails §1.
- engine: none. If a later decision clamps `first_time` too, the content check becomes belt and braces.

## Revisit when
- `TIMED_MIN_S` or `TIMED_MAX_S` changes. The §4 test fails until the schema follows.
- Content needs a timed exercise with a default outside 15..120 (for example a 3-minute wall-sit). Then either the range widens or `first_time` gets clamped, under a new decision.
