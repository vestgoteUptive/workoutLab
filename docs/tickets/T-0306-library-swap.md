---
id: T-0306
title: UF-04 Exercise library (browse, detail with attribution, compare) and UF-05.1 in-workout swap sheet
lane: split → web-feature:UF-04 (T-0306a), web-feature:UF-05 (T-0306b)
screens: [UF-04.1, UF-04.2, UF-04.3, UF-05.1, UF-09.6, UF-09.9]
decisions: [D-0005, D-0025, D-0034, D-0040, D-0056, D-0057, D-0059, D-0061, D-0062, D-0065, D-0066, D-0067, D-0069, D-0071]
deps: [T-0300, T-0203b, T-0204, T-0205, T-0224, T-0304, T-0318, T-0319]
status: split   # → T-0306a (done), T-0306b (→ T-0421, T-0422), D-0142
---
<!-- Re-groomed 2026-10-02 by product-owner (D-0142). T-0306b's build specs are T-0421 (the SwapSheet component, with the D-0093 §7 parseSessionPlan round-trip) and T-0422 (the swap seams on UF-09.9/09.6). Where they differ from the [b] ACs below, the children and D-0142 win. -->

<!-- Groomed 2026-09-29 by product-owner. Build flow: wl-build-web. Split per flow (D-0067 §1); ACs tagged [a]/[b]. Reconciled by triage 2026-09-29 (TR-0030, D-0071): SwapSheet takes a Workout and returns the engine applySwap (T-0224) result; the UI builds no swapped item; UF-09 mounts only through seams.tsx and persists through useFocusSession().replaceItem; UF-08.3 (T-0303c) reuses this sheet. -->

## Why
- **UF-04:** every exercise gets its explanation, with attribution on UF-04.2 (D-0005: the human kept CC-BY-SA in D-0061).
- **UF-05.1:** a mid-session swap. It renders `rankSwaps` (rule 12, D-0056, D-0059) exactly as ranked (principle 3), and it carries the weight over through rule 14 `carry` (T-0205, D-0057, D-0062). It must also keep focus mode to one task (principle 1): the sheet opens only from UF-09.9 Paused or UF-09.6 Next exercise.

## Split (D-0067 §1): the orchestrator edits the board
| Child | Lane | Scope | Deps | ~Size |
|---|---|---|---|---|
| T-0306a | web-feature:UF-04 | UF-04.1/.2/.3 plus the exported `ExerciseHowTo` | T-0318, T-0319 | ½ day |
| T-0306b | web-feature:UF-05 | `SwapSheet` (rankSwaps + engine `applySwap`), mounted on UF-09.9 and UF-09.6 through `seams.tsx` | T-0304, T-0224, T-0318 (T-0204, T-0205 done) | ½ day |

## Scope
- In:
  - [a] **UF-04.1** Browse: search, area chips, "My equipment" (engine `isEligible`), sorted by name (D-0069 §1).
  - [a] **UF-04.2** Detail: header, muscles, how-to, mistakes, cue, variants, "My history" link, attribution (D-0069 §2).
  - [a] **UF-04.3** Compare, from the data we have (D-0069 §3).
  - [a] **`ExerciseHowTo`**, the in-workout dialog (D-0069 §4).
  - [a] **Data:** `loadLibrary()`, `loadExerciseDetail()` and `loadVariants()` (T-0319) and `loadProfile()`.
  - [b] **`SwapSheet`**, exported from `features/UF-05/index.tsx`, props `{workout, itemIndex, onApply(result: Workout), onClose}` (D-0071 §7). It is the one swap sheet, used by UF-09.9, UF-09.6, UF-03.1 and UF-08.3.
    - It loads `loadEngineHistory()`, `loadProfile()` and `loadLibrary()` from `lib/offline`.
    - It renders the reason chips, with `rankSwaps` in engine order (D-0069 §5).
    - "Use {name}" calls the **engine** `applySwap(workout, currentExerciseId, candidateId, reason, history, profile, library, now, tz)` (T-0224) and passes its `Workout` to `onApply` unchanged. The sheet builds no plan item and persists nothing.
  - [b] **Seams:** a `swap` entry (label "Swap", `keepsClockRunning: false`) in both `pauseSeamActions` (the current item) and `nextSeamActions` (the upcoming item) in `features/UF-09/seams.tsx`. Its `render(ctx)` mounts `SwapSheet` with `ctx.workout`, and `onApply(result)` calls `ctx.replaceItem(i, result.plan.items[i], result.plan.mainLiftId)`, which persists the whole row (D-0071 §5–§6).
