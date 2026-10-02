---
id: D-0140
title: UF-09 PLAN_REPLACED never leaves the current set on a position that already has a logged set; with no free position left, the swap ends the item (rest, or done after the last item)
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0414)
area: web
builds-on: D-0066 §1 §12, D-0071 §5, D-0111 §4 §5 §7, D-0118 §2
amends: T-0410 AC1, AC1 pair, AC2, AC2 pair (their setup only; the T-0410 guard they prove stays)
---
## Context
`planReplaced` in `apps/web/src/features/UF-09/machine.ts` clamps `setIndex` into the new item's set count. After a swap to an item with fewer sets, the clamp can land on a position the old exercise already logged. Example: barbell-row set 3 of 3 (sets 0 and 1 logged), swapped while paused to db-row × 2. `setIndex` becomes 1, which already holds barbell-row set 2. The next Done set is stamped `(1, 1)` too, so two logged sets share one `(itemIndex, setIndex)`. `loggedIndexes`, `setAfterRest`, `firstIncompleteSet` and RESYNC all treat a position as one set, so the walk and the "sets done" counts go wrong, and the user is shown a set number they already did. The T-0410 review filed this (T-0414). T-0306b (the swap UI) and T-0304d (time check, which can replace items) make it reachable.

## Decision
1. **Scope.** Only when `PLAN_REPLACED` targets the current item and the set step is in play: `phase` is `set` or `timed`, or `phase` is `paused` with `resumePhase` `set` or `timed`. Every other phase keeps today's behaviour (clamp only).
2. **A free clamped position stays.** If no live logged set has `itemIndex` = the current item and `setIndex` = the clamped index (of any exercise), nothing changes from today.
3. **Otherwise, the first free position.** `setIndex` becomes the lowest index `0..setsInItem(newItem) − 1` with no live logged set at that position (of any exercise, the back-off counted), the same rule `firstUnloggedSet` uses. A logged set of the old exercise still fills its position: it is a real set the user did, and it stays in the session.
4. **No free position: the swap ends the item.** Every position of the new item already has a logged set, so there is nothing left to do on it. The machine goes where saving the item's last set would go (`afterSet`):
   - **Not the last item** → `rest` at the last position (`setIndex = setsInItem(newItem) − 1`), with a rest by the new exercise's library `type` (`restFor`).
     - Not paused: the rest timer starts at the event's `atMs`.
     - Paused: the state stays `paused`, with `resumePhase: "rest"` and a timer `{startedAtMs: pausedAtMs, durationS: restFor(...), pausedMs: 0}`. RESUME then adds the pause to `pausedMs`, so the full rest is left at the resume. REST_END then finds no unlogged set (`setAfterRest` is null) → `betweenItems` → the store's check point → UF-09.8 or UF-09.6 for the next item, as today.
   - **The last item** → `done` with `timer: null`. When paused, the pause ends at the swap: `resumePhase: null`, `pausedAtMs: null`, and `workoutPausedMs` grows by `atMs − pausedAtMs`. (`persist.ts` rejects `resumePhase: "done"`, so `done` can't wait behind the pause.)
5. **Still pure.** `planReplaced` takes the event's `atMs`. No clock, no I/O. A no-change case still returns the same state object.
6. **Every result is a readable stored state.** Each state §2–§4 produce passes `isValidFocusState` for the new plan, so a reload restores it (D-0111 §7). No change to `persist.ts`.
7. **The T-0410 tests.** T-0410 AC1, AC1 pair, AC2 and AC2 pair reached the "old exercise's set at the current position" state through PLAN_REPLACED, which §4 now ends differently. T-0414 rewrites their setup to build that paused state directly (a state a pre-T-0414 build persisted). Titles and assertions stay, so the T-0410 guard (`movedOnIfLogged` matches the current exercise) is still proved. This is a named change, not a weakened test.

## Consequences
- T-0414 (web-feature:UF-09) implements §1–§7 in `machine.ts`, with tests in `__tests__/machine.session.test.ts` and a store-level test.
- T-0304d and T-0306b depend on T-0414.
- Out of scope: a swap while paused from `confirm` (a recorded, unsaved set of the old exercise). It keeps today's behaviour. Revisit with T-0306b if the swap sheet can open from UF-09.4.

## Revisit when
- Users expect a swap to fewer sets to show the new exercise anyway ("do one more"). Then §4 offers an extra set instead of ending the item.
- The swap sheet opens from UF-09.4 Confirm.
