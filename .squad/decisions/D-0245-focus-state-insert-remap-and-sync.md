---
id: D-0245
title: "Mid-workout add in the focus machine: write the plan first (device first, queued, last write wins), then an ITEM_INSERTED event that shifts LoggedSet.itemIndex and skippedItems at or after the insert point by one; restore realigns by exercise id; the sheet lives in UF-08 behind a UF-09 seam"
status: decided
date: 2026-11-13
by: product-owner (idea, owner request)
area: web
builds-on: D-0015, D-0071 §4 §6, D-0111 §7, D-0120 §1, D-0142 §7 §8, D-0170, D-0205 §9, D-0243, D-0244
---
## Context
UF-09 refers to plan items by index: `LoggedSet.itemIndex`, `skippedItems` and the machine's `itemIndex`. An insert at `itemIndex + 1` (D-0243 §4) shifts the indices of the later items.

Two precedents already exist. D-0205 §9 writes a reordered plan, then sends a machine event that remaps the indices. D-0120 §1 writes Trim and Skip next with `upsertSession({...row, plan})`, device first. `sessions` has no `edited_at`, so the last write wins (NFR-SYNC-3). `session_sets` rows carry `exercise_id`, not an index, so the server is unaffected.

## Decision
1. **One write, then one event.** The host reads the stored row and calls `upsertSession({...row, plan: result.workout's plan})` (device first, queued for sync, so it works offline). When that resolves, it dispatches `ITEM_INSERTED {atIndex, atMs}`. The event is valid only in `paused`. Every `LoggedSet.itemIndex ≥ atIndex` and every `skippedItems` entry `≥ atIndex` goes up by 1. `itemIndex`, `setIndex`, `resumePhase` and the timers are unchanged, so the pause stays (D-0243 §7). `ctx.plan` becomes the new plan.
2. **Failure.** A rejected write leaves the plan and the state unchanged, keeps the sheet open, and shows "Couldn't add {name}. Try again." in the sheet's status line.
3. **Reload.** The plan write lands before the focus-state write. Take a stored focus state whose `LoggedSet.exerciseId` doesn't match `plan.items[itemIndex].exerciseId`: it is realigned by exercise id (D-0205 §9; the ids are unique per plan, D-0244 §1). Otherwise D-0111 §7 applies. A kill between the two writes resumes paused with every logged set kept.
4. **Where the code lives.** UF-08 owns the add list (`AddExerciseSheet`). It gains an optional `lead` prop and a way to omit "Start with this" (already optional). UF-08 publishes a side-effect-free leaf entry, `features/UF-08/index.add-in-workout.ts` (D-0170). That entry renders UF-09.10 from the `FocusSession` ctx and computes the D-0243 §3 row reasons. UF-09 adds an `add` entry to `pauseSeamActions`, loaded lazily like the swap seam (D-0142 §8) and retried in-page on a failed load (D-0162 §3). It also adds `ctx.insertItem(exerciseId)`, which calls the engine, writes and dispatches. UF-09 never imports UF-08's setup code.
5. **Counting.** The plan item itself counts for nothing. Only sets logged against it, as `session_sets` rows, count toward the 14-day loads, balance, records and check-ins, as any set does. Sets of an added item that is never done count for nothing. UF-03.1 List view, UF-03.3 summary, the UF-02.1 resume card ("n of N sets"), the progress bar (one more segment) and UF-09.9's "Sets {logged} / {planned}" all read the new plan.

## Consequences
- Two UF-09 tickets (machine and ctx, then seam and action) and one UF-08 ticket. The UF-08 ticket waits for the UF-08 tickets in flight that touch `AddExerciseSheet` (T-0940, T-0941, T-0943).

## Revisit when
A second device can run the same session, at which point last-write-wins on `sessions.plan` is no longer enough.