- Out:
  - "Also replace in my routine" and "Always use this in <routine>" (D-0069 §7).
  - Research, emphasis bars and stance diagrams (D-0069 §3).
  - "Add to a routine" on UF-04.2 (UF-07 adds through its own picker).
  - The UF-08.3 mount (T-0303c mounts this sheet).
  - The UF-03.1 swap button (T-0305a mounts this sheet).
  - The swap semantics themselves (rep slot, carry, reasons, costs): engine T-0224. The UI never builds a swapped item (principle 3).
  - The `ExerciseHowTo` seam entry on UF-09.9 (T-0305a).
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
- **AC-B6 (the sheet ranks the Workout it's given, D-0069 §5)** Given a `Workout` with `budgetMin 30`, `warmupInBudget true`, `itemsTotalS 1545`, `totalS 1725`, `unusedS 75` and `sessionReasons []` (the fixture plan with `costS` [720, 555, 270], built the D-0069 §5 way, which is what `ctx.workout` gives in UF-09), `rankSwaps` receives that exact object (reference-equal). The sheet computes no totals.
- **AC-B7 (apply through the engine, D-0071 §7)** Picking db-row with "Variety" and "Use Db row" calls the engine `applySwap(workout, "barbell-row", "db-row", "variety", history, profile, library, now, tz)` (T-0224) exactly once (spy on the real function), and `onApply` receives its return value reference-equal. "Best match" passes `reason: null`. A source test finds no `prefill(` call, no `costS` arithmetic and no `reasons` construction in `features/UF-05`. The swap semantics (rep slot, carry, reason position, costs, `mainLiftId`) are T-0224's worked examples, not ACs here.
- **AC-B8 (main slot, through the real engine)** Swapping item 0 (bench-press, `isMain`) to push-up through the real `applySwap` gives `onApply` a result with `plan.items[0].isMain` true and `plan.mainLiftId` "push-up", and the seam passes `"push-up"` as `replaceItem`'s third argument.
- **AC-B9 (carry, R14-E7, through the real engine)** A lat-pulldown item with a pre-fill weight of 50, swapped to seated-cable-row with no history, renders the engine's `prefill {weightKg: 50, kind: "carry"}` on the next UF-09.3. barbell-row at 60 swapped to db-row renders `weightKg: null, kind: "first_time"` ("Set weight").
- **AC-B10 (persisted, offline, D-0071 §5–§6)** With `navigator.onLine = false`, Apply from the UF-09.9 seam calls `ctx.replaceItem(1, result.plan.items[1], result.plan.mainLiftId)` once and makes no direct `upsertSession` call from `features/UF-05` (spy). In the integration test with the real host, the IndexedDB row then holds the new plan, and its other fields are unchanged. A remount of the UF-09 host reads it back. The applied plan passes `parseSessionPlan`. Logged sets of the old exercise keep `exerciseId "barbell-row"`, and logging continues at the next set index.
- **AC-B11 (mounted through seams.tsx, principle 1)** `seams.tsx` has a `swap` entry (`keepsClockRunning: false`) in both arrays, and the diff touches no other `features/UF-09` file. On UF-09.9 Paused, "Swap" (after Resume, in the T-0304 AC-A9 order) opens the sheet for the current item. On UF-09.6 Next exercise, "Swap" opens it for the upcoming item, and the 60 s countdown doesn't run while it's open. Cancel returns to the same screen with the plan unchanged (deep-equal) and no write. The sheet contains no link to `/balance`, `/plan`, `/library` or `/progress`. `features/UF-05` doesn't import `features/UF-09` (source test).
- **AC-B12 (empty list)** A mocked `[]` shows "No alternatives fit your equipment" and a Close button, and nothing is written.
- **AC-B13 (a11y)** The sheet is `role="dialog"` with an accessible name of "Replace <exercise name>". The reason chips are a radio group. Every option row is ≥ 44 px tall. vitest axe (the D-0060 §7 helper) finds 0 violations.

## Paths you may change
- [a] `apps/web/src/features/UF-04/**`, `apps/web/src/lib/i18n/flows/uf-04.ts` (extra), `tests/e2e/uf-04-library.spec.ts` (extra, new file, D-0071 §10). `features/UF-04/index.tsx` exports `ExerciseHowTo` (T-0305a mounts it on UF-09.9 and UF-03.1).
- [b] `apps/web/src/features/UF-05/**`, `apps/web/src/lib/i18n/flows/uf-05.ts` (extra), and in `features/UF-09` **only `apps/web/src/features/UF-09/seams.tsx`** (extra, D-0071 §4: the `swap` entries). If the host's overlay mechanism lacks something, raise a follow-up for web-feature:UF-09.
- Read-only imports: `@workoutlab/engine` (`rankSwaps`, `applySwap`), `lib/offline` loaders, `lib/i18n/*`. `features/UF-04` and `features/UF-05` may not import `features/UF-02|06|07|10|11` or `components/body-map` (D-0071 §9), because they render inside UF-09.

## Contract impact
None. `SwapCandidate`/`SwapCandidateList` render as in `api/openapi.yaml`. The stored plan stays a valid `SessionPlan` v1 (a test runs `parseSessionPlan` on the applied plan). The defaults are in D-0069 (`revisit`).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for tagged ACs · `check:size` green · contracts unchanged · commits start `T-0306a:`/`T-0306b:` with screen IDs (e.g. `T-0306b UF-05.1: rankSwaps order`).
