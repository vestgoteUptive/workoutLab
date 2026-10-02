---
id: T-0222
title: "Data: api/openapi.yaml PrefillResult.durationS is 15..120 (TIMED_MIN_S..TIMED_MAX_S); regenerate gen:api and the vendored shared copy (D-0133)"
lane: data
screens: [UF-09.1, UF-09.3, UF-09.5]
decisions: [D-0133, D-0062, D-0057, D-0117, D-0053]
deps: [T-0205, T-0229]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-data. About ¼ day. Contract fix in api/openapi.yaml (data lane), with no engine behaviour change. It can run alongside the engine queue (T-0220 → T-0221 → T-0212 → T-0211), because it touches no `packages/engine/**` path. It touches `supabase/functions/_shared/vendor/shared/**` (regenerated, never hand-edited), so it needs a green draft-PR run (AC6), like T-0229. -->

## Why
The engine never emits a timed pre-fill outside 15..120 s (D-0062 §5 clamp; `first_time` echoes library defaults of 20–40 s). But `PrefillResult.durationS` is declared `minimum: 1` with no maximum. So `parseSessionPlan` (UF-09.1) accepts a stored plan with `durationS: 3` or `600`, and UF-09.5 would run a 3 s or 10-minute timed set. D-0133 makes the contract say what the engine guarantees.

## Scope
- In:
  - `api/openapi.yaml`: `components.schemas.PrefillResult.properties.durationS` → `{ type: [integer, "null"], minimum: 15, maximum: 120 }`, plus the D-0133 §1 description sentence on `PrefillResult`.
  - `packages/shared/src/api.gen.ts`, `session-plan.schema.gen.ts` and `session-plan.validate.gen.ts`, regenerated with `pnpm --filter @workoutlab/shared gen:api`. Never edit them by hand.
  - `supabase/functions/_shared/vendor/shared/**`, regenerated with `node supabase/scripts/vendor.mjs`. Never edit it by hand.
  - A new `packages/shared/test/t0222-prefill-duration-range.test.ts`.
- Out:
  - `WorkoutItem.durationS`, `WarmupMove.durationS`, `LibraryExercise.defaultDurationS`, `SessionSet.durationS` (D-0133 §2).
  - `docs/data-model.md` and `supabase/migrations/**`.
  - `packages/engine/**`. The constants are read as text, not edited.
  - The content check on `default_duration_s` (a content follow-up, D-0133 Consequences).

## Acceptance criteria
**Fixtures:** `plan` = `exampleOf("Workout").plan`, as in `test/session-plan.test.ts`. `timed(d)` = `plan` with one item replaced by a timed item whose `repsMin`/`repsMax` are null, `durationS` is 45, and `prefill` is `{weightKg: null, reps: null, durationS: d, kind: "add_rep"}`. Build it from an existing plan item so every other field stays valid. Each new test title starts with `T-0222 ACn`.

- **AC1 (the schema)** Parse `api/openapi.yaml` with `yaml`. `PrefillResult.properties.durationS` deep-equals `{type: ["integer", "null"], minimum: 15, maximum: 120}`. The `PrefillResult` description contains `15..120` and `D-0133`. **Red on unfixed code:** on `main` it is `{…, minimum: 1}`.
- **AC2 (the validator)** `parseSessionPlan(timed(d))`:
  - `ok: true` for `d` in `[15, 45, 120, null]`;
  - `{ok: false, error: "invalid"}` for `d` in `[14, 121, 1, 600]`.
  - **Red on unfixed code:** on `main`, 14, 121, 1 and 600 are accepted.
- **AC3 (agreement with the engine, D-0133 §4)** The test reads `packages/engine/src/prefill.ts` as text and extracts the integers in `export const TIMED_MIN_S = …;` and `export const TIMED_MAX_S = …;`. They equal the schema's `minimum` and `maximum`. If either constant is missing, the test fails and names it. `@workoutlab/shared` gains no dependency.
- **AC4 (generated code in sync)** The existing drift tests pass with no edits, after regenerating: the `SESSION_PLAN_SCHEMA` drift test, T-0229 AC2 (validator byte-identical) and the `api.gen.ts` check. `session-plan.schema.gen.ts` contains `maximum: 120` in the `PrefillResult` closure.
- **AC5 (nothing else moves)**
  - Every existing `packages/shared`, `apps/web` and `supabase/tests/**` test passes unedited. The existing web fixtures with timed pre-fills (45 s and 50 s) are inside the range.
  - If any existing fixture holds a timed `prefill.durationS` outside 15..120, stop and raise triage. Don't edit the fixture.
  - `git diff main...HEAD -- api/openapi.yaml` touches only the `PrefillResult` block. Record it in the build log.
- **AC6 (vendor copy and CI)**
  - `node supabase/scripts/vendor.mjs --check` exits 0.
  - A draft PR from `t/T-0222-prefill-duration-range` to `main` passes `checks`, `supabase` and playwright e2e. Put the run URL in the accept log.

## Paths you may change
- `api/openapi.yaml`, `packages/shared/**` (the lane: `data`).
- **Listed extras:**
  - `supabase/functions/_shared/vendor/shared/**`: the output of `node supabase/scripts/vendor.mjs` only.
  - `docs/tickets/T-0222-prefill-duration-range.md`: this file, for the build and accept log.
  - `packages/engine/test/rule-14-suggest.test.ts`: the T-0205 AC21 openapi bounds regex only, updated to D-0133's `minimum: 15, maximum: 120` (added 2026-10-02 after CI on PR #23).

## Contract impact
`api/openapi.yaml`: `PrefillResult.durationS` narrows to 15..120 and its description gains one sentence, under D-0133. The data lane owns this contract. `docs/data-model.md`, `docs/engine-rules.md` and the database are unchanged.

## Coordination
- Files: `api/openapi.yaml` (the `PrefillResult` block), the three `packages/shared/src/*.gen.ts` files, the new test, and `supabase/functions/_shared/vendor/shared/**`.
- No overlap with the engine queue. T-0213 (data, the `SwapCandidate` examples in `api/openapi.yaml`) edits the same file in a different block. Whichever of T-0213 and T-0222 lands second rebases and reruns `gen:api` and `vendor.mjs`.
- Follow-up (content): a check that every `timed: true` exercise row has `default_duration_s` in 15..120 (D-0133 Consequences).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · `vendor.mjs --check` is green · the AC6 run URL is recorded · the contract change is linked to D-0133 · commit messages start with `T-0222` and cite UF-09.5 (e.g. `T-0222 UF-09.5: PrefillResult.durationS is 15..120 (D-0133)`).

## Build / accept log
