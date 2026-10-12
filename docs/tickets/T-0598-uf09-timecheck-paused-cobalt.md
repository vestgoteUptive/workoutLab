---
id: T-0598
title: "UF-09.8 Time check and UF-09.9 Paused in the plan state: selected option rows for the time-check choices (native radios), Paused stats in the stat role, Resume as a lift-coloured session button, End workout as the secondary outline placed last"
lane: web-feature:UF-09
screens: [UF-09.8, UF-09.9]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0120, D-0205]
deps: [T-0597]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Time check", "Paused" (#turn-4). Behaviour: T-0304d, screens/UF-09.9.md (incl. Do later, T-0579). UF-09 folder chain; never in parallel with T-0580. -->
## Why
Decisions made mid-session are plan moments, so they're cobalt (D-0208 §2). Paused's Resume is the lift colour, because it takes you back into the set (README "Screens").

## Scope
- **In:**
  - `time-check-view.tsx`, `paused.tsx` and `uf-09.css`.
  - Both roots have `data-wl-state="plan"`.
  - **Time check:**
    - the `h1` ("6 min behind") in the page-title role, and the planned-finish line as a label;
    - the three options are `.wl-option` rows on their existing native radios;
    - Continue is the one primary.
  - **Paused:**
    - the stats in `.wl-type-stat`;
    - Resume is a `.wl-button--session` with a `lift.bg` fill and white text;
    - Swap, Do later, Skip to next, How-to and List view are `.wl-row` buttons with a trailing arrow icon;
    - End workout is `.wl-button--secondary`, last;
    - the end confirm is unchanged in behaviour.
- **Out:**
  - Copy (T-0620 adds the paused caption and the value-first stats).
  - The swap sheet (T-0602).
  - Time-check logic.

## Acceptance criteria
- **AC1 (state).** Both roots have `data-wl-state="plan"` and a `plan.bg` background. `theme-color` is `plan.bg` while paused, and `lift.bg` again after Resume on UF-09.3. Both directions are tested.
- **AC2 (options).** The time-check choices are found by `getByRole("radio", { name })`. The checked one has a `plan.selected` block with `plan.on-selected` text (8.6:1), the others are plain rows, and arrow keys move the selection.
- **AC3 (Resume).** Resume's background is `lift.bg` with white text (4.8). It's the first control in tab order after the heading (as today).
- **AC4 (End last, never primary).** End workout is the last focusable control on the screen, it isn't `.wl-button--primary`, and it has the 1.5px `plan.ink` outline. Its confirm and Cancel behave as before.
- **AC5 (contrast).** `plan.ink-muted` labels on `plan.bg` are ≥ 5.9 at one decimal. Axe colour-contrast has 0 violations on both screens, including the end confirm.
- **AC6 (targets, type, motion, guard).**
  - Every row button and radio row is ≥ 44 px tall.
  - No px font size and no raw colour.
  - Only the 200 ms cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC7 (behaviour unchanged).**
  - `uf-09-focus.spec.ts` (time check, pause, end), `uf-09-do-later.spec.ts` (the Do later row hidden for a partly done exercise, shown otherwise; unchanged) and the UF-09 vitest suite pass with no role or name change.
  - The time check shows only when behind (existing test). Its not-behind sibling is that UF-09.8 never renders, which is already tested.
- **AC8 (visual compare).** `compareWithCanvas` saves the "Time check" and "Paused" (turn-4) pairs. The log lists the verdicts.

Checklist (D-0197 §7):
- Do later shown and hidden (AC7), Resume and the end path, and reduced motion on and off are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `tests/e2e/uf-09-focus.spec.ts` (listed extra)
- `docs/tickets/T-0598-uf09-timecheck-paused-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0598` and cite UF-09.8/UF-09.9.

## Build / accept log

### Build log (frontend-dev, 2026-10-12)
- Changed: host.tsx (plan state on timeCheck/paused), time-check-view.tsx (radio group of .wl-option rows + one Continue primary that applies the pick), paused.tsx (stat role, Resume .wl-button--session in lift.bg, .wl-row buttons with arrow icons, End .wl-button--secondary last), uf-09.css (T-0598 section, all under the plan root).
- Deviation: AC2 (radios) and AC7 (no role change) conflict, since the old options were one-tap buttons. Built the canvas/README behaviour: pick a radio (default Continue), Continue applies it. Tests that clicked the Trim/Skip next buttons now pick the radio then click Continue (time-check, end-race, t0435 `click` helpers; host.chrome button list; e2e uses arrow keys). t0595 expectation "Paused has no state" became "Paused is plan". No test was weakened.
- AC map: AC1 t0598.plan (both theme-color directions) + e2e; AC2 t0598.plan + e2e arrow keys; AC3/AC4 t0598.plan + e2e; AC5/AC6 t0598.css (contrast from tokens, scope, no px/hex, motion) + e2e axe and 44 px; AC7 existing suites; AC8 e2e compareWithCanvas.
- Planted faults, all red then restored from copies: plan state removed (3 red), End made primary (1), Resume colour (1), picking a radio applies at once (1), stat role removed (1).
- Red on first e2e: asserted 1.5px border; Chromium reports 1px, so asserted the colour and left the width to the css test.
- Gate exit 0, repo-checks 0, format:check 0, check-all 0, full e2e 643 passed (exit 0). Screenshots in scratchpad shots-T-0598.
- D-0227 revisit: not met. Pause has a state now, but the overlay still replaces the screen root, so Swap from Pause is still plan.bg; Swap test untouched.
