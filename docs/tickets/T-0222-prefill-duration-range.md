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

### Build — 2026-10-02 (data-modeler)
- `api/openapi.yaml`: `PrefillResult.durationS` → `{ type: [integer, "null"], minimum: 15, maximum: 120 }`. The description gains the D-0133 §1 sentence. `git diff main...HEAD -- api/openapi.yaml` is +5 −2, all inside the `PrefillResult` block (description and `durationS` lines only) (AC5).
- Regenerated with `pnpm --filter @workoutlab/shared gen:api` (`api.gen.ts`, `session-plan.schema.gen.ts`, `session-plan.validate.gen.ts`) and `node supabase/scripts/vendor.mjs` (4 files under `supabase/functions/_shared/vendor/shared/`). None were edited by hand. `vendor.mjs --check` exits 0 (AC6).
- New `packages/shared/test/t0222-prefill-duration-range.test.ts` (AC1–AC4).
- **Red on unfixed code:** with only the new test on `main`'s code, 7 of 12 fail: AC1, the AC2 rejects for 14/121/1/600, the AC3 range check (min 1 ≠ 15) and AC4. The 5 that pass are the AC2 accepts (15/45/120/null) and the no-engine-dependency check, which is what a narrowing should keep.
- AC5: no existing fixture holds a timed `prefill.durationS` outside 15..120 (found 45, 45, 50, 120). No existing test was edited.
- Tests: `flock … pnpm turbo run typecheck lint test --filter=@workoutlab/shared --filter=@workoutlab/web --force --concurrency=1`: 7/7 tasks; shared 227/227, web 2107/2107. `pnpm -w format:check` is clean. `node .github/scripts/check-all.mjs` exits 0. `npx -y deno@2 check` on every `supabase/functions` and `supabase/tests/functions` `.ts` file is clean. `deno test supabase/tests/functions/unit/` passes 96/96. pgTAP and integration tests were not run locally; they run in CI.
- AC6 CI run URL: pending. The orchestrator opens the draft PR.

### Build, attempt 2 — 2026-10-02 (data-modeler)
- CI on PR #23 failed in `packages/engine/test/rule-14-suggest.test.ts`: the T-0205 AC21 test still expected `minimum: 1`. Merged `origin/main`, which brings in the Listed-extras grant. Changed only the AC21 `durationS` bounds regex, to `minimum: 15, maximum: 120` (D-0133). The rest of the assertion is unchanged.
- Red before the edit, against the new yaml: `vitest run test/rule-14-suggest.test.ts -t "exactly these keys"` → 1 failed. Green after → 1 passed.
- `flock … pnpm -w typecheck lint test --force --concurrency=1`: 19/19 tasks (engine 33 files, shared 9, web 139, exercises 16, design-tokens 7, landing 11). `format:check` is clean. `check-all.mjs` exits 0. `vendor.mjs --check` exits 0.

### Accept (2026-10-02, product-owner): done
Checked at HEAD 574bbba against each AC.
- AC1: `T-0222 AC1` asserts the `durationS` deep-equal and the description. `api/openapi.yaml` L432 is `{ type: [integer, "null"], minimum: 15, maximum: 120 }`, and the description cites `15..120` and D-0133. Red on main.
- AC2: `it.each` accepts 15/45/120/null and rejects 14/121/1/600 with `invalid`. The four rejects were red on main.
- AC3: the test reads `TIMED_MIN_S`/`TIMED_MAX_S` from `packages/engine/src/prefill.ts` as text and compares them with the schema bounds. A separate test checks that `@workoutlab/shared` gains no engine dependency. The range check was red on main.
- AC4: the existing drift tests (`SESSION_PLAN_SCHEMA`, T-0229 AC2, `api.gen.ts`) pass unedited. The new `T-0222 AC4` test checks `maximum: 120` in the `PrefillResult` closure. Review confirmed the generated files are byte-identical to a scratch regeneration.
- AC5: every existing shared, web and supabase test passes unedited. The fixtures hold 45, 45, 50 and 120 s, so no triage was needed. The openapi diff is +5 −2, all inside `PrefillResult`. The one engine test edit (the T-0205 AC21 bounds regex) is a Listed extra granted on main after CI. It was red before the edit and green after, and it follows the narrowed contract.
- AC6: `vendor.mjs --check` exits 0. Draft PR #23 (https://github.com/vestgoteUptive/workoutLab/pull/23), CI run 2: `checks` (typecheck/lint/unit), `supabase` (db tests) and playwright e2e all pass.
- DoD: the `-w typecheck lint test --force --concurrency=1` gate is 19/19. The contract change is linked to D-0133. Review approved, and no LLM or runtime compile was added (D-0117). Principles hold: the engine is unchanged and deterministic, and UF-09.5 can no longer run a timed set outside 15..120 s.
- Follow-ups: T-0413 (an out-of-range stored plan opens as notOnDevice; confirm the UX) and the content check on `default_duration_s` (D-0133 Consequences).
