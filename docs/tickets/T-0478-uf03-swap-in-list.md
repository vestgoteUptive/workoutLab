---
id: T-0478
title: "UF-03.1 Swap button on the List view's current card: SwapSheet (with the host's time zone) → ctx.replaceItem, rows after a swap, focus back to Swap"
lane: web-feature:UF-03
screens: [UF-03.1, UF-05.1]
decisions: [D-0142, D-0069, D-0071, D-0093, D-0140, D-0157, D-0158, D-0169, D-0172, D-0175]
deps: [T-0418, T-0421, T-0414]
status: ready
---
<!-- Re-checked 2026-10-03 by product-owner (groom, D-0175 §5) against main 7ea4276: all three
deps are done, and the assumptions hold. `FocusSession` has `workout`, `timeZone` and
`replaceItem`. `SwapSheetProps` has `timeZone?`. UF-08 already imports `features/UF-05/index.js`.
`ListViewCtx` has `rest`/`startRest`/`adjustRest`/`skipRest` from T-0418 and still lacks
`workout`/`timeZone`/`replaceItem`. Never in parallel with T-0483, which also edits
`__tests__/list-helpers.tsx`. -->

<!-- Split out of T-0418 on 2026-10-03 by product-owner (D-0157 §7, D-0172). It mounts the SwapSheet
component (T-0421) directly, not through a seam, and persists through ctx.replaceItem, whose
free-position rule is T-0414's (D-0140). Build flow: wl-build-web. About ⅓ day. Becomes ready when
T-0418 is done (both edit ListView.tsx). -->

## Why
**UF-05.1 from the List view:** the same single swap sheet as in focus mode (D-0071 §7). The engine
builds the swapped item (principle 3), so the user who logs from the list can still swap a busy
machine without going back to focus mode.

## Scope
- In (`features/UF-03`):
  - **The Swap button** on the current card only (D-0142 §7). It shows `SwapSheet` from
    `features/UF-05/index.tsx` with `{workout: ctx.workout, itemIndex, onApply, onClose,
    timeZone: ctx.timeZone}` in place of the table (one `[data-screen-id]`: `UF-05.1`).
    `onApply(result)` returns `ctx.replaceItem(itemIndex, result.plan.items[itemIndex],
    result.plan.mainLiftId)`, and the sheet closes after it resolves.
  - **Rows after a swap:** logged rows of the old exercise show that exercise's library name as a
    tag. Unlogged rows take the new item's pre-fill.
  - **`ListViewCtx`** gains `workout`, `timeZone`, `replaceItem`, typed structurally (D-0172 §4).
  - **Focus** (D-0172 §3): after Apply or Cancel → that card's "Swap" button.
- Out:
  - The `swap` seam on UF-09.9/UF-09.6 (T-0422, done). The swap semantics (T-0224, D-0093).
  - "Always use this in <routine>" (cut, D-0069 §7).
  - Any `features/UF-09` or `features/UF-05` file.

### Edge cases that are in scope
- **Offline:** the swap persists through `replaceItem` → the queue (AC-2).
- **Time running out:** a swap may pick an "Over your time" candidate (D-0056 §3, T-0421). The time
  check stays in focus mode.
- **Zero history:** the swapped item's pre-fill is the engine's `carry` or `first_time` (R14-E7),
  shown as given (AC-2).
- **A swap during a rest:** the rest bar keeps running across the sheet (AC-1 contrast).

## Acceptance criteria
**Test setup.** T-0417's. The unit tests use a test-built `ctx` (spied `replaceItem`); AC-2 uses the
real host with the real `SwapSheet`, `rankSwaps` and `applySwap`. Each new test title starts with
`T-0478 AC-n`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
Every AC must fail on main's code. The build log records this planted fault turning its AC red: a
second plan write after `replaceItem` (AC-1).

