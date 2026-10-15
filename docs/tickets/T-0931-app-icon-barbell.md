---
id: T-0931
title: "PWA icons and favicon: draw the D-0229 barbell (option C) instead of the roundel"
lane: web-shell
screens: []
decisions: [D-0229]
deps: []
status: ready
---
## Why
The owner chose option C ("Stången", a barbell built from the LABS block shapes) on the app-icon
canvas. D-0229 has the exact geometry.

## Scope
- In: `apps/web/scripts/gen-icons.mjs` draws the D-0229 barbell in `plan.bg` / `plan.ink` for every
  generated asset (192, 512, 512 maskable, `favicon.svg`); `gen-icons.test.ts` covers it.
- Out: manifest, colours, tokens, the landing favicon, any wordmark.

## Acceptance criteria
- AC1 Every icon SVG still uses exactly the two colours `plan.bg` and `plan.ink` (existing T-0616 AC3 test stays green).
- AC2 Rendered PNGs: the centre pixel is ink (on the bar) and the corners are bg (existing tests stay green).
- AC3 Shape check on the 512 PNG (new test): ink at the outer plates (x = 25 %, y = 50 %) and on the collars (x = 37 %, y = 50 %); bg above the bar between the collars (x = 50 %, y = 40 %) and in the gap between plate and collar (x = 33 %, y = 30 %). Planted fault: restoring the roundel fails this test.
- AC4 Maskable: every ink pixel of the 512 maskable PNG lies within 40 % of the size from the centre (existing safe-zone test stays green, rename "roundel" to "icon" in its title).
- AC5 `iconSvg` no longer takes a margin that changes the drawing per asset; the barbell is the same at every size (one drawing, scaled).

## Paths you may change
- `apps/web/scripts/gen-icons.mjs`, `apps/web/scripts/gen-icons.d.mts`, `apps/web/scripts/gen-icons.test.ts`
- This ticket file (build log).

## Contract impact
None (tokens unchanged; D-0229 records the design change).

## Definition of done
Gate green · commits start with `T-0931`.

## Build / accept log
