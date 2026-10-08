---
id: T-0583
title: "Design tokens: Cobalt state groups (plan/lift/rest/paper), OKLCH coverage ramp, radius and space groups, plus self-hosted Familjen Grotesk and Bricolage Grotesque (D-0208)"
lane: design
screens: []
decisions: [D-0208, D-0019, D-0031, D-0203, D-0204]
deps: []
status: ready
---
## Why
D-0208, the Cobalt + state colour redesign. Source: branch `design/redesign-cobalt`, files `Design-docs/docs/design/redesign-cobalt/README.md` (sections "Design tokens", "Contrast", "Type") and `tokens.proposed.json`. Read them with `git show origin/design/redesign-cobalt:<path>`; don't copy or edit the handoff folder. This is the foundation for the landing page (T-0584) and, later, the app screens.

## Scope
- In:
  - `packages/design-tokens/src/tokens.json` gains the state groups from `tokens.proposed.json`: `color.plan`, `color.lift`, `color.rest`, `color.paper`, `color.coverage`, `font.plan`, `font.session`, `radius`, `space`.
  - `scripts/build-css.mjs` emits one `--wl-color-<state>-<name>` variable per colour token, `--wl-font-plan` / `--wl-font-session`, `--wl-radius-*` and `--wl-space-*`.
  - It also emits the coverage ramp interpolated in OKLCH from `coverage.from` to `coverage.to` in `steps` stops, as `--wl-color-plan-coverage-0..4`. The prefix avoids a clash with the existing `--wl-color-coverage-*`.
  - `src/index.ts` exports the new groups.
  - Update `test/tokens.test.ts` and `Design-docs/docs/design/design-system.md`: add a "Cobalt + state colour (D-0208)" section, and keep the Chalk & Iron section marked "in use until the app screens migrate".
  - Self-host Familjen Grotesk and Bricolage Grotesque, variable latin woff2, per `docs/specs/visual-foundation.md` §1: OFL texts, `SOURCES.md` with sha256, a size budget, and a new `fonts-state.css` export with `@font-face` for both.
- Out:
  - Removing the flat `color.*` keys (`bg`, `surface*`, `accent`, `warn`, `bg-focus`, …) or the current fonts. The app still reads them, and they're retired in a later ticket.
  - Any app screen, landing markup, engine, data or API change.

## Acceptance criteria
- AC1: Given tokens.json, when it's parsed, then every `tokens.proposed.json` value is present with the exact hex: plan.bg `#2337C6`, plan.raise `#3B50DD`, plan.line `#6676DA`, plan.ink `#FFFFFF`, plan.ink-muted `#C9D3FF`, plan.attention `#FFB3A3`, lift.bg **`#CC4225`** (not the mock's `#D9472B`), lift.bg-deep `#B33520`, lift.line `#EE8E7B`, rest.bg `#3F7A76`, rest.line `#7FA8A4`, rest.on-action `#2C5754`, and paper bg / ink / ink-muted / line `#F4F3EE` / `#1A2266` / `#4A5290` / `#D6D6E4`. The existing flat keys are unchanged.
- AC2: Given build-css, when it runs, then `tokens.css` has every new `--wl-color-<state>-<name>` variable plus `--wl-font-plan`, `--wl-font-session`, `--wl-radius-{pill,session-button,sheet,option,tile,input,segment}` and `--wl-space-{gutter-plan,gutter-session}`. All existing variables are unchanged.
- AC3: Given the coverage ramp, when it's built, then `--wl-color-plan-coverage-0` equals `#3B50DD` and `-4` equals `#FFFFFF`, the steps are interpolated in OKLCH (verified against a reference computation, monotonic in OKLCH lightness), and there are exactly 5 stops.
- AC4: Contrast test, WCAG 2.2, computed from the tokens. It must meet at least the README "Contrast" values:
  - white on plan.bg ≥ 8.6
  - ink-muted on plan.bg ≥ 5.9
  - white on plan.raise ≥ 6.2
  - white on lift.bg ≥ 4.8 (≥ 4.5 required; it fails on `#D9472B`)
  - white on rest.bg ≥ 4.9
  - lift.on-action on white ≥ 6.1
  - rest.on-action on white ≥ 8.1
  - paper ink ≥ 12.9 and paper ink-muted ≥ 6.5 on paper.bg
  - attention on plan.bg ≥ 5.0

  Planted fault: setting lift.bg to `#D9472B` fails it.
- AC5: Given fonts-state.css, then it declares `@font-face` for "Familjen Grotesk" (weights 400–700) and "Bricolage Grotesque" (400–800), with same-origin woff2 URLs, `font-display: swap`, and no `data:` URIs or third-party hosts. Each file's sha256 matches `SOURCES.md`, the OFL texts are present, and the total stays within the visual-foundation §1 budget. Planted faults: a wrong sha256, or a removed weight, fails it.
- AC6: Given `design-system.md`, then it documents the state groups, the contrast table, the type roles (rem) and the "no raw colours" rule. The docs tests are updated deliberately, with each changed assertion listed in the Build log.
- AC7: No raw colours outside tokens.json: the colour guard (`no-raw-colour`, `wl-check-colours`) stays green.

## Paths you may change
- `packages/design-tokens/**`, `Design-docs/docs/design/design-system.md`

## Contract impact
`packages/design-tokens/src/tokens.json` is a contract. This is an additive change named by D-0208. Gate: the full `-w typecheck lint test --force` (D-0178 contract rule).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `-w test:repo-checks`, `format:check` and `check-all` green · commits start with `T-0583` and cite D-0208.

## Build / accept log
