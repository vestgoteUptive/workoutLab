---
id: T-0941
title: "UF-08.2 empty mode: Suggestions section — engine fill around the picks, fallback call, tap to Add, focus and status, \"Other suggestions\", \"Fill the rest for me\""
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.5]
decisions: [D-0238, D-0239, D-0236, D-0237, D-0205, D-0211, D-0063]
deps: [T-0939, T-0940]
status: todo
---
## Why
The point of empty mode is "easy to select suggestions" (`docs/specs/empty-start-plan.md`). The engine already ranks what the user needs. This ticket shows its fill around the user's picks as a tap-to-add list (D-0238), with the fallback call tightened by D-0239 §3, and the focus and live-region rules of D-0239 §9–§10. The UI only picks which engine call to make and filters out what's already in the plan (principle 3).

## Scope
- In:
  - Suggestions call: `autoMainLift` = (`mainPickId` is null), `fill: true`, `pinnedIds = addedIds`, `mainLiftId = mainPickId`, `shuffle` = the visit's shuffle, plus the same `budgetMin`, `warmupInBudget`, `energy`, `avoidAreas`, `favoriteIds`, `excludeIds` as the plan call. The list = the result's items whose id is not in the plan, in engine order.
  - Fallback call (D-0239 §3): only when an id **in the current plan** (a pick or `mainPickId`) is missing from the first call's result: repeat with `autoMainLift: false`, `mainLiftId: null`. Picks dropped by a time chip don't trigger it.
  - No suggestions call when the plan is over budget (D-0239 §13.1).
  - The section per T-0939 (`section aria-labelledby`, `h2`, `ul`/`li`, UF-08.5 row anatomy, "Favorite" and "Main lift" tags, Add with name "Add {name}" ≥ 44 px), placed above "Add exercise".
  - Suggestion Add = UF-08.5 Add; a "Main lift" row sets `mainPickId` instead of pinning (D-0239 §1); safety net and refusals in the UF-08.2 status line (D-0239 §12–§13); focus per D-0239 §10.
  - "Other suggestions" (bumps the visit's `shuffle`, changes the suggestions only; hidden when the list is empty); "Fill the rest for me" (one-way switch to suggested mode with `pinnedIds = addedIds`, `mainLiftId = mainPickId`; the Suggestions section goes; Shuffle reads "Shuffle" again).
  - The empty-list copies.
  - Copy in `apps/web/src/lib/i18n/flows/uf-08.ts`.
- Out: anything T-0940 owns (entry, plan call, controls, the UF-08.5 lead line); more than one candidate per area; remembering the mode; e2e (T-0942).

## Acceptance criteria
Component tests in `apps/web/src/features/UF-08/__tests__/` with the real engine and the L1 fixture library, zero history, energy normal, warm-up on, 30 min, empty mode, unless stated.

- AC1 (B2) Given "Start empty" at 30 min, Then the Suggestions list is, in order, bench-press × 4 tagged "Main lift", inverted-row × 3, leg-extension × 2 (R7-E4), each row has a reason line and a button named "Add Bench press" / "Add Inverted row" / "Add Leg extension" at least 44 × 44 px, and the sub-line reads "For the areas that need work most. Fits your 27 min."
- AC2 (B3) Given AC1, When the user taps "Add Bench press", Then the plan is bench-press × 4 (main, `mainPickId` bench-press, `addedIds` []), the line reads "15 of 30 min · 15 min left", the suggestions are inverted-row × 3 then leg-extension × 2, focus is on "Add Inverted row", and the status reads "Bench press added. 15 min left."
- AC3 (B4) Given AC1, When the user taps "Add Leg extension", Then the plan is leg-extension only (no main lift), and for each row then shown, tapping its Add puts it in the plan with leg-extension still there (no refusal).
- AC4 (fallback trigger, D-0239 §3) Given a plan whose pick is missing from the first suggestions call's result (spy: the first call omits it), Then a second call with `autoMainLift: false` and `mainLiftId: null` is made and its result feeds the list. Given a plan whose every id is in the first result (sibling), Then exactly one suggestions call is made. Given a pick dropped by a time chip (in `addedIds`, not in the plan), Then it does not trigger the fallback.
- AC5 (B6) Given picks that leave less time than any suggestion needs, Then the list reads "Your 30 min are full." and "Other suggestions" is not rendered. Given 8 items in the plan (caps), Then the list is empty with the same copy.
- AC6 (B8) Given AC2, When the user taps "Other suggestions", Then bench-press stays in the plan and the suggestions are barbell-row × 3 then leg-extension × 2 (R13-E1, n = 1), and focus stays on "Other suggestions".
- AC7 (B12) Given AC3, When the user taps "Fill the rest for me", Then the plan deep-equals suggested mode's `suggest` with `pinnedIds` [leg-extension] and `mainLiftId` null, the Suggestions section is gone, the Shuffle control reads "Shuffle", and focus is on "Add exercise".
- AC8 (B13) Given Skip today [quads, glutes, hamstrings, calves], Then the first suggestions are bench-press, inverted-row, lateral-raise (R6-E3).
- AC9 (B14) Given every area skipped, Then the list reads "No suggestions right now. Search to add an exercise." and "Other suggestions" is not rendered.
- AC10 (B15) Given the returning-after-10-days history, Then the first suggestions are bench-press, inverted-row, calf-raise (R7-E30).
- AC11 (B22) Given a plan over budget after a `fitsBudget: false` swap, Then no suggestions call is made (spy), the list reads "Your workout is {over} min over 30 min. Remove or swap an exercise." and "Other suggestions" is not rendered.
- AC12 (B11, suggestion refusal) Given a stubbed suggestions result containing E such that adding E pushes out pick P (the safety net; unreachable with real engine output per B5), When the user taps "Add E", Then nothing changes, the UF-08.2 status reads "{E} would push out {P}. Pick more time or remove an exercise.", and focus stays on "Add E".
- AC13 (B23 focus) Given a list of three rows, When the user taps the last row's Add, Then focus moves to the new last row's Add; When the user takes the only remaining row, Then focus moves to "Add exercise"; When "Other suggestions" disappears after a tap, Then focus moves to "Add exercise"; in every case `document.activeElement` is not `body`.
- AC14 (B23 live region) Given empty mode, Then exactly one `role="status"` element exists on UF-08.2, the budget line has no `aria-live`, and each suggestion Add updates the status text.
- AC15 (no `.wl-option`, no new token) Given the rendered section, Then it is a `section` labelled by its `h2` "Suggestions", rows are `li` in a `ul`, no element has class `wl-option`, and the tags have `wl-chip wl-uf08__tag`.
- AC16 (offline, B16 unit side) Given the device offline with a cached history and library, Then AC1–AC3 behave the same.
- AC17 (suggested mode untouched) Given suggested mode, Then no Suggestions section renders and only one `suggest` call is made per re-suggest.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`, `tests/e2e/uf-08-*.spec.ts` (only to keep existing UF-08 specs passing; the new spec is T-0942's)

## Contract impact
none (engine switches from T-0936 under D-0237; on-device `suggest`, D-0063 §3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · run the UF-08 e2e specs through `scripts/locked.sh heavy` · contracts unchanged or decision linked · commit messages start with `T-0941` and cite UF-08.2.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
- **Build (web-feature:UF-08, base 17846f13, tree clean at start).** New `suggestions.ts` (`computeSuggestions`: over budget → no call; one `fill: true` call, `autoMainLift` while `mainPickId` is null; fallback call only when an id in the current plan is missing from the first result; rows = result items not in the plan). `SessionSetup.tsx`: memoised on the fields the calls read, `addExercise(id, asMain)` (a "Main lift" row sets `mainPickId`, not a pin), "Other suggestions" (bumps `shuffle`, no plan call), `fillRest` (one-way to suggested mode, over budget refused). `Suggested.tsx`: the Suggestions section above "Add exercise" (`section aria-labelledby`, `ul`/`li`, tags, "Add {name}"), list copies, focus per D-0239 §10, refusals in the status line, hidden in Reorder mode. Copy in `flows/uf-08.ts`, CSS in `uf-08.css` (existing tokens only).
- **AC to test** (`__tests__/suggestions.test.tsx`, 26 tests): AC1 `AC1` (2), AC2 `AC2`, AC3 `AC3`, AC4 `AC4` (3: trigger, sibling, time chip), AC5 `AC5` (2), AC6 `AC6`, AC7 `AC7` (2, incl. over-budget refusal), AC8 `AC8`, AC9 `AC9` (2), AC10 `AC10`, AC11 `AC11`, AC12 `AC12`, AC13 `AC13` (3), AC14 `AC14`, AC15 `AC15` (2), AC16 `AC16`, AC17 `AC17`.
- **Existing tests touched:** `empty-mode.test.tsx` helpers `lastInput` and the two `spy.mock.results.at(-1)` reads now take the last plan call (not a `fill: true` suggestions call), since empty mode now makes suggestions calls after each plan call. No assertion changed.
- **Planted faults** (backup copy, restored with `cp`, each run on suggestions + empty-mode tests): no fallback call (AC4 trigger red); fallback triggered by `addedIds` (AC4 time chip red); main row pinned (AC2 and 13 others red); `mainPickId` not set (9 red); Other suggestions re-runs the plan (AC6 red); over-budget still calls (AC11 red); Fill keeps empty mode (AC7 red); `fill: true` dropped (12 red); focus effect removed (6 red); focus to first row (AC13 red); refusal not in status (AC12 red); `wl-option` class (AC15 red); budget line `aria-live` (3 red); Other shown with no rows (5 red); Fill without the over-budget guard (AC7 over red); "full" for every empty list (new test "with picks: nothing left to suggest" red, added after the first run showed no test caught it).
- **Red run on unfixed code:** the four T-0940 tests above went red on the new code until the helpers read the plan call (expected: spy order).
- **Gate:** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1` green (379 files, 5014 tests); `-w format:check` green; UF-08 e2e (`tests/e2e/uf-08-*.spec.ts`) 73 passed. `-w check:repo` and `-w test:repo-checks` (4 tests: AC21 x2, AC-10, T-0496 AC-5) are red **identically on the clean base** (stashed my changes and re-ran): `lane-path-not-owned` for `.squad/board.md` and `docs/tickets/T-0940-*.md`, files this branch does not touch.
- **Defaults chosen:** the "time is full" vs "No suggestions right now" choice (UF-08.2.md list copy 2 vs 3) is made with one extra engine probe at the longest budget (120 min) when the list is empty, there are picks and fewer than 8 items; 8 items is "full" without a probe. No UI cost rule. A follow-up asks for a decision or an engine helper.
