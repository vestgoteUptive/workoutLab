---
id: T-0578
title: "UF-09 Do this later, machine and persistence: canDoLater predicate, the move permutation, plan write on the Trim path (device first, queued), one machine event that ends the pause and remaps itemIndex/skippedItems, restore realign by exerciseId"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.6, UF-09.1, UF-09.8]
decisions: [D-0205, D-0120, D-0111, D-0024]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 §9, item F). Flow: wl-build-web (agent frontend-dev). About ½ day. No UI: T-0579 adds the UF-09.9 button on top of this (same folder, runs after). Independent of the UF-08 chain. -->

## Why
The owner: "reorder exercises … maybe because of … busy machine." D-0205 §9: principle 1 rules out a list in focus mode, so the only in-workout reorder is "Do {name} later" on Pause. This ticket builds the pure logic, the plan write and the restore; T-0579 puts the action on UF-09.9.

## Scope
- In (`apps/web/src/features/UF-09/**`):
  - **Current item:** `itemIndex`, or item 0 when `resumePhase` is `getReady` or `warmup`.
  - **Predicate** `canDoLater(state, plan, loggedSets)` (pure): true only when the machine is `paused`, `resumePhase` is not `timeCheck`, the current item has **no** logged set (focus mode or List view), is not in `skippedItems`, and at least one later item is neither complete nor skipped.
  - **Permutation** `doLaterOrder(state, plan)` (pure): the current item moves to just after the next item that is neither complete nor skipped; returns the new `items` and the index mapping.
  - **Write:** the stored session row with `plan.items` in the new order, through the same device-first, queued path as the UF-09.8 Trim plan write (`session.tsx`; D-0120 §1), so it works offline and syncs (last write wins, NFR-SYNC-3). `plan.mainLiftId`, `isMain`, sets and costs unchanged.
  - **Machine event** (e.g. `ITEM_DEFERRED`), dispatched only after the write lands on the device: ends the pause, remaps every `LoggedSet.itemIndex` and `skippedItems` entry by the mapping, then: from `getReady`/`warmup` resumes that phase; otherwise goes to `next` (UF-09.6) for the new current item with its 60 s set-up countdown. No UF-09.8 check runs. The event carries the moved item's name for T-0579's status line.
  - **Write failure:** order, pause and state unchanged; the failure is returned to the caller (T-0579 shows the copy).
  - **Restore** (`persist.ts`/`resume.ts`): a stored `LoggedSet` whose `exerciseId` differs from `plan.items[itemIndex].exerciseId` is realigned to the item with that `exerciseId`, and `skippedItems` the same way; anything still inconsistent follows D-0111 §7.
- Out: the UF-09.9 button, its copy and the e2e (T-0579); any UF-08 change; reorder in UF-03.1.

### Edge cases that are in scope
- **Offline:** the write is queued; reload restores the new order (AC7).
- **Time running out:** `timeCheck`'s `behindS` is unchanged by the move (AC5); no UF-09.8 runs after it even when behind (AC1).
- **Skipped items:** remapped by exercise (AC6).
- **Partly done item / last unfinished item / pause from UF-09.8:** predicate false (AC4).
- **Returning after 10 days / zero history:** pre-fills are per item and unchanged; AC1 asserts the moved item's `prefill` is byte-equal before and after.

## Acceptance criteria
Plan P: bench-press × 4 (main), inverted-row × 3, leg-extension × 2. Unit tests on the machine, the pure helpers and the session write (fake-indexeddb).
- **AC1 (from UF-09.6)** Given P with bench-press's 4 sets logged and the machine paused from `next` for item 1 (inverted-row), with `behindS ≥ 60` at the last check, When the deferral runs, Then the stored row's `plan.items` ids are bench-press, leg-extension, inverted-row; the state is `next` for item 1 (leg-extension) with a 60 s countdown; every bench-press `LoggedSet` still has `itemIndex` 0; no `timeCheck` phase was entered; `plan.mainLiftId` is bench-press and each item's `prefill` is unchanged.
- **AC2 (before the first set)** Given P paused from `warmup`, When the deferral runs, Then the ids are inverted-row, bench-press, leg-extension, the state resumes `warmup` where it was (elapsed warm-up time kept), and the current item after the warm-up is inverted-row; bench-press keeps `isMain`.
- **AC3 (repeat)** After AC1, When the deferral runs again on leg-extension, Then the ids are bench-press, inverted-row, leg-extension.
- **AC4 (predicate false)** `canDoLater` is false when: one bench-press set is logged and the pause is from set 2; the current item is the last item that is neither complete nor skipped; `resumePhase` is `timeCheck`; the current item is in `skippedItems`. It is true in AC1's and AC2's states.
- **AC5 (time check unchanged)** Given the R8 fixture (`elapsedS` 1500, `nextItemIndex` 1), When barbell-row is moved after leg-curl, Then engine `timeCheck` gives `behindS` 105 before and after.
- **AC6 (skipped items remap)** Given a 4-item plan with item 1 skipped and the current item 2, When the deferral runs, Then item 2 moves after item 3, and `skippedItems` still points at the skipped exercise's new index.
- **AC7 (offline and reload)** Given `navigator.onLine` false, When AC1's deferral runs, Then the stored row has the new order and is in the sync queue with no request made; When the store is rebuilt from storage (reload), Then the machine resumes on leg-extension with every logged set kept; When the queue flushes online, Then the upsert body carries the new order.
- **AC8 (realign)** Given a stored focus state written before the plan write (a `LoggedSet` with `exerciseId` inverted-row at `itemIndex` 1) and a stored plan where inverted-row is now index 2, When restoring, Then that set's `itemIndex` is 2.
- **AC9 (write failure)** Given the device write rejects, When the deferral runs, Then the plan, the pause and every `LoggedSet` are unchanged and the caller gets a failure result.

Checklist (D-0197 §7): online/offline (AC1 online, AC7 offline); predicate true/false (AC4); write success/failure (AC1, AC9); resumePhase warm-up/next (AC1, AC2).

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)

## Contract impact
None (`sessions.plan.items` is already rewritten mid-workout; the focus state is device-local; D-0205 §10).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green (unchanged behaviour) · contracts unchanged · commits start with `T-0578:` and cite UF-09.9 / UF-09.6.

## Build / accept log
