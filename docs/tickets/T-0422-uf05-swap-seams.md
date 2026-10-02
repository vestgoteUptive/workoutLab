---
id: T-0422
title: "UF-05.1 mounted in focus mode: the swap seam on UF-09.9 Paused and UF-09.6 Next exercise (seams.tsx), the D-0142 §7 target, apply → ctx.replaceItem persisted offline, the stored plan round-trips through parseSessionPlan; the swap e2e"
lane: web-feature:UF-05
screens: [UF-05.1, UF-09.9, UF-09.6, UF-09.3, UF-09.4, UF-09.5]
decisions: [D-0142, D-0153, D-0160, D-0069, D-0071, D-0093, D-0111, D-0118, D-0120, D-0140, D-0149, D-0086, D-0156]
deps: [T-0421, T-0304d, T-0414]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. Second child of the T-0306b board row (D-0142 §1 §6 §7). Re-checked against main after T-0421 and T-0304d merged (2026-10-02 groom). SwapSheet's props are `{workout, itemIndex, onApply(result: Workout), onClose, timeZone?}`. seams.tsx still has both arrays `[]`, and ORDER already places `swap`. AC-7 now carries the D-0153 §2 confirm rule, which adds one listed extra in machine.ts. Build flow: wl-build-web. About ⅔ day. It edits features/UF-09/seams.tsx and machine.ts, so it never runs in parallel with T-0415 or T-0416. -->

## Why
- **UF-05.1 mid-session (D-0069 §6, D-0071 §4 §7):** the user replaces an exercise without leaving focus mode. It is reachable only from UF-09.9 Paused and UF-09.6 Next exercise, so the set screens stay one task (principle 1).
- **D-0071 §6:** the new plan is saved as the whole row through `ctx.replaceItem`, offline-safe.
- **D-0093 §7:** the stored plan must stay a valid `SessionPlan` v1.

## Scope
- In:
  - **`features/UF-09/seams.tsx`**, the seam grant (D-0071 §4). A `swap` entry is added to both `pauseSeamActions` and `nextSeamActions`:
    - label "Swap" (`en.uf05`), `keepsClockRunning: false`;
    - `render(ctx)` gives `<SwapSheet workout={ctx.workout} itemIndex={target} onApply={…} onClose={ctx.close} />`, where `target` is the D-0142 §7 rule, as a pure helper in `seams.tsx`;
    - `onApply(result)` returns `ctx.replaceItem(target, result.plan.items[target], result.plan.mainLiftId)` and then calls `ctx.close()`;
    - it may be `lazy()`-loaded (D-0142 §8).
  - **The UF-09 pins these entries change** (D-0142 §6, a named change listed in the build log).
  - **`features/UF-09/machine.ts` `planReplaced`: the D-0153 §2 confirm branch.** A swap of the current item while UF-09.4 is in play (`confirm`, or paused from it) saves the recorded set as recorded and moves on as `SAVED` with no edit would. This is the one `machine.ts` change. The T-0414 AC5 clamp-only pin drops its `confirm` row (a named change).
  - **A new e2e file,** `tests/e2e/uf-05-swap.spec.ts` (D-0071 §10).
  - Strings in `flows/uf-05.ts`.
- Out:
  - The sheet's own behaviour (T-0421), and the List view's Swap (T-0418).
  - Any UF-09 source file other than `seams.tsx`, the `planReplaced` branch in `machine.ts` and the D-0156 §1 filter in `prefill.ts`. If the host lacks something, that is a follow-up for web-feature:UF-09.
  - A swap from UF-09.3/.4/.5/.7 directly. Those screens stay one task, and Pause is the way in.
  - "Also replace in my routine" (D-0069 §7).

### Edge cases that are in scope
- **Offline:** apply writes through `replaceItem` → the queue, and a reload shows the new exercise (AC-5, AC-10).
- **Time running out:** an "Over your time" candidate can be applied (T-0421 AC-5). The next check point uses the new plan's costs (the plan the store holds).
- **Zero history:** the new item shows the engine's `first_time` "Set weight" on UF-09.3 (AC-5).
- **Returning after 10 days off:** the engine's `hold_after_break` pre-fill renders on UF-09.3 as given (T-0421 AC-7 is the engine half).
- **Reload mid-swap:** the sheet isn't persisted. A reload with it open restores `paused` (AC-2).

