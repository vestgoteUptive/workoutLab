---
id: T-0592
title: "Shared Cobalt controls in main.css: primary, secondary, text and session buttons, row, selected option row, segmented control, chip with an aria-hidden tick, focus ring, unboxed .wl-card; all under [data-wl-state] so unmigrated screens don't change; components/icons"
lane: web-shell
screens: [UF-01.2, UF-08.1, UF-08.3, UF-09.8]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0191, D-0203]
deps: [T-0589, T-0590]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. main.css is shared: full web e2e suite. Serial after T-0589, before T-0593 (the same file). -->
## Why
Every screen ticket reuses the same buttons, rows and choice controls (`components/state-patterns.md`, T-0590). They're built once here, reading only the generic variables, and scoped under `[data-wl-state]` (D-0210 §3). A Chalk & Iron screen that uses `.wl-button--primary` today keeps its look until its own ticket adds a state.

## Scope
- **In** (`apps/web/src/main.css`, every rule under `[data-wl-state]` or `.wl-paper`):
  - **`.wl-button--primary`:**
    - full width;
    - `--wl-action` fill and `--wl-on-action` text;
    - the button type role (1.375rem/700 in plan, 1.5rem/800 in session);
    - padding 20 px 28 px, radius `--wl-radius-pill`;
    - the label left and an icon slot right;
    - `margin-top: auto` as the last child of a `.wl-page`.
  - **`.wl-button--secondary`:** a 1.5 px `--wl-ink` outline on transparent, 1.125rem/600, 16 px block padding, pill.
  - **`.wl-button--text`:** `--wl-ink`, underlined at a 4 px offset, min 44 × 44.
  - **`.wl-button--session` and `.wl-button--session-outline`:** radius `--wl-radius-session-button`, padding 24 px 26 px, 1.5rem/800, min height 64 px.
  - **`.wl-row`:**
    - 12 px block padding and a 1 px `--wl-line` bottom border;
    - title `.wl-type-row-title`, an optional caption `.wl-type-label`, an optional trailing value or chevron;
    - min height 44 px when interactive.
  - **`.wl-option`:** wraps a native `<input type="radio">`, which stays focusable. `:has(input:checked)` gives a `--wl-selected` block with radius `--wl-radius-option`, bleeding `--wl-space-option-bleed` past the gutter, with `--wl-on-selected` text.
  - **`.wl-segmented`:** a 1 px `--wl-line` border, pill, 4 px inner padding. The selected segment (on native radios or `aria-pressed` buttons) is a `--wl-selected` pill with `--wl-on-selected` text.
  - **`.wl-chip`:** 8 px × 14 px padding, pill. Off: a 1 px `--wl-line` outline. On (`aria-pressed="true"` or `:checked`): a `--wl-selected` fill, `--wl-on-selected` text, and an `aria-hidden` tick icon before the label. Min hit area 44 × 44 (padding plus an invisible extension).
  - **`:focus-visible`** on all of these: a 2 px `--wl-focus` outline at a 2 px offset.
  - **Under a state, `.wl-card`** is unboxed: no fill, border or radius, 0 padding, and a 1 px `--wl-line` divider between sections (D-0208 §3).
  - **`apps/web/src/components/icons/`:** tick, arrow, cross, pause, chevron and drag-handle SVG components (2 px stroke, `currentColor`, `aria-hidden="true"`, `focusable="false"`).
- **Out:**
  - Checkbox, toggle, input, sheet, paper and notices (T-0593).
  - Tab bar, progress and drain (T-0594).
  - Adopting any of these in a screen.

## Acceptance criteria
- **AC1 (unchanged outside a state).** **Given** `/plan` and `/plan/account` (no state yet) **when** loaded **then** the primary and secondary buttons' computed `background-color`, `border-radius` and `font-family` equal main's (`accent`, `14px`, DM Sans), and `main-css.test.ts` ".wl-button--primary is accent on on-accent" passes unchanged.
- **AC2 (buttons in plan and lift, `tests/e2e/cobalt-controls.spec.ts`).** In an injected `[data-wl-state="plan"]`:
  - the primary has a `plan.action` background with `plan.on-action` text (8.6:1), `border-radius` ≥ 999px, 22px/700;
  - the secondary has a 1.5px solid `plan.ink` border on transparent.

  In `lift`: the session button has radius 22px, a min height of 64px, and `lift.on-action` text on white (6.1:1).

  Expected values come from `tokens.json`.
- **AC3 (selected option row).**
  - **Given** three `.wl-option` radios with the second checked, in plan **then** the second has a `plan.selected` background, a 16px radius, and its left edge 18 px left of the gutter. The others are transparent.
  - Arrow keys move the checked radio (native), and `getByRole("radio", { name })` finds each.
  - **Unchecked:** no block. Both values are tested.
