---
id: T-0605
title: "UF-01.1–UF-01.4 onboarding in the plan state: Welcome hero, goal and level as selected option rows or a segmented control on native radios, equipment as multi-select chips with an aria-hidden tick, schedule controls, PlanCard as rows; onboarding stays under 60 seconds"
lane: web-feature:UF-01
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0045]
deps: [T-0593, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Welcome", "Goal · 1 of 3", "Level and equipment · 2 of 3", "Schedule · 3 of 3" (#turn-4). Behaviour: T-0301b. Principle 5: the onboarding timing e2e must stay green. UF-01 folder chain T-0605 → T-0606. -->
## Why
This is the first thing a new user sees. The look changes; the number of taps and the timing don't (principle 5).

## Scope
- **In:**
  - `WelcomeScreen.tsx`, `GoalScreen.tsx`, `LevelScreen.tsx`, `ScheduleScreen.tsx`, `StepHeader.tsx`, `PlanCard.tsx` and `uf-01.css`.
  - Every root gets `data-wl-state="plan"` and `.wl-page`.
  - **Welcome:** the two heading lines are the hero title (the wordmark stays the app name). "Get started" is the white primary, and "I already have an account" is a text button.
  - **Step header:** the back button (an `aria-hidden` arrow in a 44 px button with its existing name) and the "n/3" progress as a label. The accessible name `progressName` is unchanged.
  - **Goal:** the options are `.wl-option` rows on their native radios, with the hint as a caption.
  - **Level:** a `.wl-segmented` on its native radios.
  - **Equipment:** `.wl-chip` multi-select with an `aria-hidden` tick.
  - **Schedule:** its existing day and length controls as `.wl-segmented` or `.wl-chip`.
  - PlanCard becomes unboxed rows.
  - One white primary per step (Continue, or the plan step's existing primary), pinned to the bottom.
- **Out:**
  - UF-01.5 (T-0606).
  - Copy, routing and the plan logic.
  - The canvas's extra inputs (D-0212 §4).

## Acceptance criteria
- **AC1 (state).** `/welcome`, `/welcome/goal`, `/welcome/level` and `/welcome/schedule` have `data-wl-state="plan"`, `plan.bg`, and a `plan.bg` `theme-color`.
- **AC2 (goal options).** On UF-01.2, `getByRole("radio", { name })` finds each goal. The checked one has the `plan.selected` block bleeding 18 px past the 28 px gutter, and arrow keys move the selection. When nothing is checked, Continue keeps its current disabled or enabled rule (existing test).
- **AC3 (chips).** Equipment chips keep their accessible names exactly. A pressed chip shows the tick and the `plan.selected` fill; an unpressed one shows neither. Both are tested.
- **AC4 (under 60 seconds).** The `tests/e2e/uf-01-onboarding.spec.ts` timing and tap-count assertions pass unchanged, so no step gains a tap.
- **AC5 (contrast).**
  - The hints and the step label are `plan.ink-muted` on `plan.bg` (≥ 5.9 at one decimal).
  - The selected option text is `plan.on-selected` on white (8.6).
  - Axe colour-contrast has 0 violations on each step.
- **AC6 (targets, type, motion, guard).**
  - Every option row, chip and segment is ≥ 44 × 44.
  - At 320 × 640, Goal has no horizontal scroll.
  - No px font size and no raw colour in `uf-01.css`.
  - Moving between steps animates only the cross-fade (none between two plan screens), and nothing under reduced motion. Both values are tested.
- **AC7 (behaviour unchanged).** `uf-01-onboarding.spec.ts` and the UF-01 vitest suite pass with no role or name change, both for a first launch and for a returning, signed-out user (the existing stand-down case).
- **AC8 (visual compare).** `compareWithCanvas` saves "Welcome", "Goal · 1 of 3", "Level and equipment · 2 of 3" and "Schedule · 3 of 3" (turn-4). The log lists the verdicts. Expected deviations: the app's three goals, "workout LAB" not "[App name]", and no session-length choice (D-0212 §4).

Checklist (D-0197 §7):
- First launch and returning, goal checked and unchecked, chip pressed and unpressed, and reduced motion on and off are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/cobalt-state.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (orchestrator grant: their no-state page `/welcome` now has a state; move them to a still-legacy page or an injected fixture)
- `apps/web/src/features/UF-01/**` (lane)
- `tests/e2e/uf-01-onboarding.spec.ts` (listed extra)
- `docs/tickets/T-0605-uf01-onboarding-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-01-onboarding.spec.ts` green · commit messages start with `T-0605` and cite UF-01.1–UF-01.4.

## Build / accept log