## Acceptance criteria
**Test setup.** As T-0304d: the real `SessionHost` with the **module** arrays (no `seams` prop), plan P1 (`__tests__/fixtures.ts`: bench-press × 4 main, barbell-row × 3, leg-curl × 3, plank × 2), `fake-indexeddb`, a signed-in user, `locale="en-GB"`, `timeZone="UTC"`, the real `rankSwaps`/`applySwap`, and the real `upsertSession` in a spy. The cache has a beginner, full-equipment profile and engine L1. Unit tests of the `swap` entry's `render`/`onApply` pass a test-built `ctx`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC except AC-9 (a pin) must fail on `main` as of this groom (the arrays have no `swap`, and `planReplaced` clamps `confirm` only). No new UF-09 test sets `document.body.innerHTML`, because the T-0424 AC-3 guard scans `features/UF-09/__tests__/`; use `cleanup()` or `unmount()`. SwapSheet tests freeze `Date` alone (D-0160 Consequences). Host tests use the UF-09 `useFakeClock` + `flushReal` helpers. The build log records these planted faults turning their ACs red:
- `target = ctx.currentItemIndex` always (AC-3);
- `replaceItem` without the third argument (AC-6);
- a direct `upsertSession` call in the seam (AC-5);
- the old `confirm` clamp-only branch restored in `planReplaced` (AC-7);
- the `exerciseId` filter removed from `nextSetPrefill` (AC-5 load line, AC-11);
- `"Couldn't load alternatives."` restored to `SEAM_SENTINELS["UF-05"]` (`build.test.ts` AC-A6 red), and, on a scratch copy, a side-effect `import "../features/UF-05/index.js"` in `src/app` with the copy sentinel gone (AC-12: §3 still fails on `wl-uf05`).

- **AC-1 (entries and order, D-0071 §4)**
  - **The arrays.** `pauseSeamActions` and `nextSeamActions` each contain one `swap` entry with `keepsClockRunning: false`.
  - **UF-09.9.** The order is Resume · Swap · Skip to next exercise · (How to · List view, if T-0416 has landed) · End workout.
  - **UF-09.6.** The step's buttons are "I'm ready" then "Swap" (with the chrome's "Pause workout").
  - **The diff** touches `features/UF-09` source only in `seams.tsx`, `machine.ts` `planReplaced` and `prefill.ts` (D-0156 §1). In `features/UF-09/__tests__` it changes only the D-0142 §6 pins and the T-0414 AC5 `confirm` row (D-0153 §2), adds cases to `prefill.test.ts` (D-0156 §1), and adds `t0422*` files. Record `git diff --stat main...HEAD -- apps/web/src/features/UF-09` in the build log (not in a test).
  - **No import of UF-09.** `features/UF-05` has no import of `features/UF-09` (the T-0421 source test still passes).
- **AC-2 (Swap from UF-09.9)**
  - **Opens.** Paused from barbell-row set 2 (`resumePhase: "set"`, item 1, set index 0 logged), "Swap" shows the dialog "Replace Barbell row" in place of UF-09.9.
  - **The clock stays paused.** After 10 min of fake time with the sheet open, the stored state is deep-equal to before.
  - **Cancel** returns to UF-09.9 with the plan deep-equal to before and no `upsertSession` call.
  - **Reload.** A remount with the sheet open restores UF-09.9 paused.
  - **No way out.** There is no `a[href]` in the DOM while the sheet is open.
- **AC-3 (which item, D-0142 §7)**
  - **Finished item.** Paused in the rest after bench-press set 4 (all 4 logged), "Swap" opens "Replace Barbell row" (item 1).
  - **The pair.** Paused in the rest after bench-press set 2, it opens "Replace Bench press".
  - **Skipped.** With bench-press complete and item 1 in `skippedItems`, it opens "Replace Leg curl".
  - **None left.** With every set of P1 logged, it opens the current item.
