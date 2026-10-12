---
id: T-0612
title: "UF-11.2 Plan, UF-11.1 check-in card (paper panel, also on Today) and UF-11.3 Edit plan in the plan state: raise target tiles with ink-on-raise labels, unboxed sections, the links as rows, Edit plan as the one white primary; G-2 gutter pin moves to 28 px"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2, UF-11.3, UF-02.1]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0203, D-0204, D-0195]
deps: [T-0593, T-0582, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Plan · full scroll" and "Today · check-in pending" (#turn-5). UF-11.3 isn't drawn, so reuse the Goal and Schedule patterns. Behaviour: screens/UF-11.2.md (updated by T-0590), docs/specs/uf-11-plan-checkin.md. Must follow T-0582 (same folder). UF-11 chain T-0612 → T-0613. The nav links stay as built (H-32, D-0203 §3). -->
## Why
D-0203 organised Plan as cards. The redesign keeps that order and content, but swaps the cards for hairline sections and `plan.raise` tiles. The check-in card asks for an answer, so it's the paper panel wherever it shows (UF-11.2 and Today).

## Scope
- **In:**
  - `PlanBody.tsx`, `CheckinCard.tsx`, `EditPlanBody.tsx` and `plan.css`.
  - The roots `/plan` and `/plan/edit` get `data-wl-state="plan"`.
  - The title is a page title with `.wl-title--stop`; sections are unboxed.
  - "Your plan" is a two-column label/value grid.
  - **Target tiles:** `--wl-raise`, radius `--wl-radius-tile`, the area label in `--wl-ink-on-raise`, the number in the stat role in `--wl-ink`. A priority tile has a 1.5 px `--wl-ink` inset outline plus its existing "Priority" text.
  - **The links**, with order and targets unchanged: "Account and sign out" (a header secondary pill), "Favorite exercises" and "Excluded exercises" (`.wl-row` with an arrow), "See this period in Balance" (`.wl-row`).
  - Check-ins and routines are `.wl-row`; "+ New routine" is a text button.
  - Edit plan is the one white primary.
  - **CheckinCard:** `.wl-paper`; Accept is the `paper.action` pill with `paper.on-action` text; "Keep current" is the secondary in `paper.ink`; the target rows are paper hairlines.
  - **Edit plan (UF-11.3):** `.wl-option` and `.wl-segmented` on its native inputs, with the primary at the bottom.
  - `tests/e2e/uf-11-plan-layout.spec.ts` G-2 (`20px`) moves to `28px` deliberately (D-0211 §3) for `/plan` and `/plan/edit`, with the red run logged.
- **Out:**
  - UF-11.4/.5/.6 (T-0613), copy and check-in logic.

## Acceptance criteria
- **AC1 (state and gutter).** `/plan` and `/plan/edit` have `data-wl-state="plan"`, with `padding-left` `28px` at 390 px and `20px` at 340 px. The 640 px centring (G-3) is unchanged.
- **AC2 (tiles).**
  - Each target tile has a `plan.raise` background.
  - Its label is `plan.ink-on-raise` (≥ 4.9 at one decimal) and its number is `plan.ink` (6.2).
  - A priority tile has the inset outline **and** the "Priority" text; a non-priority tile has neither. Both are tested.
- **AC3 (check-in paper, on UF-11.2 and Today).**
  - **Given** a pending check-in **when** `/plan` and `/` render **then** the card is `.wl-paper`, full-bleed at 390 px, `paper.bg` with `paper.ink` (12.9).
  - Accept is `paper.action` with `paper.on-action` (8.6), and "Keep current" is the secondary.
  - The D-0195 `h1.nextElementSibling` pin holds.
  - **Given** no pending check-in **then** no paper panel renders.
  - Both are tested.
- **AC4 (links).** The four links keep their names, targets and order (existing `uf-11-plan.spec.ts`, unchanged). None is a `.wl-button--primary`.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on `/plan` with and without a check-in, and on `/plan/edit`.
  - Tiles, rows and links are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `uf-11-plan.spec.ts`, `uf-11-plan-layout.spec.ts` (G-2 updated), the UF-02 check-in cases and the UF-11 vitest suite pass with no role or name change. Offline, Edit plan's save is disabled with its existing line; online it saves (existing tests).
- **AC7 (visual compare).** `compareWithCanvas` saves "Plan · full scroll" (turn-5; scrolled sections captured in 844-px slices, noted) and "Today · check-in pending" (turn-5, the card part). An app-only shot of `/plan/edit`. The log lists the verdicts.

Checklist (D-0197 §7):
- Check-in pending and not, priority and non-priority tiles, and online and offline save are all covered.
- No migration fixture: not applicable.

- **AC-T0601 (from the T-0601 review).** Given a pending check-in on Today, then the page shows exactly one white primary (Start). The card's Accept uses the paper or secondary action, not a second primary. Delete the interim `.wl-today [data-part=checkin-card] :is(.wl-label,.wl-muted)` colour override in `features/UF-02/today.css`. Update the T-0601 e2e "outside the check-in slot, Today's own Start is the only primary" so it asserts 1 primary on the page.

## Paths you may change
- `tests/e2e/cobalt-controls.spec.ts`, `tests/e2e/fonts.spec.ts` (orchestrator grant: their 'unchanged outside a state' checks used a now-migrating screen; move each to an injected no-state fixture, never another real screen)
- `tests/e2e/visual-foundation.spec.ts` (orchestrator grant, for every screen restyle: move this screen's checks from the legacy no-state scale to the plan or state scale, as T-0601/T-0597 did, or to an injected no-state fixture; never use another real screen as the no-state host)
- `apps/web/src/features/UF-02/today.css`, `tests/e2e/uf-02-today.spec.ts` (orchestrator grant: remove the T-0601 interim override and tighten the primary-count test)
- `apps/web/src/features/UF-11/**` (lane)
- `tests/e2e/uf-11-plan.spec.ts`, `tests/e2e/uf-11-plan-layout.spec.ts`, `tests/e2e/uf-02-today.spec.ts` (check-in colour cases only) (listed extras)
- `tests/e2e/uf-11-favorites.spec.ts` (orchestrator grant: the row-order case asserted one section.wl-card per row; the rows are now unboxed links)
- `docs/tickets/T-0612-uf11-plan-checkin-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-11 specs and `uf-02-today.spec.ts` green · commit messages start with `T-0612` and cite UF-11.1/UF-11.2/UF-11.3.

## Build / accept log

### Build log (T-0612, frontend-dev)
- Built on main at ab9cb3b. The orchestrator granted cobalt-controls.spec.ts and fonts.spec.ts after the first stop (both used /plan as a no-state host); both checks moved to an injected no-state fixture with their assertions kept.
- Changed: PlanBody, CheckinCard, EditPlanBody, index, FavoritesRow, ExcludedRow, plan.css (UF-11); today.css (interim check-in colour override deleted); e2e: uf-02-today, uf-11-plan-layout (G-2 gutter 20px to 28px, new Cobalt block), visual-foundation (/plan to the state page-title check), cobalt-controls, fonts, uf-11-favorites.
- Legacy CSS kept (UF-11.4 to .6, T-0613): wl-account__*, wl-card--strong, wl-plan__linkbtn, wl-plan__notice, wl-plan__name.
- AC map: AC1 cobalt.test "state roots" + layout spec gutter 28/20 at 390/340 (both roots), G-3 unchanged. AC2 cobalt.test tiles + layout spec tiles (raise, ink-on-raise 4.9+, ink 6.2, priority outline + word, non-priority neither). AC3 cobalt.test + plan-checkins-routines paper/absent + layout spec (paper bg/ink 12.9, full-bleed 0..390, Accept action/on-action 8.6, Keep secondary, h1 sibling pin). AC4 cobalt.test links + layout spec (order, none primary). AC5 axe colour-contrast x3, every text pair 4.5, 44x44, no px font, only the root cross-fade, instant under reduced motion. AC6 existing UF-11 and UF-02 vitest suites and the UF-11/UF-02 e2e green (native disabled became aria-disabled; assertions updated to aria-disabled). AC7 compareWithCanvas Plan full scroll (turn-5, 844 px slices) and Today check-in pending (existing T-0601 test), app-only /plan/edit. AC-T0601 uf-02-today "Start is the only primary" (count 1) + plan-checkins-routines.
- Red runs on unfixed code: uf-11-plan-layout "320 x 640" went red at minmax(5.5rem) (3 tile columns), fixed to 5.75rem; motion check red until the state root and tab bar were excluded; uf-11-favorites row-order case red (cards gone), updated (outside the grants, see handback).
- Planted faults (all red, restored from backups): no priority class (cobalt AC2), no .wl-paper (cobalt AC3 and routines), Accept given wl-button--primary (cobalt AC3, routines, e2e Today one-primary, e2e Plan one-primary), no data-wl-state on /plan (cobalt AC1), native disabled on Save (cobalt Edit plan), tile background not raise (e2e AC2), paper not full-bleed (e2e AC3).
- Deviations: Accept is not a .wl-button--primary (own .wl-checkin__accept in paper.action) so the page keeps one white primary; Edit plan is now always the primary (no secondary switch while pending). The account pill has no icon (canvas has none). Targets caption sits on the title row as in the canvas.
- Review rework: stepper and Save aria-disabled guards tested (planted faults on the guards went red, restored); disabled Accept uses ink-on-raise on raise; dead onVisibleChange removed; New routine svg aria-hidden check restored.
