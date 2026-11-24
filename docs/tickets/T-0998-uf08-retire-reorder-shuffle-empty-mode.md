---
id: T-0998
title: UF-08 retire Reorder, Shuffle and the empty-mode Suggestions code now that the area plan replaces them
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.5]
decisions: [D-0274, D-0280, D-0236, D-0238, D-0205, D-0242]
deps: [T-1009]
status: done
---
## Why
After T-0996 and T-0997 the old controls are unreachable. Dead code and dead tests slow every later ticket (D-0274 §3). This ticket removes them and keeps the engine inputs they used.

## Scope
- In (`apps/web/src/features/UF-08/`, `apps/web/src/lib/i18n/flows/uf-08.ts`): delete Reorder mode and `order.ts`'s permutation use, Shuffle on UF-08.2, the Suggestions section and `suggestions.ts`, "Other suggestions", the `mode: "empty"` visit state and its budget line, the empty-mode branches in `AddExerciseSheet`, dead copy and CSS; keep `autoMainLift` and `fill` calls only where "Start empty" and "Fill the rest" still use them. Mark `docs/specs/empty-start-plan.md` status "folded into D-0274" (extra, product path, by grant). Delete or rewrite the tests that pinned the retired behaviour, each with a one-line reason.
- Out: the engine switches and rule 13 (stay), UF-09.10 and its sheet, data, tokens.

## Acceptance criteria
- AC1 Given UF-08.2 in any state, Then there is no "Reorder", "Move up", "Move down", "Shuffle", "Other suggestions" or "Suggestions" text or control (a text-absence test with the area plan present: the sibling assertion that the area rows still render).
- AC2 Given "Start empty" and "Suggest my workout", Then both still open UF-08.2 (empty and default) and "Fill the rest for me" still works (the T-0996 ACs pass unchanged).
- AC3 Given UF-08.5 opened from UF-08.6, Then its lead line is the area-first line of the spec (not the empty-mode "{left} of {n} min left."), and an Add is local (T-0997 AC5 unchanged).
- AC4 Given the sources, Then no import of the deleted files remains, `exports-and-lint` and `jsx-no-literals` pass, and `pnpm -w lint` is clean.
- AC5 Given UF-09.10 (add during a workout) and UF-09.9 "Do later", Then their tests pass unchanged (they are not retired).
- AC6 Given `docs/specs/empty-start-plan.md`, Then its status line says it is folded into D-0274 and `check-all` passes.

- From the T-0996 review: remove the `legacyExerciseList` prop, `Suggested.tsx`, the `F_TZ_PROPS` / `swap-before-start` opt-ins and `Adjusted.emptiedByRemove`; add a guard test that no non-test file passes `legacyExerciseList` (until the prop is gone).

- From the T-0997 review: update `Design-docs/docs/design/screens/UF-08.6.md` (lines ~39, 65, 80) and T-0997 AC3 text to the shipped copy "No other exercise for {Area} today. Use Swap." and the same-area-only rule (D-0288 §1).

