---
id: T-0961
title: Engine rule 16, the estimated one-rep max per exercise
lane: engine
screens: [UF-06.2]
decisions: [D-0254, D-0255, D-0258, D-0257, D-0219]
deps: [T-0952]
status: todo
---
## Why
UF-06.2 (Exercise history) will show an estimated 1RM and a chart over time (`docs/specs/estimated-1rm.md`). The number must come from a pure, deterministic engine function (principle 3), never from the web and never from an LLM. T-0961 adds rule 16 and narrows rule 15's "never the e1RM number" to "never on Today". It depends on T-0952 (RIR engine ticket) because both tickets edit `HistorySet`, `types.ts`, the vendored copy and rule 15's paragraph; running them in parallel would conflict.

## Scope
- In:
  - New `packages/engine/src/e1rm.ts` beside `records.ts`: `estimatedOneRepMax(history, library, exerciseId) -> E1rmPoint[]`, `E1rmPoint { sessionId, clientId, completedAt, weightKg, reps, e1rm }`, oldest first (sorted by `completedAt`, then `clientId`). Export from `index.ts`.
  - Reuses `normalizeHistory` (rule 0), `isHardSet` (rule 2), `indexLibrary`. No `Date.now()`, no `new Date()`.
  - Plain Epley at every rep count: `weightKg x (30 + reps) / 30`. Ties compare `weightKg x (30 + reps)` (no float division); divide only when building the point. Output unrounded.
  - Valid set: hard set, exercise in library with `kind = "exercise"`, `timed = false`, `externalLoad = true`, `weightKg` finite and > 0, integer `reps` 1..10. One point per (`exerciseId`, `sessionId`): highest e1RM; ties go to the earlier `completedAt`, then the smaller `clientId`.
  - `docs/engine-rules.md`: new rule 16 with examples R16-E1 onward; rule 15 text narrowed from "never the e1RM number" to "never on Today"; add R15-E12 (series) and traceability entries.
  - Extend the isolation test ("no core module imports `records.ts`") to `e1rm.ts`; check that `suggest` and the other engine outputs do not import `e1rm.ts`.
  - Re-vendor `supabase/functions/_shared/vendor/**` and run `vendor.mjs --check`.
- Out: any web change, the 56-day window and local-date placement (T-0963), RIR-adjusted estimates, Brzycki, any change to rules 7, 14 or 15 behaviour, data-model, openapi, export. Edits to the RIR parts of `HistorySet` (T-0952 owns them; rebase on top).

## Acceptance criteria
Each criterion becomes at least one automated test.
- AC1 (formula) Given back-squat hard set 100 x 8, When computed, Then `e1rm` = 126.667 (100 x 38/30). Given 100 x 1, Then 103.333 (plain Epley, no 1-rep case, D-0258 §1). Given 90 x 10, Then 120.
- AC2 (range) Given a session with only 60 x 15, Then no point. Given 100 x 10 and 60 x 15 in one session, Then the point is 100 x 10 (133.333). Given 100 x 0, reps 0, reps null, weight null, negative or NaN weight, or non-integer reps, Then those sets are ignored.
- AC3 (sets) Given a warm-up set 130 x 1, a tombstoned (`deletedAt`) 120 x 5 and a live 100 x 8 in one session, Then the point is 100 x 8. Given a set of an unknown exercise, a timed exercise (plank), a bodyweight exercise (`externalLoad: false`) or a warm-up move (`kind: "warmup"`), Then `[]`. Given an exercise with no history (zero history), Then `[]`.
- AC4 (best per session) Given S1 with 100 x 8 and 105 x 5 (126.667 and 122.5), Then one point for S1: 100 x 8. Given S2 with two equal sets at 10:00 and 10:05, Then the 10:00 set. Given two equal sets at the same `completedAt`, Then the smaller `clientId`. Given a back-off set (lighter, hard) and a top set, Then the top set wins.
- AC5 (determinism) Given shuffled input order, Then identical output. Given a duplicated replayed row (same `clientId`, older `editedAt`), Then identical output. Given the same input twice, Then deep-equal. Rule 15 `records`, `suggest` and every other engine output are byte-identical before and after this ticket for the existing fixtures.
- AC6 (agreement with rule 15) Given any history, When the points and rule 15's session-best key are built for the same exercise, Then the best set per session is the same set at every rep count 1..10 (a record and a chart peak never disagree).
- AC7 (R15-E12 series) Given the R15-E12 fixture, Then bench yields 7 points, back-squat 7, dead-bug `[]`, with exact values asserted.
- AC8 (isolation) Given the engine sources, Then `e1rm.ts` imports no `records.ts`, and `suggest` and the other core modules do not import `e1rm.ts`; no `Date.now()` or `new Date()` in `e1rm.ts`.
- AC9 (offline-merged) Given an offline-merged history (queued rows with `status: "queued"` and a server row with the same `clientId`, plus a tombstoned and a `status: "rejected"` row), Then the points equal those from the clean history of the surviving sets.
- AC10 (simulated histories) Given each of five simulated histories, Then the series is as listed below.
- AC11 (vendor) Given the re-vendored `supabase/functions/_shared/vendor/**`, Then `vendor.mjs --check` passes.
- AC12 (rule text) Given `docs/engine-rules.md`, Then rule 15 says "never on Today", rule 16 exists with examples R16-E1+ and each example has a test.

