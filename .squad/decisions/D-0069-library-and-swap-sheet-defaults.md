---
id: D-0069
title: UF-04 Library and UF-05 Swap sheet v1 — browse filters and order, detail content and attribution, compare from data we have, mid-session swap semantics, reason chips, no "also replace in routine"
status: revisit
date: 2026-09-29
by: product-owner (T-0306 groom)
area: product
---
> **Amended in part by D-0071 (2026-09-29).** §5: `SwapSheet` takes a `Workout` (props `{workout, itemIndex, onApply, onClose}`) and is the one swap sheet, used by UF-08.3 too. §6: the swapped item is built by the engine's `applySwap` (T-0224, D-0071 §7), not by the UI, and it is persisted through `useFocusSession().replaceItem` with the whole row (D-0071 §5–§6). Consequences: the UF-09 mounts go through `features/UF-09/seams.tsx` only.

## Context
The prototypes for UF-04.1–.3 and UF-05.1 show content the library doesn't have:
- movement patterns ("squat pattern") and stabiliser muscles,
- research notes with citations,
- qualitative emphasis bars, "key differences" and stance diagrams,
- variant blurbs ("More adductors"),
- a "Gym is busy" tab.

The library (`docs/data-model.md` `exercises`, D-0029) does have: name, type, level, equipment, instructions, mistakes, cue, source, license, attribution, source_url, area weights and `exercise_variants`. D-0005 (confirmed in D-0061) requires attribution on UF-04.2. Today every seeded row is `source: workoutlab`, `license: LicenseRef-workoutLab`, but wger CC-BY-SA rows are allowed.

`rankSwaps` (rule 12, D-0056, D-0059) takes a `Workout`. A running session stores only `sessions.plan` (`SessionPlan`). Nothing says how a swap works after some sets of the item have been logged. Nothing says what "Also replace it in my routine" means either, since `sessions` has no routine id.

## Decision
1. **UF-04.1 Browse:**
   - **List:** every `kind: exercise` entry from `loadLibrary()`. Warm-up moves are hidden. The list is sorted by `name` with `localeCompare` in the device locale. This is a library listing, not an engine output.
   - **Search:** a case-insensitive substring match on the name, trimmed. With no match it shows "No exercises match "{q}"".
   - **Filters:** one chip row: All, the 9 areas (the exercise has weight 1.0 there) and "My equipment". "My equipment" keeps an exercise when `isEligible(exercise, profile)` (engine rule 0, with an empty `excludeIds`) is true. It can be combined with one area chip.
   - **Row:** the name, then the primary areas, the secondary areas and the equipment ("Bodyweight" when there is none), and a link to UF-04.2.
2. **UF-04.2 Detail:**
   - **Header:** name, and a tag line "{Type} · {Level} · {equipment}".
   - **Muscles:** primary areas as highlighted pills, secondary areas as grey pills.
   - **Content:** the numbered instructions, a "Common mistakes" list (hidden when empty) and the cue.
   - **Variations:** `loadVariants(id)` as links to UF-04.3 `/library/:id/compare/:variantId`, hidden when empty.
   - **"My history":** a link to UF-06.2.
   - **Attribution** (D-0005): when `source ≠ "workoutlab"`, a block "Text: {attribution} · {license} · Source" with `license` linking to its licence URL (`CC-BY-SA-4.0` → `https://creativecommons.org/licenses/by-sa/4.0/`) and "Source" to `source_url`. When `source = "workoutlab"`, it reads "Text: workoutLab". A null `attribution` or `source_url` hides only that part.
   - **Unknown id:** it redirects to `/library`.
   - **Cut:** "Add to a routine" (UF-07.1 adds through its own picker, D-0070).
3. **UF-04.3 Compare** only shows data we have, as two columns (current | other): primary areas, secondary areas, equipment, type, level, the time per set (`setCostS`, engine, shown as "{m:ss} per set") and the cue. It ends with a link to the other exercise's UF-04.2. An `otherId` that's unknown or equal to `exerciseId` redirects to UF-04.2. The research, emphasis bars and "Swap it in for today only" are cut. UF-04 is never inside a workout.
4. **`ExerciseHowTo`** (exported by `features/UF-04`) is the in-workout how-to. It's a dialog with the name, the cue and the instructions, with no links out of the session, and Close returns focus to the button that opened it.
5. **UF-05.1 Swap sheet:**
   - **Inputs:** the `SwapSheet` component is given the session's `SessionPlan`, the session row (`time_budget_min`, `warmup_in_budget`, `energy`) and the current item. It builds the `Workout` that `rankSwaps` needs as follows: `plan`, `budgetMin`, `warmupInBudget`, `energy`, `itemsTotalS` = Σ `plan.items[].costS`, `totalS` = `itemsTotalS + 180` when `warmupInBudget` is on, `unusedS` = `max(0, availableS − itemsTotalS)` and `sessionReasons: []`. These are inputs, not results (`fitsBudget` reads only `itemsTotalS`, `costS`, `budgetMin` and `warmupInBudget`, D-0056 §3).
   - **Reason chips:** "Best match" (null, the D-0025 default for UF-05.1), "Equipment taken", "Discomfort", "Variety" and "Short on time". Each tap calls `rankSwaps` again. The list renders in engine order, never re-sorted or filtered.
   - **Each row:** the name, "{round(muscleMatch × 100)} % muscle match", "{m} min" (`timeCostS`, rounded up to whole minutes) and the equipment ("Bodyweight" when there is none). A "Best match" tag appears when `bestMatch`, and an "Over your time" tag when `fitsBudget` is false. A row with `fitsBudget: false` can still be selected (D-0056 §3).
   - **Empty list:** "No alternatives fit your equipment" and a Close button.
6. **Applying a swap mid-session:**
   - **Plan item:** it keeps its slot and its `sets`, and its `exerciseId` becomes the pick. `costS` becomes the candidate's `timeCostS`. The pre-fill is recomputed with `prefill(newExercise, {repsMin, repsMax}, history, library, now, tz, {exerciseId: old, weightKg: old item prefill.weightKg})`, rule 14 with carry (D-0057, D-0062).
   - **Reasons:** `swap {reason}` with the chosen reason (null for "Best match") is inserted after `days_since`, as D-0056 §11 does for shuffle. The main slot keeps `isMain`.
   - **Sets already logged** keep their original `exerciseId` (history is the truth). Logging continues at the next set index, so "Set 3 of 4" continues on the new exercise.
   - **Storage:** the updated plan is saved with `upsertSession({id, plan})` through the queue (offline-safe). `mainLiftId` follows the item when the main slot is swapped.
7. **Cut: "Also replace it in my routine"** (UF-05.1) and "Always use this in <routine>". A session carries no routine id in v1, so there's nothing to write to. It's a Phase 5 idea together with starting a session from a routine (D-0070 §1).

## Consequences
- T-0306a and T-0306b encode §1–§7.
- T-0306b mounts `SwapSheet` on UF-09.9 "Swap" and UF-09.6 "Swap" (explicit extra files in `features/UF-09`, after T-0304). T-0305a mounts it on UF-03.1.
- Content: variant blurbs and movement patterns would need new `exercises` columns (a data + content idea).

## Revisit when
- Exercise text or illustrations gain new fields (pattern, research, images).
- Users ask to swap a partly done exercise into a new slot instead of continuing the set count.
- Routines get linked to sessions.