## Paths you may change
- `Design-docs/docs/design/screens/UF-08.6.md` (orchestrator grant: copy sync from the T-0997 review)
- `docs/tickets/T-0997-uf08-area-detail.md` (orchestrator grant: AC3 copy sync from the T-0997 review)
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `docs/specs/empty-start-plan.md` (extra, one status line), `tests/e2e/uf-08-*.spec.ts`. Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0998` and cite UF-08.2.

## Build / accept log
- **Built.** Deleted `Suggested.tsx`, `suggestions.ts`, `order.ts`, the `legacyExerciseList` prop, `Adjusted.shuffle` / `order` / `emptiedByRemove`, `addExercise` / `fillRest` / the `pushedOut` safety net and the legacy `startWith` fallback in `SessionSetup.tsx`; 26 dead `en.uf08` keys (Reorder, Move, Shuffle, Suggestions, budget line, empty plan, push-out, `addLead` old text); 19 dead CSS classes (rows, reorder, suggest, handle...). Kept `Adjusted.mode` ("empty" = Start empty: `autoMainLift:false, fill:false` on a time chip; `AreaPlan` reads it). `AddExerciseSheet.lead` is now required and `AreaDetail` passes "{left} of {n} min left." (UF-08.5.md, AC3); its `budgetMin` prop is gone. Docs: `docs/specs/empty-start-plan.md` status "folded into D-0274", `UF-08.6.md` and T-0997 AC3 to "No other exercise for {Area} today. Use Swap." and the same-area rule (D-0288 §1).
- **Review nits (T-1009).** (1) `makeMain` now returns `{ failed: true }` on an engine throw and `startWith` shows `areaChangeFailed` (test: area-detail "T-1009 AC-start-with an engine throw reads as a failed change"). (2) The `capArea` branch of `startWith` is **unreachable**: Start with this is only offered on rows already in the plan, and the branch required `!plan.items.some(id)`. A test cannot reach it, so I deleted the dead branch (not added a test); `not_admissible` falls to `noFitStart`, which the existing `it.each` refusal case still pins. (3) `orderItems(adjusted.workout, data.library)` is a `useMemo` (`startWorkout`); no test (it is a render-cost change).
- **AC to test.** AC1 `retired-controls.test.tsx` (3 cases, area rows present + no retired text on UF-08.2 suggest / empty / filled and UF-08.6) + `exports-and-lint` (no retired `en.uf08` key). AC2 `area-plan.test.tsx` T-0996 ACs (unchanged) + `empty-mode.test.tsx` AC1/AC2/AC4. AC3 `add-exercise.test.tsx` AC1 (lead `{n} of 30 min left.`; sheet reached from UF-08.6) and `area-detail.test.tsx` T-0997 AC5 (unchanged). AC4 `exports-and-lint.test.ts` "T-0998 AC4" (no `legacyExerciseList`, no deleted-file import, files gone) + lint/typecheck. AC5 UF-09 and `add-in-workout.test.tsx` unchanged except one stylesheet regex (below). AC6 `check-all`.
- **Tests deleted, one reason each.** `suggested-view`, `suggested-actions`, `remove-without-refill` (render the deleted `Suggested` list; Remove and Never suggest on UF-08.6 are in area-detail AC4); `suggestions` (empty-mode Suggestions section, retired D-0238); `reorder` (Reorder retired, D-0274 §4); `start-with-this` (list and sheet Start with; the row button is area-detail AC6 and `makeMain` is not a `suggest` call); `swap-pins` (pins through Shuffle and the list; swap pin and rebuild is area-detail AC2); in `add-exercise` AC3-AC7, AC9 and the pin cases (re-suggest around an Add, retired D-0274 §5; the local Add is area-detail AC5); in `add-states` AC4-AC7 (8-item cap by pins, Remove of an added row, re-add, removed main; list rows); in `favorites-section` AC3 (a plan with no areas has no UF-08.6 to open the sheet from); in `favorites-suggest` the Shuffle/Add/Start-with calls and the tagged-row cases (rows are not on UF-08.2); in `excluded-suggest` the 13 list-row cases (Removed line, Never suggest, union on Shuffle: UF-08.6 has them in area-detail AC4); in `skip-today` AC3/AC4/AC7 rewritten for area rows and the 45 chip (Shuffle gone); in `swap-before-start` the row Swap button cases (rewritten to UF-08.6: AC-3 keep, T-0580 failed-exclusion alert, AC-6 bad URLs); `empty-mode` cut from 36 to 7 (budget line, Suggestions, Add by pins, push-out refusals; the plan call inputs and per-visit mode stay); `cobalt-workout` cut to the CSS guards and the sheet structure (list rows and Reorder styling); `over-budget-guard` rewritten to Add and Start with through UF-08.6 (Shuffle and Doesn't-fit line retired; UF-08.2 + / Fill over budget is area-plan T-0996 AC10); `how-to` ported to UF-08.6; `loading-handoff` mocks `AreaPlan` not `Suggested`; `level-pointer`, `favorites-section`, `add-states` AC1-AC3 open the sheet from UF-08.6 (the sheet's "Start with this" row button is not there: dropped from `level-pointer`, one reason: UF-08.6's sheet has no such button).
- **One edit in a UF-09.10 test (AC5, flag).** `add-in-workout.test.tsx` AC12 asserted `.wl-uf08__icon--text` min 44 px in the CSS; that variant was dead (nothing renders it) and went with the CSS cleanup, so the regex now reads `inline-size|block-size: 44px` on `.wl-uf08__icon`. Behaviour of UF-09.10 unchanged; `cobalt-plan.test.tsx` AC6 transition guard now expects no transition in the file (Reorder's was the only one).
- **Planted faults (backup, `cp` restore, `cmp` clean, none committed).** F1 a stray "Shuffle" button in `AreaPlan` -> AC1 x3 red. F2 `AreaDetail` lead back to "The rest of your workout adjusts..." -> AC3 add-exercise AC1 red. F3 a `legacyExerciseList` mention in `SessionSetup.tsx` -> AC4 guard x2 red. F4 `makeMain` catch back to `not_admissible` -> area-detail engine-throw case red. F5 Fill the rest does not commit -> area-plan T-0996 AC6 red. F6 Start empty's `autoMainLift/fill` removed on a time chip -> empty-mode AC4 red. Nit 2 has no fault (no test; dead branch removed).
- **Red runs on unfixed code.** After deleting the code and before the test triage: 156 failing web tests in UF-08 (all on the old list) plus 5 suites that imported `Suggested.js`; every one is above.
- **Gates.** `pnpm --filter web typecheck`, `lint` clean; `scripts/locked.sh heavy pnpm --filter web test`: all green after the triage (416 files, 5394 tests passed; `format:check` clean; `check-all` only the stacked-ticket `lane-path-not-owned` noise (plus T-0997 ticket text, edited as the review bullet asks).
- Orchestrator gate (T-0998, UF-08.2): AC3's wording is stale. `UF-08.5.md` as amended by D-0274 §5 makes "{left} of {n} min left." the only lead line, so the shipped line is right (newest decision wins). The dead `capArea` branch was deleted rather than tested: "Start with this" is only offered on rows already in the plan. The one UF-09.10 AC12 regex change is accepted, since the CSS variant it measured no longer exists.
