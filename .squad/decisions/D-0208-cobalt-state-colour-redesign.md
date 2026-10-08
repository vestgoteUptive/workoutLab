---
id: D-0208
title: "Visual redesign: state colour (plan cobalt / lift red / rest teal / paper), no cards, Familjen Grotesk + Bricolage Grotesque; supersedes the Chalk & Iron palette and fonts (D-0019 values, D-0031 stacks, D-0203 card/gutter rules)"
status: accepted
date: 2026-10-08
by: designer handoff (Design-docs/docs/design/redesign-cobalt/); owner decides Q1–Q4
supersedes: D-0019 colour values (not its shape rules or colour guard), D-0031 font stacks, D-0203 / visual-foundation §2–§3 card, gutter and heading rules
builds-on: D-0002, D-0003, D-0013, D-0017, D-0046, D-0190, D-0207
---
## Context
The owner finds the current UI generic ("looks AI generated"): a dark charcoal background, a lime accent, condensed caps and nested cards. A design exploration settled on one rule: the background colour shows the session state. The full spec is in `Design-docs/docs/design/redesign-cobalt/README.md`.

## Decision
1. **Tokens.** `tokens.json` moves to state groups: `color.plan`, `color.lift`, `color.rest`, `color.paper`, and a `coverage` ramp from plan.raise to white in OKLCH. Fonts become `font.plan` and `font.session`, and `radius` and `space` groups are added. The values are in `tokens.proposed.json`.
   - `accent`, `warn`, `surface*` and `bg-focus` are retired.
   - The colour guard (`no-raw-colour`, `wl-check-colours`) stays.
2. **State scopes.** Each screen root carries `data-wl-state="plan|lift|rest"`. `main.css` maps it to generic variables (`--wl-bg`, `--wl-ink`, …), and components read only those.
   - Mapping: plan for every non-session screen and for decisions made mid-session (UF-09.8, UF-09.9, swap sheets); lift for UF-09.2/.3/.4/.7 and UF-03.1; rest, draining to lift, for UF-09.1/.5/.6 and UF-03.2.
3. **No cards.** Structure comes from hairlines and type size. Gutter 28 px (plan) / 26 px (session); max width 640 px stays.
4. **Fonts.** Familjen Grotesk (plan) and Bricolage Grotesque (session), self-hosted under the visual-foundation §1 rules.
5. **Contrast.** lift.bg is `#CC4225`, not the mock's `#D9472B`, and the README "Contrast" fixes apply. Every session screen names its state in text, because lift and rest differ by hue only.
6. **Behaviour, copy and flows are unchanged.** Screen specs and earlier decisions stand.
7. **Landing** follows the same tokens, with layout **1b** (owner choice, 2026-10-08): all plan blue, a single lift-coloured Set screen in the hero, the four features in a numbered 2 × 2 hairline grid, and privacy on a paper band. No new copy.

## Owner questions (defaults in brackets)
- Q1 Two font families, or one? [two, as designed]
- Q2 Gutter 28 px instead of 20 px? [yes]
- Q3 The body figure / C-01 recolour for plan.bg needs a design check before C-01 ships [yes: ship the tokens first, the figure in its own ticket]
- Q4 Navigation additions (Balance link from Plan, etc.) still need product sign-off [unchanged]

## Rollout (orchestrator, 2026-10-08)
- **Source:** branch `design/redesign-cobalt`, `Design-docs/docs/design/redesign-cobalt/` (README, `tokens.proposed.json`, `canvas/`). Read it with `git show`; the handoff folder stays on its branch as the reference and isn't moved or edited.
- **Phase 1** (this decision's first tickets):
  - **T-0583:** tokens and fonts.
  - **T-0584:** the landing page, option 1b.
- **Additive tokens in phase 1.** The app screens aren't restyled yet and about 55 files read the flat `color.*` keys, so T-0583 adds the state groups next to the existing flat keys. It doesn't replace them. `accent`, `warn`, `surface*` and `bg-focus` are retired in a later ticket, once the last app screen has moved (the app-screen tickets are groomed later from `PROMPT.md`).
- **Fonts.** Familjen Grotesk and Bricolage Grotesque are added next to Big Shoulders Display and DM Sans, which the app still uses until its screens move.
- **Owner questions Q1–Q4** are H-29 to H-32 in `.squad/needs-human.md`. Work continues on the defaults.
