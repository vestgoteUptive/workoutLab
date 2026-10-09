---
id: T-0611
title: "UF-10.1 Balance and UF-10.2 Area detail in the plan state: full C-01 (recoloured), area rows with Needs attention in plan.attention #FFB3A3 (README fix), 14-day strip and contributor rows, stats value-first with the existing strings"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0013, D-0207]
deps: [T-0593, T-0615, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Balance · all areas", "Balance · area detail" (#turn-5). Behaviour: docs/specs/uf-10-balance.md. README contrast fix: "Needs attention" is #FFB3A3, not the mock's #FF9A85. -->
## Why
Balance shows coverage per area against the 14-day targets. C-01 is recoloured by T-0615. The attention outline and label take `plan.attention`.

## Scope
- **In:**
  - `features/UF-10/**` views and `balance.css`.
  - The roots have `data-wl-state="plan"` and `.wl-page`.
  - The title is a page title with `.wl-title--stop`, and the window line is a label.
  - The area list is `.wl-row`: the name, then "Needs attention" or "Recovering" as a label in `--wl-attention` or `--wl-ink-muted`, then the trailing "load / target" in `.wl-type-row-title`.
  - The attention outline is 2 px `--wl-attention` with the `--wl-bg` gap.
  - **Detail:**
    - the deficit and last-trained values are drawn value-first, using the existing strings and no new copy (D-0212 §2 item 21);
    - the 14-day strip's cells are `--wl-raise`, and days with sets are `--wl-ink`;
    - contributors are `.wl-row`;
    - "Start workout" is the one white primary.
  - The Plan back link is a text button.
- **Out:**
  - C-01 colours (T-0615), engine output and copy.

## Acceptance criteria
- **AC1 (state).** `/balance` and `/balance/:area` have `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (attention).** Seeded with one area `needsAttention: true` and one false:
  - the true row's label text is `plan.attention` (≥ 5.0 on `plan.bg`), and its region outline is 2px `plan.attention`;
  - the false row has neither;
  - a computed scan finds no `#FF9A85` and no legacy `warn`.
- **AC3 (C-01).** C-01's regions use the plan ramp (step 4 is `plan.ink`, step 0 is `plan.raise`), and the numeric labels are still present (D-0019).
- **AC4 (strip).** Days with hard sets are `plan.ink` and days without are `plan.raise`. Each cell keeps its accessible text (`stripCell` / `stripCellEmpty`), so the state isn't shown by colour alone.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on both screens.
  - Rows and area buttons are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `uf-10-balance.spec.ts` (including never-in-workout) and the UF-10 vitest suite pass with no role or name change. Zero history, returning after 10 days off, and no data on this device (offline, never loaded) render in plan: three cases.
- **AC7 (visual compare).** `compareWithCanvas` saves "Balance · all areas" and "Balance · area detail" (turn-5). The log lists the verdicts, with the README override: attention `#FFB3A3`.

Checklist (D-0197 §7):
- Attention true and false, zero and some history, and online and offline-never-loaded are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-10/**` (lane)
- `tests/e2e/uf-10-balance.spec.ts` (listed extra)
- `docs/tickets/T-0611-uf10-balance-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-10-balance.spec.ts` green · commit messages start with `T-0611` and cite UF-10.1/UF-10.2.

## Build / accept log
