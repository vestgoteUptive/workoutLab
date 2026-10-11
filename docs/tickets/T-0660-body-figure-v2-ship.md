---
id: T-0660
title: "Ship body figure v2 (owner pick 1b, D-0225): new body-figure.svg, v2 body-figure.css, highlight-dims-rest classes in BodyFigure.tsx; match canvas Body Figure Export"
lane: web-shell
screens: [UF-01, UF-02.2, UF-04.1, UF-04.2, UF-09.3, UF-09.6, UF-10.1, UF-10.2, UF-11.3]
decisions: [D-0225, D-0207, D-0210, D-0003]
deps: [T-0615]
status: ready
---
## Why
H-31 and D-0225: the owner supplied body figure v2. The handoff is in `Design-docs/docs/design/redesign-cobalt/body-figure/` (README.md, BodyFigure-changes.md, body-figure.css, body-figure.v2.svg). The visual acceptance target is `redesign-cobalt/canvas/Body Figure Export.dc.html`.

## Scope
- In:
  - Replace `Design-docs/docs/design/assets/body-figure/body-figure.svg` with `redesign-cobalt/body-figure/body-figure.v2.svg`. Strip its `<metadata>` block (a provenance manifest, about 18 KB, not needed at runtime), and keep paths and classes byte-identical otherwise.
  - Wherever BodyFigure gets its geometry (generated module or import), regenerate it from the new SVG.
  - Under `[data-wl-state]`, the component CSS (`apps/web/src/components/body-figure/body-figure.css`) follows the handoff's `body-figure.css` exactly.
  - Apply the two-line change from BodyFigure-changes.md: `wl-fig--has-highlight` on the svg, and `wl-fig__region--highlighted` on the region.
  - The new SVG has no `data-seam` paths; update the seam handling and tests.
  - Update `check-figure.mjs`, `preview.html` and `c-01-body-map.md` to v2. The T-0650 variants section goes, because it's superseded.
- Unmigrated screens (D-0225 §6, D-0210): outside `[data-wl-state]` the v2 art must stay legible on Chalk & Iron. Map the generic variables at :root, which already equal the legacy values, or keep a legacy colour block. Record the choice in the log.
- Out: screen restyles (T-0601, T-0608, T-0611 adopt the figure later), engine, data and copy.
- Superseded by this ticket: T-0628 (ring/halo geometry) and the D-0215 colour defaults.

## Acceptance criteria
- AC1 The `data-area` keys in the shipped SVG equal `AREAS` from `@workoutlab/shared`, as a test. Front: chest, shoulders, arms, core, quads. Back: back, shoulders, arms, glutes, hamstrings, calves. Planted fault: renaming one key fails the test.
- AC2 In `[data-wl-state="plan"]`:
  - silhouette = ink at 16 % and zones = ink at 32 %;
  - seam stroke = `--wl-bg`, 2.4, and 4 at compact size;
  - step-4 and primary are white, and steps 0–3 keep the zone tint;
  - secondary uses the hatch;
  - attention = `plan.attention` plus a ring.

  Checked through computed styles in e2e.
- AC3 In lift and rest the seams follow `--wl-bg` (red or teal), and attention is not drawn.
- AC4 Highlight: with `highlighted="quads"` the svg has `wl-fig--has-highlight`, quads is white with the ring, and the others dim to 12 % body and 20 % zones. Planted fault: dropping the class fails it.
- AC5 Sizes: full ≈ 300 px tall (18.5rem wide), detail ≈ 220 px (13.5rem), compact ≈ 60 px (3.75rem).
- AC6 Accessibility: the svg stays `aria-hidden`, and the area list or labels carry the meaning. In forced-colors mode it is still visible, and forced colours still win.
- AC7 Unmigrated screens render the figure legibly. A screenshot of the current UF-10.1 and UF-04.2 at 390 px is attached, plus a note.
- AC8 No raw colours, and rem sizes.
- AC9 Screenshots at 390 × 844 of the figure in plan (full, detail with highlight, attention), lift, rest and compact. They go next to the matching frames of `Body Figure Export.dc.html`, saved to the scratchpad path given at dispatch, for the owner's by-eye check.

