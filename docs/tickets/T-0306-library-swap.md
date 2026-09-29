---
id: T-0306
title: UF-04 Exercise library (browse, detail with attribution, compare) and UF-05.1 in-workout swap sheet
lane: split → web-feature:UF-04 (T-0306a), web-feature:UF-05 (T-0306b)
screens: [UF-04.1, UF-04.2, UF-04.3, UF-05.1, UF-09.6, UF-09.9]
decisions: [D-0005, D-0025, D-0034, D-0040, D-0056, D-0057, D-0059, D-0061, D-0062, D-0067, D-0069]
deps: [T-0300, T-0203b, T-0204, T-0205, T-0304, T-0318, T-0319]
status: ready
---
<!-- Groomed 2026-09-29 by product-owner. Build flow: wl-build-web. Split per flow (D-0067 §1); ACs tagged [a]/[b]. -->

## Why
- **UF-04:** every exercise gets its explanation, with attribution on UF-04.2 (D-0005: the human kept CC-BY-SA in D-0061).
- **UF-05.1:** a mid-session swap. It renders `rankSwaps` (rule 12, D-0056, D-0059) exactly as ranked (principle 3), and it carries the weight over through rule 14 `carry` (T-0205, D-0057, D-0062). It must also keep focus mode to one task (principle 1): the sheet opens only from UF-09.9 Paused or UF-09.6 Next exercise.

## Split (D-0067 §1): the orchestrator edits the board
| Child | Lane | Scope | Deps | ~Size |
|---|---|---|---|---|
| T-0306a | web-feature:UF-04 | UF-04.1/.2/.3 plus the exported `ExerciseHowTo` | T-0318, T-0319 | ½ day |
| T-0306b | web-feature:UF-05 | `SwapSheet` plus the apply-swap function, mounted on UF-09.9 and UF-09.6 | T-0304, T-0318 (T-0204, T-0205 done) | ½ day |

## Scope
- In:
  - [a] **UF-04.1** Browse: search, area chips, "My equipment" (engine `isEligible`), sorted by name (D-0069 §1).
  - [a] **UF-04.2** Detail: header, muscles, how-to, mistakes, cue, variants, "My history" link, attribution (D-0069 §2).
  - [a] **UF-04.3** Compare, from the data we have (D-0069 §3).
  - [a] **`ExerciseHowTo`**, the in-workout dialog (D-0069 §4).
  - [a] **Data:** `loadLibrary()`, `loadExerciseDetail()` and `loadVariants()` (T-0319) and `loadProfile()`.
  - [b] **`SwapSheet`**, props `{sessionId, plan, sessionRow, itemIndex, onClose, onSwapped}`:
    - the reason chips, and `rankSwaps` rendered in engine order (D-0069 §5)
    - `applySwap()`, a pure function that builds the updated `SessionPlan` (D-0069 §6)
    - persisting through `upsertSession({id, plan})`
    - mounting on the UF-09.9 "Swap" and UF-09.6 "Swap" actions
- Out:
  - "Also replace in my routine" and "Always use this in <routine>" (D-0069 §7).
  - Research, emphasis bars and stance diagrams (D-0069 §3).
  - "Add to a routine" on UF-04.2 (UF-07 adds through its own picker).
  - The UF-08.3 pre-start swap (T-0303).
  - The UF-03.1 swap icon (T-0305a mounts the sheet).
  - Contracts.

### Edge cases that are in scope
- **Offline:**
  - UF-04 renders from the Dexie cache (NFR-OFF-1).
  - The swap sheet ranks on the device from cached history plus the queue, and the swap persists through the queue.
  - A reload after an offline swap shows the new exercise.
- **Time running out:**
  - `fitsBudget: false` candidates are still listed with "Over your time" and can be picked (D-0056 §3).
  - "Short on time" reorders by `timeCostS` (engine).
- **Zero history:** a swap gives `prefill.kind` `carry` (shared area + equipment) or `first_time` (R14-E7).
- **Returning after 10 days off:** a swap to an exercise last done 12 days ago gets `hold_after_break` from `prefill` (engine), shown as the engine returns it.
- **No alternatives:** "No alternatives fit your equipment" and Close. The plan is unchanged.

