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

**T-0603 build (frontend-dev).** Start: tree clean, HEAD c6557fe on `t/T-0603-uf03-list-view-cobalt`.
- Built: `ListView.tsx` and `list-view.css` rewritten (legacy `.wl-uf03-list__*` look removed; `summary.css` never used it, grep of src and tests/e2e first). List root `data-wl-state="lift"`; the rest view is `rest` + `.wl-drain` + `drainStyle`. Header (44 px chevron button "Focus mode", elapsed, Finish session outline), exercise title `.wl-type-page-title`, How to / Swap / + Add set text buttons, set rows `.wl-row` on a 5-column grid (table semantics kept), `.wl-input`, a 44 px Done box over the native checkbox with an `aria-hidden` tick, collapsed exercises `button.wl-row` + chevron, rest bar session outline, error form (icon + words + 2 px ink border) on the row status, the Finish error and the input hints. No role or name change.
- AC1 `t0603.cobalt.test.tsx` (lift/rest root, drain 60% at 90 s of 150, total-as-first-seen with ±15 s and the reset mark) + e2e (root, bg, theme-color lift.bg / rest.bg). AC2 `t0603.css.test.ts` + e2e (every Previous cell computed lift.ink, painted colours are tokens only, no legacy hex). AC3 cobalt test (failed save: icon + words; success empty; Finish error) + css test + e2e (computed 2 px ink border, hidden when empty). AC4 css test + e2e (`1s` / `0s` under reduced motion). AC5 axe colour-contrast 0 on both views, own pair scan, targets >= 44 on both views, 320 x 640 no horizontal scroll, css scan (no px font size, no raw colour, every selector scoped). AC6 existing UF-03 vitest (266) and the T-0458 e2e cases unchanged and green. AC7 `compareWithCanvas` turn-5 "In session · list view" and "In session · list view rest".
- Verdicts (shots in the scratchpad `shots-T-0603/`): List view matches the canvas structure: header, big exercise title with text actions, hairline grid rows, white Previous (README override), lift `#CC4225`, collapsed rows with chevrons. Differences: Finish is an outline (the ticket) where the canvas fills it white; the workout name and the cue/barbell line are not in the data; the canvas rest bar is teal at the bottom, here it is a lift-coloured session outline in the flow (it never covers a focused field, asserted `position: static`). List view rest: drain, big clock, -15/+15 outline pair, Skip pinned low, as the canvas; no "Up next" block (copy and logic are out of scope).
- Red/planted: planted faults on backup copies (legacy Previous colour, 1 px status border, 2 s drain, 32 px Done box, wrong state, inverted drain, no error icon) each turned red exactly the tests that claim them (8 vitest, 4 e2e); restored with `cp`, `cmp` identical. First e2e run red on my own helper (rgb(0,0,0) checkbox colour, row count before the data loaded): fixed (`color: var(--wl-ink)` on the Done box; wait for rows).
- Gate: `-w typecheck lint test --concurrency=1` 0, `test:repo-checks` 0, `format:check` 0, `check-all` 0.
- Follow-up: `FocusSession.rest` (UF-09 `session.tsx`) should carry `totalS`; `ListViewCtx.rest.totalS?` is read when present, else the total is the rest as first seen by the List view plus its own ±15 s (a rest that began before the List view opened drains from 0%).

**Rework (review: a11y).** Live regions (hints, row status, Finish error) are always rendered and, when empty, are zero size with no border/padding/margin, never display:none (`:empty` rule; tests: css rule, jsdom "in the tree while empty", e2e computed display/size). Table shape restored: swap tag back in the row `th`, hints inside their kg/reps `td`, row status inside the Done `td`; CSS lays them under the row (absolute, one `--wl-slot` each). Tests: one cell per column header, row-header text with tag. Planted faults (display:none on empty hint, hidden status, extra td, tag out of th) each red on exactly those tests; restored with `cp`/`cmp`. Screenshots regenerated.
