---
id: T-0940
title: "UF-08.1/UF-08.2: \"Start empty\" entry and empty mode — `mode` + `mainPickId` in the setup record, plan call with `fill: false`, controls, safety net and refusal copies"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2, UF-08.3, UF-08.4, UF-08.5]
decisions: [D-0236, D-0237, D-0239, D-0235, D-0205, D-0191, D-0199, D-0109, D-0211, D-0063]
deps: [T-0935, T-0936, T-0939]
status: in-progress
---
## Why
The owner wants to start a workout empty and pick exercises (`docs/specs/empty-start-plan.md`, D-0236). This ticket builds the mode itself: the entry, the setup-record fields, the plan call that holds only the picks (`autoMainLift: false`, `fill: false`, D-0237), and how every existing UF-08.2 control behaves in it (D-0239 §1–§2, §6–§7, §9, §11–§13). The Suggestions section is T-0941. It also lands `mainPickId` in suggested mode, which amends D-0235 §2 so a time chip can't lose a chosen main lift (D-0239 §1).

## Scope
- In:
  - UF-08.1 secondary button "Start empty" under "Suggest my workout" (layout per T-0939's `UF-08.1.md`).
  - Setup record (D-0109): `mode: "suggested" | "empty"`, `mainPickId: string | null`. "Start empty" sets `mode: "empty"`, `addedIds: []`, `mainPickId: null`. Back to UF-08.1 drops the record as today.
  - `mainPickId` in **both** modes (D-0239 §1): set by "Start with this", a UF-08.3 swap of the main lift (replacing T-0935's main-lift handling), and (in T-0941) adding a "Main lift" suggestion; cleared by Remove of that item. Re-suggests pass `mainLiftId = mainPickId` in empty mode and `mainPickId ?? plan.mainLiftId` in suggested mode; never read back from a plan that dropped it.
  - Empty-mode plan call: `autoMainLift: false`, `fill: false`, `pinnedIds = addedIds`, `mainLiftId = mainPickId`, `shuffle: 0`, plus `budgetMin`, `warmupInBudget`, `energy`, `avoidAreas`, `favoriteIds`, `excludeIds` (stored ∪ visit) as today.
  - Empty-mode UF-08.2: running-total line (D-0239 §6–§7), not `aria-live`; empty-list copy; "Looks good" `aria-disabled` at 0 items with `aria-describedby`; Add (UF-08.5), Remove, Swap (D-0235 + D-0239 §1), Start with this (D-0239 §2: old main to the front of `addedIds`), Reorder, time chips; the safety net and the three refusal copies (D-0239 §12–§13); the single `role="status"` live region (D-0239 §9). The "Add exercise" button sits where T-0939 places it.
  - UF-08.5 in empty mode: header lead line "{left} of {n} min left."; the over-budget refusal on the sheet.
  - Copy in `apps/web/src/lib/i18n/flows/uf-08.ts`.
- Out: the Suggestions section, "Other suggestions", "Fill the rest for me" and suggestion focus (T-0941); e2e of the full flow (T-0942); openapi/validator (T-0937, T-0938); remembering the mode; "Clear all".

## Acceptance criteria
Unit/component tests in `apps/web/src/features/UF-08/__tests__/` with the real engine and the engine's L1 fixture library, zero history, energy normal, warm-up on, unless stated.

Entry and record
- AC1 (B1) Given UF-08.1 at 30 min, When the user taps "Start empty", Then UF-08.2 shows 0 items and "Nothing here yet. Pick from the suggestions or add an exercise.", the budget line reads "3 of 30 min · 27 min left", and "Looks good" has `aria-disabled="true"`, is focusable, and its `aria-describedby` element reads "Add at least one exercise."; activating it does not navigate.
- AC2 (B1 sibling) Given UF-08.1 at 30 min, When the user taps "Suggest my workout", Then UF-08.2 is in suggested mode with the R7-E4 plan and "Looks good" is enabled (suggested mode unchanged).
- AC3 (B1 warm-up off) Given "Start empty" at 30 min with the warm-up toggle off, Then the line reads "0 of 30 min + warm-up · 30 min left".
- AC4 (plan call) Given empty mode, When UF-08.2 renders, Then `suggest` is called with `autoMainLift: false`, `fill: false`, `pinnedIds: []`, `mainLiftId: null`, `shuffle: 0` (spy on the engine call).
- AC5 (B19) Given picks in empty mode, When the user goes Back to UF-08.1 and taps "Suggest my workout", Then UF-08.2 is in suggested mode, the `suggest` input has `pinnedIds: []` and `mainLiftId: null`, and the record's `mainPickId` is null.

Controls in empty mode
- AC6 (UF-08.5 Add) Given empty mode at 30 min, When the user adds leg-extension on UF-08.5, Then the plan is leg-extension only, the status reads "Leg extension added. {left} min left." with `{left}` = floor(`unusedS`/60), focus is on the new row (D-0205 §4), and the sheet's lead line read "{left} of 30 min left." before the Add ("30 of 30 min left." at 0 items with warm-up off; "27 of 30 min left." with it on).
- AC7 (B17) Given one pick leg-extension at 45 min, When the user taps "Looks good", Then UF-08.4 shows 1 exercise and its real duration and finish time, and Start begins UF-09 with that single item (the `sessions.plan` written has one item).
- AC8 (B9) Given a pick inverted-row, When it is removed, Then it is not in the plan, it is in the visit's `excludeIds` on the next `suggest` call, it is not in `addedIds`, and the Removed line offers "Never suggest".
- AC9 (B9, main) Given `mainPickId` bench-press, When bench-press is removed, Then `mainPickId` is null and the next plan call has `mainLiftId: null`.
- AC10 (B10) Given a pick inverted-row, When it is swapped for barbell-row on UF-08.3, Then barbell-row is in `addedIds` where inverted-row was, inverted-row is in the visit's `excludeIds`, and after a time chip inverted-row is in neither the plan nor any `suggest` result.
- AC11 (B10, main swap, D-0239 §1) Given `mainPickId` bench-press, When bench-press is swapped for db-bench-press, Then `mainPickId` is db-bench-press and the next call has `mainLiftId: "db-bench-press"`.
- AC12 (B20) Given `mainPickId` bench-press and a pick barbell-row at 45 min, When the user taps "Start with this" on barbell-row, Then barbell-row is the main lift and first, bench-press is still in the plan, `addedIds` is [bench-press] (bench-press at the front, barbell-row removed), `mainPickId` is barbell-row, and the status reads "Barbell row is the main lift now."
- AC13 (B11 / B20 refusal) Given picks that fill the time so that making a row's compound X the main lift would push out another pick P (or the old main lift), When the user taps "Start with this" on X, Then the plan, `addedIds` and `mainPickId` are unchanged, the UF-08.2 status reads "{X} would push out {P}. Pick more time or remove an exercise." (P = first pushed-out item in plan order), and focus stays on that "Start with this" button.
- AC14 (refusal copy 2) Given empty mode with picks leaving less time than exercise E needs, When the user adds E on UF-08.5, Then the sheet shows D-0205 §4's "{E} doesn't fit in {n} min." copy (with its suffix), and nothing changes. A cap case (a third chest-primary pick) shows D-0205's cap copy.
- AC15 (refusal copy 3 on the sheet) Given picks where adding E on UF-08.5 fits E but pushes out pick P, Then the sheet shows "{E} would push out {P}. Pick more time or remove an exercise." and nothing changes.
- AC16 (B7) Given picks bench-press (`mainPickId`) and inverted-row at 30 min, When the user taps the 20 chip, Then the plan keeps bench-press × 4, drops inverted-row, the line reads "Doesn't fit in 20 min: Inverted row.", inverted-row stays in `addedIds`; When the user taps 30, Then inverted-row is back.
- AC17 (B21, D-0239 §1) Given `mainPickId` M, When a time chip's plan result has no main lift (the test may stub `suggest` for this one step if no L1 main lift exceeds the 15-min `available`; R7-E2 shows bench-press × 4 fits at 15 min), Then M is named in "Doesn't fit in {n} min: …", the plan shows no main lift, the next call still passes `mainLiftId: M`, and When the original minutes are picked again, Then M is the main lift again.
- AC18 (B22) Given picks and a UF-08.3 swap confirmed with `fitsBudget: false` that puts the plan X min over 30, Then the line reads "{used} of 30 min · X min over", the bar has `data-over` and no colour change from its non-over state other than the existing `data-over` treatment (no new class or token; computed colour check against the existing `data-over` rule), and a UF-08.5 Add is refused on the sheet with "Your workout is X min over. Remove or swap an exercise first."; "Start with this" on a row is refused in the status line with the same copy.
- AC19 (live region, D-0239 §9) Given empty mode, Then the budget line has no `aria-live` attribute and exactly one element on UF-08.2 has `role="status"`; Given suggested mode (sibling), Then the budget/fit line keeps its existing `aria-live="polite"`.
- AC20 (focus never to body) Given any of AC6, AC8, AC12, AC13, AC14, When the action completes, Then `document.activeElement` is not `document.body`.

Suggested mode (D-0239 §1)
- AC21 Given suggested mode, When the user taps "Start with this" on compound X and then a time chip, Then the call passes `mainLiftId: X` (from `mainPickId`), and if X was dropped by a smaller chip, picking the original minutes brings X back as main.
- AC22 Given suggested mode with no "Start with this", When a time chip re-suggests, Then the call passes `mainLiftId = plan.mainLiftId` as today (T-0935's tests still pass).

Offline
- AC23 (B16 unit side) Given the device offline (cached history and library), When the user does AC1, AC6 and AC12, Then they behave the same and nothing is written before Start.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`, `tests/e2e/uf-08-*.spec.ts` (only to keep existing UF-08 specs passing if shared markup moves; the new empty-start spec is T-0942's)

## Contract impact
none (consumes the engine switches from T-0936 under D-0237; no openapi call, D-0063 §3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · run the UF-08 e2e specs (`npx playwright test tests/e2e/uf-08-*.spec.ts` through `scripts/locked.sh heavy`) · contracts unchanged or decision linked · commit messages start with `T-0940` and cite UF-08.1/UF-08.2.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.
