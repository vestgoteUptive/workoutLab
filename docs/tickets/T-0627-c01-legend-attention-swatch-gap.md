---
id: T-0627
title: "C-01 legend attention swatch: 2 px --wl-attention ring with a 1 px --wl-bg gap, per c-01-body-map.md:78"
lane: web-shell
screens: [UF-02.1, UF-10.1]
decisions: [D-0207, D-0215]
deps: [T-0615]
status: ready
---
## Why
T-0615 review: the spec (`Design-docs/docs/design/components/c-01-body-map.md:78`) gives the legend's "Needs attention" swatch a 2 px `--wl-attention` ring with a 1 px `--wl-bg` gap. `BodyMap.tsx:117,192` uses `outlineOffset: 0`, so the gap is missing.

## Scope
- In (`apps/web/src/components/body-map/**`): the legend attention swatch draws the 1 px `--wl-bg` gap inside the 2 px `--wl-attention` ring, both legacy (at :root the variables equal the legacy values) and under `[data-wl-state]`.
- Out: the figure's halo geometry (T-0628).

## Acceptance criteria
- AC1 Given the legend renders, then the attention swatch has a 2 px `--wl-attention` outline and a 1 px gap in `--wl-bg` (computed style, in plan and at :root). Planted fault: offset 0 fails it.
- AC2 Unmigrated screens: the legacy swatch colours are unchanged apart from the gap (existing BodyMap tests updated deliberately and listed in the log).

## Paths you may change
- `apps/web/src/components/body-map/**`, `tests/e2e/body-map-figure.spec.ts`

## Contract impact
None.

## Definition of done
Gate green · commits start with `T-0627`.

## Build / accept log
