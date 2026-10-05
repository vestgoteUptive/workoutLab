---
id: T-0472
title: "UF-03.1: unchecking a logged added row after a reload keeps the row (unchecked, with its values) and keeps focus on its toggle; plus T-0457 AC-6's untested timed-focus case (folds in T-0473)"
lane: web-feature:UF-03
screens: [UF-03.1]
decisions: [D-0142, D-0164, D-0071, D-0182]
deps: [T-0457]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main b99a184 (D-0182 §2). From the T-0457 review
(T-0472) and accept (T-0473, folded in here: same lane, same test file, one small diff). Build flow:
wl-build-web. About ¼ day. -->

## Why
T-0457 shipped "+ Add set" in the UF-03.1 List view. `Rows` in `features/UF-03/ListView.tsx`
builds a card's rows from three sources: the planned positions, the logged sets above the plan
(`loggedHere`), and the rows added in this mount (`added`, component state).

Within one mount, unchecking an added row keeps it, because `added` still holds it. After a
reload, `added` is empty, and a logged added row (say row 5) is on screen only because
`ctx.loggedSets` holds it. Unchecking it calls `ctx.deleteSet`, the set leaves `loggedSets`, and
the row disappears. The checkbox that had focus is removed, so focus drops to `<body>`. A
keyboard or screen-reader user loses their place mid-workout, and anyone who unchecked by
mistake can't simply re-check. The same tap gives different results depending on whether the
page was reloaded.

The fix (D-0182 §2) makes both cases behave the same: the row stays, unchecked, with the values
it was logged with, and focus stays on its toggle. That's the in-mount behaviour and D-0142 §3's
"checked, edited and unchecked exactly as T-0417's rows are". Moving focus to "+ Add set" was
considered and rejected: it would leave the row gone, so undoing a mis-tap would take two steps
and the user would have to re-enter the values.

T-0473 is folded in. T-0457 AC-6 says focus moves to the seconds field on a timed item, and no
test covers it.

## Scope
- In (`apps/web/src/features/UF-03/`):
  - Unchecking a logged row whose `setIndex` is at or above the planned count (`setCount(item)`)
    keeps that row in the card after the delete resolves:
    - unchecked;
    - with the values it was logged with (kg, reps or seconds) as its opening values;
    - at the same index, so re-checking it records the same `setIndex`;
    - rendered by the **same** `SetRow` element (no remount), so focus stays on its checkbox.

    One way to do it: when such a row is unchecked, `Rows` records it in `added` with its logged
    values before the delete. The builder may pick another, but the ACs must hold.
  - This applies to any logged row above the plan, whether it was added in this mount or came
    from a reload. A row the user never logged is unchanged: collapsing the card or reloading
    still drops it (T-0457 scope).
  - A vitest for T-0457 AC-6's timed variant (T-0473).
- Out:
  - Removing an added row (T-0457 left that out; still out).
  - Planned rows. They always render, so they never had this problem.
  - Any change to `ctx.deleteSet` / `ctx.recordSet` or to the host (`features/UF-09`).
  - e2e. The real-host vitest (AC-3) covers the reload through `SessionHost`.

### Edge cases that are in scope
- **Offline:** unchecking writes a tombstone through `ctx.deleteSet` offline like any row. AC-3
  runs offline.
- **Delete fails:** the row stays logged and shows `uf03.rowSaveFailed`, as today (AC-4).
- **A logged set far above the plan** (setIndex 6 on a 4-set item, from another device): unchecking
  it keeps row 7, and the next "+ Add set" still gives index 7 + 1 = 8 (AC-2).

## Acceptance criteria
Each test title starts with `T-0472 AC-n`. Unit tests use `list-view.addset.test.tsx`'s setup:
`makeCtx`, `logged`, `settle`, the `four` sets (back-squat rows 1–4 at 100 × 6, 100 × 6,
100 × 5, 100 × 5), and fake `Date` only. "Reload" in a unit test means the first render already
has the above-plan set in `ctx.loggedSets`, so `added` is empty. That's the state a remount
leaves.