- **AC-4 (Swap from UF-09.6)**
  - **Opens.** On UF-09.6 for item 1 with 50 s left, "Swap" opens "Replace Barbell row" (the upcoming item).
  - **The countdown stops.** After 90 s of fake time with the sheet open, Cancel returns to UF-09.6 with 50 s left (the host's PAUSE/RESUME, D-0071 §4).
  - **Apply** returns to UF-09.6, now showing the new exercise's name, and the countdown runs on from 50 s.
- **AC-5 (apply persisted offline, D-0071 §5 §6, D-0093 §7)** With `navigator.onLine = false`, from AC-2's state, picking db-row and "Use Db row":
  - **The call.** `ctx.replaceItem(1, result.plan.items[1], result.plan.mainLiftId)` runs once, and `features/UF-05` makes no `upsertSession` call (spy).
  - **The stored row.** The IndexedDB row's plan has `items[1].exerciseId` "db-row". Its other fields are deep-equal to before, and `parseSessionPlan(row.plan)` is `ok`.
  - **After Resume,** UF-09.3 shows "Db row", "Set 2 of 3", and the load line "Set weight" with "8 reps" (the engine's `first_time` pre-fill, D-0118 §9).
  - **Logging.** The logged barbell-row set keeps `exerciseId "barbell-row"`. The next Done set records `exerciseId "db-row"` at `setIndex: 1`, and no two live sets share an `(itemIndex, setIndex)` (D-0140).
  - **Remount.** A remount of the host reads "Db row" back.
- **AC-6 (main slot)** Swapping item 0 (bench-press) to push-up under "Equipment taken" calls `replaceItem(0, item, "push-up")`. The stored `plan.mainLiftId` is "push-up", and `items[0].isMain` is true.
- **AC-7 (a swap while UF-09.4 is in play, D-0153 §2, amends D-0140 §1)**
  - **Reducer, paused.**
    - Given: `paused` with `resumePhase: "confirm"` on item 1, barbell-row sets `(1, 0)` and `(1, 1)` logged (set 2 recorded, `setIndex: 1`), `pausedAtMs: P`.
    - When: `PLAN_REPLACED` for item 1 with db-row × 3.
    - Then: `phase: "paused"`, `resumePhase: "rest"`, `setIndex: 1`, and `timer: {startedAtMs: P, durationS: restFor("db-row"), pausedMs: 0}`. `loggedSets` is deep-equal to before, so both entries keep `exerciseId: "barbell-row"`, and the state passes `isValidFocusState`.
    - Red on main: the state is unchanged (`resumePhase: "confirm"`).
  - **Reducer, running.** The same from `phase: "confirm"` (no pause) gives `phase: "rest"` with the rest starting at the event's `atMs`.
  - **Reducer, fewer sets.** Given `confirm` at `(1, 2)` (all three barbell-row sets logged), a swap to an item with 2 sets gives `rest` at `setIndex: 1`, and `REST_END` then reaches `betweenItems`.
  - **Reducer, last item.** A swap of item 3 while paused from `confirm` on its last set gives `done`, ends the pause (`resumePhase: null`, `pausedAtMs: null`, `workoutPausedMs` grows by `atMs − P`), and passes `isValidFocusState`.
  - **The pair.** A `PLAN_REPLACED` for another item while paused from `confirm` returns the same state object. The T-0414 AC5 rows for `rest`, `next` and paused-on-rest stay clamp-only and unedited.
  - **Host.**
    - Given: paused from UF-09.4 with barbell-row set 2 recorded. Swap → db-row → "Use Db row" (offline). The D-0142 §7 target is item 1, because set index 2 is still unlogged.
    - Then Resume shows UF-09.5 (rest), not UF-09.4.
    - The rest's end shows UF-09.3 "Db row" "Set 3 of 3". The next Done set records `exerciseId "db-row"` at `setIndex: 2`.
    - The queued barbell-row sets are unchanged (`lib/offline` spy: no `editSet` call), and no two live sets share a position.
  - **Host pair.** Paused from UF-09.4 on bench-press set 4 of 4 (item 0 complete), Swap targets item 1 (D-0142 §7). After "Use …" and Resume, UF-09.4 shows bench-press with the recorded values. Save leads to UF-09.5 and then UF-09.6 with the new item 1 name.
- **AC-8 (strings and a11y)** Every new string is in `en.uf05` (`react/jsx-no-literals` green). The vitest axe helper finds 0 violations with the sheet open over UF-09.9 and over UF-09.6.
- **AC-9 (unchanged surfaces)** The UF-09 `index.tsx` export pin and `features/UF-05/index.tsx`'s pin (exactly `SwapSheet`) are unchanged. The T-0304a AC-2 tick-counting test still passes.
- **AC-10 (e2e, new file `tests/e2e/uf-05-swap.spec.ts`)** In the preview build, offline, with the T-0904 guard (D-0086):
  - Seed a P1-like session row and its library and profile cache (an in-spec seed, the `uf-09-focus.spec.ts` pattern).
  - Pause → Swap by keyboard. The first option row is ≥ 44 px tall (`boundingBox()`).
  - Pick the first option and "Use …", then Resume. UF-09.3 shows that option's name.
  - **After a reload,** the IndexedDB `wl-offline.sessions` row's plan has the new exercise, and UF-09 shows it.
  - **axe** on the open sheet reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed request.
- **AC-11 (the pre-fill after a swap, D-0156 §1, amends D-0118 §7)** Unit tests in `features/UF-09/__tests__/prefill.test.ts`, calling `nextSetPrefill` directly. Only add cases; the existing cases stay unedited.
  - **Same exercise carries.** Item 1 is barbell-row (`prefill {weightKg: 60, reps: 8}`). `loggedSets` holds `(1, 0)` barbell-row at 62.5 kg × 7. Set index 1 gives `{weightKg: 62.5, reps: 7}`.
  - **A swapped exercise doesn't carry.** The plan's item 1 is now db-row (`prefill {weightKg: null, reps: null}`, `repsMin: 8`). The same `(1, 0)` barbell-row entry is in `loggedSets`. Set index 1 gives `{weightKg: null, reps: 8}`. This is red on main.
  - **Mixed history.** Item 1 is db-row, with `(1, 0)` barbell-row and `(1, 1)` db-row at 20 kg × 10 logged. Set index 2 gives `{weightKg: 20, reps: 10}`.
  - **Swap back.** Item 1 is barbell-row again, with the `(1, 0)` barbell-row entry. Set index 1 carries `{62.5, 7}`.
  - **Per-field fallback.** Same exercise, with a saved `weightKg: null` on a loaded lift. The weight falls back to set 1's value and the reps carry, as before.
  - **Host.** AC-5's load line ("Set weight", "8 reps") passes with the test unedited. AC-7 Host's UF-09.5 "Next" line, after the swap from UF-09.4, does not show barbell-row set 2's weight (an added assertion in the `t0422*` host test).
  - **Nothing else moved.** Every existing UF-09 test passes unedited. If any existing test other than the TR-0043-labelled one pins a carry across exercises, stop and raise triage. Don't edit it.
- **AC-12 (the UF-05 sentinel, D-0156 §2, amends D-0144 §3c)**
  - **The list.** In `apps/web/build.test.ts`, `SEAM_SENTINELS["UF-05"]` is exactly `["wl-uf05"]`. Its comment cites D-0156 and says that flow strings are in the entry by design (D-0071 §1), so copy can't be a sentinel.
  - **No other edit.** No other line of `build.test.ts` changes: §3a, §3b, the route-folder and accounted-for tests, and the sentinel loop.
  - **Green.** With T-0422's mount, "AC-A6 … no seam-mounted feature is in the entry chunk" passes.
  - **Still guards.** The two planted faults in the Test rules are recorded in the build log. They are scratch-only and reverted.

## Paths you may change
- `apps/web/src/features/UF-05/**` (the lane: `web-feature:UF-05`).
- **Listed extras:**
  - `apps/web/src/features/UF-09/seams.tsx`: the `swap` entries and their target helper (D-0071 §4, D-0142 §7).
  - `apps/web/src/features/UF-09/machine.ts`: the `planReplaced` confirm branch (D-0153 §2), and its doc comment.
  - `apps/web/src/features/UF-09/__tests__/*.test.tsx`: the D-0142 §6 pins these entries change, plus new `t0422*` test files. The pins are the module-array contents in `seams.test.tsx` AC-9 and its two "with the module arrays" rows, `paused.test.tsx` "the pair: with the module arrays …", `next-exercise.test.tsx` "the pair: with the module arrays only I'm ready …", and the UF-09.9 and UF-09.6 button counts.
  - `apps/web/src/features/UF-09/__tests__/machine.session.test.ts`: only the `confirm` row of "T-0414 AC5 rest, next, confirm and paused-on-rest keep the clamp-only result" (D-0153 §2, a named change).
  - `apps/web/src/features/UF-09/__tests__/t0422*.test.ts`: new reducer test files.
  - `tests/e2e/uf-09-focus.spec.ts`: the UF-09.9 button count in its seeded-session row (line 221 on main: 2 becomes 3, D-0142 §6).
  - `tests/e2e/uf-05-swap.spec.ts`: a new file (D-0071 §10).
  - `tests/e2e/fixtures/**`: additive exports (D-0071 §10).
  - `apps/web/src/lib/i18n/flows/uf-05.ts`: this flow's strings file (D-0071 §1); add keys.
  - `apps/web/src/features/UF-09/prefill.ts`: only the D-0156 §1 `exerciseId` filter in `nextSetPrefill` and its doc comment (web-feature:UF-09 lane, granted by D-0156 §3).
  - `apps/web/src/features/UF-09/__tests__/prefill.test.ts`: added AC-11 cases only.
  - `apps/web/build.test.ts`: only the `SEAM_SENTINELS["UF-05"]` value and its comment (web-shell lane, granted by D-0156 §3 as a named exception to D-0144 §5).
  - `docs/tickets/T-0422-uf05-swap-seams.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (from `seams.tsx`), `@workoutlab/shared` (`parseSessionPlan`, tests), `lib/offline` (tests), the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The plan is written as `SessionPlan` v1 through the queue, as a whole row (D-0071 §6).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `check:size` green · contracts unchanged · commits start `T-0422` and cite the screen (for example `T-0422 UF-05.1: swap seam on UF-09.9`).

## Notes
- **Flow:** `wl-build-web`.
- **T-0306b is done** when T-0421 and T-0422 are.
- **Parallel (2026-10-02 groom):**
  - **Never with T-0415 or T-0416** (D-0142 §1). T-0415 also edits `machine.ts`.
  - **With T-0423 and T-0424, allowed.** They don't touch `seams.tsx`, `machine.ts`, `paused.test.tsx`, `seams.test.tsx`, `next-exercise.test.tsx` or `machine.session.test.ts`. T-0423 AC-6 needs `host.chrome.test.tsx` unedited, and this ticket must not edit it either. If a `host.chrome.test.tsx` pin breaks, wait for T-0423 to merge first.
  - **With T-0435, allowed.** T-0435 edits `session.tsx` and adds `t0435*` tests, so there is no shared file.
  - **With T-0433, allowed.** It is in the UF-03 lane.
  - **Before T-0394, preferably.** T-0394's "Back closes a seam overlay" (host.tsx) should be tested against this real swap overlay.
- **T-0303c and T-0418** mount the same `SwapSheet`, not this seam, so they don't depend on this ticket.

- **TR-0043 (2026-10-02), resolved by D-0156:**
  - D-0156 folds the pre-fill filter and the sentinel change into this ticket (AC-11, AC-12).
  - This ticket still merges only after T-0423 merges and the `host.chrome.test.tsx` pins are updated (see Parallel).
  - The new files don't overlap T-0304g (host.tsx, ring.tsx, rest.tsx) or T-0424.
- **From T-0414 review (2026-10-02):** D-0140 left a swap from `confirm` out of scope. D-0153 §2 now settles it, and it is AC-7.

## Build log (frontend-dev, 2026-10-02)
**Status (attempt 1): needs-triage (TR-0043).** Superseded by the attempt 2 log below: TR-0043 is resolved by D-0156, and the branch is done.

### What changed
- **`features/UF-09/seams.tsx`.** One `swap` entry is in both arrays: label `en.uf05.swapAction` ("Swap"), `keepsClockRunning: false`.
  - It `lazy()`-loads `SwapSheet` from `../UF-05/index.js` (D-0142 §8).
  - `swapTarget(ctx)` is the pure D-0142 §7 helper.
  - `onApply` awaits `ctx.replaceItem(target, result.plan.items[target], result.plan.mainLiftId)`, then calls `ctx.close()`. A rejection leaves the sheet open with T-0421's save notice.
  - The label is read as `const { uf05 } = en`. The UF-09 strings scan (`exports-and-lint.test.ts`, which T-0423 AC-6 pins unedited) bans the literal `en.uf0X` in UF-09 sources. This file is the seam flow's one grant (D-0071 §4).
  - The dynamic `import()` also keeps the T-0304e pin "seams.tsx imports nothing from UF-03/04/05 (static)" green.
- **`features/UF-09/machine.ts`.** `planReplaced` has the D-0153 §2 confirm branch (`savedBySwap`) and its doc comment.
- **`flows/uf-05.ts`.** Adds `swapAction: "Swap"`.
- **Named pin changes (D-0142 §6, D-0153 §2):**
  - `seams.test.tsx` AC-9: the arrays hold exactly `["swap"]`, and both "with the module arrays" rows are the real lists.
  - `paused.test.tsx`: "actions: …", "the pair: with the module arrays …", "hidden on the last item", "hidden in a pause taken on UF-09.8", and the AC-8 Cancel list. Each UF-09.9 list gains "Swap".
  - `next-exercise.test.tsx`: "the pair: with the module arrays …" is now `["Pause workout", "I'm ready", "Swap"]`.
  - `machine.session.test.ts`: the T-0414 AC5 clamp-only row for `confirm` is dropped.
  - `tests/e2e/uf-09-focus.spec.ts` AC-7: the UF-09.9 button count goes from 2 to 3.
- **New files:**
  - `t0422.machine.test.ts`, `t0422.seams.test.tsx`, `t0422.host.test.tsx`;
  - `tests/e2e/uf-05-swap.spec.ts`.

`git diff --stat main...HEAD -- apps/web/src/features/UF-09`:
```
 __tests__/machine.session.test.ts   |   4 +-
 __tests__/next-exercise.test.tsx    |  11 +-
 __tests__/paused.test.tsx           |  25 +-
 __tests__/seams.test.tsx            |  29 +-
 __tests__/t0422.host.test.tsx       | 730 ++++
 __tests__/t0422.machine.test.ts     | 163 ++++
 __tests__/t0422.seams.test.tsx      | 240 ++++
 machine.ts                          |  29 +-
 seams.tsx                           |  65 +-
 9 files changed, 1266 insertions(+), 30 deletions(-)
```

### AC → test
| AC | Tests |
|---|---|
| AC-1 | `t0422.seams` "each array holds one swap entry …"; `seams.test` AC-9 (arrays, UF-09.6/UF-09.9 lists); `paused.test` "the pair: with the module arrays …"; `next-exercise.test` "the pair: …"; UF-05 `exports-and-lint` (no UF-09 import, unchanged). The diff stat is above. |
| AC-2 | `t0422.host` "T-0422 AC-2 …": opens, the clock stays paused (10 min), Cancel, reload, no way out |
| AC-3 | `t0422.host` "T-0422 AC-3 …" (finished, pair, skipped, none left); `t0422.seams` "AC-3 swapTarget" (pure, both values) |
| AC-4 | `t0422.host` "T-0422 AC-4 …": opens, the countdown stops (90 s → 0:50), the pair (runs without the sheet), apply → new name, runs on from 0:50 |
| AC-5 | `t0422.host` "T-0422 AC-5 …": one `replaceItem` with the engine's item and main lift, one `upsertSession`, stored row and `parseSessionPlan` ok, set line, logging (`db-row` at `setIndex: 1`, unique positions), remount. **The load-line test is red: TR-0043, conflict 1.** |
| AC-6 | `t0422.host` "T-0422 AC-6 …" (push-up under Equipment taken, the 3-argument call, `mainLiftId`, `isMain`), plus the non-main pair |
| AC-7 | `t0422.machine` (paused, running, the rest by type, fewer sets with its pair, last item paused/running with its pair, another item returns the same object); `t0422.host` "T-0422 AC-7 host …" (Swap from UF-09.4 → UF-09.5 → Db row Set 3 of 3 at `setIndex: 2`, no `editSet`, queued rows unchanged) and the host pair (bench-press set 4 of 4 → item 1, UF-09.4 as recorded → Save → UF-09.5 → UF-09.6 Db row) |
| AC-8 | `t0422.host` "T-0422 AC-8 axe …" over UF-09.9 and over UF-09.6 (0 violations); `exports-and-lint` jsx-no-literals in UF-09 and UF-05 |
| AC-9 | These pass unchanged: UF-09 `exports-and-lint` (index pin), UF-05 `exports-and-lint` (exactly `SwapSheet`), and the T-0304a AC-2 tick test |
| AC-10 | `tests/e2e/uf-05-swap.spec.ts`: offline; keyboard Swap; first row ≥ 44 px; Use; Resume shows the option; the reload reads it back from `wl-offline.sessions`; axe clean; guarded |

### Red on main
- The vitest run used `main`'s `seams.tsx`, `machine.ts` and `flows/uf-05.ts`, with the new tests: 40 of 42 failed.
  - The two that passed are the pairs that hold on main too: "with no sheet open the countdown runs" and "another item returns the same state object".
  - Every AC from 1 to 8 had red tests.
- The e2e run used `main`'s `seams.tsx` (`t0422.seams` moved aside so `tsc -b` builds). `uf-05-swap` failed with no Swap button: `keyTo` timed out.

### Planted faults (each reverted)
1. `target = ctx.currentItemIndex`: 5 red.
   - AC-3 "finished item" and "skipped";
   - `t0422.seams` "renders the sheet over the target item";
   - the AC-7 host pair;
   - (the TR-0043 test).
2. `replaceItem` without the third argument: 5 red.
   - AC-6 both;
   - AC-5 "one replaceItem …";
   - `t0422.seams` "Use: replaceItem(…)";
   - (the TR-0043 test).
3. A direct `upsertSession` call in the seam: AC-5 "one replaceItem …, one row write …" is red (2 calls), plus the TR-0043 test.
4. The old `confirm` clamp-only branch restored in `planReplaced`: 10 red.
   - all 8 positive `t0422.machine` tests;
   - the AC-7 host test;
   - (the TR-0043 test).

### Gate (2026-10-02)
- `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: typecheck and lint are green. Test: 5 failed of 2696, all expected.
  - `host.chrome.test.tsx` × 3 (next, paused, paused on the last item). These pin the module arrays and gain "Swap". They are deferred until T-0423 merges (Notes; T-0423 AC-6 needs the file unedited).
  - `t0422.host` AC-5 load line (TR-0043, conflict 1).
  - `build.test.ts` AC-A6 "no seam-mounted feature is in the entry chunk" (TR-0043, conflict 2). `Couldn't load alternatives.` reaches the entry through the `en` catalogue, not through UF-05's code. UF-05 is its own lazy chunk.
- `-w format:check`: green.
- `node .github/scripts/check-all.mjs`: green.
  - TR-0043 is left untracked in the worktree for the orchestrator, because `.squad/triage/**` isn't in this lane.
- `check:size`: green.
- The whole web `test:e2e`, with `TMPDIR=$HOME/.cache/wl-pw-tmp` (the /tmp tmpfs is full): 139 passed.

## Build log, attempt 2 (frontend-dev, 2026-10-02): done
`git merge main` brought in D-0156 and T-0423, and merged cleanly.

### What changed
- **`features/UF-09/prefill.ts`** (D-0156 §1, AC-11). `nextSetPrefill` matches the previous entry on `itemIndex`, `setIndex − 1` **and** `exerciseId === item.exerciseId`. The doc comment cites D-0156 §1. Nothing else in the file changed.
- **`__tests__/prefill.test.ts`.** The cases are added in a new describe, "T-0422 AC-11 nextSetPrefill after a swap": same exercise carries, a swapped exercise doesn't, mixed history, swap back, and the per-field fallback. The existing cases are unedited.
- **`__tests__/t0422.host.test.tsx`.** The AC-5 load-line test is unedited, and it now passes. The AC-7 host test gets one more assertion: UF-09.5 shows "Next · set 3 of 3", and the page has no "60 kg".
- **`apps/web/build.test.ts`** (D-0156 §2, AC-12). Only `SEAM_SENTINELS["UF-05"]` changed, to `["wl-uf05"]`, and its comment now cites D-0156 and D-0071 §1.
- **`__tests__/host.chrome.test.tsx`** (D-0142 §6 named changes). Three pins changed:
  - next is now Pause workout, I'm ready, Swap;
  - paused is now Resume, Swap, Skip to next exercise, End workout (4 buttons);
  - paused on the last item is now Resume, Swap, End workout.
- **No other UF-09 test moved.** Every existing test passed unedited with the filter: `src/features/UF-09`, `UF-05` and `build.test.ts` gave 871/871.

`git diff --stat main...HEAD -- apps/web/src/features/UF-09`:
```
 __tests__/host.chrome.test.tsx      |  13 +-
 __tests__/machine.session.test.ts   |   4 +-
 __tests__/next-exercise.test.tsx    |  11 +-
 __tests__/paused.test.tsx           |  25 +-
 __tests__/prefill.test.ts           |  63 +-
 __tests__/seams.test.tsx            |  29 +-
 __tests__/t0422.host.test.tsx       | 733 ++++
 __tests__/t0422.machine.test.ts     | 163 ++++
 __tests__/t0422.seams.test.tsx      | 240 ++++
 machine.ts                          |  29 +-
 prefill.ts                          |  12 +-
 seams.tsx                           |  65 +-
 12 files changed, 1350 insertions(+), 37 deletions(-)
```

### Planted faults
Each fault was made on a scratch copy and reverted from a backup with `cmp` (no `git checkout`).
- **The `exerciseId` filter removed from `nextSetPrefill`.** 3 tests go red:
  - AC-11 "a swapped exercise doesn't carry";
  - the AC-5 load line (`t0422.host`);
  - the AC-7 host test (its "Next" line shows 60 kg).
  The carry cases stay green, as they should.
- **The copy sentinel restored** (`["Couldn't load alternatives.", "wl-uf05"]`). AC-A6 "no seam-mounted feature is in the entry chunk" goes red: `entry-graph files with a UF-05 sentinel`.
- **The copy sentinel gone, plus a side-effect `import "../features/UF-05/index.js"` in `src/app/App.tsx`.** AC-A6 §3 is still red, on `assets/index-….css: wl-uf05`.
- **With the new sentinel and no fault,** AC-A6 is 3/3 green.

### Gate (2026-10-02)
- `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`: 19/19 tasks; web 2745/2745.
  - The first run had one red, UF-08 `ready-start.test.tsx` "retry: the second tap…". It is outside this diff. It passed 3/3 on its own, and the rerun of the whole gate was green.
- The whole web `test:e2e` with `TMPDIR=$HOME/.cache/wl-pw-tmp`: 144 passed.
- `check:size`: green.
- `-w format:check`: green.
- `node .github/scripts/check-all.mjs`: green.

## Build, attempt 3 (frontend-dev, 2026-10-02): done
Two code review findings are fixed. Only `features/UF-09/seams.tsx` changed.
- **MEDIUM: the lazy sheet had no loading step and no error boundary.** `renderSwap` now renders `SwapOverlay`, which wraps the lazy `SwapSheet` like this:
  - **`SwapBoundary`** is a class error boundary. It catches a rejected import, or an error while the sheet renders.
  - **The Suspense fallback is `SwapPlaceholder`.** It is a `role="dialog"` with `data-screen-id="UF-05.1"`, labelled `en.uf05.titleFallback`. It shows `en.uf05.loading`, or `en.uf05.loadFailed` from the boundary, and a Close button (`en.uf05.close`) that calls `ctx.close`. Focus moves to Close.
  - **No new strings.** The keys already exist in `flows/uf-05.ts`.
  - **Scope.** The boundary wraps only the lazy sheet.
  - **No chunk warm-up.** The optional step, starting the import when the Swap button renders, isn't done: it needs a host hook outside this grant.
- **LOW: the target moved after `replaceItem`.** `swapTarget(ctx)` now runs once, in `useState`'s initialiser, when the overlay opens.

### New tests (red before → green after)
- **`t0422.lazy-reject.test.tsx`** (UF-05 mocked to throw; the stale-chunk 404 case). The rejected import shows "Couldn't load alternatives." with Close focused. Close returns to UF-09.9 with the stored state deep-equal. Red before: there was no dialog, because the error went up to the root.
- **`t0422.lazy-pending.test.tsx`** (UF-05 mocked to never resolve). "Loading alternatives…" shows with Close focused. Close returns to UF-09.9 with the state unchanged. Red before: there was no dialog, because the fallback was `null`.
- **`t0422.seams` "the target is stable across a rerender after replaceItem resolves".** After Use, a rerender with item 1 now complete still shows "Replace Barbell row", not "Replace Leg curl". Red before: no dialog named "Replace Barbell row" after the rerender.
- **`t0422.seams` "the swap boundary doesn't catch an error outside the sheet".** A sibling's error reaches the outer boundary, not the swap fallback. This is a scope guard, so it is green before and after.
- **Pair (the import resolves, and the sheet renders):** every existing `t0422.host` and `t0422.seams` test, for example AC-2 "opens" and the AC-8 axe tests, plus the e2e `uf-05-swap`.

### Gate (2026-10-02)
- `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`: 19/19 tasks; web 2749/2749.
- `-w test:repo-checks`: 146/146.
- The whole web `test:e2e` with `TMPDIR=$HOME/.cache/wl-pw-tmp`: 144 passed.
- `check:size`, `-w format:check` and `check-all`: green.
- `git diff --stat main...HEAD -- apps/web/src/features/UF-09`: 14 files changed, 1577 insertions(+), 37 deletions(-). The two new files are `t0422.lazy-reject.test.tsx` and `t0422.lazy-pending.test.tsx`.

## QA / accept log (qa-tester, 2026-10-02): done
- **Start.** Clean at f74116b; `git merge main` → e0e5f5f, then main moved again → merged to 41e60d2 (clean). `git diff --stat main...HEAD`: 19 files, all in the grant.
- **AC → test:**
  - AC-1: `t0422.seams` AC-1; `seams.test` AC-9; `paused.test`/`next-exercise.test` module-array pairs; `host.chrome.test` pins; UF-05 `exports-and-lint`.
  - AC-2: `t0422.host` AC-2 (opens, 10 min paused, Cancel, reload, no `a[href]`).
  - AC-3: `t0422.host` AC-3 (finished/pair/skipped/none left); `t0422.seams` `swapTarget` (pure, both values).
  - AC-4: `t0422.host` AC-4 (opens, 90 s stopped → 0:50, the pair runs, apply → new name, runs on).
  - AC-5: `t0422.host` AC-5 (one 3-arg `replaceItem`, one row write, plan valid, Set 2 of 3, Set weight/8 reps, db-row at setIndex 1, remount).
  - AC-6: `t0422.host` AC-6 (push-up main) + non-main pair.
  - AC-7: `t0422.machine` (paused, running, fewer sets, last item, another item = same object); `t0422.host` AC-7 host + host pair.
  - AC-8: `t0422.host` AC-8 axe over UF-09.9 and UF-09.6; jsx-no-literals in `exports-and-lint`.
  - AC-9: UF-09/UF-05 export pins and the T-0304a AC-2 tick test pass unedited.
  - AC-10: `tests/e2e/uf-05-swap.spec.ts` (offline, keyboard, ≥ 44 px, reload from `wl-offline.sessions`, axe, guard); `--repeat-each=5`: 5/5.
  - AC-11: `prefill.test` "T-0422 AC-11" (5 cases); AC-5 load line; AC-7 host "no 60 kg".
  - AC-12: `build.test` AC-A6 green; diff touches only the `SEAM_SENTINELS["UF-05"]` value and comment.
  - Attempt 3: `t0422.lazy-reject`, `t0422.lazy-pending`, `t0422.seams` stable target and boundary scope.
- **Planted faults** (scratch backup, `cp` restore, `cmp` ok, tree clean after):
  - F1 `target = currentItemIndex`: 4 red (AC-3 finished/skipped, AC-7 host pair, seams render).
  - F2 no `mainLiftId`: 4 red (AC-5 call, AC-6 both, seams Use).
  - F3 confirm clamp-only: 9 red (8 `t0422.machine`, AC-7 host).
  - F4 prefill filter removed: 3 red (AC-11 swapped, AC-5 load line, AC-7 host).
  - F5 copy sentinel restored: AC-A6 red.
  - F6 `SwapBoundary` removed: `t0422.lazy-reject` red, `lazy-pending` green (the pair).
- **Gate at 41e60d2:**
  - `-w typecheck lint test --force --concurrency=1 --continue`: 18/19 tasks; web 2851/2852. The one red is UF-11 `strings.test.ts` AC-B16 (`git diff main...HEAD` pinned to T-0308b's paths). It came in from main, fails on every non-UF-11 branch and on main itself (empty diff), and is filed as T-0450. Not this ticket's.
  - landing `ac21` and 3 of the repo-checks (check-all on the real repo) are red only because the local `origin/main` (4867665) is behind `main`, so check-lane-paths counts T-0308b's merged files. In a scratch clone with `origin/main` = ad1d5db: `check-all` exit 0 and repo-checks 146/146.
  - Whole web e2e: 155 passed. `check:size`, `format:check`: green.
- **Nit (no gate):** the `t0422.host` AC-5 load-line comment still says "TR-0043: red until it is resolved". The test stays unedited per AC-11.
