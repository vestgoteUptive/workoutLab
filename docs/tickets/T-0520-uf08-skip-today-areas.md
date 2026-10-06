---
id: T-0520
title: "UF-08.1 Skip today: nine area toggle chips feed SessionInput.avoidAreas into the fit line, Suggest and every UF-08.2 re-suggest; UF-08.2 shows \"Skipping today: …\" (GitHub #33)"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2]
decisions: [D-0191, D-0109, D-0107, D-0065]
deps: [T-0516]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33 (D-0191 §1, §2, §6). Build flow:
wl-build-web. About ½ day. Runs before T-0521 (both edit features/UF-08). -->

## Why
GitHub #33: "Today I couldn't select muscle group when starting a workout. Did legs a couple of days
ago and is sore." UF-08.1 has no area input (D-0191 Context). This ticket adds the per-workout
"Skip today" choice and sends it to the engine as `avoidAreas` (T-0516, principle 3: no UI-side
filtering of the plan).

## Scope
- In:
  - UF-08.1: under Energy, a `role="group"` named "Skip today" with the helper line "Sore or busy?
    Skipped areas stay out of this workout." It holds nine toggle buttons with the `en` area labels
    in the fixed order (chest … calves) and `aria-pressed`. None is pressed on mount.
  - `setupInput` (`SessionSetup.tsx`) and the D-0109 §1 inputs record carry `avoidAreas` (the
    pressed areas, in the fixed order). The fit line, "Suggest my workout", and every UF-08.2
    re-suggest (Remove while it still re-suggests, Shuffle, time chips) pass it.
  - UF-08.2: when `avoidAreas` isn't empty, one line under the why chips: "Skipping today: Quads,
    Glutes" (`data-part="skipping"`). It has no control.
  - Strings go in `lib/i18n/flows/uf-08.ts`.
- Out: persisting the choice (D-0191 §1), group chips such as "Legs" (D-0191 revisit), UF-08.3
  swap filtering, UF-02.1's preview (it stays `avoidAreas` absent), and Remove semantics (T-0521).

## Acceptance criteria
Use the existing UF-08 harness (`__tests__/harness.tsx`) with zero history unless stated.
- AC1 (default) Given UF-08.1 is mounted, Then the "Skip today" group shows nine buttons in the
  order Chest, Back, Shoulders, Arms, Core, Glutes, Quads, Hamstrings, Calves, all
  `aria-pressed="false"`, and the `suggest` input has no avoided areas (absent or `[]`). The fit
  line and plan equal today's (regression).
- AC2 (fit line follows the choice) Given 30 min, When Glutes, Quads, Hamstrings and Calves are
  pressed, Then the last `suggest` call's `avoidAreas` is `["glutes","quads","hamstrings","calves"]`
  (fixed order, whatever order they were tapped in), and the fit line shows that plan's counts
  (the T-0516 R6-E3 list).
- AC3 (Suggest hands it over) Given AC2, When "Suggest my workout" is pressed, Then UF-08.2 renders
  a plan with no row whose exercise has a leg area at weight 1.0, made by no new `suggest` call
  (D-0107 §2), and the "Skipping today: Glutes, Quads, Hamstrings, Calves" line is shown.
- AC4 (re-suggests keep it) Given AC3, When Shuffle is pressed, and then the 45 chip, Then each of
  the two `suggest` calls carries the same `avoidAreas`, and neither plan has a leg row.
- AC5 (Back keeps it) Given AC3, When Back is pressed to UF-08.1, Then the four chips are still
  pressed and the fit line still uses them. Given a fresh visit to `/session/setup` (remount), Then
  none is pressed.
- AC6 (toggle off) Given Quads pressed, When it is pressed again, Then `aria-pressed="false"` and
  the next `suggest` call has `avoidAreas` without quads.
- AC7 (all nine) Given all nine pressed, Then the fit line shows the existing empty-plan copy
  ("Nothing fits in 30 min"), "Suggest my workout" still works, and UF-08.2 shows the empty-plan
  state (D-0109 §4).
- AC8 (no line when empty) Given no area pressed, Then UF-08.2 has no `data-part="skipping"`
  element.
- AC9 (offline) Given `navigator.onLine = false`, Then the chips work and the plan is built on the
  device, as in AC2. Also cover the online value, per T-0327's lesson.
- AC10 (a11y and principle 2) The time stepper and chips stay the first controls on UF-08.1 in DOM
  and tab order. The group passes the AC-D10 axe check, and each chip's hit area is at least
  44 × 44 px.
- AC11 (e2e) In `tests/e2e/uf-08-setup.spec.ts`: sign in with the e2e fixture, open
  `/session/setup`, press Quads and Glutes, press Suggest, and assert no row has those areas as
  primary and the "Skipping today" line is visible.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`,
`tests/e2e/uf-08-setup.spec.ts` (listed explicitly).

## Contract impact
none (uses T-0516's engine input).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0520` and cite UF-08.1 / UF-08.2.

## Build / accept log

## Build / accept log (recorded by the orchestrator from the builder's hand-back, 2026-10-06)
- UF-08.1 gets a "Skip today" group: helper "Sore or busy? Skipped areas stay out of this workout." and nine area toggle chips (3-column grid, ≥44 px), below Energy and above the fit line; time stepper, chips and Energy stay first in DOM/tab order.
- Pressed chips → `SessionInput.avoidAreas` (fixed area order regardless of tap order) for the fit line, Suggest (hand-over, no extra suggest call) and every UF-08.2 re-suggest (shuffle, time chips). The key is omitted when none are pressed. State lives in the host: Back keeps chips pressed; a fresh `/session/setup` mount starts empty. All nine pressed → "Nothing fits in 30 min".
- UF-08.2 shows "Skipping today: …" under the why chips (no control).
- Tests: AC1–AC10 in `__tests__/skip-today.test.tsx` (13 new), AC11 the new e2e case in `tests/e2e/uf-08-setup.spec.ts` (axe clean, chips ≥44×44, no skipped-area primary row). Planted fault (drop the avoidAreas spread) → 8 of 13 red, restored.
- Gates: UF-08 vitest 317/317; `-w typecheck lint test` 19/19 (web 3664); e2e uf-08-setup 33/33; repo-checks 278/0 (one T-0524 flake on first run); format, check-all green.
