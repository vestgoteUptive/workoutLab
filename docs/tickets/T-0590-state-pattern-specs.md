---
id: T-0590
title: "Design specs for the Cobalt shared patterns: components/state-patterns.md (buttons, row, selected option row, segmented control, chip, checkbox, toggle, input, sheet, paper panel, tab bar, session progress, drain), C-03 and neutral-notice updates, UF-11.2/11.4 visual wording, prototype superseded note"
lane: design
screens: [UF-01.2, UF-08.1, UF-08.3, UF-05.1, UF-09.8, UF-11.2, UF-11.4, UF-11.5]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0199, D-0191, D-0196, D-0203]
deps: [T-0587]
status: done
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-design (agent designer). About ½ day, docs and docs tests only. T-0592–T-0594 build from these specs. The source is README "Shared patterns" on origin/design/redesign-cobalt; this ticket writes it in the repo's spec form with the D-0211 contrast rules. -->
## Why
The handoff gives the shared patterns as a list. The repo's components need specs that name their tokens, states, contrast and accessibility, the way C-03 and the neutral notice do. Two existing specs and their docs tests pin the Chalk & Iron look (conflicts doc §C 17–18).

## Scope
- **In:**
  - **`Design-docs/docs/design/components/state-patterns.md` (new).** One section for each pattern. Each names:
    - its anatomy;
    - the D-0211 §2 generic variables it reads;
    - its radius and space tokens;
    - its states: rest, hover, focus-visible (`--wl-focus`, 2 px at a 2 px offset), disabled (`aria-disabled`) and selected;
    - its contrast pairs (D-0211 §4);
    - its motion: none, except the D-0208 cross-fade and the drain's 1 s step, both instant under reduced motion.

    The rules it carries:
    - The selected option row keeps the native radio.
    - The chip tick, the primary arrow and the session ✓ are `aria-hidden` icons (D-0211 §6).
    - The session button is at least 64 px tall.
    - Destructive actions use the secondary outline and sit last.
    - **Sheet:** the plan state even over lift, radius 28 on the top corners, a 40 × 4 `--wl-line` grabber, and the `plan.scrim` scrim at 45 %.
    - **Paper panel:** full-bleed, 18–22 px block padding with the gutter inline.
    - **Session progress:** a 44 px pause, segments 4 px high with radius `radius.progress`, and a `nowrap` counter.
    - **Tab bar:** text only, the active tab in `--wl-ink` with a 2 px underline and `aria-current`, inactive tabs in `--wl-ink-muted`. D-0196 placement is unchanged.
    - **Input:** a 1 px `--wl-ink-muted` boundary and radius `tile` (12). The error form follows D-0211 §5.
  - **`components/c-03-checkbox.md`:**
    - a 22 px box, radius 6, a 1.5 px `--wl-ink-muted` border;
    - checked: a `--wl-selected` fill with an `--wl-on-selected` tick.

    The 44 px row, the native input in its label and `aria-disabled` are unchanged.
  - **`components/neutral-notice.md`:** a `--wl-raise` fill, radius 12, `--wl-ink` text (6.2:1; never `ink-muted`, which is 4.2) and an info icon in `--wl-ink`. "Orange is reserved" becomes "the attention colour is reserved for C-01 attention, errors and over time" (D-0211 §5).
  - **`screens/UF-11.2.md` and `UF-11.4.md`:**
    - card wording becomes sections divided by hairlines (D-0208 §3);
    - the target tiles stay `plan.raise`, with labels in `plan.ink-on-raise`;
    - the UF-11.4 unsynced sign-out confirm is the paper panel;
    - remove the "needs product sign-off" sentence from UF-11.2 and cite H-32 (2026-10-08) and D-0203 §3.
  - **`screens/UF-11.5.md`, `UF-11.6.md`, `UF-08.2.md`, `UF-08.5.md`, `UF-08.3-UF-05.1.md`, `UF-09.9.md`:** one line each, "Look: Cobalt + state colour (D-0208); state `plan`; patterns in `components/state-patterns.md`", and any retired token name in them replaced.
  - **`prototype/README.md`:** "Chalk & Iron prototypes, superseded for the look by D-0208; still valid for layout order and copy."
  - **`packages/design-tokens/test/docs.test.ts`:** the C-03 and neutral-notice assertions are rewritten deliberately, and a new block covers `state-patterns.md`.
- **Out:**
  - Any app code.
  - C-01 and the body figure (T-0614).
  - `user-flows.md` (T-0618).

## Acceptance criteria
- **AC1 (C-03 docs test).** **Given** the C-03 spec **when** the docs test reads it **then** it names:
  - a native input in its label;
  - a 22 px box;
  - a 44 px row;
  - the `--wl-ink-muted` border;
  - `--wl-selected` and `--wl-on-selected`.

  It names no `accent`, `on-accent` or `warn`. The old "24 px box" assertion is replaced in the same commit, and the log shows its red run on the old spec.
- **AC2 (neutral notice).** **Given** `neutral-notice.md` **then** it names `--wl-raise`, `--wl-ink` and the info icon, and contains no `warn`, `accent`, `surface-2` or hex.
- **AC3 (state-patterns.md).** **Given** the new file **then**:
  - it has exactly one section per pattern, headed: Primary button, Secondary button, Text button, Session button, Row, Selected option row, Segmented control, Chip, Checkbox, Toggle, Input, Sheet, Paper panel, Tab bar, Session progress, Drain fill;
  - each section names at least one `--wl-` generic variable and no hex;
  - the Chip section says the tick is `aria-hidden`;
  - the Selected option row section says the native radio stays;
  - the Drain fill and Sheet sections name `prefers-reduced-motion`;
  - every section with a control names a ≥ 44 × 44 target.
- **AC4 (contrast in specs).** Each pattern's contrast table uses the D-0211 §4 values: 8.6, 5.9, 6.2, 4.9, 4.8, 4.9, 6.1, 8.1, 12.9, 6.5 and 5.0 where they apply. A test asserts that the Input and Checkbox sections cite `ink-muted` on `plan.bg` 5.9 as their boundary.
- **AC5 (UF-11.2).** `screens/UF-11.2.md` no longer contains "needs product sign-off" and cites D-0203 §3.
- **AC6 (no raw colour).** `wl-check-colours` over `Design-docs/docs/design/components` and `screens` reports nothing.

Checklist (D-0197 §7):
- Docs only. Selected and unselected, and on and off, are both specified for every control.
- No migration fixture: not applicable.

## Paths you may change
- `Design-docs/docs/design/**` (lane)
- `packages/design-tokens/test/docs.test.ts` (lane)
- `docs/tickets/T-0590-state-pattern-specs.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · check-all green · commit messages start with `T-0590`.

## Build / accept log
Archived in `docs/tickets/log/T-0590.md` (D-0157).
