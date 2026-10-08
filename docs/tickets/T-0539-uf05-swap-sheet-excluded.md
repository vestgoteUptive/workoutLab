---
id: T-0539
title: "UF-05.1 / UF-08.3 swap sheet: pass the stored list to rankSwaps, the \"Don't suggest {current} again\" checkbox applied on confirm, the \"No alternatives left. The others are excluded.\" empty state"
lane: web-feature:UF-05
screens: [UF-05.1, UF-08.3]
decisions: [D-0199, D-0200, D-0056, D-0071, D-0142]
deps: [T-0532, T-0533, T-0536, T-0537]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item g). Flow: wl-build-web (agent frontend-dev). About ½ day. MERGE ONLY AFTER H-27 (D-0199 §11, D-0200 §2): the checkbox writes excluded_exercises. -->

## Why
D-0199 §2 §3 §9: an excluded exercise is never offered as a swap, and the swap sheet is the one in-workout place to exclude (behind Pause, principle 1). The sheet is UF-05.1 wherever it opens (UF-09.6, UF-09.9, the UF-03.1 List view behind Pause) and UF-08.3 when UF-08 hosts it (D-0200 §4), so the change lives in the sheet and every host gets it.

## Scope
- In (`apps/web/src/features/UF-05/**`, `lib/i18n/flows/uf-05.ts`):
  - `SwapSheet` reads the stored list (`useExcludedIds`, T-0536, IndexedDB only, no `refresh*`, D-0111 §11) and passes it as `rankSwaps`'s 9th argument (T-0533). The rows stay `rankSwaps` exactly as returned (principle 3).
  - A C-03 `Checkbox` (T-0537) "Don't suggest {current name} again", unchecked by default, placed per T-0532 (under "Always use this in <routine>" when that row exists). On confirm ("Use …") with the box unticked: the swap is applied exactly as today. With the box ticked: `excludeExercise(userId, current.id)` runs first; on success the swap is applied; on failure the sheet stays open, nothing is applied, "Couldn't save. Try again." (`role="alert"`) is shown in the sheet, and the controls are enabled again, so the user can retry or untick and swap without excluding (D-0199 §6: the stored list changes only after the server confirms).
  - Offline: the checkbox is `aria-disabled` with "Connect to change excluded exercises"; the swap itself still works. Enabled on `online` without a remount.
  - Empty state: when `rankSwaps(…, stored)` returns `[]`, call `rankSwaps(…, [])` (a second engine call, still engine output). If that has candidates: "No alternatives left. The others are excluded."; otherwise the existing "No alternatives fit your equipment".
  - Warm-up items: the checkbox is not shown when `current` is a warm-up move (the client refuses warm-up ids, D-0199 §4).
