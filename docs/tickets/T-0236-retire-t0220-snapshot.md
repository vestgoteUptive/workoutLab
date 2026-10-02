---
id: T-0236
title: "Engine tests: retire the T-0220 AC6 frozen snapshot (pre-t0220-suggest.json); the sweep keeps its inline old-formula invariants"
lane: engine
screens: [UF-08.2, UF-09.3]
decisions: [D-0131, D-0096, D-0053]
deps: [T-0220]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅛ day. Test-only: `src/**` is unchanged, so there is no vendor regen and no new simulated-history run beyond the rescoped AC6 sweep. Ready once T-0220 merges (it is merging on its branch `t/T-0220-backoff-floor-light-lift`). Engine tickets run one at a time (D-0096 §3): T-0221 → T-0212 → T-0211 → T-0236 → T-0235. It must merge before T-0235, the next engine ticket that changes `suggest` output. -->

## Why
T-0220 AC6 proved that D-0131 changed only the back-off weight. It froze `suggest`'s pre-T-0220 output for 264 plans into `packages/engine/test/fixtures/pre-t0220-suggest.json` (about 35k lines) and deep-equals today's output against it, with the back-off weight blanked. That proof was recorded once in the T-0220 build and accept log. As a standing test it is a trap: any later engine ticket that legitimately changes a plan (T-0235 first) fails it and has to regenerate a 35k-line file nobody can review. The board asks to retire the frozen comparison and keep the invariants that don't depend on the old code.

## Scope
- In:
  - `packages/engine/test/t0220-backoff-floor.test.ts`, the `T-0220 AC6 …` sweep only:
    - drop the `PRE` read and the `withoutBackoffWeight(w)` deep-equal against it;
    - replace each use of the snapshot's back-off weight (`preBw`) with the old formula computed inline, `oldBackoff(pw, inc)`, which the file already defines;
    - keep the title (it contains `sweep`), the `SWEEP_TIMEOUT_MS` budget and the loops over `SWEEP_HISTORIES` × `sweepInputs()`.
    - Add a comment above the test: the whole-plan deep-equal was a one-time proof, recorded in `docs/tickets/T-0220-backoff-floor-light-lift.md` (build and accept log), and was retired by T-0236.
  - Delete `packages/engine/test/fixtures/pre-t0220-suggest.json`.
  - A new `packages/engine/test/t0236-no-t0220-snapshot.test.ts` for AC3.
- Out:
  - Every other T-0220 test (AC1–AC5, AC7, AC9), unedited.
  - The other frozen baselines (`pre-t0204-suggest.json`, `pre-t0205-suggest.json`, `pre-t0219-baseline.json`, `pre-t0226-suggest.json`) and their tests. See the follow-up in Coordination.
  - `packages/engine/src/**` and `docs/engine-rules.md`.

## Acceptance criteria
Each new test title starts with `T-0236 ACn`. The rescoped AC6 test keeps its `T-0220 AC6` title.
- **AC1 (the rescoped sweep)** **Given** `SWEEP_HISTORIES` (the 4 simulated histories, `empty` and `light`) and `sweepInputs()` (High energy, bench-press main, budget 15..120 step 5, warm-up on and off), **When** `suggest` runs on each pair, **Then**:
  - the number of cases is exactly 264 (6 × 44), asserted as a literal;
  - for every item with a back-off and prefill weight `pw`: the back-off weight is null when `pw` is null, 0 when `pw` is 0, and otherwise in `(0, pw]`;
  - when `pw > 0` and `oldBackoff(pw, inc) > 0`, the back-off weight equals it;
  - when the back-off weight differs from `oldBackoff(pw, inc)` (with `pw > 0`), the history is `light`;
  - non-vacuity: at least one `light` case has a 2.5 kg back-off, and at least one non-`light` case has a back-off equal to `oldBackoff(pw, inc)` with `pw > 0`.
  - It still has the `30_000` runtime budget, and the T-0230 guard passes unedited.
- **AC2 (it fails on the old helper)** Temporarily make `backoffOf` in `src/session.ts` return the pre-D-0131 `floorInc(0.9 × w, inc)`. The rescoped AC6 must go red (the light cases give 0, outside `(0, pw]`). Revert, and record the red run in the build log. Don't commit the change.
- **AC3 (the snapshot is gone)** A test asserts:
  - `packages/engine/test/fixtures/pre-t0220-suggest.json` doesn't exist;
  - no file under `packages/engine/test/` (`.ts`, recursively) contains the string `pre-t0220-suggest`, apart from this test file itself.
  - **Red on unfixed code:** on `main` after T-0220 merges, both fail. Record the red run in the build log.
- **AC4 (no behaviour change)** `git diff --stat main...HEAD -- packages/engine/src` is empty (record it in the build log). Every other engine test passes with no edit. The engine test count changes only by the new AC3 cases.
- **AC5** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0236-retire-t0220-snapshot.md`: this file, for the build and accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `test/t0220-backoff-floor.test.ts` (the AC6 test only), `test/fixtures/pre-t0220-suggest.json` (deleted) and the new `test/t0236-no-t0220-snapshot.test.ts`.
- Engine lane, one ticket at a time (D-0096 §3). Run it after T-0211 and before T-0235. T-0221, T-0212 and T-0211 don't change `suggest` output, so they don't touch this sweep.
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs `node supabase/scripts/vendor.mjs --check` at merge.
- Follow-up (product, groom): the four other `pre-*.json` baselines have the same trap. Audit them and retire or rescope each, the same way, before an engine ticket that changes the output they freeze.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0236` (e.g. `T-0236: retire the T-0220 AC6 frozen snapshot; keep the inline invariants`).

## Build / accept log
Archived in `docs/tickets/log/T-0236.md` (D-0157).
