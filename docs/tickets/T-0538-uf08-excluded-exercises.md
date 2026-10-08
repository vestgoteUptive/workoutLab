---
id: T-0538
title: "UF-08 excluded exercises: the stored list ∪ this visit's Removes reaches every suggest call (incl. the UF-08.1 fit line), the UF-08.2 Removed line with Never suggest / Undo, the neutral area notice, the exclusion empty state"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2]
decisions: [D-0199, D-0200, D-0191, D-0059, D-0071, D-0197]
deps: [T-0532, T-0534, T-0536, T-0537]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item f). Flow: wl-build-web (agent frontend-dev). About ½ day. MERGE ONLY AFTER H-27 (D-0199 §11, D-0200 §2): "Never suggest" writes excluded_exercises. -->

## Why
Today an exclusion lasts one UF-08 visit (D-0191 §4). D-0199 §2 §5 §8: the stored list joins every `suggest` call as an engine input (principle 3), UF-08.2 offers "Never suggest" after Remove, and UF-08.2 shows the neutral notice when the stored list empties an area.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - **Every `suggest` call** passes `excludeIds = excludeIdsFor(storedList, visitRemoves)` (T-0536): the first suggest, Shuffle, the time chips, and the UF-08.1 fit line (`SessionSetup.tsx` `setupInput`, visit list `[]`). The setup record keeps only the per-visit list (D-0191 §4). The T-0303a AC-6 test that pins `excludeIds: []` changes to pin the stored list (`[]` when empty).
  - **Removed line** at the end of the UF-08.2 list (T-0532 spec): one row per item removed on this visit, "{name} · Never suggest"; after the tap "{name} won't be suggested · Undo". A persistent `role="status"` region present on mount; focus stays on the row after Never suggest and after Undo; no timeout; gone when the user leaves UF-08. Remove stays one tap (D-0191).
  - **Notice:** `ExcludedAreasNotice` (T-0537) with `excludedOutAreas(profile, library, storedList)` (T-0534), from the **stored list only**, under the "Skipping today" line.
  - **Empty state:** 0 items and no Remove caused it → the existing "Nothing fits in {n} min" with the notice above it when it applies. D-0191 §5's "No exercises left. Pick a time to rebuild." still covers the Remove case.
  - **Offline / failure:** "Never suggest" and Undo are `aria-disabled` offline with the one "Connect to change excluded exercises" description; enabled on `online` without a reload. A failed write shows "Couldn't save. Try again." (`role="alert"`) and re-enables the control; the row keeps its previous state.
- Out:
  - The UF-08.3 checkbox and swap list (T-0539, inside the UF-05 sheet).
  - Any UF-09 change (principle 1). Any `lib/` change (T-0536). UF-02 (T-0542).

### Edge cases that are in scope
- **Offline:** suggestions honour the cached list; write controls disabled (AC6).
- **Include again elsewhere / another device:** the next re-suggest uses the fresh stored list (AC3).
- **Zero history:** all ACs run at zero history unless stated.
- **Every exercise for an area excluded:** the notice and no weight-1.0 item for it (AC4).
- **Time running out / returning after 10 days:** not applicable to UF-08 setup; exclusions never expire, the list comes from the cache refreshed on start (T-0536).

