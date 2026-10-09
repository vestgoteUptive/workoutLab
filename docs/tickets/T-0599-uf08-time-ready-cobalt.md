---
id: T-0599
title: "UF-08.1 Time and energy and UF-08.4 Ready in the plan state: time stepper and quick-pick chips first, energy as a segmented control, Skip today chips with an aria-hidden tick, finish-time .wl-input, warm-up and Ready settings as toggle rows, one white primary"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.4]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0191, D-0107, D-0115]
deps: [T-0593, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Set up · time and energy" (#turn-3), "Set up · ready" (#turn-5). Behaviour: the UF-08.x tickets (T-0303a, T-0303d), D-0191. UF-08 folder chain T-0599 → T-0600. -->
## Why
Setup is where the time budget is asked (principle 2). The redesign keeps time first, and gives it the strongest control on the screen.

## Scope
- **In:**
  - UF-08.1 and UF-08.4 in `SessionSetup.tsx`, `Ready.tsx`, `time.ts` (view only) and `uf-08.css`.
  - The roots get `data-wl-state="plan"` and `.wl-page`; the old 16 px padding is dropped, so the gutter isn't doubled.
  - **Time:** the minutes value in `.wl-type-hero` with the −/+ steppers as outline pill buttons; the 20/30/45/60/90 quick picks as `.wl-chip`; the finish-time field as `.wl-input`.
  - **Energy:** `.wl-segmented` on its existing controls, with the hint as a label.
  - **Skip today:** `.wl-chip` with the `aria-hidden` tick (D-0211 §6).
  - The warm-up toggle and the Ready settings (sound cues, voice countdown, keep screen awake) become `.wl-toggle` rows.
  - One white primary each ("Suggest my workout", "Start").
  - The `.wl-uf08__error` text uses the plan error form.
- **Out:**
  - UF-08.2, UF-08.5 and Reorder (T-0600).
  - The swap sheet (T-0602).
  - Copy and engine calls.

## Acceptance criteria
- **AC1 (state).** `/session/setup` (UF-08.1) and Ready (UF-08.4) have `data-wl-state="plan"`, a `plan.bg` background and a `plan.bg` `theme-color`. At 390 px, `padding-left` is `28px`.
- **AC2 (time first, principle 2).** The time control is the first interactive element in tab order on UF-08.1. The selected quick pick has the `plan.selected` fill, and the steppers and keys change it as before.
- **AC3 (chips).**
  - A pressed "Skip today" chip's accessible name is exactly the area label ("Quads"), with `aria-pressed="true"`, a `plan.selected` fill and a visible tick.
  - Unpressed: transparent and no tick.
  - Both are tested.
- **AC4 (toggles).** The warm-up toggle and the Ready toggles keep their roles and names (`getByRole` queries unchanged). Toggling the warm-up still changes the plan's warm-up inclusion (existing test, unchanged).
- **AC5 (one primary, contrast).**
  - Exactly one `.wl-button--primary` per screen, with `plan.on-action` on `plan.action` (8.6).
  - Labels are `plan.ink-muted` on `plan.bg` (≥ 5.9 at one decimal).
  - The error line, when shown, is `plan.attention` on `plan.bg` (≥ 5.0). Shown and hidden are both tested.
  - Axe colour-contrast has 0 violations.
- **AC6 (targets, type, motion, guard).**
  - Every control, including each chip, is ≥ 44 × 44.
  - No px font size and no raw colour in `uf-08.css`.
  - No transition except the cross-fade, instant under reduced motion. Both values are tested.
- **AC7 (behaviour unchanged).**
  - `uf-08-setup.spec.ts`, `uf-08-excluded.spec.ts`, `uf-08-favorites.spec.ts` and the UF-08 vitest suite pass with no role or name change.
  - Offline (the cached plan) and zero history both render in plan (two e2e cases).
  - "Nothing fits in 20 min" renders as a label, not an error.
- **AC8 (visual compare).** `compareWithCanvas` saves "Set up · time and energy" (turn-3) with two areas skipped, and "Set up · ready" (turn-5). The log lists the verdicts.

Checklist (D-0197 §7):
- Online and offline, zero history and returning, chip pressed and unpressed, and error shown and hidden are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `tests/e2e/uf-08-setup.spec.ts` (listed extra)
- `docs/tickets/T-0599-uf08-time-ready-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · commit messages start with `T-0599` and cite UF-08.1/UF-08.4.

## Build / accept log
