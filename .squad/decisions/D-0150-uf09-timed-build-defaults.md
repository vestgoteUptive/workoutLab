---
id: D-0150
title: "UF-09 timed set build defaults (T-0304c): a 15 s e2e hold run by the page clock, an already-logged hold moves on with HOLD_ALREADY_LOGGED, the auto-log guard matches the exercise, the swap rules for the timed timer, no ring pause at 0, and a separate 'Hold {m:ss}' target line"
status: revisit
date: 2026-10-02
by: frontend-dev (build T-0304c)
area: product
builds-on: D-0062 §5, D-0111 §4, D-0119 §1–§4, D-0120 §9, D-0133, D-0138, T-0410
---
## Context
Building T-0304c raised six points that the ticket and D-0119 leave open, or state in a way that
can't be built as written:
1. AC-6 seeds a timed item with `prefill.durationS` 5. The SessionPlan contract bounds a pre-fill's
   `durationS` to 15..120 (`PrefillResult`, D-0062 §5, D-0133). T-0413 renders such a plan as
   "This workout's plan can't be read" (D-0138), so the walk could never reach UF-09.7.
2. D-0119 §3 says the auto-log doesn't run "when `loggedSets` already has an entry for that
   `(itemIndex, setIndex)`", but not what the screen does next. Left alone, it would sit at 0:00
   with only Pause. `RESYNC` jumps back to the first item with an unlogged set, which is the wrong
   place.
3. T-0410 made "this set is logged" depend on the exercise as well as the position, because after
   a swap a set of the old exercise at that position isn't the set on screen.
4. D-0119 §1 lists the ways into `timed`, but not a swap (`PLAN_REPLACED`) or `RESYNC`.
5. Whether "Pause timer" works on a hold that has already reached 0.
6. D-0119 §4's target "Hold {m:ss}" and AC-2's counting-down "Hold 0:50" are two different things.

## Decision
1. **The e2e hold is 15 s**, the smallest valid `prefill.durationS`. The row installs
   `page.clock` (D-0120 §9) and runs it 3 s, then 15 s. The IndexedDB assert reads
   `durationS: 15`. Every other AC-6 assert is as written.
2. **An already-logged hold moves on.** A new event, `HOLD_ALREADY_LOGGED {atMs}`, is valid only
   in `timed`. When the current position has a logged set of this exercise, it moves on as that
   set's `TIMED_RECORDED` did (rest, or `done`), with no second entry. Otherwise it returns the
   same state. The host dispatches it instead of `recordSet` at 0. It reuses `movedOnIfLogged`,
   the T-0304b/T-0410 RESUME rule.
3. **The guard matches the exercise.** An entry counts as "already logged" only when its
   `exerciseId` is the current item's (T-0410). A set of another exercise at the same position
   (after a swap) doesn't stop the auto-log.
4. **Swaps and re-syncs.**
   - `PLAN_REPLACED` that turns a `set` step into a `timed` one starts the timed timer at `atMs`.
     When paused, it starts at `pausedAtMs`, so `RESUME` starts it running.
   - `timed` → `set` drops the timer.
   - `timed` → `timed` (a timed item swapped for another) keeps the running timer, so the
     T-0410 assertions stand.
   - `RESYNC` onto a timed item starts a fresh timed timer.
   - Leaving `timed`, or a new timer, clears `timerPausedAtMs`.
5. **No ring pause at 0.** `TIMER_PAUSE` on a hold at 0 returns the same state, so a pause can't
   block the auto-log that is due. The view hides "Pause timer" at 0.
6. **Two lines.** UF-09.7 shows the planned hold as a static target line "Hold {m:ss}" (D-0119 §4).
   Inside the ring, a phase label reads "Get in position" or "Hold", and the `role="timer"`
   counts down (3, 2, 1, then `m:ss`).

## Consequences
- No contract changes. The new event is additive (D-0111 §4: children may add events).
- T-0414 (D-0140) rewrites `planReplaced`'s position rule. It should keep §4's timer rules:
  the set → timed timer, and `timerPausedAtMs` cleared on a new timer.
- T-0306b (Swap): a `timed` → `timed` swap keeps the old hold's timer. If Swap is offered while a
  hold is running, T-0306b should restart the timer for the new item's hold.

## Revisit when
- The engine's timed range changes (D-0133), or an e2e needs a hold shorter than 15 s.
- Swap is offered on UF-09.7 (see Consequences).
- T-0414 changes how a swapped position is matched to its logged sets.
