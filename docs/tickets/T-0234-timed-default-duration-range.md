---
id: T-0234
title: "Content: every timed exercise row has default_duration_s in 15..120 (TIMED_MIN_S..TIMED_MAX_S), checked by the schema and a test (D-0133)"
lane: content
screens: [UF-09.7, UF-09.3]
decisions: [D-0133, D-0062, D-0033]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-content. About ⅛ day. Follow-up from the T-0222 groom (D-0133 Consequences). The content-curator has no shell: the orchestrator runs the tests for its branch. No engine, data or web change, so it can run alongside the engine queue. -->

## Why
D-0133 narrowed `PrefillResult.durationS` to 15..120. The engine clamps every timed pre-fill to that range except `first_time`, which echoes the library's `default_duration_s` (D-0062 §5, unclamped). Today every timed exercise row is 20–40 s, but `data/exercises/schema.json` allows 5..120 and `test/timed.test.ts` only checks `≥ 5`. A future row at 10 s would make the engine emit a `first_time` pre-fill that `parseSessionPlan` rejects, and UF-09 couldn't open that workout. This ticket makes the content check carry the range.

Warm-up moves (`kind: "warmup"`) are out: the plan's warm-up entries use a fixed 40 s (D-0040 §2), and `WarmupMove.durationS` keeps its own range (D-0133 §2).

## Scope
- In:
  - `data/exercises/schema.json`: one new `allOf` branch. If `kind` is `"exercise"` and `timed` is `true`, then `default_duration_s` has `minimum: 15` (the top-level `maximum: 120` already applies).
  - `data/exercises/test/timed.test.ts`: the AC2 range check and the AC3 engine-agreement check.
  - A new invalid fixture `data/exercises/test/fixtures/invalid/timed-exercise-duration-below-15.json`.
  - A new valid fixture `data/exercises/test/fixtures/valid/warmup-duration-10.json`.
  - `data/exercises/test/schema.test.ts`: the two fixture cases in AC1.
- Out:
  - Any library row's values. They're all in range today.
  - The top-level `default_duration_s` bounds (5..120), which warm-up moves still use.
  - `packages/engine/**`, `api/openapi.yaml`, `docs/data-model.md`, `supabase/**`.

## Acceptance criteria
Each new test title starts with `T-0234 ACn`.
- **AC1 (the schema)**
  - `timed-exercise-duration-below-15.json` is a copy of `data/exercises/library/plank.json` with `id` `"t0234-plank-10"` and `default_duration_s: 10`. **Given** the schema validator (`validator()` in `test/helpers.ts`), **When** it validates the fixture, **Then** it fails with an error whose `instancePath` is `/default_duration_s` and whose `keyword` is `minimum`.
  - **Red on unfixed code:** on `main` the fixture validates with 0 errors, because the schema minimum is 5. Record the red run in the build log.
  - **Pair:** `warmup-duration-10.json` is a copy of `data/exercises/library/arm-circles.json` (a `kind: "warmup"` row) with `id` `"t0234-arm-circles-10"` and `default_duration_s: 10`. It validates with 0 errors, so warm-ups are unchanged.
  - A copy of `plank.json` at 15 and at 120 validates (built in memory). At 121 it fails.
  - The existing "has at least the 6 required invalid fixtures" test and every library-file case pass unedited.
- **AC2 (the library)** **Given** `loadLibrary()`, **When** the test filters rows with `kind === "exercise"` and `timed === true`, **Then**:
  - there is at least 1 (non-vacuity; `plank` is one);
  - every one has `default_duration_s` in `[15, 120]`, and a failure names the row id.
- **AC3 (agreement with the engine, D-0133 §4)**
  - The test reads `packages/engine/src/prefill.ts` as text (resolved from the package root, as T-0222 AC3 does from `packages/shared`). It extracts the integers in `export const TIMED_MIN_S = …;` and `export const TIMED_MAX_S = …;`.
  - They equal the bounds AC2 checks (15 and 120). If either constant is missing, the test fails and names it.
  - `data/exercises/package.json` gains no dependency.
- **AC4 (nothing else moves)** Every existing `data/exercises` test passes unedited, including `warmup.test.ts` and the old `≥ 5` check in `timed.test.ts`. `npx -y pnpm@10.28.2 --filter @workoutlab/exercises typecheck lint test` is green.

## Paths you may change
- `data/exercises/**` (the lane: `content`).
- **Listed extras:**
  - `docs/tickets/T-0234-timed-default-duration-range.md`: this file, for the build and accept log.

## Contract impact
none. `data/exercises/schema.json` is the content lane's own validator. `api/openapi.yaml` and `docs/data-model.md` are unchanged.

## Coordination
- Files: `data/exercises/schema.json`, `test/timed.test.ts`, `test/schema.test.ts` and the two new fixtures.
- No other ticket on the board touches `data/exercises/**`.
- If a later decision clamps `first_time` in the engine, this check becomes belt and braces and stays (D-0133 Consequences).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0234` and cite UF-09.7 (e.g. `T-0234 UF-09.7: timed exercise default_duration_s is 15..120 (D-0133)`).

## Build / accept log
