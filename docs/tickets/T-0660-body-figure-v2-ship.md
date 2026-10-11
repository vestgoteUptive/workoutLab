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
- `packages/design-tokens/test/body-figure-cobalt.test.ts`, `packages/design-tokens/test/docs.test.ts` (only the figure assertions that pin the old art)
- `tests/e2e/body-map-figure.spec.ts`, `tests/e2e/uf-04-figure.spec.ts`, `tests/e2e/body-figure-v2.spec.ts` (new)
- `docs/tickets/T-0660-body-figure-v2-ship.md` (log)

## Contract impact
None. The SVG is a design asset; the API is unchanged.

## Definition of done
Full gate green · full e2e green · check-all green · commits start with `T-0660`.

## Build / accept log