- **AC4 (chip).**
  - A pressed chip's accessible name equals its label exactly ("Quads", not "✓ Quads"), and its tick `<svg>` is `aria-hidden="true"`.
  - Pressed and unpressed differ in background (`plan.selected` vs transparent) **and** in whether the tick is present.
  - Its hit box is ≥ 44 × 44.
- **AC5 (segmented control).** The selected segment's background is `plan.selected`, with `plan.on-selected` text (8.6:1). The control's border is 1px `plan.line`, which is decorative: the label text identifies the segment.
- **AC6 (focus).** Tabbing to each control inside plan shows a 2px solid `plan.ink` outline at a 2px offset. Inside `.wl-paper` the outline is `paper.ink`.
- **AC7 (no cards under a state).** A `.wl-card` in a plan root has a transparent background, `border-width: 0px` and `border-radius: 0px`. Outside a state it keeps the `surface` fill.
- **AC8 (scoping, vitest over main.css).**
  - There is no raw colour and no `px` font size.
  - Every new selector is under `[data-wl-state]` or `.wl-paper`.
  - A planted unscoped `.wl-button--primary { border-radius: 999px }` fails (log).
- **AC9 (motion).** None of these controls has a `transition` other than inheriting the state cross-fade. With reduced motion, the computed `transition-duration` is `0s`.

Checklist (D-0197 §7):
- Inside and outside a state, checked and unchecked, and pressed and unpressed are all tested.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/main.css` (listed extra)
- `apps/web/src/app/__tests__/main-css.test.ts`, `apps/web/src/components/icons/**` (lane)
- `tests/e2e/cobalt-controls.spec.ts` (new, listed extra)
- `docs/tickets/T-0592-state-buttons-rows-options.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0592`.

## Build / accept log
- Build (HEAD 2df82a8, tree clean). `main.css`: every control rule is under `:is([data-wl-state], .wl-paper)`; `components/icons/` has Tick, Arrow, Cross, Pause, Chevron, DragHandle on a shared `Icon` (2 px, currentColor, aria-hidden, focusable=false). Chip and option ticks are always in the markup and CSS shows them only when on. No Chip or Option component: adopting them is a screen ticket.
- AC to test: AC1 `cobalt-controls.spec.ts` "AC1" (3 tests: /plan primary, /plan/account secondary, bare fixture) + unchanged `main-css.test.ts` primary test. AC2 "AC2 plan buttons", "AC2 lift session button". AC3 "AC3 selected option row" (checked, unchecked, 18 px bleed, arrow keys, role lookups). AC4 "AC4 chip" (aria-pressed and native checkbox, tick present or hidden, 44 x 44). AC5 "AC5 segmented control". AC6 "AC6 keyboard focus" (Tab through 10 controls, plan and paper). AC7 "AC7 no cards". AC8 `main-css.test.ts` "T-0592 AC8" (3 tests). AC9 "AC9 no transition" with and without reduced motion. icons: `components/icons/__tests__/icons.test.tsx`.
- Note: Chrome computes a 1.5px border as 1px, so AC2/AC5 e2e assert width >= 1px and solid ink; the authored `1.5px solid var(--wl-ink)` is pinned in main-css.test.ts.
- Planted faults (backup `main.css.bak`, restored with cp): (1) unscoped `.wl-button--primary{border-radius:999px}` -> only the main-css AC8 legacy test red (the "scoped controls" test also went red in that run from the other planted edits), and e2e AC1 red; (2) unscoped `.wl-chip {` -> AC8 "every selector" red; (3) option bleed 0 -> AC3 red; chip tick always shown -> AC4 red; segmented border ink -> AC5 red; `.wl-card` padding 16px/boxed -> AC7 red; session radius 14px -> AC2 lift red; transition on chip -> AC9 red; (4) focus offset 0 -> AC6 red; plan primary radius 14px -> AC2 plan red. First e2e planted run missed AC6 and AC2 plan (my edit hit the legacy rule); redone as run 2 and went red.
- Gate (HEAD 2df82a8 + change): typecheck lint test exit 0; test:repo-checks 0; format:check 0; check-all.mjs 0; full web e2e 409 passed, exit 0.
- Rework (review): checked option and pressed chip text (captions too) use `--wl-on-selected`; an unchecked option's hover caption uses `--wl-ink`; disabled primary or session in lift and rest is the outline form; a disabled and pressed chip keeps `--wl-on-selected`. New e2e "review 1" to "review 4" (option caption in plan and paper, hover caption contrast, disabled in rest, disabled+pressed chip, option tick visible or hidden, `.wl-card + .wl-card` divider). Planted fault: removing the four fixes turned review 1 (both tests), 2 and 3 red (4 red); the tick and divider tests guard unchanged behaviour. Restored with cp.
- Rework gate: typecheck lint test 0 (after widening the AC8 scope regex to accept :is() lists of states), test:repo-checks 0, format:check 0, check-all 0, full web e2e 0 (includes cobalt-controls, visual-foundation).
