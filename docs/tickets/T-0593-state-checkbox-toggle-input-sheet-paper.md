---
id: T-0593
title: "Shared Cobalt surfaces: C-03 checkbox, .wl-toggle, .wl-input with the per-state error form, .wl-sheet with grabber and plan.scrim, .wl-paper panel; the excluded-areas notice, offline line and account-deleted notice read the generic variables"
lane: web-shell
screens: [UF-08.3, UF-05.1, UF-08.5, UF-08.2, UF-11.4, UF-11.5, UF-02.1]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0199, D-0195]
deps: [T-0592]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Touches components/checkbox, excluded-areas-notice, offline-status, account-deleted-notice and main.css: full web e2e suite. The last main.css ticket before the screens. -->
## Why
These are the remaining shared pieces from `components/state-patterns.md` (T-0590). The checkbox and the notices exist and are restyled, not rebuilt. The input, toggle, sheet and paper panel are classes that the screen tickets adopt.

## Scope
- **In:**
  - **`components/checkbox` (C-03):** reads `--wl-ink-muted`, `--wl-selected`, `--wl-on-selected`, `--wl-focus` and `--wl-radius-checkbox`; a 22 px box with a 1.5 px border. Markup, behaviour and `aria-disabled` are unchanged.
  - **`.wl-toggle`:** a 48 × 28 pill on a native checkbox with `role="switch"`, with a 44 px row hit area.
    - On: a `--wl-selected` track with an `--wl-on-selected` knob.
    - Off: a 1.5 px `--wl-ink-muted` outline with an `--wl-ink-muted` knob.
    - No transition (README: "no other motion").
  - **`.wl-input`:** a 1 px `--wl-ink-muted` boundary (5.9:1 on `plan.bg`), radius `--wl-radius-input`, `--wl-ink` text, min height 44 px. `[aria-invalid="true"]` follows D-0211 §5:
    - plan: a 2 px `--wl-attention` border;
    - lift and rest: a 2 px `--wl-ink` border, plus an `aria-hidden` error icon slot;
    - paper: `paper.ink`.

    `.wl-input__error` text is `--wl-attention` in plan.
  - **`.wl-sheet`, `.wl-sheet__grabber` and `.wl-sheet-scrim`:**
    - the sheet sets `data-wl-state="plan"` on itself, even over lift (D-0208 §2);
    - it starts at `block-start: 150px`, with radius `--wl-radius-sheet` on the top corners only;
    - the grabber is 40 × 4 in `--wl-line` and `aria-hidden`;
    - the scrim is `color-mix(in oklch, var(--wl-color-plan-scrim) 45%, transparent)`;
    - it opens and closes without a transition.
  - **`.wl-paper`:** full-bleed (negative inline margins of `--wl-gutter`), with 18–22 px block padding, the gutter inline, no radius, and the paper variables.
  - **The notices** (`excluded-areas-notice`, `offline-status`, `account-deleted-notice`): read `--wl-raise`, `--wl-ink` and `--wl-radius-tile`, with the icon in `--wl-ink`.
- **Out:**
  - Adopting these in screens.
  - Notice copy.

## Acceptance criteria
- **AC1 (checkbox, `tests/e2e/cobalt-surfaces.spec.ts` + vitest).**
  - In plan, an unchecked C-03 box is 22 × 22 with a 1.5px `plan.ink-muted` border (5.9:1, ≥ 3:1) and transparent.
  - Checked, it has a `plan.selected` fill and a `plan.on-selected` tick.
  - The row is ≥ 44 px tall.
  - Outside a state, the box keeps the legacy `text-muted` border and the `accent` fill.
  - The existing C-03 tests (Space toggles; `aria-disabled` blocks click and Space) pass unchanged.
- **AC2 (toggle).**
  - `getByRole("switch", { name })` finds it, and Space toggles it.
  - On and off differ in knob position **and** fill.
  - The row hit area is ≥ 44 px.
  - Computed `transition-duration` is `0s`, with and without reduced motion.
- **AC3 (input and error).**
  - In plan, a valid `.wl-input` has a 1px `plan.ink-muted` border.
  - With `aria-invalid="true"`, it has a 2px `plan.attention` border, and its error text is `plan.attention` (5.0:1 on `plan.bg`).
  - In lift, the invalid border is 2px `lift.ink` and the icon is `aria-hidden`.
  - Valid and invalid are both tested in plan and lift.
