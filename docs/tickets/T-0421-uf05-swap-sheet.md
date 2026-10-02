---
id: T-0421
title: "UF-05.1 SwapSheet component: rankSwaps in engine order with the five reason chips, rows with match/time/equipment, Over your time still pickable, Use → engine applySwap → onApply unchanged; the applied plan round-trips through parseSessionPlan (D-0093 §7)"
lane: web-feature:UF-05
screens: [UF-05.1]
decisions: [D-0142, D-0069, D-0071, D-0093, D-0056, D-0059, D-0105, D-0130, D-0079, D-0060]
deps: [T-0224, T-0226, T-0318]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. First child of the T-0306b board row (D-0142 §1 §5). Build flow: wl-build-web. About ½ day. The component needs no UF-09 code (it takes a Workout and hands one back), so it can run now. The seam mount on UF-09.9/09.6 is T-0422. UF-08.3 (T-0303c) and the List view (T-0418) mount this same component. -->

## Why
- **UF-05.1** is the one swap sheet (D-0071 §7). It is used by UF-09.9, UF-09.6, UF-03.1 and UF-08.3.
- **Principle 3:** it renders `rankSwaps` (rule 12) exactly as ranked, and the engine's `applySwap` (rule 12.1, T-0224) builds the swapped item. The UI never re-sorts, filters or builds an item.
- **Principle 1:** it has no way out of the session. It is a dialog with one task: pick a replacement.
- **D-0093 §7:** the engine package has no `@workoutlab/shared` dependency, so the `parseSessionPlan` round-trip of `applySwap`'s output is asserted here, on the web side.

## Scope
- In (`features/UF-05`):
  - **`SwapSheet`**, the one export of `features/UF-05/index.tsx` (with its props type). Props `{workout, itemIndex, onApply(result: Workout): void | Promise<void>, onClose, timeZone?}` (D-0071 §7, D-0142 §5).
  - **Data:** `loadEngineHistory()`, `loadProfile()` and `loadLibrary()` from IndexedDB, with no refresh (it renders inside a workout, D-0111 §11).
  - **Chips:** Best match (`null`), Equipment taken, Discomfort, Variety, Short on time. Each tap calls `rankSwaps(currentExerciseId, reason, workout, profile, library, history, now, tz)` again (D-0130 argument order).
  - **Rows** (D-0069 §5): the name, "{round(muscleMatch × 100)} % muscle match", "{ceil(timeCostS / 60)} min", the equipment ("Bodyweight" for `[]` or `["none"]`), a "Best match" tag when `bestMatch`, and an "Over your time" tag when `fitsBudget` is false.
  - **"Use {name}"** calls `applySwap(workout, currentExerciseId, candidateId, reason, history, profile, library, now, tz)` and passes its result to `onApply` unchanged.
  - **States:** pending and rejected `onApply` (D-0142 §5), the empty list, and a load failure.
  - **Strings** in `flows/uf-05.ts`. The equipment labels are copied there (D-0079 §5 allows it; T-0341 later moves them to a shared module).
- Out:
  - The seam entries (T-0422), the UF-03.1 button (T-0418), and the UF-08.3 mount (T-0303c).
  - "Also replace in my routine" (D-0069 §7).
  - Any swap semantics: rep slot, carry, reasons, costs (engine T-0224).
  - Persisting anything: the caller persists `onApply`'s result.

