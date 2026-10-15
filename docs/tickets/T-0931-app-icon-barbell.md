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
- Built: `iconSvg(size)` draws the D-0229 five-path barbell on a 100x100 viewBox, same drawing at every size; d.mts signature updated; roundel removed.
- AC1/AC2 existing tests green; AC3 new shape test (512 PNG at 25/37/50/33 % points); AC4 safe-zone test renamed "icon", green; AC5 `iconSvg` has no margin arg.
- Planted fault (roundel `<circle r=35>` instead of shapes, on a backup copy): AC3 test red, other 5 green; restored from copy, 6/6 green.
- Gate: first -w run red on flaky UF-03 list-view.swap focus test (passes 2x alone, unrelated); rerun green (exit 0). repo-checks, format:check, check-all.mjs all exit 0. vite build emits dist/icons/*.png and dist/favicon.svg.
