---
id: D-0216
title: "Cobalt shared surfaces, defaults T-0593 picked: the checkbox radius stays 6 px (no --wl-radius-checkbox token exists), the account-deleted notice moves from inline styles to `main.css` classes, the input error icon is shown by CSS order, the sheet keeps its own plan state"
status: revisit
date: 2026-10-09
by: frontend-dev (T-0593)
area: design
amends: D-0211
builds-on: D-0208, D-0210
---
## Context
T-0593 names `--wl-radius-checkbox`, but `tokens.json` has no such key and the contract changes only by decision (D-0211 added the last four). The account-deleted notice used inline styles with legacy token names, which cannot be scoped to a state.

## Decision
1. **Checkbox radius is the literal 6 px** that C-03 already specifies and the legacy box already uses. No token is added. Revisit if a second 6 px use appears.
2. **The account-deleted notice gets classes (`wl-account-deleted*`) styled in `main.css`**, with the legacy look as the base and the generic-variable form under `:is([data-wl-state], .wl-paper)`. The component may not import a stylesheet (the T-0310c AC11 boundary test in `lib/account`), so it only adds class names. The 44 px minimum size stays inline, so the existing jsdom test still measures it.
3. **The input error icon (`.wl-input__error-icon`) is `display: none`, shown under lift and rest, then hidden again under plan and paper** by later rules of equal specificity. A plan sheet nested in a lift screen therefore keeps the plan form, with no new variable.
4. **The sheet carries `data-wl-state="plan"` itself**, so its rules are `[data-wl-state].wl-sheet` and `transition: none` cancels the state root's background cross-fade.
5. **The input is 48 px tall** (state-patterns), which meets the ticket's 44 px minimum.

## Revisit when
- A second 6 px control appears (then add `radius.checkbox`).
- A `.wl-type-label` inside a plan sheet over lift should keep plan type sizes: the lift type overrides still match it by ancestry.

## Addendum (orchestrator, T-0593 review, 2026-10-09)
- **Motion:** `state-patterns.md` asks for a sheet slide and a scrim fade, but the ticket and the README say "no other motion". The README wins: sheets and scrims don't animate. state-patterns.md is corrected in a later design pass.
- **Known limits, for the screen tickets:**
  - The error-icon order breaks for a lift region inside plan. No planned screen nests that way.
  - AccountDeletedNotice is mounted outside any state root, so its Cobalt rules don't apply yet.
  - The sheet (z 2) and scrim (z 1) sit below the tab bar (z 5).
  - A scrim portalled to body gets no styles.
  - The UF-08.3 and UF-05.1 sheet tickets must settle stacking and portal scope (T-0630).
