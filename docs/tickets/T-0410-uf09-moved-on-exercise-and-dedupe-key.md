---
id: T-0410
title: "UF-09 hardening: RESUME moves on only for a logged set of the current item's exercise, and the recordSet in-flight dedupe key includes exerciseId and source"
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4, UF-09.7, UF-09.9]
decisions: [D-0111, D-0118, D-0071, D-0066]
deps: [T-0304b, T-0304f]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Follow-up from the T-0304b re-review. Both fixes are in `features/UF-09/machine.ts` and `features/UF-09/session.tsx`, and T-0304f (doing) changes the same machine/session files. So this waits for T-0304f to merge. Ready when T-0304f is done. -->

## Why
Two T-0304b guards key on position alone (`itemIndex`, `setIndex`). After a swap, the exercise at
a position can change, so position alone isn't enough:
1. **`movedOnIfLogged` (machine.ts).** On RESUME into `set`/`timed`, it moves on when *any* logged
   set sits at the current `itemIndex:setIndex`. Say the user pauses on barbell-row set 3 of 3
   (with sets 1 and 2 logged) and swaps it to a 2-set exercise. `planReplaced` clamps `setIndex` to
   1, and RESUME finds the old barbell-row set 2 there. It jumps to UF-09.4 Confirm for a set of the
   new exercise that nobody did. This breaks principle 1 (one task on screen), because the screen
   shows a step that doesn't exist.
2. **The recordSet dedupe (session.tsx).** The in-flight map is keyed `${itemIndex}:${setIndex}`.
   A second log for the same position is merged into the pending Done set write, even when it is a
   different exercise (after a swap) or a deliberate List-view log (UF-09.9 → T-0305a). It is
   silently dropped and resolves with the other set's entry: a lost set.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - `machine.ts` `movedOnIfLogged`: the entry must also have
    `entry.exerciseId === ctx.plan.items[state.itemIndex].exerciseId`. With no such entry, it returns
    `state` as it is.
  - `session.tsx`:
    - `FocusSetInput` gains an optional `source?: "focus" | "list"` (default `"focus"`).
    - The in-flight key becomes `` `${source}:${itemIndex}:${setIndex}:${exerciseId}` ``.
    - `source` is removed before the input goes to `lib/offline` `recordSet`.
    - The `FocusSession.recordSet` doc comment names the key.
  - New cases in `__tests__/machine.test.ts` (or `machine.session.test.ts`) and
    `__tests__/session.writes.test.tsx`.
- Out:
  - Which machine event a List-view log of the *current* set dispatches. That is T-0305a's
    decision. `writeSet`'s position-based dispatch is unchanged.
  - `planReplaced`'s `setIndex` clamp.
  - `lib/offline/**`.
  - The List view itself (T-0305a).

### Edge cases that are in scope
- **Offline:** both guards are local (machine state and an in-memory map). Nothing waits on the
  network.
- **Swap while paused** to fewer sets, for a reps item and for a timed item (AC1, AC2).
- **Remount while a write is pending** (the T-0304b reason for the dedupe) still gives one row
  (AC3).

## Acceptance criteria
Each new test title starts with `T-0410 ACn`. P1 and the L1 fixtures. Where a test needs `db-row`,
it adds an L1 row to its own ctx library: `db-row`, compound, `["dumbbell", "bench"]`,
`{ back: 1, arms: 0.5 }`, increment 2.5. The swap item is `{ ...ROW, exerciseId: "db-row", sets: 2 }`.
Both values of every condition get a test.
- AC1 (reps, red on unfixed code) **Given** the machine at item 1 (barbell-row), `setIndex` 2,
  phase `set`, with logged barbell-row sets at (1, 0) and (1, 1), **When** PAUSE, then PLAN_REPLACED
  for item 1 with the db-row item (setIndex clamps to 1), then RESUME run, **Then** the phase is
  `set`, `itemIndex` 1, `setIndex` 1, and `timer` is unchanged from the resumed state. On main the
  phase is `confirm`.
  - **The pair:** the same, but a db-row set is logged at (1, 1) while paused (SET_LOGGED). RESUME
    gives phase `confirm` with the auto-save timer, as T-0304b does today.
- AC2 (timed, red on unfixed code) **Given** the machine at item 3 (plank), `setIndex` 1, phase
  `timed`, with a logged plank set at (3, 0), **When** PAUSE, then PLAN_REPLACED for item 3 with
  `{ ...PLANK, exerciseId: "side-plank", sets: 1 }` (a timed L1-style row added to the ctx library),
  then RESUME run, **Then** the phase is `timed` at `setIndex` 0. On main it leaves `timed`.
  - **The pair:** with a side-plank set logged at (3, 0) while paused, RESUME gives the same state
    that `TIMED_RECORDED` at that `atMs` would give.