## Acceptance criteria
UI tests use the L1 library fixture (names: id in sentence case, "db-" → "Dumbbell"), F-profile, user A, the stored list seeded in the T-0536 cache.
- **AC1 (AC8: Never suggest / Undo)** Given UF-08.2 shows leg-extension and the user is online, When they tap Remove on leg-extension, Then the Removed line shows "Leg extension · Never suggest". When they tap Never suggest, Then `excludeExercise(A, "leg-extension")` was called once, the row reads "Leg extension won't be suggested · Undo", and focus is on that row. When they tap Undo, Then `includeExercise` was called, the row shows "Never suggest" again, and focus stays on it. When they leave UF-08 and Start again with leg-extension still stored, Then leg-extension is not an item.
- **AC2 (AC10: union reaches suggest)** Given the stored list is [bench-press] and the user removed inverted-row on this visit, When they tap the 45-min chip, Then `suggest` was called with `excludeIds` exactly `["bench-press", "inverted-row"]` and neither is an item. Shuffle passes the same list.
- **AC3 (fresh stored list)** Given AC2's state, When bench-press is included again (cache updated) and the user taps a time chip, Then `excludeIds` is `["inverted-row"]`.
- **AC4 (AC9: notice)** Given the stored list is [back-squat, leg-extension], When UF-08.2 renders, Then it shows "Not suggested: Quads. Every exercise for it is excluded." and no item has quads at weight 1.0. Given an empty stored list, Then no notice. Given an empty stored list and the user removes every quads item on this visit, Then no notice.
- **AC5 (AC10a fit line)** Given the stored list is [bench-press], When the UF-08.1 fit line computes, Then its `suggest` call has `excludeIds` `["bench-press"]`; with an empty list, `[]` (the changed T-0303a AC-6 pin).
- **AC6 (AC15 offline)** Given the stored list [bench-press] is cached and `navigator.onLine` is false, When UF-08.2 builds a suggestion, Then bench-press is not an item, and after a Remove the "Never suggest" control is `aria-disabled` with the description "Connect to change excluded exercises" (one such element on the screen). When the `online` event fires, Then it is enabled without a remount.
- **AC7 (AC16 failure)** Given online and `excludeExercise` rejects, When the user taps Never suggest, Then "Couldn't save. Try again." is shown with `role="alert"`, the row still shows "Never suggest", and the control is enabled.
- **AC8 (AC10b empty state)** Given the stored list excludes every exercise the 15-min budget could fit and no Remove happened, Then UF-08.2 shows "Nothing fits in 15 min", with the notice above it when `excludedOutAreas` is not empty.
- **AC9 (e2e)** One Playwright spec (`tests/e2e/uf-08-excluded.spec.ts`, guarded fixture): Remove → Never suggest → leave → Start again → the exercise is absent; the Supabase mock records exactly one upsert to `excluded_exercises` with `ignoreDuplicates`.

Checklist (D-0197 §7): online/offline (AC1, AC6), empty/non-empty stored list (AC4, AC5) both covered.

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-excluded.spec.ts` (new file)
- `apps/web/src/lib/offline/excluded-hooks.ts` and its `__tests__` (a `loaded` flag for the review finding; orchestrator grant 2026-10-08)

## Contract impact
None.

## Release order
**Merge only after H-27 is ticked** (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0538:` and cite UF-08.1 / UF-08.2.

## Build / accept log

### Build log (frontend-dev)
- Built: stored list ∪ visit removes (`excludeIdsFor`) on every UF-08 suggest (first/fit line, Shuffle, chips); only `setupInput` takes a `pinnedIds` parameter for D-0205 (`resuggest` still passes `[]`; threading it is for the add tickets); `RemovedLine.tsx` (persistent role=status, one button per row so focus stays, aria-disabled offline + one description, role=alert on failure); `ExcludedAreasNotice` from stored list only; strings in `uf-08.ts`.
- AC→test: AC1–AC8 in `__tests__/excluded-suggest.test.tsx` (AC5 replaces the T-0303a AC-6 pin; fit-line.test.tsx keeps the empty-list pin); AC9 `tests/e2e/uf-08-excluded.spec.ts`. AC8's "15 min" is 45 min (UF-08.1 has no 15 chip; default budget).
- Planted faults (all caught): resuggest without stored; fit line `[]`; notice from union (first attempt was vacuous: memo deps + a library with two quads exercises; test now uses a library with leg-extension as the only quads move); no aria-disabled; offline writes allowed; key by state (focus lost); no alert; notice dropped; status region conditional.
- Red run: e2e first failed on an unwaited plan render (spec fixed).

### Review fixes (frontend-dev)
- Fix 1: `useExcludedList` (new, `excluded-hooks.ts`) returns `{ids, loaded}`; UF-08.1's fit line and Suggest wait for it. Test `excluded-loading.test.tsx` (real hooks, deferred Dexie read). Faults: gating removed, `loaded` always true: both fail it.
- Fix 2: notice under BudgetBar, or under the Skipping line (fault: wrong placement fails). Fix 3: RemovedLine busy until the row flips (+1 s fallback), aria-disabled while busy (fault: busy cleared at once fails the double-tap test). Fix 4: alert is a sibling of the status region (test added; no planted fault run for it).