## Acceptance criteria
- **Tests:** Vitest + Testing Library + `fake-indexeddb`, and Playwright where tagged **e2e**.
- **Fixtures:**
  - Library: the engine L1 table (`docs/engine-rules.md`) plus `detail` text rows.
  - Profile: F-profile, level beginner, full equipment.
  - Clock: tz Europe/Stockholm, now `2026-09-27T12:00:00+02:00`.
  - Session plan: R7-E4-style, i.e. bench-press × 4 (main), barbell-row × 3, leg-extension × 2, budget 30, warm-up on.

### T-0306a UF-04
- **AC-A1 (browse order + no warm-ups)** Given the L1 library plus 8 warm-up moves, UF-04.1 lists 22 rows sorted by name with `localeCompare`, and no `wu-*` id.
- **AC-A2 (search)** Typing "  ROW " (trimmed, case-insensitive substring of the name) shows exactly Barbell row, Db row, Inverted row and Seated cable row. It doesn't show Straight-arm pulldown. Typing "zzz" shows the text `No exercises match "zzz"`.
- **AC-A3 (area chip)** The "Hamstrings" chip shows exactly the exercises with `areas.hamstrings === 1` (romanian-deadlift, leg-curl). It doesn't show back-squat (0.5).
- **AC-A4 (My equipment = engine isEligible)** With a profile of equipment `[dumbbell]` and level beginner, "My equipment" shows exactly the L1 entries where engine `isEligible(e, profile)` is true. The test computes the expected set with the same engine call, and spies that the component calls it. pull-up (intermediate) is absent, and push-up (no equipment) is present.
- **AC-A5 (detail content)** `/library/back-squat` shows:
  - the tag line "Compound · Beginner · Barbell, Rack"
  - primary pills Quads and Glutes, and secondary pills Hamstrings and Core
  - the instructions as an ordered list in stored order, the mistakes list and the cue
  - a "My history" link to `/progress/back-squat`
  - with `mistakes: []`, no "Common mistakes" heading
- **AC-A6 (attribution, D-0005)**
  - A row `{source: "wger", license: "CC-BY-SA-4.0", attribution: "wger.de contributors", source_url: "https://wger.de/exercise/1"}` shows "Text: wger.de contributors · CC-BY-SA-4.0 · Source". The licence link goes to `https://creativecommons.org/licenses/by-sa/4.0/`, and "Source" goes to `https://wger.de/exercise/1`.
  - A row `{source: "workoutlab"}` shows "Text: workoutLab" and no licence link.
  - With `source_url: null`, only the Source link is hidden.
- **AC-A7 (variants → compare)** `loadVariants("back-squat")` = [goblet-squat, leg-press] → two links to `/library/back-squat/compare/goblet-squat` and `…/leg-press`, in that order. With no variants, there's no "Variations" section.
- **AC-A8 (compare, D-0069 §3)** `/library/back-squat/compare/leg-extension` shows both names as column headers, primary areas "Quads, Glutes" | "Quads", equipment "Barbell, Rack" | "Machine", type Compound | Isolation, and a time per set of "2:45" | "1:45" (engine `setCostS` = 165 | 105). `…/compare/back-squat` and `…/compare/nope` redirect to `/library/back-squat`.
- **AC-A9 (unknown id)** `/library/nope` redirects to `/library`.
- **AC-A10 (offline)** After one online `refreshAll()`, with `fetch` rejecting and `navigator.onLine = false`, AC-A1, AC-A5 and AC-A7 render the same, with no network call awaited.
- **AC-A11 (ExerciseHowTo)** `<ExerciseHowTo exerciseId="back-squat">` opened from a button renders `role="dialog"` named "How to: Back squat", with the cue and the instructions and no `a[href]` elements. Escape or Close closes it, and focus returns to the opener.
- **AC-A12 (a11y, e2e)** axe on `/library`, `/library/back-squat` and `/library/back-squat/compare/leg-extension` finds 0 serious or critical violations. The chips and rows are ≥ 44 × 44 px.

### T-0306b UF-05.1
- **AC-B1 (engine order, reason null)** With the fixture plan and the current item barbell-row, the sheet opens with "Best match" selected and rows in exactly the order of `rankSwaps("barbell-row", null, workout, profile, library, history, now, tz)`: db-row, inverted-row, lat-pulldown, seated-cable-row, straight-arm-pulldown (R12-E1). Only the first row has "Best match".
- **AC-B2 (never re-sorted)** With `rankSwaps` mocked to return [straight-arm-pulldown (0.667), db-row (1.0)], the sheet renders them in that order.
- **AC-B3 (reason chips re-rank)**
  - Tapping "Short on time" calls `rankSwaps` with `"short_on_time"` and renders R12-E2's order (straight-arm-pulldown first).
  - "Discomfort" renders R12-E4's order.
  - "Equipment taken" and "Variety" pass `"equipment_taken"` and `"variety"`.
  - The chip set is exactly: Best match, Equipment taken, Discomfort, Variety, Short on time.