- **AC-1 (the row stays, focus stays, red on main)**
  - **Given** a mount with `loggedSets: [...four, row5]`, where `row5` is
    `{ ...logged(0, 4, "back-squat", 5, 100), clientId: "c-5" }`, and the toggle
    "Mark set 5 not done" is focused.
  - **When** it is clicked, the delete settles, and the view is re-rendered with
    `loggedSets: four` (what the host does after the tombstone).
  - **Then**:
    - `ctx.deleteSet` was called once, with `"c-5"`;
    - a checkbox "Mark set 5 done" exists, unchecked, and is the **same DOM node** that was
      clicked;
    - `document.activeElement` is that checkbox (not `document.body`);
    - "Set 5 weight in kg" reads `100` and "Set 5 reps" reads `5`.

  **Red:** on main, "Mark set 5 done" doesn't exist and `document.activeElement` is
  `document.body`.
- **AC-2 (re-check and the index rule)**
  - After AC-1, clicking "Mark set 5 done" calls `ctx.recordSet` once with `setIndex: 4`,
    `weightKg: 100`, `reps: 5`, `backoff: false`, `itemIndex: 0`.
  - **Given** `loggedSets: [{ ...logged(0, 6, "back-squat", 4, 95), clientId: "c-7" }]`,
    **when** "Mark set 7 not done" is unchecked and the view is re-rendered with no logged
    sets, **then** row 7 is still shown, unchecked, with `95` / `4`. Pressing "+ Add set" then
    gives row 8 ("Set 8 reps" exists).
- **AC-3 (through a real reload)** Extend `list-view.addset.host.test.tsx`'s AC-4 flow. After the
  remount, row 5 shows done. Focus "Mark set 5 not done" and click it. Then:
  - `await screen.findByRole("checkbox", { name: "Mark set 5 done" })` resolves;
  - `document.activeElement` is that checkbox;
  - "Set 5 weight in kg" reads `100`;
  - the tombstone landed: the set for index 4 carries `deletedAt` not null in IndexedDB.

  Check the tombstone the same way T-0417's host uncheck test (`list-view.logging.host.test.tsx`)
  already does, whether that reads the session's sets or the queue.
- **AC-4 (failed delete)** With `ctx.deleteSet` rejecting, unchecking row 5 (AC-1's Given)
  leaves "Mark set 5 not done" checked and shows `uf03.rowSaveFailed` in that row's
  `[data-part="row-status"]`. The view is not re-rendered, since nothing was deleted.
- **AC-5 (T-0473: timed focus)**
  - **Given** a plan whose item 0 is the timed `plank` (the item and the `PLANK` library entry
    from `list-view.logging.test.tsx`: `durationS: 45`, no reps, no weight), with that library
    seeded.
  - **When** "+ Add set" is pressed.
  - **Then** `document.activeElement` is the textbox "Set 5 seconds", and its value is `45`.

  This test is green on main, so prove it with a planted fault: on a backup copy, remove
  `ref={showKg ? undefined : firstField}` from the seconds input. AC-5 must fail. Restore with
  `cp`.

**Red proof.** Run AC-1 and AC-3 on main: both must fail. Then plant one fault on a backup copy:
key the rows by `` `${i}-${logged ? "l" : "u"}` `` (a remount on uncheck). AC-1's same-node and
focus checks must fail. Restore with `cp`. Record every run, AC-5's planted fault included.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `docs/tickets/T-0472-uf03-uncheck-added-row-after-reload.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red runs and the planted faults recorded.
- `tests/e2e/uf-03-list-summary.spec.ts` is green (that one spec, through
  `scripts/locked.sh heavy`, D-0178).
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0472` and cite UF-03.1.

## Notes
- **Parallel:** the only UF-03 ticket in flight (D-0164 §1: one UF-03 ticket at a time). Runs
  alongside T-0343 (UF-10) and T-0443 (web-shell). T-0443 touches no UF-03 file.
- T-0473 is closed as folded into this ticket (D-0182 §2).

## Build / accept log
