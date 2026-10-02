---
id: D-0142
title: UF-03 List view / Summary and UF-05 Swap sheet groom — eight half-day children (T-0415…T-0422), List-view logs never move the focus machine, no auto-finish under a List-view overlay, the summary renders only an ended session and never redirects, its `now` is `ended_at`, seam targets and pin updates
status: revisit
date: 2026-10-02
by: product-owner (groom T-0305a, T-0305b, T-0306b)
area: product
builds-on: D-0066 §12, D-0068, D-0069, D-0071 §2 §4 §5 §6 §7 §9 §10, D-0093 §7, D-0111 §3 §11, D-0113, D-0118 §6 §7 §12, D-0120, D-0140
amends: D-0068 §2 (the "or now" fallback for `ended_at`), D-0113 §1 (no mount refresh on UF-03.3), T-0305 parent AC-B8 (the redirect), T-0305 parent AC-A2 (the "W" rows), in part
---
## Context
The board rows T-0305a (UF-03.1/.2), T-0305b (UF-03.3) and T-0306b (UF-05.1) are each ¾–1 day of agent work once the merged UF-09 code is read. A web build that runs past its budget dies with no result (D-0106, D-0111, D-0118). Reading `main` also found these gaps:

1. **List-view logs move the machine.** `createFocusActions().recordSet` (`features/UF-09/session.tsx`) dispatches `SET_RECORDED`/`TIMED_RECORDED` whenever the set is the machine's current position, whatever its `source`. Under a List view, checking the current row puts the hidden machine in `confirm` with a 5 s auto-save, and checking a timed item's current row ends the hold. Checking the last row of the last item reaches `done`, and the host then calls `finish()` and leaves the List view 5 s later, with no Finish tap.
2. **`done` under an overlay.** `host.tsx` renders `done` before it looks at the overlay, and its `done` effect calls `finish()` at once. D-0071 §5 says `close()` from the List view re-syncs and "a `done` finishes as usual", which assumes `done` is reached at `close()`, not while the overlay is open.
3. **A rest after the last set of the last item.** `REST_END` with no unlogged set always gives `betweenItems`, then `next` for an item index past the end. A List view rest can reach that, and a stored `next` past the end is out of range (D-0111 §7), so a reload would restart at `getReady`.
4. **The summary route's shell tests.** `routes.phase3.render.test.tsx` reads `<h1>{en.screens.sessionSummary}</h1>` from the `Summary` source and needs exactly one `[data-screen-id="UF-03.3"]`. `profile-gate.test.tsx` AC-8 asserts the location stays `/session/0b9e1f/summary`. `auth-guard.phase3.test.tsx` and `shell.spec.ts` AC-6 render it with no session row, and UF-10's `never-in-workout.test.tsx` asserts no `a[href^="/balance"]` there. The parent AC-B8 "an unknown session id redirects to `/`" would break all of them.
5. **A summary of a running session.** D-0068 §2 falls back to "now" when `ended_at` is null. A cold load of `/session/S1/summary` mid-workout would then show a "See balance" link (a way out of focus mode, principle 1) and Save would end the workout.
6. **The summary's mount refresh.** D-0113 lists UF-03 among the screens that refresh on mount through `useAuth().status`. But the UF-09 tests render the real `Summary` with no `AuthProvider`, and `useAuth()` throws outside one.
7. **Which `now` the summary uses.** D-0068 §1 says `before` and `after` use the same `now`, not which one. A device clock gives different numbers on each reload as the 14-day window rolls.
8. **Type imports.** `FocusSession` is a UF-09 type. UF-03 and UF-05 may not import `features/UF-09` (D-0071 §4).
9. **Pins.** `features/UF-09/__tests__/seams.test.tsx` AC-9 asserts both arrays are `[]`. T-0304d AC-6 asserts "with the module arrays there is no Swap, How to or List view button", and it and the e2e row "AC-7 the chrome on a seeded session" pin the UF-09.9 button count. Every seam ticket breaks these pins by design.
10. **Which item a seam swap targets** on UF-09.9 when the current item's sets are all logged (a rest that leads to the next item).
11. **"W" warm-up rows.** No flow logs `isWarmup: true` sets in v1 (UF-09.2 warm-up moves aren't sets), so the parent's "W" row has no subject.

## Decision
1. **Eight children, ids T-0415…T-0422** (the next free web ids, state.md):

   | Id | Lane | Scope | Deps |
   |---|---|---|---|
   | T-0415 | web-feature:UF-09 | Host support for the List view (§2) | T-0304d, T-0414 |
   | T-0416 | web-feature:UF-03 | UF-03.1 set table read side, `how-to` + `list-view` seams, Finish, the T-0360 cross-screen principle-1 assertion | T-0304d, T-0419 |
   | T-0417 | web-feature:UF-03 | UF-03.1 logging (check, edit, uncheck, add set), reload, the NFR-OFF-2 e2e | T-0416, T-0415, T-0420 |
   | T-0418 | web-feature:UF-03 | UF-03.2 rest bar + rest view, the Swap button inside the List view | T-0417, T-0421, T-0414 |
   | T-0419 | web-feature:UF-03 | UF-03.3 summary content and states | T-0318, T-0319 |
   | T-0420 | web-feature:UF-03 | UF-03.3 effort 1–5 + Save through the queue, the summary e2e | T-0419, T-0324 |
   | T-0421 | web-feature:UF-05 | `SwapSheet` itself (rankSwaps + applySwap, `parseSessionPlan` round-trip) | T-0224, T-0226, T-0318 |
   | T-0422 | web-feature:UF-05 | `swap` seam entries on UF-09.9 and UF-09.6, persisted through `replaceItem` | T-0421, T-0304d, T-0414 |

   - The UF-03 lane runs T-0419 → T-0420 → T-0416 → T-0417 → T-0418. If T-0324 is late, T-0416 may run before T-0420.
   - **T-0416 and T-0422 both edit `features/UF-09/seams.tsx` and the seam pins (§6). They never run in parallel.** Neither may run in parallel with T-0415 either, because all three touch UF-09 tests.
   - T-0304d and T-0414 must land before T-0422 (the swap mount) and before T-0418 (the List view swap, which calls `replaceItem`). T-0304d must land before T-0416 (the real UF-09.9 view and its pins). T-0421 and T-0419 need neither.
2. **Host support for the List view (T-0415, web-feature:UF-09).**
   - A `recordSet` with `source: "list"` always dispatches `SET_LOGGED`. It never dispatches `SET_RECORDED` or `TIMED_RECORDED`, so the hidden machine never enters `confirm` and never ends a timed hold under the List view. `source: "focus"` (the default) is unchanged. D-0071 §5's "the next set is the first set index with no live logged set" still holds: `close()` re-syncs (RESYNC), and `REST_END` uses `setAfterRest`.
   - `REST_END` on the **last** item with no unlogged set goes to `done` (timer null), not to `betweenItems`. On any other item it is `betweenItems` as today. In focus mode this case can't arise (`afterSet` already gives `done`), so focus behaviour is unchanged.
   - While a `keepsClockRunning: true` overlay is open, a `done` state keeps the overlay on screen and doesn't call `finish()`. `finish()` runs when the user calls `ctx.finish()` (UF-03.1 Finish), or when `close()` leaves the state `done` (D-0071 §5 "finishes as usual"). With no overlay open, `done` finishes at once as today (T-0304e AC-6).
3. **The UF-03.1 List view.**
   - **Header.** "Elapsed {m:ss}" reads `ctx.elapsedS` (rule 8's elapsed, the same number UF-09.9 shows, D-0120 §6). Then "Focus mode" (`ctx.close()`) and "Finish".
   - **Current card** = `ctx.currentItemIndex`, expanded. The other items are collapsed, and at most one other card is expanded at a time.
   - **Rows.** Rows 1…`item.sets`, then a "Back-off" row (index `item.sets`, `backoff: true`) when `item.backoff` is non-null, then one row for each logged set of this item above those positions (an added set). There are **no "W" rows** (Context 11).
   - **Values.** A logged row shows its logged values. An unlogged planned row shows `item.prefill` (`reps` null → `repsMin`; a timed item shows `prefill.durationS`). The back-off row shows `backoff.weightKg`/`backoff.reps`. "Previous" is D-0068 §4, and is never used to pre-fill.
   - **Weights** are shown with `formatDecimal` (inputs) and `formatKg` (text), D-0118 §6. UF-03 has its own pure weight parser with D-0118 §6's rules, because it may not import `features/UF-09/weight-input.ts`. A bodyweight exercise (`externalLoad: false`) has no kg input and records its pre-fill weight.
   - **An added set** ("+ Add set") gets index `1 + max(the item's last planned index, the item's highest logged setIndex)`, `backoff: false`, and the last row's values.
   - **A rest (UF-03.2)** starts with `ctx.startRest(exerciseId)` after a check resolves, unless no planned set of the session is left unlogged. Then the rest bar stays hidden, and Finish is the next step.
   - **No refresh.** The List view is inside UF-09, so D-0111 §11 applies. It reads `loadEngineHistory()` and `loadLibrary()` from IndexedDB, and calls no `refresh*`.
4. **UF-03.3 Summary states (amends D-0068 §2 and the parent AC-B8).**
   - `features/UF-03/index.tsx` keeps `export function Summary()` as a wrapper: `<div data-screen-id="UF-03.3">` with `<h1>{en.screens.sessionSummary}</h1>`, then the content component from its own module. This is the UF-04 `Compare` pattern, so the shell tests above stay byte-identical (the D-0108 §3 approach).
   - **Loading** (the first commit) shows the wrapper and the heading only.
   - **"This workout isn't on this device"** with a link to `/` covers: no `sessions` row, a row of another `userId`, an unreadable plan, and IndexedDB rejecting. It never redirects, and never shows `role="alert"` or a `banner`.
   - **"This workout is still running"** with a link "Back to workout" to `/session/:sessionId` covers a row whose `ended_at` is null. D-0068 §2's "or now" fallback is withdrawn: the summary never ends a workout.
   - Only an **ended** session shows the numbers, "See balance" and (T-0420) the effort and Save. So "See balance" (user flows v2 UF-10 entry) appears only after the workout has ended, and the other states have no `/balance` link.
   - **`now` is the row's `ended_at`** for `before`, `after` and the window, so a reload any time later shows the same numbers. `tz` is the device zone, or the `timeZone` prop in tests.
   - **No mount refresh (the D-0111 §11 exemption, extended to the summary; amends D-0113 §1 for UF-03.3).** The summary reads only IndexedDB (the session row, `loadEngineHistory()` = cache ∪ queue, the cached library and targets) and calls no `refresh*`. The reasons:
     - Its subject is this device's own session, whose sets are all in the queue, and its numbers are fixed at `ended_at`. A refresh can only add other devices' sets to "before", which online and offline would then show differently.
     - It is a `session`-guarded route, like `/session/:sessionId`: it must not wait on the network or on auth (routes.ts, D-0071 §2).
     - The UF-09 tests render the real `Summary` after `finish()` with no `AuthProvider` (`features/UF-09/__tests__/session-helpers.tsx`), so a `useAuth()` call would throw there.
     - AutoSync (T-0300c) still flushes the queue in the background.
   - **Save** (T-0420) re-reads the stored row at the tap and sends `{...row, effort_rating}`, so `ended_at` is the stored one (D-0071 §6). A stored `effort_rating` preselects its chip.
5. **Seam components type their own `ctx`.** `features/UF-03` and `features/UF-05` each declare the structural props they use (for example a `ListViewSession` interface listing `plan`, `loggedSets`, `recordSet`…). They don't import `FocusSession`. `seams.tsx` passes the real `FocusSession`, so `tsc` proves the two shapes match. `SwapSheet` takes D-0071 §7's props plus an optional `timeZone?: string` (the UF-10 pattern, used by tests). Its `onApply` may return a promise. While that promise is pending, "Use …" is `aria-disabled`. When it rejects, the sheet shows "Couldn't save the swap. Try again." and stays open.
6. **Pin updates are named changes (D-0118 §12).** A seam ticket updates the pins its entries change, and lists them in its build log:
   - `seams.test.tsx` AC-9 becomes "the arrays hold exactly these ids" (the ids landed so far);
   - T-0304d's "with the module arrays" row becomes the real button list;
   - the UF-09.9 button counts in UF-09 vitest files and in `tests/e2e/uf-09-focus.spec.ts`.
   Every other assertion in those files stays as it is. An injected-seam test (`SessionHost seams={…}`) is never changed.
7. **The swap target.** On UF-09.9 and UF-09.6 the seam swaps the first item from `ctx.currentItemIndex` on that has an unlogged planned position and isn't in `skippedItems`. If there is none, it swaps `ctx.currentItemIndex`. On UF-09.6 this is the upcoming item, because `next` already holds it. The UF-03.1 Swap button swaps the card it sits on, so only the current card has one.
8. **Lazy seams.** `seams.tsx` may `lazy()`-load `ListView` and `SwapSheet` from their flows' `index.tsx` (a dynamic import of an `index` is allowed by D-0071 §9), with a fallback inside the overlay. `check:size` stays green.

## Consequences
- The orchestrator edits the board: T-0305a → split (T-0415, T-0416, T-0417, T-0418), T-0305b → split (T-0419, T-0420), T-0306b → split (T-0421, T-0422), with §1's deps. T-0360 is carried by T-0416 (and can be marked folded into it). T-0303c's dep on T-0306b becomes T-0421, because UF-08.3 mounts the component, not the seam.
- `docs/tickets/T-0305-list-view-summary.md` and `docs/tickets/T-0306-library-swap.md` point to the children. The parent ACs stay as background. Where a child differs, the child wins.
- `never-in-workout.test.tsx` (UF-10) stays green: its `/session/S1/summary` has no row, so it shows "isn't on this device", which has no `/balance` link. T-0416 adds the seeded, ended-session half of that check (T-0360).
- T-0341 (shared equipment labels) isn't a blocker. T-0421 copies the labels it needs into `flows/uf-05.ts`, as D-0079 §5 allows.
- No contract change.

## Revisit when
- Users want the summary of an unfinished workout (for example a "Finish here" button on it).
- A List-view user expects the focus screen to have moved along while the list was open, which §2's `SET_LOGGED` rule doesn't do until `close()`.
- `isWarmup` sets start being logged. Then the List view gets its "W" rows.
- The swap target rule (§7) surprises users who paused in the rest after an item's last set.