### Edge cases that are in scope
- **Offline:** the sheet ranks from IndexedDB (cached history plus the queue) and makes no network call (AC-9).
- **Time running out:** `fitsBudget: false` candidates are listed with "Over your time" and can be applied (AC-5). "Short on time" re-ranks by `timeCostS` (AC-3).
- **Zero history:** the result's pre-fill is `carry` or `first_time` (R14-E7, AC-7).
- **Returning after 10 days off:** a candidate last done 12 days ago gets `hold_after_break` from the engine, passed through unchanged (AC-7).
- **No alternatives:** "No alternatives fit your equipment" and Close (AC-8).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb`. Clock: tz `Europe/Stockholm` (the `timeZone` prop), now `2026-09-27T12:00:00+02:00`. Library: engine L1. Profile: beginner, full equipment.
- **Workout W5:** bench-press × 4 (main), barbell-row × 3, leg-extension × 2, `budgetMin` 30, `warmupInBudget` true, built the D-0069 §5 way. It is the rule 12 session behind R12-E1…E5.
- `rankSwaps` and `applySwap` are the **real** engine functions, wrapped in spies (`vi.spyOn` on the module namespace), unless an AC says "mocked".
- Tests render `<SwapSheet>` directly.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on `main` (`features/UF-05` doesn't exist). The build log records these planted faults turning their ACs red:
- sorting candidates by `muscleMatch` in the UI (AC-2);
- a UI-built item `{...plan.items[i], exerciseId: candidateId}` passed to `onApply` (AC-6, AC-10);
- hiding `fitsBudget: false` rows (AC-5).

- **AC-1 (engine order, reason null)** With W5 and `itemIndex: 1` (barbell-row), the sheet opens with "Best match" checked, and the rows are, in this order: db-row, inverted-row, lat-pulldown, seated-cable-row, straight-arm-pulldown (R12-E1). `rankSwaps` was called with `("barbell-row", null, workout, …)`. Only the first row has the "Best match" tag.
- **AC-2 (never re-sorted)** With `rankSwaps` mocked to return [straight-arm-pulldown (`muscleMatch` 0.667), db-row (1.0)], the rows are in that order.
- **AC-3 (reason chips re-rank)**
  - The chips are one `role="radiogroup"` with exactly: Best match, Equipment taken, Discomfort, Variety, Short on time.
  - "Short on time" calls `rankSwaps` with `"short_on_time"` and renders R12-E2's order (straight-arm-pulldown first). "Discomfort" renders R12-E4's order.
  - "Equipment taken" and "Variety" pass `"equipment_taken"` and `"variety"`.
- **AC-4 (row content)** A mocked candidate `{exerciseId: "straight-arm-pulldown", muscleMatch: 0.667, timeCostS: 375, equipment: ["cable"], fitsBudget: true, bestMatch: false}` reads "Straight-arm pulldown", "67 % muscle match", "7 min" and "Cable". `equipment: []` reads "Bodyweight". `timeCostS: 360` reads "6 min" (the ceiling's other value).
- **AC-5 (over budget still pickable, D-0056 §3)** A mocked candidate with `fitsBudget: false` shows "Over your time", can be selected, and "Use …" calls `applySwap`. The pair, `fitsBudget: true`, has no tag.
- **AC-6 (apply through the engine, D-0071 §7)**
  - Picking db-row under "Variety" and "Use Db row" calls `applySwap(workout, "barbell-row", "db-row", "variety", history, profile, library, now, "Europe/Stockholm")` exactly once (the real function, spied), with `workout` reference-equal to the prop. `onApply` receives its return value, reference-equal.
  - Under "Best match" the reason passed is `null`.
  - `rankSwaps` receives the `workout` prop reference-equal (the sheet computes no totals).
  - A source test finds no `prefill(` call, no `costS` arithmetic and no `reasons` construction in `features/UF-05`.
- **AC-7 (real engine results, R12-E7, R12-E8)**
  - **Main slot.** `itemIndex: 0` (bench-press) to push-up under "Equipment taken" gives `onApply` a result with `plan.items[0].isMain` true and `plan.mainLiftId` "push-up".
  - **Carry.** A lat-pulldown item with pre-fill 50 kg, swapped to seated-cable-row with no history, gives `prefill {weightKg: 50, kind: "carry"}`. barbell-row at 60 kg to db-row gives `weightKg: null, kind: "first_time"`.
  - **10 days off.** With db-row last done 12 days ago (a cached session), barbell-row to db-row gives `prefill.kind` "hold_after_break".
- **AC-8 (empty list and load failure)** With `rankSwaps` mocked to `[]`, the sheet shows "No alternatives fit your equipment" and a Close button. Close calls `onClose`. `onApply` is never called. With `loadProfile()` resolving `null` or `loadLibrary()` rejecting, it shows "Couldn't load alternatives." and Close, with no uncaught error and no unhandled rejection.
- **AC-9 (offline, pending, rejection, D-0142 §5)**
  - **Offline.** With `navigator.onLine = false` and the cache seeded, AC-1 renders the same, and no `fetch` is made (spy).
  - **Pending.** While a returned `onApply` promise is held, "Use …" has `aria-disabled="true"`, and a second click makes no second `applySwap` call.
  - **Rejection.** "Couldn't save the swap. Try again." (polite) shows, the sheet stays open, and "Use …" works again.
  - **Throw.** With `applySwap` mocked to throw a `RangeError`, the sheet shows "Couldn't swap to that exercise." and doesn't call `onApply`.
- **AC-10 (the applied plan round-trips, D-0093 §7)** For each of these real `applySwap` results, `parseSessionPlan(result.plan)` is `ok` and its plan deep-equals `result.plan`:
  - R12-E6 (accessory, zero history);
  - R12-E8 (main slot);
  - R12-E9 (a timed candidate, plank into a dead-bug slot);
  - R12-E10 (a back-off slot).
  The planted UI-built item makes at least one of them fail.
- **AC-11 (dialog, principle 1, a11y)**
  - `role="dialog"` named "Replace Barbell row" (the current item's library name).
  - Escape calls `onClose`.
  - The sheet has no `a[href]` at all.
  - Every option row is a radio in a second group named "Replacement", and is ≥ 44 px tall (a stylesheet test that reads the UF-05 CSS: the row class has `min-height` ≥ 44px, the `OfflineStatus.test.tsx` size-check pattern). T-0422's e2e measures it with `boundingBox()`.
  - The vitest axe helper (D-0060 §7) finds 0 violations with the list, the empty state and the load failure.
- **AC-12 (exports and imports)** `features/UF-05/index.tsx` exports exactly `SwapSheet` (an export-keys pin). A source test finds no import of `features/UF-09`, `UF-02`, `UF-06`, `UF-07`, `UF-10`, `UF-11` or `components/body-map` in `features/UF-05` (D-0071 §4 §9). `ESLint.lintText` confirms the lint ban for one of them.

## Paths you may change
- `apps/web/src/features/UF-05/**` (the lane: `web-feature:UF-05`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-05.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0421-uf05-swap-sheet.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `@workoutlab/engine` (`rankSwaps`, `applySwap`), `@workoutlab/shared` (`parseSessionPlan`, tests), `lib/offline` (`loadEngineHistory`, `loadProfile`, `loadLibrary`), `lib/i18n/en.ts`.

## Contract impact
None. `SwapCandidate` and `Workout` render as in `api/openapi.yaml`. The applied plan stays a valid `SessionPlan` v1 (AC-10).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `check:size` green · contracts unchanged · commits start `T-0421` and cite the screen (for example `T-0421 UF-05.1: rankSwaps order`).

## Notes
- **Flow:** `wl-build-web`.
- **Board:** T-0303c (UF-08.3) may depend on this ticket instead of T-0306b (D-0142 Consequences).
- **Parallel:** it is parallel-safe with T-0419 (UF-03) and every UF-09 ticket.

## Build log
- 2026-10-02, frontend-dev. `features/UF-05/index.tsx` exports only `SwapSheet` (and the `SwapSheetProps` type). `SwapSheet.tsx` reads `loadEngineHistory`, `loadProfile` and `loadLibrary` from IndexedDB (no refresh, no fetch). It renders `rankSwaps(current, reason, workout, profile, library, history, now, tz)` as returned and passes `applySwap(…)`'s result to `onApply` unchanged. `labels.ts` words a candidate (percent, `ceil` minutes, equipment, with "Bodyweight" for `[]`/`["none"]`). `uf-05.css` uses tokens only. The strings are in `flows/uf-05.ts`, and the equipment labels are copied from UF-04 (D-0079 §5). Build defaults are in **D-0160**: one mount-time `now`, the first row preselected and re-selected on a chip change, a `rankSwaps` throw shown as the load failure, Close in every state.
- Tests (`features/UF-05/__tests__/`, 62 cases):
  - `engine.test.tsx` (real `rankSwaps`/`applySwap`, spied with `vi.spyOn` on the namespace; real fake-indexeddb cache): AC-1, AC-3, AC-6, AC-7, AC-9 offline (plus a queued-set case), AC-10 (R12-E6, E8, E9 and E10 through the sheet; each result `toStrictEqual`s an independent `applySwap` call and `parseSessionPlan` round-trips it through JSON), and AC-5 with the real R12-E11 over-budget candidate.
  - `mocked.test.tsx`: AC-2, AC-4, AC-5, AC-8, and AC-9 pending, rejection and throw.
  - `dialog.test.tsx`: AC-11, including axe in three states and the 44 px stylesheet check.
  - `exports-and-lint.test.ts`: AC-12 and the AC-6 source test.
- Red on `main`: with the four UF-05 source files removed and `flows/uf-05.ts` at its `main` content, the three render suites fail to import and 6 of the 13 `exports-and-lint` cases fail. The 7 that pass are the ESLint config checks and the regex self-tests, which hold on `main` by design.
- Planted faults (`vitest run` of the three render suites, 49 cases; each fault reverted after):
  - **UI sort by `muscleMatch`:** 2 red, AC-2 "renders the mocked order…" and AC-3 "Short on time renders R12-E2…".
  - **UI-built item `{...plan.items[i], exerciseId: candidateId}` passed to `onApply`:** 11 red: AC-6 (reference-equal), AC-7 ×4, AC-9 queued, AC-10 ×4 (R12-E6, E8, E9, E10) and the R12-E11 case.
  - **Hiding `fitsBudget: false` rows:** 3 red: AC-5 mocked, AC-5 R12-E11, and AC-2 "never filters".
- Both values: Best match vs another chip, bestMatch tag true/false, fitsBudget true/false, ceil 375 → 7 and 360 → 6, `[]`/`["none"]` vs real equipment, main vs accessory slot, carry vs first_time, a 12-day vs a 3-day gap, empty vs non-empty, loaded vs failed, void vs promise `onApply`, a resolved vs rejected promise, and applySwap ok vs throwing.
- No Playwright spec: the sheet has no route or mount until T-0422, whose e2e measures the row with `boundingBox()`.
- Gates: web `typecheck` and `lint` are green, `-w format:check` is green and `check:repo` is green. Web `test` has 2362 passing and 1 failing: `build.test.ts` AC-A6 requires every `src/features/*` folder to be a route chunk, and UF-05 has no route by design. That file is in the web-shell lane, so this is **TR-0042**, and the branch must not merge before it is fixed.
