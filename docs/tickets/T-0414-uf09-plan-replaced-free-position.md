---
id: T-0414
title: "UF-09: on PLAN_REPLACED after a swap to fewer sets, the current set moves to the first free position, or the swap ends the item; never two logged sets at one (itemIndex, setIndex)"
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.5, UF-09.7, UF-09.9]
decisions: [D-0140, D-0111, D-0071, D-0066]
deps: [T-0304c]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Follow-up from the T-0410 review. The fix is in `features/UF-09/machine.ts` (`planReplaced`), and T-0304c (doing) changes the same machine for the warm-up and timed paths. So this waits for T-0304c to merge. Ready when T-0304c is done. It must merge before T-0304d (time check can replace items) and T-0306b (the swap sheet), so both gain T-0414 as a dep. -->

## Why
`planReplaced` clamps `setIndex` into the new item's set count. After a swap to fewer sets, the clamp can land on a position the old exercise already logged. Example: barbell-row set 3 of 3, sets 0 and 1 logged, swapped while paused to db-row × 2. `setIndex` becomes 1, which already holds barbell-row set 2. The next Done set is stamped `(1, 1)` too, so two logged sets share one position. `loggedIndexes`, `setAfterRest`, `firstIncompleteSet` and RESYNC all treat a position as one set, so the walk and "Set n of N" go wrong, and the user is shown a set they already did. D-0140 decides the fix: move to the first free position, or, with none left, end the item.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - `machine.ts` `planReplaced(state, ctx, itemIndex, atMs)`, per D-0140 §1–§5:
    - only for the current item, and only when `phase` is `set`/`timed`, or `paused` with `resumePhase` `set`/`timed`;
    - a free clamped position stays as today;
    - otherwise `setIndex` = the lowest free position of the new item (any exercise counts, back-off included);
    - no free position, not the last item: `rest` at `setsInItem(newItem) − 1` with `restFor(newItem.exerciseId)`. Paused: stays `paused`, `resumePhase: "rest"`, timer `{startedAtMs: pausedAtMs, durationS, pausedMs: 0}`. Not paused: timer from `atMs`;
    - no free position, last item: `done`, `timer: null`. Paused: the pause ends (`resumePhase` and `pausedAtMs` null, `workoutPausedMs += atMs − pausedAtMs`);
    - the doc comment names D-0140.
  - New tests in `__tests__/machine.session.test.ts` (a `describe("T-0414 …")`) and a store-level test in `__tests__/` (any file name starting `t0414` or an existing store test file).
  - The setup of the four T-0410 tests in `__tests__/machine.session.test.ts` (D-0140 §7), see AC7.
- Out:
  - `persist.ts` (D-0140 §6: no change).
  - `movedOnIfLogged` (T-0410), `session.tsx`, the swap UI (T-0306b), the time check (T-0304d).
  - A swap while paused from `confirm` (D-0140 Consequences).
  - Other items' positions: `PLAN_REPLACED` for a non-current item still returns the same state.

### Edge cases that are in scope
- **Offline:** the reducer is local. Nothing waits on the network.
- **Reload after the swap:** every new state restores (AC6).
- **Sets logged out of order** (List view): a gap below the clamp is found (AC1).
- **The last item** of the plan, timed (AC3, AC4).

## Acceptance criteria
Each new test title starts with `T-0414 ACn`. P1 and the L1 fixtures (`__tests__/fixtures.ts`: BENCH × 4, ROW × 3, leg-curl × 3, PLANK × 2, the last item). A test that needs a new exercise adds an L1-style row to its own ctx library, as T-0410 does: `db-bench-press` (compound, `{ chest: 1 }`, increment 2.5), `db-row` (compound, `{ back: 1, arms: 0.5 }`), `side-plank` (isolation, timed, `defaultDurationS` 45, `externalLoad: false`). Logged sets of the old exercise carry its `exerciseId`. `T0 = 1_000_000`; PAUSE at `T0 + 1000`, PLAN_REPLACED at `T0 + 2000`, RESUME at `T0 + 30_000`. Every state is passed through `deepFreeze`, as the file does.

- **AC1 (first free position, red on unfixed code)** **Given** item 0 (bench-press), `setIndex` 3, phase `set`, logged bench sets at (0, 0) and (0, 2), **When** PLAN_REPLACED for item 0 with `{ ...BENCH, exerciseId: "db-bench-press", sets: 3 }`, **Then** `phase` is `set` and `setIndex` is 1 (on main: 2). **And When** SET_RECORDED follows, **Then** no two `loggedSets` share `(itemIndex, setIndex)`, and the new entry is `(0, 1)` with `exerciseId` "db-bench-press".
  - **Paused:** the same with PAUSE first: `phase` `paused`, `resumePhase` `set`, `setIndex` 1. RESUME gives `set` at `setIndex` 1.
  - **The pair (unchanged behaviour):** with only (0, 0) logged, the clamp lands on free 2 and stays 2. And the three existing `PLAN_REPLACED` tests pass unedited.
