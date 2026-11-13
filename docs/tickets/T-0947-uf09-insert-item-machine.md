---
id: T-0947
title: "Focus mode keeps every logged set in place when an exercise is added mid-workout (save the new plan, shift later sets, survive a reload)"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.10]
decisions: [D-0245, D-0246, D-0244, D-0243, D-0111, D-0120, D-0205, D-0138]
deps: [T-0945]
status: todo
---
## Why
UF-09 refers to plan items by index (`LoggedSet.itemIndex`, `skippedItems`, the machine's `itemIndex`). An insert at `itemIndex + 1` shifts later indices, so the machine needs an `ITEM_INSERTED` event, a restore that realigns by exercise id, and a `ctx.insertItem` that calls the engine, writes the plan and then dispatches (D-0245 §1–§3, D-0246 §2 §12). The UI (T-0948, T-0949) calls this; it holds no rule of its own.

## Scope
- In: `ITEM_INSERTED {atIndex, atMs}` in `machine.ts` (paused only); restore realign by exercise id (`resume.ts`/`load.ts`); `ctx.insertItem(exerciseId)` and a `ctx.timeLeftS()` read on the FocusSession ctx, both from live state via the engine's `timeLeftS`.
- `ctx.insertItem` result shape (consumed by T-0948): `{status: "added", name, afterName}` · `{status: "refused", reason: "time" | "items_cap", leftS}` · `{status: "blocked"}` (id is an item or has a logged set; no write, no event) · `{status: "failed"}` (write rejected).
- Out: the Paused action and the sheet (T-0948, T-0949), any engine change.

## Acceptance criteria
Fixture P as in the spec.
- AC1 (B9) Given the machine paused on bench-press set 3 with one leg-extension set logged ahead (`itemIndex` 2), When `ITEM_INSERTED {atIndex: 1}`, Then that set's `itemIndex` is 3, the bench-press sets keep 0, the machine's `itemIndex` is 0, and `setIndex`, `resumePhase` and the timers are unchanged.
- AC2 (B9) Given `skippedItems` [2], When an insert at 1, Then [3]; given `skippedItems` [0] (sibling, below the insert), Then [0].
- AC3 Given the machine in any phase other than `paused`, When `ITEM_INSERTED` arrives, Then the state is unchanged.
- AC4 (B1) Given P paused from UF-09.5 after bench-press set 2 with `elapsedS` 600, When `ctx.insertItem("lateral-raise")`, Then the engine is called with `atIndex` 1 and `leftS` 945, `upsertSession({...row, plan})` resolves before `ITEM_INSERTED` is dispatched, `ctx.plan` has 4 items, both bench-press sets keep `itemIndex` 0, and the result is `{status: "added", name: "Lateral raise", afterName: "Bench press"}`.
- AC5 (B8, D-0246 §12) Given the last item, Then `atIndex` = `items.length` (appended). Given a 0-item plan injected in a unit test, Then `atIndex` is clamped to 0.
- AC6 (B7) Given a pause from UF-09.2 (warm-up, `elapsedS` 60, 120 s warm-up left), Then `atIndex` is 1, `leftS` is 975, and the restored phase is still the warm-up.
- AC7 (D-0246 §5) Given a pause from UF-09.6 (`resumePhase: "next"`) on inverted-row (`itemIndex` 1), Then `atIndex` is 2.
- AC8 (B3/B11) Given the engine returns `{refused: "time"}` or `{refused: "items_cap"}`, Then no write and no event, and the result carries the reason and `leftS`.
- AC9 (B10, B20, D-0246 §2) Given an id that is a plan item (skipped or not), and given bench-press with 2 logged sets swapped for db-bench-press, When `ctx.insertItem("bench-press")`, Then `{status: "blocked"}`, the engine is not called, nothing is written and no event is sent.
- AC10 (B15) Given `upsertSession` rejects, Then `{status: "failed"}`, `ctx.plan` and every index are unchanged, and no event is sent.
- AC11 (B14, D-0245 §3) Given the plan write landed and the app is killed before the focus-state write, When it reloads, Then it resumes paused with four items and both bench-press sets on bench-press (realigned by exercise id); given focus state and plan agree (sibling), Then D-0111 §7 restore applies unchanged.
- AC12 (offline) Given offline, When AC4 runs, Then the write is queued (device first) and the result is `added`; online (sibling) behaves the same.
- AC13 (B17) Given AC4's add, When bench-press ends at `elapsedS` 1300, Then rule 8's `remainingS` is 1200, `behindS` −200 and no UF-09.8.
- AC14 (B8) Given P after bench-press and inverted-row with biceps-curl appended during leg-extension set 2 of 2, When that set is confirmed, Then the next phase is UF-09.6 for Biceps curl, not finish.

## Paths you may change
`apps/web/src/features/UF-09/**`

## Contract impact
none (D-0245; `session_sets` hold `exercise_id`, `SessionPlan.items maxItems 8` exists).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · commit messages start with `T-0947` and cite UF-09.9 / UF-09.10.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.