- Out:
  - Any host change in UF-03, UF-08 or UF-09 (the sheet's props stay compatible; a host passes nothing new). Any `lib/` change. `applySwap` (unchanged, D-0199 §3).

### Edge cases that are in scope
- **Offline:** the list is honoured from the cache, the checkbox is disabled, the swap works (AC4).
- **Time running out (UF-09.8):** an exclusion made mid-workout changes only the confirmed swap and future suggestions, never the rest of the running plan (AC6a).
- **Excluded current:** the sheet opens normally for an item that is itself excluded (AC1's third case in T-0533).
- **Every alternative excluded:** the new empty state (AC5).
- Zero history and returning after 10 days: no history dependence beyond `rankSwaps`; tests run at zero history.

## Acceptance criteria
UI tests: L1 library fixture (names: id in sentence case, "db-" → "Dumbbell"), F-profile, user A, the stored list seeded in the T-0536 cache.
- **AC1 (AC11 checkbox ticked)** Given UF-05.1 is open for barbell-row and the user is online, When they tick "Don't suggest Barbell row again" and choose lat-pulldown, Then `onApply` receives `applySwap`'s result for lat-pulldown and `excludeExercise(A, "barbell-row")` was called once.
- **AC2 (unticked)** Given the same, When they choose lat-pulldown with the box unticked, Then the swap is applied and `excludeExercise` was not called.
- **AC3 (stored list filters)** Given the stored list contains db-row, When the sheet opens for barbell-row, Then `rankSwaps` was called with 9th argument `["db-row"]` and db-row is not a row. Given an empty stored list, Then the 9th argument is `[]`. The same two cases pass with UF-08.3 as the host (a `SessionSetup` test).
- **AC4 (AC15 offline)** Given `navigator.onLine` is false and the stored list [db-row] is cached, Then db-row is not offered, the checkbox is `aria-disabled` with the description "Connect to change excluded exercises", and choosing lat-pulldown still applies the swap. When `online` fires, Then the checkbox is enabled without a remount.
- **AC5 (AC10b empty states)** Given every candidate for barbell-row's slot is in the stored list, When the sheet opens, Then it shows "No alternatives left. The others are excluded."; given no candidate even with `excludeIds` [] (a profile with no matching equipment), Then "No alternatives fit your equipment".
- **AC6 (write failure)** Given online and `excludeExercise` rejects, When the user confirms lat-pulldown with the box ticked, Then `onApply` was not called, the sheet is still open, "Couldn't save. Try again." is shown with `role="alert"`, and the box and "Use Lat pulldown" are enabled. When they untick and confirm, Then the swap is applied and `excludeExercise` was not called again.
- **AC6a (running plan)** Given a UF-09 host with a three-item plan, When the user confirms a ticked swap on item 2, Then items 1 and 3 are deep-equal to before (the exclusion changes only this swap and future suggestions).
- **AC7 (warm-up)** Given the sheet opens for a warm-up item, Then there is no checkbox.

Checklist (D-0197 §7): ticked/unticked (AC1, AC2), online/offline (AC1, AC4), empty/non-empty stored list (AC3) each covered.

## Paths you may change
- `apps/web/src/features/UF-05/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-05.ts` (own flow file)
- `apps/web/src/features/UF-08/__tests__/swap-before-start.test.tsx` (the UF-08.3 host test for AC3 only; T-0538 owns UF-08, so the two run serially)

## Contract impact
None.

## Release order
**Merge only after H-27 is ticked** (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-05/UF-08/UF-09 swap e2e specs green · contracts unchanged · commits start with `T-0539:` and cite UF-05.1 / UF-08.3.

## Build / accept log

### Build log (frontend-dev)
- Clean tree at fb2dd81. SwapSheet reads `useExcludedList` (waits for `loaded`), passes it as rankSwaps' 9th arg, second `rankSwaps(..., [])` call for the empty state, C-03 checkbox above "Use", write via `excludeExercise` before `applySwap`, `role="alert"` on failure, offline aria-disabled + description (ticked box cleared when offline), hidden for warm-ups, no user, and both empty states. "Always use this in <routine>" does not exist in the sheet today (T-0532 not in this code), so the box sits above the confirm button.
- AC map: AC1-AC2, AC3 (sheet), AC4, AC5, AC6, AC6a, AC7 in `UF-05/__tests__/excluded.test.tsx`; AC3 UF-08.3 host in `UF-08/__tests__/swap-before-start.test.tsx`. AC6a is tested at sheet level (items 1 and 3 equal), not through a UF-09 host. engine.test.tsx updated for the new 9th arg `[]`.
- Planted faults, each caught: stored list not passed (4 red), no write on tick, write always, apply on failure, checkbox for warm-up, never disabled, empty message, ticked box not cleared offline, not waiting for loaded (2 red).
- Gate: typecheck/lint/test 19/19 (web 4004 tests); test:repo-checks 369 pass; format:check and check-all ok; e2e uf-05 + uf-09: 23 passed. First gate run failed typecheck (exactOptionalPropertyTypes on describedBy), fixed.