## Paths you may change
- `apps/web/src/components/body-figure/**`, `apps/web/src/components/body-map/**` (lane)
- `Design-docs/docs/design/assets/body-figure/**`, `Design-docs/docs/design/components/c-01-body-map.md` (orchestrator grant: the owner-supplied asset)
- `packages/design-tokens/test/body-figure.test.ts`, `packages/design-tokens/test/body-figure-cobalt.test.ts`, `packages/design-tokens/test/docs.test.ts` (only the figure assertions that pin the old art)
- `tests/e2e/body-map-figure.spec.ts`, `tests/e2e/uf-04-figure.spec.ts`, `tests/e2e/body-figure-v2.spec.ts` (new)
- `docs/tickets/T-0660-body-figure-v2-ship.md` (log)

## Contract impact
None. The SVG is a design asset; the API is unchanged.

## Definition of done
Full gate green · full e2e green · check-all green · commits start with `T-0660`.

## Build / accept log
- Built on branch t/T-0660 (merged origin/main at 46d3fe1). SVG = handoff v2 minus `<metadata>` and the c2pa xmlns; BodyFigure.tsx: seam handling and onAccent removed, `wl-fig--has-highlight` and `wl-fig__region--highlighted` added; body-figure.css = handoff rules plus pointer-events:none on halo/ring, lift/rest hide attention, forced-colors block (system colours, higher specificity). draw-figure.mjs removed (v1 generator). check-figure.mjs, preview.html (links the component CSS, no copy; T-0650 variants gone), README, c-01-body-map.md moved to v2.
- Unmigrated screens (AC7): no legacy block. main.css :root already maps --wl-bg/--wl-ink to the Chalk & Iron values, so the same rules draw Chalk text at 16/32 % with page-coloured seams. Test: body-figure-v2.spec.ts and body-map-figure.spec.ts (no-state computed colours), screenshots uf-10-1-unmigrated*.png, uf-04-2-unmigrated.png. Draft decision in scratchpad drafts-T-0660/.
- AC map: AC1 BodyFigure.test.tsx (keys, step-4 = engine on target, no metadata/seams) + check-figure; AC2/AC3/AC4/AC5/AC6 body-figure-v2.spec.ts (computed styles, sizes, forced colours); AC4 also unit; AC7 above; AC8 colours.test.ts (no literals, rem); AC9 shots in scratchpad.
- Planted faults (all red, restored): renamed data-area key; dropped wl-fig--has-highlight; dropped region--highlighted; step-4 selector moved. Red runs on unfixed code: first e2e had 5 failures (wrong fixture steps, library page timeout, compact re-render) fixed in the specs.
- Gate: typecheck/lint/test --force exit 0; format:check 0; full e2e 466 passed, exit 0. test:repo-checks and check-all exit 1: lane-path-not-owned for packages/design-tokens/test/body-figure.test.ts (not in the ticket grant; it pins the old art and had to change). Needs a grant on main.
- Rework (legend and dots): C-01 legend is 3 items (Under target = zone tint, On target = ink, Needs attention = ring with the T-0627 gap), existing strings only. Label dots wear the figure's fill (ink at step 4, zone tint at 0-3, `--wl-attention` when flagged). The figure, legend and dots use one variable, `--wl-attention` (plan = salmon, charcoal = legacy orange). BodyMap.test.tsx changed assertions: legend test 6 to 3 items and fills; AC-D1 per-step fills (steps 0-4, hamstrings step 1, mixed fixture), AC-D2 attention fill (steps 0 and 4), AC-D8 zero history, all via `dotFill()`; BodyMap.qa.test.tsx shuffled-output and missing-area fills; colours.test.ts attention variable. E2E: body-figure-v2.spec.ts "legend swatches match the figure" (none, plan, lift, rest): swatch, dot and attention fills equal the region fills. Faults (swatch 40 %, session block removed, attention var reverted to plan token, flagged dot to legacy warn): red, restored.