- **AC-B4 (row content)** A candidate `{exerciseId: straight-arm-pulldown, muscleMatch: 0.667, timeCostS: 375, equipment: [cable], fitsBudget: true}` reads "Straight-arm pulldown", "67 % muscle match", "7 min" and "Cable". `equipment: []` reads "Bodyweight".
- **AC-B5 (over budget still pickable)** A mocked candidate with `fitsBudget: false` shows "Over your time", and it can be selected and applied.
- **AC-B6 (Workout built from the stored plan, D-0069 §5)** Given `sessionRow {time_budget_min 30, warmup_in_budget true, energy "normal"}` and the plan items' `costS` [720, 555, 270], the `Workout` passed to `rankSwaps` has `budgetMin 30`, `warmupInBudget true`, `itemsTotalS 1545`, `totalS 1725`, `unusedS 75` and `sessionReasons []`, and `plan` is the stored plan by reference-equal content.
- **AC-B7 (applySwap, D-0069 §6)** `applySwap(plan, 1, {exerciseId: "db-row", timeCostS: 555}, "variety", deps)` returns a plan where:
  - item 1 has `exerciseId "db-row"`, `sets 3`, `isMain false` and `costS 555`
  - `prefill` equals engine `prefill(db-row, {repsMin 8, repsMax 12}, history, library, now, tz, {exerciseId: "barbell-row", weightKg: <old prefill weight>})`
  - `reasons` contains `{code: "swap", reason: "variety"}` directly after the `days_since` entry (or after `area_deficit` when there's no `days_since`)
  - every other item is deep-equal to the input
  - the input isn't mutated
  - "Best match" gives `reason: null`
- **AC-B8 (main slot)** Swapping item 0 (bench-press, `isMain`) to push-up keeps `isMain: true` and sets `plan.mainLiftId = "push-up"`.
- **AC-B9 (carry, R14-E7 through the sheet)** A plan whose item 1 is lat-pulldown with a pre-fill weight of 50, swapped to seated-cable-row with no history, stores `prefill {weightKg: 50, kind: "carry"}`. barbell-row at 60 swapped to db-row stores `weightKg: null, kind: "first_time"`.
- **AC-B10 (persisted, offline)** With `navigator.onLine = false`, Apply calls `upsertSession({id, plan: <new plan>})` once, and the IndexedDB session row holds the new plan. A remount of the UF-09 host reads it back. Logged sets of the old exercise keep `exerciseId "barbell-row"`.
- **AC-B11 (mounted, principle 1)** On UF-09.9 Paused, "Swap" opens the sheet for the current item. On UF-09.6 Next exercise, "Swap" opens it for the upcoming item. Cancel returns to the same screen with the plan unchanged (deep-equal). The sheet contains no link to `/balance`, `/plan`, `/library` or `/progress`.
- **AC-B12 (empty list)** A mocked `[]` shows "No alternatives fit your equipment" and a Close button, and nothing is written.
- **AC-B13 (a11y)** The sheet is `role="dialog"` with an accessible name of "Replace <exercise name>". The reason chips are a radio group. Every option row is ≥ 44 px tall. vitest axe (the D-0060 §7 helper) finds 0 violations.

## Paths you may change
- [a] `apps/web/src/features/UF-04/**`, `apps/web/src/lib/i18n/flows/uf-04.ts` (extra), `tests/e2e/library.spec.ts` (extra, new file).
- [b] `apps/web/src/features/UF-05/**`, `apps/web/src/lib/i18n/flows/uf-05.ts` (extra), and in `apps/web/src/features/UF-09/**` only the UF-09.9 and UF-09.6 action wiring that opens `SwapSheet` (extra, D-0067 §4). Name the files in the PR.

## Contract impact
None. `SwapCandidate`/`SwapCandidateList` render as in `api/openapi.yaml`. The stored plan stays a valid `SessionPlan` v1 (a test runs `parseSessionPlan` on the applied plan). The defaults are in D-0069 (`revisit`).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for tagged ACs · `check:size` green · contracts unchanged · commits start `T-0306a:`/`T-0306b:` with screen IDs (e.g. `T-0306b UF-05.1: rankSwaps order`).
