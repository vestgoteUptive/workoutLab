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

### Build log (frontend-dev, 2026-10-09, branch base b9c18a0 clean)
- Design: `body-figure.css` keeps the legacy rules and adds `:where([data-wl-state]) …` rules on the generic `--wl-*` variables (same specificity, so source order wins and the forced-colors block still wins). Reason: the generic variables at `:root` can't reproduce the legacy look exactly (legacy gap is `surface` not `bg`, primary is lime `accent` not `ink`, body stroke is `line-strong` not `line`), and D-0210 §2 says unmigrated screens don't change. `body-map.css` colours moved to generic vars (equal to legacy at `:root`).
- Legend: `coverageLegend[n].token` = `plan-coverage-N`, `attentionLegend.token` = `plan-attention`. `BodyMap.tokenVar` and UF-10 `tokenVar` draw them as `var(--wl-coverage-N)` / `var(--wl-attention)` (neutral = `var(--wl-raise)`), never `--wl-color-plan-*`.
- AC-ring: the ring (and its gap) is now emitted after the neutral body parts and before the regions, so the silhouette no longer hides it and the gap doesn't eat into its own region. Trade-off: a neighbouring region painted later still overlaps the ring where they touch (preview painted the ring first of all).
- AC→test: AC1 `body-map-figure.spec.ts` "T-0615 AC1"; AC2 "AC2 legacy fallback" (+ legend swatch); AC3 `uf-04-figure.spec.ts` "AC3 plan primary and secondary"; AC4 `colours.test.ts` (regex gains `--wl-(raise|ink|ink-muted|line|bg|attention|focus|on-selected|coverage-0..4)`); AC5 existing specs, only colour assertions in BodyMap unit tests moved (`--wl-color-coverage-N` → `--wl-coverage-N`, `--wl-color-warn` → `--wl-attention`, focus → `--wl-focus`); AC6 "AC6 / AC7" axe color-contrast on C-01 full and compact + value colour = plan.ink; AC-T0614-2 `tokens.test.ts` AC6, `BodyMap.test.tsx` "AC-T0614-2", `UF-10/__tests__/legend-vars.test.ts`; AC-ring `BodyFigure.test.tsx` "AC-ring".
- Planted faults (each restored from a backup copy; all failed as intended): literal `#FFFFFF` in body-figure.css fails colours.test; ring emitted before parts fails AC-ring; `tokenVar` reading `--wl-color-plan-*` fails 25 BodyMap tests incl. the AC-T0614-2 no-plan-var test; plan rules applied outside a state (`:where(html)`) fails AC2 and AC3 e2e; plan rules removed fails AC1 and AC3 e2e; numeric label colour `--wl-raise` fails AC6 e2e.
- AC7 verdict: app-only 390×844 screenshots (full, compact, UF-04.2 figure) viewed. Cobalt figure, white on-target fill, hatch, salmon halo with bg gap and white focus ring match T-0614's preview; no canvas frame (placeholder box). The e2e puts `data-wl-state="plan"` on `<html>` because screens aren't migrated yet (T-0601/T-0608/T-0611); the UF-04 card keeps its dark surface until then.
- Existing body-map/uf-04 e2e (labels, taps, 44 px, axe, forced colours) pass unchanged.