- **AC-1 (Swap from the list, D-0071 §7)**
  - **Opens.** "Swap" on the current back-squat card shows `SwapSheet` with `workout`
    reference-equal to `ctx.workout`, `itemIndex: 0` and `timeZone` equal to `ctx.timeZone`
    (checked with ctx `timeZone` "America/New_York"). The other cards have no Swap button.
  - **Apply.** `onApply(result)` calls `ctx.replaceItem(0, result.plan.items[0],
    result.plan.mainLiftId)` exactly once and returns its promise. There is no other plan write (no
    `upsertSession` import in the List view, the T-0417 AC-4 scan).
  - **Cancel** (the sheet's `onClose`) returns to UF-03.1 with no call.
  - **Rejection.** With `replaceItem` rejecting, the sheet stays open with its rejection text
    (T-0421), and the card still shows back-squat.
  - **During a rest.** With a rest running in the real host, opening and cancelling the sheet
    leaves `ctx.rest` running; the bar shows again on return.
- **AC-2 (after a swap, through the real engine and host)** With back-squat rows 1–2 logged,
  swapping to the first candidate the real `rankSwaps` returns:
  - the card shows the candidate's library name;
  - rows 3–4 (unlogged) show the engine's pre-fill from the new `plan.items[0].prefill`;
  - rows 1–2 keep their values, show the tag "Back squat", and keep `exerciseId "back-squat"` in
    IndexedDB;
  - checking row 3 records the new exerciseId at `setIndex: 2` (the first free position, D-0140);
  - the stored row's plan passes `parseSessionPlan`, and its other fields are deep-equal to before;
  - offline (`navigator.onLine = false`), all of the above holds, and a remount reads the new
    exercise back.
- **AC-3 (focus and a11y)** After Cancel and, separately, after a resolved Apply,
  `document.activeElement` is the back-squat card's "Swap" button (named "Swap Back squat" before,
  "Swap {new name}" after Apply). The vitest axe helper finds 0 violations on UF-03.1 with the Swap
  button showing.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0478-uf03-swap-in-list.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (`SwapSheet`), `@workoutlab/shared`
  (`parseSessionPlan`, tests), `lib/offline` (tests).

## Contract impact
None. The plan is persisted by `ctx.replaceItem` as a whole row (D-0071 §6).

## Definition of done
Tests for every AC pass, with the planted fault recorded · while working,
`scripts/locked.sh small npx vitest run <files>` · once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, `check:size` on a fresh build (UF-03 now pulls in UF-05), and
`scripts/locked.sh heavy` on the web `test:e2e` for `uf-03-list-summary.spec.ts` and
`uf-09-focus.spec.ts` · contracts unchanged · commits start `T-0478` and cite the screen (for
example `T-0478 UF-03.1: swap from the list`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** T-0418 is done, so this can start. Same lane as T-0483, T-0464, T-0472 and
  T-0473: run them one at a time. T-0483 also edits `__tests__/list-helpers.tsx`.

## Build / accept log

**2026-10-04, web-feature:UF-03.** Resumed after a session interruption mid-edit; `ListView.tsx`,
`__tests__/list-helpers.tsx` and `lib/i18n/flows/uf-03.ts` already had the Swap button, `ctx`
fields and `onApply`/`onClose` wiring from the earlier session. Finished:
- Fixed `loggedHere`/`SetRow`'s `logged` lookup and the collapsed card's "done" count to key by
  `itemIndex` alone, not `itemIndex` + `item.exerciseId` (a logged row of the pre-swap exercise
  was being dropped once `item.exerciseId` became the new one). Added the "tag" (old exercise's
  library name) on a row logged under a different exerciseId than the card's current one, plus
  `uf03.swapTag` and `.wl-uf03-list__tag` CSS.
- Added focus-restore (`swapRef.current.focus()`) after the sheet closes (Cancel or a resolved
  Apply): `Card` tracks `wasSwapping` across renders (AC-3).
- Found the `SwapSheet` import had to be `React.lazy`, not static (`ListView.tsx` is reachable
  through `UF-03/index.js`'s static `export { ListView }`, which `UF-09`'s own test helper
  `session-helpers.tsx` imports statically for `Summary`; a static `SwapSheet` import there forced
  `UF-05/index.js` to resolve just from importing `Summary`, breaking/hanging six UF-09 tests that
  mock `UF-05/index.js` to reject or hang, simulating a slow/failed chunk for UF-09's own swap
  seam). Confirmed red on main's `ListView.tsx` (`t0422.lazy-pending.test.tsx` genuinely hangs,
  `t0422.lazy-reject.test.tsx` throws) before the fix, green after, with `<Suspense fallback=
  {null}>` around the sheet (no seam chrome, matching "mounts the sheet directly").
- Fixed `makeCtx()` in `list-helpers.tsx`: `over` was spread *before* the hardcoded fn spies, so a
  test's own override of `replaceItem` (or any other spy) was silently discarded. Moved `...over`
  last. Re-ran the full UF-03 suite after the fix (244 tests, all green) to confirm no other test
  relied on the old order.
