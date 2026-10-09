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

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `tests/e2e/uf-11-plan.spec.ts`, `tests/e2e/uf-11-plan-layout.spec.ts`, `tests/e2e/uf-02-today.spec.ts` (check-in colour cases only) (listed extras)
- `docs/tickets/T-0612-uf11-plan-checkin-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-11 specs and `uf-02-today.spec.ts` green · commit messages start with `T-0612` and cite UF-11.1/UF-11.2/UF-11.3.

## Build / accept log
