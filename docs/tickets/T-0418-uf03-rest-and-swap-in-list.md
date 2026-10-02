---
id: T-0418
title: "UF-03.2 rest bar and rest view on the host's wall-clock rest (startRest/adjustRest/skipRest, no rest after the session's last planned set) + the Swap button on the List view's current card (SwapSheet → ctx.replaceItem)"
lane: web-feature:UF-03
screens: [UF-03.1, UF-03.2, UF-05.1]
decisions: [D-0142, D-0069, D-0071, D-0093, D-0118, D-0140, D-0066]
deps: [T-0417, T-0421, T-0414]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Third child of the T-0305a board row (D-0142 §1 §3 §5 §7). Build flow: wl-build-web. About ½ day. It mounts the SwapSheet component (T-0421) directly, not through a seam, and persists through ctx.replaceItem, whose free-position rule is T-0414's (D-0140). -->

## Why
- **UF-03.2:** the rest between sets in the List view. It uses the host's wall-clock rest (D-0071 §5, NFR-TIME-1), so a rest started in the list carries on in focus mode, and a background tab doesn't drift.
- **UF-05.1 from the List view:** the same single swap sheet as in focus mode (D-0071 §7). The engine builds the swapped item (principle 3).

## Scope
- In (`features/UF-03`):
  - **The rest bar** "Rest · {m:ss} left" reads `ctx.rest`. It is shown while `ctx.rest` is non-null. After a check resolves, `ctx.startRest(item.exerciseId)` is called, unless no planned set of the session is left unlogged (D-0142 §3).
  - **The rest view (UF-03.2):** the bar expands to a view with −15 s, +15 s and Skip (`ctx.adjustRest(∓15)`, `ctx.skipRest()`) and "Back to list". It replaces the table while open (one `[data-screen-id]`).
  - **The Swap button** on the current card only (D-0142 §7). It shows `SwapSheet` from `features/UF-05/index.tsx` with `{workout: ctx.workout, itemIndex, onApply, onClose}` in place of the table. `onApply(result)` returns `ctx.replaceItem(itemIndex, result.plan.items[itemIndex], result.plan.mainLiftId)`, and the sheet closes after it resolves.
  - **Rows after a swap:** logged rows of the old exercise show that exercise's name as a tag. Unlogged rows take the new item's pre-fill.
- Out:
  - The `swap` seam on UF-09.9/UF-09.6 (T-0422).
  - A List-view announcer of its own: the host's chrome announcer (D-0118 §10) speaks "10 seconds" and "Go".
  - The swap semantics (T-0224 engine, D-0093).
  - Any `features/UF-09` file.

### Edge cases that are in scope
- **Offline:** the swap persists through `replaceItem` → the queue (AC-5). The rest is wall-clock and needs no network.
- **Time running out:** a swap may pick an "Over your time" candidate (D-0056 §3, T-0421). The time check stays in focus mode.
- **Zero history:** the swapped item's pre-fill is the engine's `carry` or `first_time` (R14-E7), shown as given (AC-5).
- **Backgrounded tab:** the rest reads the wall clock (AC-1).

## Acceptance criteria
**Test setup.** T-0417's. The rest tests use the real host (the rest is the host's) with fake timers and a mocked `Date.now`. The swap tests use a test-built `ctx` (spied `replaceItem`) and, for AC-5, the real host with the real `SwapSheet`, `rankSwaps` and `applySwap`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on T-0417's code. The build log records these planted faults turning their ACs red:
- a `setInterval` countdown inside UF-03 (AC-1, through a UF-03 copy of the T-0304a tick-counting source scan, because a test in `features/UF-03` may not deep-import `features/UF-09/__tests__`);
- `startRest` after the session's last planned set (AC-2);
- a second plan write after `replaceItem` (AC-4).

