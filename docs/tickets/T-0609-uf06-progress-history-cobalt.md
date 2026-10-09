---
id: T-0609
title: "UF-06.1 Progress and UF-06.2 Exercise history in the plan state: page title with a CSS full stop, month calendar with workout days in white and other days ink-muted, the 14-day Balance card unboxed, recent exercises and sessions as hairline rows, stats in the stat role"
lane: web-feature:UF-06
screens: [UF-06.1, UF-06.2]
decisions: [D-0208, D-0210, D-0211, D-0213]
deps: [T-0593, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Progress" (#turn-3), "Exercise history" (#turn-5). Behaviour: T-0307b. The canvas's weekly sets, streak, records and 1RM stay out (D-0212 §4). -->
## Why
Progress reads as numbers and a calendar. The plan look turns the cards into hairline sections with large stats.

## Scope
- **In:**
  - `Progress.tsx`, `BalanceCard.tsx`, `ExerciseHistory.tsx` and `progress.css`.
  - The roots have `data-wl-state="plan"` and `.wl-page`.
  - The title is a page title with `.wl-title--stop`.
  - **Calendar:** day numbers in `--wl-ink-muted`; workout days in `--wl-ink`, weight 700, with the existing accessible "Workout" marker; today with a 2 px underline.
  - The Balance card is an unboxed `.wl-row` link with its caption.
  - Recent exercises and history sessions are `.wl-row`.
  - The history stats (Best set, Heaviest, Sessions) are `.wl-type-stat` with label captions.
  - The How-to link is a text button.
- **Out:**
  - New content (D-0212 §4), data and copy.

## Acceptance criteria
- **AC1 (state).** `/progress` and the history route have `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (calendar).** Seeded with workouts on two days this month, those days are `plan.ink` and keep their accessible "Workout" text, so the state isn't conveyed by colour alone. The others are `plan.ink-muted` (5.9). A month with no workouts renders all days muted, with the existing count line. Both are tested.
- **AC3 (stats).** On UF-06.2, the three stats use the stat role (2.125rem/700), with the `noValue` "—" when there are no sets in 8 weeks. Both are tested.
- **AC4 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on both screens.
  - Rows and links are ≥ 44 px tall.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC5 (behaviour unchanged).** `uf-06-progress.spec.ts` and the UF-06 vitest suite pass with no role or name change. Zero history renders its empty state in plan, and an offline load renders from the cache (existing cases).
- **AC6 (visual compare).** `compareWithCanvas` saves "Progress" (turn-3) and "Exercise history" (turn-5). The log lists the verdicts. Expected deviations: no weekly sets, streak, records or 1RM.

Checklist (D-0197 §7):
- Zero history and some history, online and offline, and no sets vs sets on UF-06.2 are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-06/**` (lane)
- `tests/e2e/uf-06-progress.spec.ts` (listed extra)
- `docs/tickets/T-0609-uf06-progress-history-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-06-progress.spec.ts` green · commit messages start with `T-0609` and cite UF-06.1/UF-06.2.

## Build / accept log