- **AC4 (sheet).**
  - A `.wl-sheet` opened inside a `[data-wl-state="lift"]` root has a `plan.bg` background and 28px top radii (bottom radii 0).
  - The scrim's computed background is `plan.scrim` at alpha 0.45.
  - The grabber is `aria-hidden`.
  - The screen root keeps `lift`.
- **AC5 (paper).** At 390 px, a `.wl-paper` in a plan `.wl-page` spans x = 0 to 390, with `paper.bg` and `paper.ink` (12.9:1).
- **AC6 (notices).**
  - In plan, the excluded-areas notice has a `plan.raise` background and `plan.ink` text (6.2:1). The test checks the computed pair is ≥ 4.5.
  - Outside a state it keeps `surface-2`.
  - The offline line reads `--wl-ink` online and offline. Both states are rendered.
- **AC7 (guard and rem).** The checkbox and notice CSS have no raw colour and no px font size. The no-raw-colour lint and `wl-check-colours` pass, and a planted `#FFFFFF` in `checkbox.css` fails (log).

Checklist (D-0197 §7):
- Checked and unchecked, valid and invalid, inside and outside a state, and online and offline (the offline line) are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/components/checkbox/**`, `components/excluded-areas-notice/**`, `components/offline-status/**`, `components/account-deleted-notice/**`, `apps/web/src/app/__tests__/main-css.test.ts` (lane)
- `apps/web/src/main.css` (listed extra)
- `tests/e2e/cobalt-surfaces.spec.ts` (new, listed extra)
- `docs/tickets/T-0593-state-checkbox-toggle-input-sheet-paper.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0593`.

## Build / accept log

- 2026-10-09 build (frontend-dev). Start: clean, HEAD b9683cb. D-0216 records the defaults (no `--wl-radius-checkbox` token: literal 6 px; account-deleted notice classes live in `main.css`, since `lib/account` boundaries.test forbids a stylesheet import).
- Changed: `main.css` (toggle, input + error, sheet, grabber, scrim, paper), `checkbox.css`, notice CSS (excluded, offline) and the account-deleted classes in `main.css` (+ its tsx className), `main-css.test.ts`, new `tests/e2e/cobalt-surfaces.spec.ts`, three `*-cobalt.test.ts`.
- AC→test: AC1 e2e "AC1 checkbox ..." (plan, paper+lift, disabled+hover, legacy) + `checkbox-cobalt.test.ts`; existing Checkbox.test unchanged and green. AC2 e2e toggle (role, Space, knob/fill, 44 px, 0s with and without reduced motion, paper). AC3 e2e input plan/lift/rest/paper valid+invalid, disabled, nested plan sheet. AC4 e2e sheet over lift (bg, radii, y=150, scrim 0.45, grabber, root stays lift, nested caption). AC5 e2e paper 0..390. AC6 e2e three notices in state and outside (offline: text and icon variants in plan, lift, none; online renders nothing, covered by existing OfflineStatus tests). AC7 three `*-cobalt.test.ts` (no px font size, check-colours, planted `#FFFFFF` fails) plus AC8 scope tests in `main-css.test.ts`.
- Review lessons: (a) nested captions asserted in the sheet (plan) and the paper/checked cases; no toggle/checkbox nested text exists. (b) disabled checkbox/toggle/input keep ink-muted (>= 3:1 plan, ink in lift/rest). (c) disabled rules do not touch the checked fill or tick (tested incl. hover).
- Red on unfixed code: first e2e run 7 failed (component CSS not in the /welcome bundle: injected from disk; fixture id clash `#root`). Fixed in the spec, then 18/18.
- Planted faults (backup copy, restored by `cp`): invalid border colour (AC3 x2), sheet radius, scrim 30%, paper margin removed, toggle knob position, icon shown in plan, checkbox tick colour (3), notice bg, offline ink colour: each fails the e2e; unscoped `.wl-toggle` fails main-css AC8; `#FFFFFF` in checkbox.css fails check-colours (in-test).
- Gate 1 red: `lib/account` boundaries.test forbids a stylesheet import in AccountDeletedNotice; rules moved to `main.css`, test untouched.
- Gate (exit codes): `-w typecheck lint test --concurrency=1` 0; `test:repo-checks` 0; `format:check` 0; `check-all.mjs` 0; full e2e 0.
