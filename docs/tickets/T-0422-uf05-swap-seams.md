---
id: T-0422
title: "UF-05.1 mounted in focus mode: the swap seam on UF-09.9 Paused and UF-09.6 Next exercise (seams.tsx), the D-0142 §7 target, apply → ctx.replaceItem persisted offline, the stored plan round-trips through parseSessionPlan; the swap e2e"
lane: web-feature:UF-05
screens: [UF-05.1, UF-09.9, UF-09.6, UF-09.3]
decisions: [D-0142, D-0069, D-0071, D-0093, D-0111, D-0118, D-0120, D-0140, D-0086]
deps: [T-0421, T-0304d, T-0414]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Second child of the T-0306b board row (D-0142 §1 §6 §7). Build flow: wl-build-web. About ½ day. T-0304d (the real UF-09.9 with its seam positions) and T-0414 (PLAN_REPLACED never leaves the current set on a logged position, D-0140) must land first. It edits features/UF-09/seams.tsx, so it never runs in parallel with T-0416 or T-0415. -->

## Why
- **UF-05.1 mid-session (D-0069 §6, D-0071 §4 §7):** the user replaces an exercise without leaving focus mode. It is reachable only from UF-09.9 Paused and UF-09.6 Next exercise, so the set screens stay one task (principle 1).
- **D-0071 §6:** the new plan is saved as the whole row through `ctx.replaceItem`, offline-safe.
- **D-0093 §7:** the stored plan must stay a valid `SessionPlan` v1.

## Scope
- In:
  - **`features/UF-09/seams.tsx`**, the one UF-09 source file this ticket edits (D-0071 §4). A `swap` entry is added to both `pauseSeamActions` and `nextSeamActions`:
    - label "Swap" (`en.uf05`), `keepsClockRunning: false`;
    - `render(ctx)` gives `<SwapSheet workout={ctx.workout} itemIndex={target} onApply={…} onClose={ctx.close} />`, where `target` is the D-0142 §7 rule, as a pure helper in `seams.tsx`;
    - `onApply(result)` returns `ctx.replaceItem(target, result.plan.items[target], result.plan.mainLiftId)` and then calls `ctx.close()`;
    - it may be `lazy()`-loaded (D-0142 §8).
  - **The UF-09 pins these entries change** (D-0142 §6, a named change listed in the build log).
  - **A new e2e file,** `tests/e2e/uf-05-swap.spec.ts` (D-0071 §10).
  - Strings in `flows/uf-05.ts`.
- Out:
  - The sheet's own behaviour (T-0421), and the List view's Swap (T-0418).
  - Any UF-09 source file other than `seams.tsx`. If the host lacks something, that is a follow-up for web-feature:UF-09.
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

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on the T-0421 tree (the arrays have no `swap`). The build log records these planted faults turning their ACs red:
- `target = ctx.currentItemIndex` always (AC-3);
- `replaceItem` without the third argument (AC-6);
- a direct `upsertSession` call in the seam (AC-5).

- **AC-1 (entries and order, D-0071 §4)**
  - **The arrays.** `pauseSeamActions` and `nextSeamActions` each contain one `swap` entry with `keepsClockRunning: false`.
  - **UF-09.9.** The order is Resume · Swap · Skip to next exercise · (How to · List view, if T-0416 has landed) · End workout.
  - **UF-09.6.** The step's buttons are "I'm ready" then "Swap" (with the chrome's "Pause workout").
  - **The diff** touches no `features/UF-09` source file other than `seams.tsx`, and in `features/UF-09/__tests__` it changes only the D-0142 §6 pins.
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
- **AC-7 (a swap while paused from UF-09.4, D-0140 Consequences)** Paused from UF-09.4 with barbell-row set 2 recorded (`resumePhase: "confirm"`), swapping to db-row and then Resume shows UF-09.4 with the recorded barbell-row set. Save leads to UF-09.5, and the next set is db-row `setIndex: 2`. No two live sets share a position.
- **AC-8 (strings and a11y)** Every new string is in `en.uf05` (`react/jsx-no-literals` green). The vitest axe helper finds 0 violations with the sheet open over UF-09.9 and over UF-09.6.
- **AC-9 (unchanged surfaces)** The UF-09 `index.tsx` export pin and `features/UF-05/index.tsx`'s pin (exactly `SwapSheet`) are unchanged. The T-0304a AC-2 tick-counting test still passes.
- **AC-10 (e2e, new file `tests/e2e/uf-05-swap.spec.ts`)** In the preview build, offline, with the T-0904 guard (D-0086):
  - Seed a P1-like session row and its library and profile cache (an in-spec seed, the `uf-09-focus.spec.ts` pattern).
  - Pause → Swap by keyboard. The first option row is ≥ 44 px tall (`boundingBox()`).
  - Pick the first option and "Use …", then Resume. UF-09.3 shows that option's name.
  - **After a reload,** the IndexedDB `wl-offline.sessions` row's plan has the new exercise, and UF-09 shows it.
  - **axe** on the open sheet reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed request.

## Paths you may change
- `apps/web/src/features/UF-05/**` (the lane: `web-feature:UF-05`).
- **Listed extras:**
  - `apps/web/src/features/UF-09/seams.tsx`: the `swap` entries and their target helper (D-0071 §4, D-0142 §7).
  - `apps/web/src/features/UF-09/__tests__/*.test.tsx`: the D-0142 §6 pins these entries change (the module-array contents and the UF-09.9 and UF-09.6 button counts), plus new `t0422*` test files.
  - `tests/e2e/uf-09-focus.spec.ts`: the UF-09.9 button count in its seeded-session row (D-0142 §6).
  - `tests/e2e/uf-05-swap.spec.ts`: a new file (D-0071 §10).
  - `tests/e2e/fixtures/**`: additive exports (D-0071 §10).
  - `apps/web/src/lib/i18n/flows/uf-05.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0422-uf05-swap-seams.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (from `seams.tsx`), `@workoutlab/shared` (`parseSessionPlan`, tests), `lib/offline` (tests), the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The plan is written as `SessionPlan` v1 through the queue, as a whole row (D-0071 §6).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `check:size` green · contracts unchanged · commits start `T-0422` and cite the screen (for example `T-0422 UF-05.1: swap seam on UF-09.9`).

## Notes
- **Flow:** `wl-build-web`.
- **T-0306b is done** when T-0421 and T-0422 are.
- **Parallel:** never with T-0415 or T-0416 (D-0142 §1).

- **From T-0414 review (2026-10-02):** D-0140 left a swap from `confirm` out of scope. If the swap sheet can open from UF-09.4, the recorded old-exercise set can still share a position with the next set; handle it here (or keep the seam off UF-09.4).
