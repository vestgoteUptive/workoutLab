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
- `tests/e2e/body-figure-v2.spec.ts` (orchestrator grant: the line ~354 'UF-04.2 with no state' case moves to a detached fixture host like `detachMap`; fix the AC7 describe title/comments that name UF-04.2)
- `apps/web/src/features/UF-04/**` (lane)
- `tests/e2e/uf-04-library.spec.ts`, `tests/e2e/uf-04-figure.spec.ts`, `tests/e2e/uf-04-favorites.spec.ts` (listed extras)
- `docs/tickets/T-0608-uf04-detail-howto-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-04 e2e specs green · commit messages start with `T-0608` and cite UF-04.2.

## Build / accept log
- 2026-10-11 build (frontend-dev). Branch t/T-0608 merged with origin/main (ad77036). UF-04.2 is a plan root; figure beside Primary/Secondary lists (flex-wrap, 216 px figure, wraps under at 320); how-to is a `.wl-sheet` plan sheet (wrapper is the plan root so the scrim rule applies, `display: contents`); steps are `ol.wl-uf04-steps > li.wl-row` numbered by CSS counter; Favorite/Don't suggest are `.wl-button--secondary`, side by side from 360 px. Legacy `.wl-uf04*` detail rules removed (grep src and tests/e2e first: only `.wl-uf04__sr` was shared, kept). `ExerciseHowTo` hosts UF-03/UF-08/UF-09 unchanged (names and roles).
- AC→test: AC1 `detail-cobalt.test.tsx` (roots, sheet, scrim, 28 px token) + e2e `uf-04-library.spec.ts` T-0608 (plan root, sheet from UF-08: bg, 28/28/0 radii, 0s transition, top 150); AC2 `detail-cobalt` + `figure.test.tsx` (labels, no-secondary) + e2e `uf-04-figure.spec.ts` T-0615 AC3 (white primary, hatch, detached no-state host) and `body-figure-v2.spec.ts` (detached host); AC3 `detail-cobalt` + e2e (secondary, aria-disabled offline); AC4 contrast pairs from tokens, axe incl. color-contrast online/offline/sheet, 44 px, no px font or raw colour, scoped rules, sheet `transition: none` and reduced motion; AC5 existing UF-04 vitest + uf-04-library/figure/favorites e2e unchanged in roles and names; AC6 canvas compare "Exercise detail" (turn-5) + app-only how-to shot.
- Planted faults (all red, then restored by `cp`): root state removed (AC1 vitest); Favorite class primary (AC3 vitest); `wl-row` dropped from steps; sheet `transition: none` replaced (main.css); primary pill on-colour replaced by ink; wrapper `data-wl-state` removed (e2e scrim 0.2 s, red); figure column direction (e2e figure-beside-lists, red).
- Visual verdicts (390x844, canvas vs app): title, label caption, figure plus lists beside it, label/row steps match. Deviations: no looped illustration or cue table (expected), the canvas "Muscles worked" pills are the Primary/Secondary lists beside the figure, no back link or top "My history" (the link is last, a text button), tagline under the title not above it. Sheet title uses the section size.
