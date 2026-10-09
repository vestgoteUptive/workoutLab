---
id: T-0608
title: "UF-04.2 Exercise detail in the plan state with the recoloured body figure (primary white, secondary white hatch) beside the Primary/Secondary lists, Favorite and Don't-suggest as secondary buttons, and the how-to as the plan sheet"
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0207, D-0199, D-0202]
deps: [T-0607, T-0615]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Exercise detail" (#turn-5). Behaviour: screens/UF-04.1-UF-04.2.md, T-0558 (figure placement), T-0568 (favorites), T-0541 (exclude). Depends on T-0615, so the figure is cobalt when this screen flips. -->
## Why
UF-04.2 is the one screen that shows the figure's primary and secondary areas. T-0615 recolours the figure; this ticket places it in the plan layout and drops the card around it.

## Scope
- **In:**
  - `LibraryDetail.tsx`, `DetailActions.tsx`, `ExcludeControl.tsx`, `ExerciseHowTo.tsx`, `HowToBody.tsx`, `Attribution.tsx`, `InlineCredit.tsx` (view only), `uf-04.css` and `how-to.css`.
  - The root has `data-wl-state="plan"`.
  - The title is a page title with `.wl-title--stop`, and the type caption is a label.
  - The figure sits next to the Primary/Secondary lists (a 110 px column at 390 px, per the canvas), at the D-0207 sizes.
  - The how-to steps are numbered `.wl-row`s.
  - The Favorite toggle and "Don't suggest this" are secondary buttons with their names and `aria-pressed` states unchanged.
  - The "My history" link is a text button.
  - The how-to opens as `.wl-sheet` (`bg-focus` dropped).
  - The attribution line is a label.
- **Out:**
  - Figure colours (T-0615).
  - Copy and library data.
  - The canvas cue table (D-0212 §4).

## Acceptance criteria
- **AC1 (state).** `/library/:id` has `data-wl-state="plan"`. The open how-to has `data-wl-state="plan"` with 28px top radii and the `plan.scrim` scrim.
- **AC2 (figure).** On UF-04.2, the figure's primary regions are `plan.ink` (white) and the secondary regions use the white hatch on `plan.raise` (T-0615). The visible Primary and Secondary labels are unchanged. An exercise with no secondary areas shows no hatch and no Secondary label (existing behaviour, tested).
- **AC3 (controls).**
  - Favorite and Don't-suggest keep their names and `aria-pressed` states, and they're mutually exclusive (D-0202; existing tests).
  - Offline they're `aria-disabled` with the existing line; online they toggle. Both are tested.
  - Neither is a `.wl-button--primary`.
- **AC4 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on the screen and the open how-to.
  - Controls are ≥ 44 × 44.
  - No px font size and no raw colour.
  - The sheet opens without a transition, and the cross-fade is instant under reduced motion. Both values are tested.
- **AC5 (behaviour unchanged).** `uf-04-library.spec.ts`, `uf-04-figure.spec.ts`, `uf-04-favorites.spec.ts` and the UF-04 vitest suite pass with no role or name change.
- **AC6 (visual compare).** `compareWithCanvas` saves "Exercise detail" (turn-5), plus an app-only shot of the open how-to. The log lists the verdicts. Expected deviations: no looped illustration and no cue table.

Checklist (D-0197 §7):
- Online and offline controls, secondary areas present and absent, Favorite on and off, and the sheet open and closed are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `tests/e2e/uf-04-library.spec.ts`, `tests/e2e/uf-04-figure.spec.ts`, `tests/e2e/uf-04-favorites.spec.ts` (listed extras)
- `docs/tickets/T-0608-uf04-detail-howto-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-04 e2e specs green · commit messages start with `T-0608` and cite UF-04.2.

## Build / accept log