- **AC-1 (rest bar, NFR-TIME-1)**
  - **Start.** After checking back-squat row 1 (a compound), `ctx.startRest("back-squat")` is called once, and the bar reads "Rest · 2:00 left" (`REST_COMPOUND_S`). After an isolation (leg-curl), it reads "Rest · 1:00 left" (`REST_ISOLATION_S`).
  - **Wall clock.** With `Date.now` advanced 90 s and no timer ticks run (as if backgrounded), the next render reads "0:30".
  - **Expiry.** At 0 the bar is gone (the host's `REST_END`).
  - **No own timer.** A source scan of `features/UF-03` finds no `setInterval`/`setTimeout` countdown (a copy of the T-0304a AC-2 helper).
  - **Edits.** Edit and uncheck start no rest (spy).
- **AC-2 (no rest after the last planned set, D-0142 §3)** Given every planned set of S1 logged except leg-curl row 3, When row 3 is checked, Then `startRest` isn't called, and there is no bar. The pair: with leg-curl rows 2 and 3 unlogged, checking row 2 starts a rest.
- **AC-3 (rest view UF-03.2)**
  - **Open.** Tapping the bar shows exactly one `[data-screen-id="UF-03.2"]` with the time, "−15 s", "+15 s", "Skip" and "Back to list".
  - **Adjust.** At "0:30", "+15 s" calls `ctx.adjustRest(15)` and reads "0:45". "−15 s" reads "0:30".
  - **Skip** calls `ctx.skipRest()` and returns to UF-03.1 with no bar.
  - **Back to list** returns to UF-03.1 with the bar still running.
  - **Announcer.** In the real host, while the List view is open, the chrome announcer (`[data-field="announcer"]`) reads "10 seconds" once at ≤ 10 s and "Go" at the expiry (D-0118 §10). UF-03 renders no `aria-live` region of its own for the rest.
- **AC-4 (Swap from the list, D-0071 §7)**
  - **Opens.** "Swap" on the current back-squat card shows `SwapSheet` with `workout` reference-equal to `ctx.workout` and `itemIndex: 0`. The other cards have no Swap button.
  - **Apply.** `onApply(result)` calls `ctx.replaceItem(0, result.plan.items[0], result.plan.mainLiftId)` exactly once and returns its promise. There is no other plan write (no `upsertSession` import in the List view, the T-0417 AC-4 scan).
  - **Cancel** (the sheet's `onClose`) returns to UF-03.1 with no call.
  - **Rejection.** With `replaceItem` rejecting, the sheet stays open with its rejection text (T-0421), and the card still shows back-squat.
- **AC-5 (after a swap, through the real engine and host)** With back-squat rows 1–2 logged, swapping to the first candidate the real `rankSwaps` returns:
  - the card shows the candidate's library name;
  - rows 3–4 (unlogged) show the engine's pre-fill from the new `plan.items[0].prefill`;
  - rows 1–2 keep their values, show the tag "Back squat", and keep `exerciseId "back-squat"` in IndexedDB;
  - checking row 3 records the new exerciseId at `setIndex: 2` (the first free position, D-0140);
  - the stored row's plan passes `parseSessionPlan`, and its other fields are deep-equal to before;
  - offline (`navigator.onLine = false`), all of the above holds, and a remount reads the new exercise back.
- **AC-6 (a11y)** The rest bar is a `button` named "Rest, {m:ss} left, show rest". The rest view buttons are named. The vitest axe helper finds 0 violations on UF-03.2 and on UF-03.1 with the bar showing.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0418-uf03-rest-and-swap-in-list.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (`SwapSheet`), `lib/i18n/workout.ts` (`restLabel`), `@workoutlab/engine` (`REST_COMPOUND_S`, `REST_ISOLATION_S`, tests only), `@workoutlab/shared` (`parseSessionPlan`, tests), `lib/offline` (tests).

## Contract impact
None. The plan is persisted by `ctx.replaceItem` as a whole row (D-0071 §6).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green · `check:size` green · contracts unchanged · commits start `T-0418` and cite the screen (for example `T-0418 UF-03.2: rest on the host's wall clock`).

## Notes
- **Flow:** `wl-build-web`.
- **T-0305a is done** when T-0415, T-0416, T-0417 and T-0418 are.
