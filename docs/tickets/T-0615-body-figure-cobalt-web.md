---
id: T-0615
title: "BodyFigure and C-01 BodyMap read the generic state variables (plan ramp, white primary and hatch, plan.attention halo with the bg gap) and keep the lime look on screens without a state; colours.test accepts --wl-* deliberately"
lane: web-shell
screens: [UF-02.1, UF-10.1, UF-04.2]
decisions: [D-0208, D-0210, D-0211, D-0207, D-0060]
deps: [T-0614, T-0589]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Restyle only: components/body-figure and components/body-map were built in T-0556/T-0557. A dependency of T-0601, T-0608 and T-0611. Shared components: full web e2e suite. -->
## Why
T-0614 defines the cobalt figure. The components read the generic variables, so the figure is cobalt on a plan screen and stays lime on a screen without a state (D-0210 §2). That lets the components change before every screen does.

## Scope
- **In:**
  - `components/body-figure/body-figure.css`: each `var(--wl-color-…)` becomes the D-0211 §2 generic variable, per the T-0614 table: `--wl-raise`, `--wl-ink-muted`, `--wl-line`, `--wl-ink`, `--wl-coverage-N`, `--wl-attention`, `--wl-bg` (the gap) and `--wl-focus`. The forced-colours block is unchanged.
  - `components/body-map/**`: the legend swatches and labels read `coverageLegend` and `attentionLegend` (now `plan-…`) through `--wl-coverage-N` and `--wl-attention`. The numeric labels stay.
  - Tests:
    - `body-figure/__tests__/colours.test.ts`: the allowed-value regex gains `var(--wl-(raise|ink|ink-muted|line|bg|attention|focus|on-selected|coverage-[0-4]))`, with the reason logged; a planted raw `#fff` still fails;
    - `BodyMap.attention-token.test.tsx`, `legend-source.test.ts`, `tests/e2e/body-map-figure.spec.ts` and `tests/e2e/uf-04-figure.spec.ts`: the colour assertions only.
- **Out:**
  - Placing the figure in screens (T-0601, T-0608, T-0611).
  - Geometry and copy.

## Acceptance criteria
- **AC1 (plan).** Inside a `[data-wl-state="plan"]` fixture:
  - a step-4 region's computed fill is `--wl-color-plan-coverage-4` (white) and a step-0 region's is `plan.raise`;
  - the silhouette is `plan.raise` with an `plan.ink-muted` stroke;
  - the attention halo's outer stroke is `plan.attention`, and its gap stroke is `plan.bg`.
- **AC2 (legacy fallback).** In a fixture without a state, the same regions have the legacy fills (lime `coverage-4`, `surface-2`) and the `warn` halo, so unmigrated screens don't change. Both values are tested.
- **AC3 (UF-04.2 primary and secondary).** Inside plan, a primary region is `plan.ink`. A secondary region is filled with its instance's hatch pattern, whose stripe is `plan.ink` on a `plan.raise` ground.
- **AC4 (tokens only).** The updated `colours.test.ts` passes, and a planted literal `#FFFFFF` in `body-figure.css` fails it (log). The no-raw-colour lint and `wl-check-colours` pass.
- **AC5 (behaviour unchanged).** `body-map-figure.spec.ts` (label linking, region taps, 44 px targets, axe, forced colours) and `uf-04-figure.spec.ts` pass with no role or name change. Only the colour assertions move.
- **AC6 (contrast).** In plan, axe colour-contrast has 0 violations on a C-01 fixture showing steps 0–4 and one attention area. The numeric labels are `plan.ink` on `plan.bg` (8.6).
- **AC7 (visual).** App-only screenshots at 390 × 844 of C-01 (compact and full) in a plan fixture, and the UF-04.2 figure. There's no canvas frame (the canvas has a placeholder box; logged). The log has a verdict against T-0614's preview.

Checklist (D-0197 §7):
- State and no state, and attention on and off, are both tested.
- No migration fixture: not applicable.

- **AC-T0614-2 (moved from T-0614 per TR-0048).** The `coverageLegend` / `attentionLegend` `token` fields in `packages/design-tokens/src/index.ts` point to `plan-coverage-N` / `plan-attention`, tokens.test.ts AC6 is updated, and the consumers (`BodyMap.tsx`, `features/UF-10/format.ts`) compile and still render the legacy look outside `[data-wl-state]` (D-0210 §2). Planted fault: a consumer reading the plan token outside a state scope fails a test.
- **AC-ring.** The highlight ring draws above the body parts, so the silhouette no longer hides it around inner areas (core, chest). Covered by a test on paint order.

## Paths you may change
- `apps/web/src/components/body-figure/**`, `apps/web/src/components/body-map/**` (lane)
- `tests/e2e/body-map-figure.spec.ts`, `tests/e2e/uf-04-figure.spec.ts` (listed extras)
- `packages/design-tokens/src/index.ts`, `packages/design-tokens/test/tokens.test.ts`, `apps/web/src/features/UF-10/format.ts` and its tests (TR-0048 grant)
- `docs/tickets/T-0615-body-figure-cobalt-web.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0615` and cite UF-02.1/UF-10.1/UF-04.2.

## Build / accept log