Simulated histories (D-0258 §13), each a 14-day-or-longer fixture with a named expectation:
1. Steady linear gain: back-squat 100 x 8 rising 2.5 kg weekly for 8 weeks, series strictly increasing.
2. Plateau then deload: bench flat 80 x 8 for 4 weeks, then 70 x 8; the lower point after the break is shown as is.
3. Returning after 10 days off: one gap with a lower first point back; no special handling, points oldest first.
4. Mixed rep ranges: 100 x 5, 90 x 10, 60 x 15 across sessions; the 15-rep session gives no point; ties and warm-ups ignored.
5. Two sessions on the same day (same local date) plus a session crossing midnight: both same-day points kept, midnight session dated by its best set's `completedAt`.
6. Offline-merged history (AC9).

Seeded property tests (inline mulberry32, no fast-check, at least 200 cases per property, fixed seeds):
- Output is sorted by `completedAt`, then `clientId`; at most one point per session.
- Every point's `reps` is 1..10 and `weightKg` > 0; `e1rm` equals `weightKg x (30 + reps) / 30`.
- Permuting the input never changes the output; appending a warm-up or tombstoned set never changes it.
- No point's `e1rm` is below any other valid set's e1RM in its session.
- Adding sets of other exercises changes nothing.

Checklist (D-0197 §7): online/offline is covered by AC9 (the engine is pure, so offline is only a merge shape); empty and non-empty by AC3 and AC1; first launch and returning by history 3; tombstoned and `rejected` rows by AC3 and AC9.

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (rule 16 new, rule 15 narrowing, R15-E12, traceability)
- `supabase/functions/_shared/vendor/**` (re-vendor only, via `vendor.mjs`; no hand edits)
- Extra: `.squad/ownership.yaml` lists no lane for the vendor folder; this ticket names it explicitly, as T-0952 does.

## Contract impact
`docs/engine-rules.md`: rule 16 added and rule 15 narrowed, named by D-0255, D-0257 §rule 15 and D-0258 §12. No change to `docs/data-model.md`, `api/openapi.yaml` or design tokens.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0961` and cite UF-06.2.

Per-package commands: `pnpm --filter @workoutlab/engine typecheck`, then a separate `… lint`, then a separate `… test` (confirm the package name in `packages/engine/package.json`).

## Build / accept log
- Base: worktree `t/T-0961-e1rm-engine` from `main-hzlbfc` at fbec8145 (T-0952 merged, clean). Added `packages/engine/src/e1rm.ts` (`estimatedOneRepMax`, `E1rmPoint`, `E1RM_MAX_REPS`), export in `index.ts`, rule 16 + R16-E1..E13 in `docs/engine-rules.md`, rule 15 narrowed to "never on Today", traceability row, re-vendored `supabase/functions/_shared/vendor/engine/**` via `vendor.mjs`.
- AC to test: AC1 `rule-16-e1rm.test.ts` R16-E1/E2; AC2 R16-E3/E4; AC3 R16-E5/E6; AC4 R16-E7/E8; AC5 R16-E9 + `rule-16-e1rm-histories.test.ts` "display-only" (suggest JSON identical before/after, five histories + progressive); AC6 `rule-16-e1rm-properties.test.ts` R16-E10 (300 cases, reps 1..10); AC7 histories R16-E11; AC8 "isolation" block (every core module, records.ts, no Date/Math.random); AC9 R16-E12 (unit + simulated 6); AC10 histories "simulated histories" 1-6 (+ R16-E13 for 5); AC11 `vendor.mjs --check`; AC12 "rule text" block. Properties P1-P5 and R16-E10 use inline mulberry32, 300 cases, fixed seeds 1601-1606.
- Guard: `rule-16-e1rm-histories.test.ts` calls `suggest(`, so it is listed in `rule-7-switches-b18.test.ts`.
- Planted faults (backup copy, restored by `cp`, diff clean), each made at least one of the three rule-16 files fail: 1-rep special case (3 fail), reps cap 12 (3), tie to later completedAt (4), skip normalizeHistory (2), `import "./records.js"` in e1rm.ts (1), tie to larger clientId (1), drop externalLoad check (2), weight >= 0 (3).
- Red runs on unfixed code: first histories run failed once on my own fixture date (`2026-07-55`, RangeError); fixed in the test, not the engine.
- Note: `HistorySet` has no `status`; "rejected" rows are dropped by the caller before the engine (modelled in AC9 as queued tombstones).
- Red run: the first full `turbo ... --force` had engine `test-budgets` fail (property tests lacked the 30 s budget); added `30_000` to the six property tests, green after.
- Gate (`turbo run typecheck lint test --force --concurrency=1 --continue`): typecheck, lint, shared, exercises, web (5061) green; engine 63 files / 1670 tests green on re-run; `-w format:check`, `-w test:repo-checks` (exit 0), `vendor.mjs --check` and `gen-seed.mjs --check` green.
- Environment-only reds, none on T-0961 paths: `check-all.mjs` (design-tokens uf06-2 spec test, landing ac21, `check:repo`) report `lane-path-not-owned` for ~35 files this branch did not touch, because the diff base resolves to a stale `origin/main` (2d3f3ab4) instead of `main-hzlbfc` (fbec8145). No engine, engine-rules, vendor or T-0961 path is flagged. Expected to clear once the base is current.
