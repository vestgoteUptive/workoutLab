---
id: T-0587
title: "Design tokens: add plan.ink-on-raise #DDE3FF, plan.scrim #0E1652, radius.progress 2, space.option-bleed 18 and meta.planCoverage (additive contract change, D-0211 §1)"
lane: design
screens: []
decisions: [D-0208, D-0209, D-0210, D-0211]
deps: []
status: ready
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-design (agent designer). About ¼ day. Contract change: forced full gate. -->
## Why
The Cobalt app screens need four values the handoff README uses but `tokens.proposed.json` lacks:
- the tile label colour on `plan.raise`;
- the sheet scrim;
- the 2 px progress-segment radius;
- the 18 px option bleed.

They also need coverage label flags computed against `plan.bg`. Without these, the web tickets would need raw colours or literals (conflicts doc §A 2–3). Source: README "Contrast", "Spacing, radius, shape" and "Shared patterns" on `origin/design/redesign-cobalt`.

## Scope
- **In:**
  - `packages/design-tokens/src/tokens.json` gains:
    - `color.plan.ink-on-raise` `#DDE3FF`
    - `color.plan.scrim` `#0E1652`
    - `radius.progress` `2`
    - `space.option-bleed` `18`
    - `meta.planCoverage`: 5 entries `{ requiresLabel }`, computed as the contrast of `--wl-color-plan-coverage-n` on `plan.bg` < 3.
  - `build-css.mjs` emits `--wl-color-plan-ink-on-raise`, `--wl-color-plan-scrim`, `--wl-radius-progress: 2px` and `--wl-space-option-bleed: 18px`.
  - `src/index.ts` types widen.
  - The tests: `tokens.test.ts`, `css.test.ts`, `types.test.ts`.
  - The `design-system.md` Cobalt section gets these rows.
- **Out:**
  - Removing or renaming any key (T-0625).
  - The legend fields (T-0614).
  - App CSS.

## Acceptance criteria
- **AC1 (values).** **Given** `tokens.json` **when** it's parsed **then** the four new values are exactly as above (uppercase hex for colours, numbers for radius and space), and every existing key and value is unchanged. The test diffs against the pre-change key set.
- **AC2 (CSS).** **Given** the build **when** `tokens.css` is read **then** it has `--wl-color-plan-ink-on-raise: #DDE3FF`, `--wl-color-plan-scrim: #0E1652`, `--wl-radius-progress: 2px` and `--wl-space-option-bleed: 18px`, and every emitted variable name is unique.
- **AC3 (contrast).** **Given** the tokens **when** the WCAG 2.2 ratios are computed **then**:
  - `plan.ink-on-raise` on `plan.raise` ≥ 4.9 at one decimal (D-0209 §1) and ≥ 4.5 unrounded;
  - `plan.ink-muted` on `plan.raise` is < 4.5. This is a planted-failure pair that must stay failing; it documents the D-0211 §4 rule.
  - **Planted fault:** setting ink-on-raise to `#C9D3FF` fails the first assertion (log).
- **AC4 (planCoverage).** **Given** the five `--wl-color-plan-coverage-n` values **when** `meta.planCoverage` is checked **then** each `requiresLabel` equals (contrast on `plan.bg` < 3). Step 0 is `true` and step 4 is `false`.
  - The other value of the condition: a planted flipped flag fails.
- **AC5 (no raw colours, guard).** The colour guard (`no-raw-colour`, `wl-check-colours`) and `.github/scripts/auth-templates.test.mjs` stay green. That test walks tokens.json strings.
- **AC6 (docs).** `design-system.md` lists the four tokens with their use and the 4.9 ratio. `docs.test.ts` stays green, and any changed assertion is listed in the log.

Checklist (D-0197 §7):
- Binary conditions: requiresLabel true/false are both asserted (AC4).
- No migration or upgrade fixture: not applicable.

## Paths you may change
- `packages/design-tokens/**`, `Design-docs/docs/design/design-system.md` (lane)
- `docs/tickets/T-0587-tokens-cobalt-additions.md` (log only)

## Contract impact
`packages/design-tokens/src/tokens.json`: additive keys named by D-0211 §1. Forced full gate (`-w typecheck lint test --force --concurrency=1`).

## Definition of done
Tests for every AC pass · forced full gate green · `-w test:repo-checks`, `format:check` and `check-all` green · commit messages start with `T-0587` and cite D-0211.

## Build / accept log