- Wrote `list-view.swap.test.tsx` (mocked `SwapSheet`, AC-1 + AC-3) and
  `list-view.swap.host.test.tsx` (real host/engine, AC-2 + AC-3's real-name check).

**AC → test map.**
- AC-1 opens/itemIndex/timeZone/other-cards: `list-view.swap.test.tsx` "opens SwapSheet…", "the
  other cards have no Swap button".
- AC-1 Apply/no-other-write: "Apply calls ctx.replaceItem… exactly once…", CONTRAST scan for
  `upsertSession`.
- AC-1 Cancel: "Cancel (onClose) returns to UF-03.1 with no replaceItem call".
- AC-1 rejection: "rejection: the sheet stays open and the card still shows back-squat".
- AC-1 during a rest: "during a rest: opening and cancelling the sheet leaves ctx.rest untouched".
- AC-2 (real engine/host, all in `list-view.swap.host.test.tsx`): candidate's name shown; rows 3-4
  pre-fill (the real `carry` prefill for this fixture, not `first_time` — back-squat's own 100 kg
  prefill carries to hip-thrust since they share glutes at weight 1.0 and barbell equipment, rule
  14 step 1); rows 1-2 keep values + tag + exerciseId in IndexedDB; row 3 check records at
  setIndex 2; `parseSessionPlan` + other-fields-unchanged; offline + remount.
- AC-3 focus/a11y: "after Cancel…", "after a resolved Apply… (still addressable)" (unit, frozen
  ctx.plan) plus the host test's "focus lands on the Swap button, now named 'Swap Hip thrust'"
  (real name change); axe 0 violations.

**Red runs recorded.**
- Every new AC-1/AC-3 test, run against a temporary revert of the `Rows`/`SetRow`/`Card` changes:
  red (tag/keying and focus-restore are new behaviour).
- `t0422.lazy-pending.test.tsx` / `t0422.lazy-reject.test.tsx` / `t0451.*` / `t0446.swap-zone` /
  `t0463.swap.rerender`: red (hang or throw) on the static-`SwapSheet`-import version of
  `ListView.tsx`; green after switching to `React.lazy`.
- Planted fault (ticket-required, AC-1): a second `ctx.replaceItem(...)` call inside `onApply`
  after the first, on a backup copy, restored with `cp` after. Turned exactly "Apply calls
  ctx.replaceItem… exactly once…" red (`expected … called 1 times, but got 2 times`); every other
  test in the file stayed green. Repeated after the lazy-loading fix with the same result.

**Gate (2026-10-04).**
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`: 19/19
  tasks green (3544 web tests, 256 files).
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`: 159/159 green.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w format:check`: green (after a prettier pass on
  the two new test files).
- `scripts/locked.sh heavy node .github/scripts/check-all.mjs`: green.
- `check:size` on a fresh build (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set for the build
  step only): green; the build log notes UF-03 pulling in UF-05 is now a lazy chunk, not an eager
  one.
- `TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y pnpm@10.28.2 exec playwright test
  --config tests/e2e/playwright.config.ts` (full suite, since the `SwapSheet` lazy-loading change
  touches `apps/web/src/**` beyond one feature folder): 220/220 green, `uf-03-list-summary.spec.ts`
  and `uf-09-focus.spec.ts` included.

Contracts unchanged. No decision needed: the `React.lazy` fix is an implementation detail inside
`ListView.tsx`, not a contract or cross-lane change (`UF-09`'s files are untouched).

**2026-10-04, review rework (two blocking findings, four non-blocking).**
- **Blocking 1 — unfalsifiable "during a rest" unit test.** `list-view.swap.test.tsx`'s
  `expect(ctx.rest).toEqual({remainingS: 90})` checked the literal object passed into `makeCtx`,
  which nothing (mocked or real) ever writes back to — it could not fail. Fixed in two places:
  the unit test now asserts the rest bar is visible before opening, while the dialog is open, and
  after Close (`RestBar` renders unconditionally on `ctx.rest`, outside the swapped card, so this
  is a real assertion about the DOM, not the mock's own state), plus keeps the legitimate
  `skipRest`/`adjustRest` not-called checks. A new host-level test
  (`list-view.swap.host.test.tsx`, "AC-1 during a rest, real host") seeds a real paused-mid-rest
  focus state (`resumePhase: "rest"`, a live timer), opens Swap from the real List view, cancels,
  and asserts the real rest bar's clock text is unchanged after — the genuine end-to-end case the
  AC asks for. Planted fault (`onClose` also calling `ctx.skipRest()`): both the unit and the host
  test go red; restored with `cp`.
- **Blocking 2 — a failed SwapSheet import stuck (D-0162 §3).** The plain `lazy()` added to fix
  the UF-09 test collision cached a rejected import for the page's life, contradicting D-0162 §3
  ("a failed UF-05 import doesn't stick") — a gap introduced as a side effect of that fix, never
  decided. Fixed by copying UF-09's own `retryableLazy`/boundary pattern into UF-03 (a new
  `features/UF-03/lazy-retry.ts`, since UF-03 never imports a UF-09 module, D-0142 §5): a local
  `SwapLoadBoundary` class component catches a failed import, resets the lazy in
  `componentDidCatch`, and shows "Couldn't load alternatives." with "Try again" (remounts under a
  fresh `useReducer` key, matching UF-09's `useSeamRetry`) and "Close" (back to the rows; the next
  Swap tap gets a fresh attempt either way, since the reset already ran). Two new strings,
  `uf03.swapLoadFailed`/`swapRetry`. New test file `list-view.swap-retry.test.tsx` (4 tests,
  mocking `../../UF-05/index.js` to throw/hang/recover, T-0451's own pattern): shows the failure
  state with no `UF-05.1` dialog underneath (distinguishing it from `SwapSheet`'s own unrelated
  internal data-load failure, which coincidentally shares the same message text but has no "Try
  again" and no dialog `data-screen-id`); Close then Swap again imports again (a higher
  `loader.calls`, not the cached rejection); Try again imports again and fails cleanly with no
  unhandled rejection; Try again after the chunk becomes reachable shows the real sheet. Planted
  fault (`componentDidCatch` not calling `reset()`): 3 of the 4 new tests go red (the one that
  never retries stays green, as it should); restored with `cp`.
- **Non-blocking, addressed:**
  - AC-1's "rejection... text (T-0421)" is now its own host test
    ("AC-1 rejection, real host and real SwapSheet"): deletes the session's IndexedDB row so the
    real `ctx.replaceItem` rejects, and asserts the real `SwapSheet`'s own `saveFailed` notice text
    ("Couldn't save the swap. Try again.") shows, not a List-view-owned message.
  - AC-2's "keep exerciseId back-squat in IndexedDB" now reads the real `db.sets` queue table
    (seeded via a new `seedQueuedBackSquat()` helper in the host test, since the ticket's
    `LOGGED_BACK_SQUAT` fixture was previously only ever written to the persisted focus-state
    JSON, never queued) instead of substituting the focus state for "IndexedDB". The "checking row
    3" test now checks both: the focus state's `itemIndex` grouping (a UI idea with no `itemIndex`
    column in `db.sets`, D-0045 §6) and the real queued row's `exerciseId`/`setIndex`/`weightKg`.
  - The "rows after a swap (unit side)" test's title and assertion were contradictory (it built a
    `ctx.plan` whose current item was still back-squat, so the "no tag" it asserted was correct but
    proved nothing about a post-swap row). Rebuilt with `withItem(LIST_PLAN, 0, {exerciseId:
    "hip-thrust"})` against `loggedSets` still saying `back-squat`, genuinely reproducing "the card
    now shows a different exercise than a row's own logged one"; added the missing "T-0478 AC-2"
    title prefix and a CONTRAST test for the same-exerciseId (no tag) case.
  - The "CONTRAST: a stale focus target" test asserted nothing about `ListView`. Replaced with a
    real contrast through the component: opening the sheet (no Cancel, no Apply) never moves focus
    to the Swap button, proving the focus-restore assertions above are about the close path
    specifically, not an unconditional default.
- Re-ran the full UF-03 + UF-09 suite after each change (1178 → 1181 → 1185 tests as new tests were
  added, all green); one single flaky failure in the pre-existing, untouched `rest.test.tsx`
  (a real-timer announcer test) under heavy concurrent system load, confirmed not a regression by
  re-running the same file in isolation 4 times (19/19 every time) and the full suite once more
  clean (93 files, 1185 tests).

**Gate, re-run after the rework.** `-w typecheck lint test --concurrency=1`: 19/19 tasks, 257 files,
3551 tests green. `-w test:repo-checks`: 159/159. `-w format:check`: green. `check-all.mjs`: green.
`check:size` on a fresh build: green. Full e2e: 220/220 green.