- AC3 (dedupe still holds) **Given** `queueRecordSet` held pending, **When**
  `session().recordSet(input)` is called twice with the same `itemIndex` 0, `setIndex` 0,
  `exerciseId` "bench-press" and no `source`, **Then** `lib/offline` `recordSet` is called once and
  both calls resolve to the same `clientId`. The same holds for two `source: "list"` calls.
- AC4 (a different exercise isn't merged, red on unfixed code) **Given** a held pending bench-press
  write at (0, 0), **When** `recordSet` is called for (0, 0) with `exerciseId` "db-row", **Then**
  `lib/offline` `recordSet` is called twice, the two results have different `clientId`s, and
  `loggedSets` holds both once each write resolves.
- AC5 (a List-view log isn't merged, red on unfixed code) **Given** a held pending focus write for
  bench-press (0, 0), **When** `recordSet({ ...sameInput, source: "list" })` is called, **Then**
  `lib/offline` `recordSet` is called twice, with two distinct `clientId`s. Neither call's argument
  has a `source` key.
- AC6 (key cleared) After the held write resolves, a new call with the same key makes a new
  `lib/offline` `recordSet` call (T-0304b behaviour, pinned).
- AC7 (no regression) Every existing `features/UF-09/__tests__/*` test and the UF-09 rows in
  `tests/e2e/uf-09-focus.spec.ts` pass unedited. The export pin is unchanged.
- **Red proof:** run AC1, AC2, AC4 and AC5 (the red-marked halves) against main's `machine.ts` and
  `session.tsx`. All must fail. Record this in the build log.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0410-uf09-moved-on-exercise-and-dedupe-key.md`: this file, for the build and accept log.

## Contract impact
none. `FocusSetInput.source` is a UF-09-internal type (the `useFocusSession()` API, D-0071 §5). It
is optional, so every existing caller compiles unchanged.

## Coordination
- Files: `features/UF-09/machine.ts`, `features/UF-09/session.tsx`, and their tests.
- Dep T-0304f (UF-09, doing): it changes the machine and the session hook. Branch from `main` after
  it merges.
- T-0409 (UF-09, ready) edits `weight-input.ts` and `confirm-set.tsx` and their tests. The files
  are disjoint, so the two can run in parallel. T-0233 edits only T-0409's `confirm-set.test.tsx`
  lines.
- T-0304c (UF-09, todo, after T-0304f) also touches the timed path in the machine. Run T-0410 and
  T-0304c one after the other, in either order.
- Note for T-0305a: the List view calls `recordSet` with `source: "list"`.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with
`T-0410` and cite the screen (e.g. `T-0410 UF-09.9: resume moves on only for the current exercise's
set`).

## Build / accept log

### Build 2026-10-02 (frontend-dev)
- `machine.ts` `movedOnIfLogged`: the logged entry at `itemIndex:setIndex` must also have the
  current item's `exerciseId`; otherwise RESUME returns the resumed state as is. Still pure.
- `session.tsx`: `FocusSetInput.source?: "focus" | "list"` (default `"focus"`). The in-flight key
  is `${source}:${itemIndex}:${setIndex}:${exerciseId}`. `source` is destructured off before
  `writeSet`, so `lib/offline` `recordSet` never sees it. The `FocusSession.recordSet` doc names
  the key. `writeSet`'s position-based dispatch is unchanged.
- Tests: `__tests__/machine.session.test.ts` "T-0410 RESUME after a swap while paused" (AC1, AC1
  pair, AC2, AC2 pair; `db-row` and `side-plank` rows added to the test's own ctx library);
  `__tests__/session.writes.test.tsx` "T-0410 recordSet in-flight dedupe key" (AC3 no source and
  `source: "list"`, AC4, AC5, AC6), with the first `lib/offline` `recordSet` held on a deferred
  gate and then run for real; every promise is resolved, so no unhandled rejections.
- **Red proof** (new tests against main's `machine.ts` and `session.tsx`, before the fix):
  6 failed / 51 passed. AC1 (phase was `confirm`), AC2 (left `timed`: phase `done`), AC4 and AC5
  (`recordSet` called 1 time, expected 2) all failed, as did the AC2 pair (its plain-RESUME
  baseline left `timed`) and AC3's `source: "list"` half (`source` reached `lib/offline`). AC3 (no
  source) and AC6 passed on main, as they pin T-0304b behaviour.
- AC7: no existing UF-09 test or e2e row edited; the export pin is unchanged.