- **AC2 (no free position, not the last item, paused, red on unfixed code)** **Given** item 1 (barbell-row), `setIndex` 2, phase `set`, logged barbell-row sets at (1, 0) and (1, 1), **When** PAUSE, then PLAN_REPLACED for item 1 with `{ ...ROW, exerciseId: "db-row", sets: 2 }`, **Then** the state is `phase` `paused`, `resumePhase` `rest`, `itemIndex` 1, `setIndex` 1, `timer` `{ startedAtMs: T0 + 1000, durationS: 120, pausedMs: 0 }`, and `loggedSets` unchanged (on main: `resumePhase` `set`).
  - **And** RESUME gives `phase` `rest` with `remainingS(timer, T0 + 30_000)` = 120.
  - **And** REST_END after it gives `betweenItems` (the reducer), and the same REST_END through `createFocusStore` gives `next` for item 2 (default check point).
  - **Not paused:** the same without PAUSE gives `phase` `rest`, `setIndex` 1, `timer` `{ startedAtMs: T0 + 2000, durationS: 120, pausedMs: 0 }`.
- **AC3 (no free position, last item, paused, red on unfixed code)** **Given** item 3 (plank, the last item), `setIndex` 1, phase `timed`, a logged plank set at (3, 0), **When** PAUSE, then PLAN_REPLACED for item 3 with `{ ...PLANK, exerciseId: "side-plank", sets: 1 }`, **Then** `phase` is `done`, `timer` null, `resumePhase` null, `pausedAtMs` null and `workoutPausedMs` is 1000 (on main: `paused` with `resumePhase` `timed`).
  - **Not paused:** the same without PAUSE gives `done`, `timer` null, `workoutPausedMs` 0.
- **AC4 (the rest follows the new exercise's type)** In AC2, replacing with an isolation row (a `db-row` library row with `type: "isolation"`) gives `durationS` 60.
- **AC5 (other phases unchanged)** **Given** AC2's logged sets and the swap, **When** the phase is `rest` (with a timer), `next`, `confirm`, or `paused` with `resumePhase` `rest`, **Then** the result equals today's clamp-only result (only `setIndex` changes, to 1). A PLAN_REPLACED for another item is reference-equal to the input.
- **AC6 (every new state restores)** Each result of AC1 (paused), AC2 (paused and not), AC3 (paused and not) passes `isValidFocusState(state, S1, newCtx)`, and a `writeFocusState` then `readFocusState` round trip returns it deep-equal. Also through the store: `createFocusStore(...).replacePlan(newPlan, itemIndex, atMs)` on AC2's paused state writes that state to the storage stub.
- **AC7 (T-0410 tests rescoped, D-0140 §7)** T-0410 AC1, AC1 pair, AC2 and AC2 pair keep their titles and their `RESUME` assertions. Their setup no longer calls PLAN_REPLACED. It builds the paused state directly: `at("paused", { itemIndex, setIndex, resumePhase, pausedAtMs: T0 + 1000, loggedSets })`, with AC1's `{ itemIndex: 1, setIndex: 1, resumePhase: "set" }` and AC2's `{ itemIndex: 3, setIndex: 0, resumePhase: "timed" }` (a state a pre-T-0414 build may have persisted). All four pass. The diff of those four tests touches only the setup lines, and the build log lists them.
- **AC8 (no regression)** Every other `features/UF-09/__tests__/*` test and the UF-09 rows in `tests/e2e/uf-09-focus.spec.ts` pass unedited. The export pin is unchanged. The reducer stays pure (the existing purity tests pass).
- **Red proof:** run AC1, AC2 and AC3 against main's `machine.ts` (after T-0304c merges). All must fail. Record this in the build log.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0414-uf09-plan-replaced-free-position.md`: this file, for the build and accept log.

## Contract impact
none. The `PLAN_REPLACED` event shape is unchanged (it already carries `atMs`). `FocusState` and `persist.ts` are unchanged.

## Coordination
- Files: `features/UF-09/machine.ts` (`planReplaced` only), `__tests__/machine.session.test.ts`, a store-level test.
- Dep T-0304c (UF-09, doing): it changes the timed path in `machine.ts`. Branch from `main` after it merges. If T-0304c gives `timed` a running timer, AC1–AC3 keep their assertions; a timed state left by `planReplaced` follows T-0304c's rule for entering `timed`.
- T-0304d and T-0306b: add T-0414 to their deps (orchestrator, board).
- T-0395 (UF-09 lane, ready) adds `resume-card.tsx` and an `index.tsx` export. Disjoint files, but the same lane, so the orchestrator runs them one after the other.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with `T-0414` and cite the screen (e.g. `T-0414 UF-09.9: a swap to fewer sets moves to the first free set or ends the item`).

## Build / accept log
