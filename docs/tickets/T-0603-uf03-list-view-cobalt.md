---
id: T-0603
title: "UF-03.1 List view in the lift state (set table as hairline rows, Previous column in white per the README fix, lift error form) and UF-03.2 List view rest in the rest state with the drain"
lane: web-feature:UF-03
screens: [UF-03.1, UF-03.2]
decisions: [D-0208, D-0210, D-0211, D-0213]
deps: [T-0593, T-0594, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "In session · list view" and "In session · list view rest" (#turn-5). Behaviour: T-0305, T-0457 (+ Add set). UF-03 folder chain T-0603 → T-0604. -->
## Why
The List view is a session screen (lift), and its rest uses the same drain as UF-09.5. The README fixes the "Previous" column contrast: `#FBD9D1` at 3.3:1 becomes white.

## Scope
- **In:**
  - `ListView.tsx`, `list-view.css` and the List view rest view.
  - The root (the `data-screen-id` element) has `data-wl-state="lift"`; during rest it has `data-wl-state="rest"` and `.wl-drain` with `drainStyle(elapsedS, totalS)`.
  - **Header:** collapse (an `aria-hidden` chevron in a 44 px button with its existing name), the elapsed time and Finish as a session outline.
  - Each exercise block uses the session page title, with How-to and Swap as text buttons.
  - **Set rows:**
    - `.wl-row` grid: Set, Previous, kg, Reps, Done;
    - Previous in `--wl-ink`;
    - inputs are `.wl-input` (lift);
    - Done is a 44 px checkbox-style button with an `aria-hidden` tick.
  - "+ Add set" is a text button.
  - Collapsed exercises are `.wl-row` with a caption.
  - The rest bar ("Rest · 1:32 left") is a full-width session outline.
  - `__status` uses the lift error form.
- **Out:**
  - The Summary (T-0604).
  - Copy and set logic.

## Acceptance criteria
- **AC1 (states).** The List view root has `lift`, and List view rest has `rest` with a `--wl-drain` equal to `drainPercent(elapsed, total)` at a seeded time. `theme-color` follows each (`lift.bg`, `rest.bg`).
- **AC2 (Previous fix).** Every "Previous" cell's computed colour is `lift.ink` (white, ≥ 4.8 on `lift.bg`). A computed scan finds no `#FBD9D1` and no value outside the tokens.
- **AC3 (error form).** A row save failure shows `__status` with a 2px `lift.ink` border or underline, the `aria-hidden` icon and the existing text. Success shows none. Both are tested.
- **AC4 (drain motion).** The rest drain's `transition-duration` is `1s`, and `0s` under reduced motion. Both are tested.
- **AC5 (contrast, targets, type, guard).**
  - Axe colour-contrast has 0 violations on both views.
  - Every input, Done button and text button is ≥ 44 × 44.
  - At 320 × 640 the set table doesn't scroll horizontally.
  - No px font size and no raw colour.
- **AC6 (behaviour unchanged).** `tests/e2e/uf-03-list-summary.spec.ts` List view and rest cases (including the T-0458 offline case and + Add set) and the UF-03 vitest suite pass with no role or name change. Offline writes still queue: the existing assertion, plus offline and online rows rendered.
- **AC7 (visual compare).** `compareWithCanvas` saves "In session · list view" and "In session · list view rest" (turn-5). The log lists the verdicts, with the README overrides: lift `#CC4225` and Previous in white.

Checklist (D-0197 §7):
- Online and offline, save failed and succeeded, rest running and not, and reduced motion on and off are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-03/**` (lane)
- `tests/e2e/uf-03-list-summary.spec.ts` (listed extra)
- `docs/tickets/T-0603-uf03-list-view-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-03-list-summary.spec.ts` green · commit messages start with `T-0603` and cite UF-03.1/UF-03.2.

## Build / accept log
