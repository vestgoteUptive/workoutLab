---
id: T-0315
title: "Draw the original body figure (front and back, 9 data-area regions, no colour attributes) and fold the C-01 and UF-04.2 deltas into the design docs"
lane: design
screens: [UF-04.2, UF-02.1, UF-10.1]
decisions: [D-0207, D-0005, D-0192, D-0060, D-0003]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-08 (groom, D-0207; GitHub #48). Reactivates parked T-0315 (no longer gated on H-12, which was answered 2026-10-04). Flow: wl-design (agent designer). About ½ day. Blocks T-0556. -->

## Why
D-0207 §1: one original, neutral figure drawn in-house (D-0005: no third-party images; D-0192: no ExerciseDB media). The owner approved the look ("Body figure looks fine"). Web ticket T-0556 builds the component from this asset, so the asset's structure must be exact.

## Scope
- In:
  - `Design-docs/docs/design/assets/body-figure/body-figure.svg`: one `<svg viewBox="0 0 256 290">`, front view left (x 4..124), back view right (x 132..252), per `docs/specs/body-map-silhouette.md` §3.1–§3.2.
    - Regions are `<path>` elements with `data-area="<area id>"` and class `wl-fig__region`. Left and right sides are separate paths with the same `data-area`.
    - Neutral parts (head, neck, hands, hip flexors and adductors, knees, shins, ankles, feet) carry class `wl-fig__body` and no `data-area`.
    - Decorative seams carry class `wl-fig__seam`. Nothing is named or focusable.
    - **No `fill`, `stroke`, `style` or colour attribute and no hex, `rgb(`, `hsl(` or colour name anywhere in the file.** Hatching is a `<pattern id="wl-fig-hatch">` whose stripe uses a class.
    - Stroke widths are set by class, with `vector-effect: non-scaling-stroke`, in the preview CSS.
  - A preview page `Design-docs/docs/design/assets/body-figure/preview.html` showing the figure at 140/200/240 px with: all regions `coverage-0..4`, the attention halo, primary/secondary/none, and forced-colours. CSS there uses `var(--wl-color-…)` tokens only.
  - A region table (`README.md` in the same folder): area, view, path count.
  - Fold the deltas: merge `components/c-01-body-map-silhouette.md` into `components/c-01-body-map.md` (mark D-0060 §1 superseded by D-0207, remove "proposed"), merge `screens/UF-04.2-body-figure.md` into `screens/UF-04.1-UF-04.2.md`, and delete the two delta files. Add the figure stroke, seam and hatch rules to `design-system.md`.
- Out: any `apps/**` code; `tokens.json` (unchanged); a Male/Female figure; named sub-muscles; a UF-08.2 figure (D-0207 §4).

### Edge cases that are in scope
- **Small sizes:** the figure stays legible at 140 px tall (compact C-01); every region border is visible against `coverage-0`.
- **Forced colours and greyscale:** primary solid versus secondary hatch is distinguishable (preview shows both).
- **Zero data / missing area:** a region with no style falls back to `surface-2` (shown in the preview).
- Offline: the asset is bundled inline by T-0556; nothing is fetched.

## Acceptance criteria
Checked by a small script run as the test: `Design-docs/docs/design/assets/body-figure/check-figure.mjs` (node, no dependencies), run in the log.
- **AC-1** Given `body-figure.svg`, then the set of `data-area` values is exactly {chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves}, and per view: front has chest, shoulders, arms, core, quads; back has back, shoulders, arms, glutes, hamstrings, calves (spec §3.1). Chest, core and quads are absent from the back view, and back, glutes, hamstrings and calves from the front.
- **AC-2** Given the file, then no element has `fill`, `stroke` or `style` attributes, and the regex `#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(` finds nothing.
- **AC-3** Given the file, then every `data-area` element is a `<path>` and has class `wl-fig__region`; elements without `data-area` that are not seams are `wl-fig__body`; `viewBox` is `0 0 256 290`; the `<pattern id="wl-fig-hatch">` exists; the `<svg>` has no `tabindex`, `role` or `<title>`.
- **AC-4** Given the preview at 140 px, then a screenshot shows 9 distinguishable regions on `coverage-0` (the designer records it in the log; not a CI test).
- **AC-5** Given the docs, then `c-01-body-map.md` contains the silhouette layout and no longer says "proposed", `UF-04.1-UF-04.2.md` contains the figure card, the two delta files are gone, no doc links to them, and `design-system.md` has a "Body figure" section with the 1.5 px outline, 1 px region border, 0.75 px seam and hatch rules (5 px period, 1.5 px stripes, 45°).
- **AC-6** Given `node .github/scripts/check-all.mjs`, then it passes (the colour check included).

## Paths you may change
- `Design-docs/docs/design/assets/body-figure/**` (new)
- `Design-docs/docs/design/components/c-01-body-map.md`, `c-01-body-map-silhouette.md` (delete)
- `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md`, `UF-04.2-body-figure.md` (delete)
- `Design-docs/docs/design/design-system.md`
- `docs/tickets/T-0315-body-figure-design.md` (log only)
- **Not yours:** `packages/design-tokens/**` (no token change), `apps/**`, `.squad/**`.

## Contract impact
None. No token, schema, API or engine change. D-0207 is the decision.

## Definition of done
Every AC checked and recorded · `check-figure.mjs` green · `node .github/scripts/check-all.mjs` green · contracts unchanged · commits start with `T-0315:` and cite UF-04.2 / UF-10.1.

## Build / accept log

### 2026-10-08 designer — build (base 8a6b247, clean)
- Drew an original front/back figure (hand-placed points in `draw-figure.mjs` → `body-figure.svg`, viewBox 0 0 256 290; nothing traced from third-party art). 34 region paths, 9 areas; neutral parts `wl-fig__body`; 26 seams `wl-fig__seam` with `data-seam`. Added `preview.html`, `README.md` (region table), `check-figure.mjs`. Folded both deltas into `c-01-body-map.md` (§ Silhouette layout, D-0060 §1 superseded by D-0207) and `UF-04.1-UF-04.2.md` (§ UF-04.2 Body figure); deleted the delta files; added `design-system.md` § Body figure.
- AC-1/2/3 → `check-figure.mjs` (`checkSvg`) + `packages/design-tokens/test/body-figure.test.ts` (shipped asset passes; 21 planted-fault cases via stdin, one per rule, incl. XML validity).
- AC-4 → Playwright screenshot of `preview.html` at 140 px, all coverage-0: 9 areas distinguishable by their 1 px `text-muted` borders (designer review; not CI).
- AC-5 → `check-figure.mjs` (`checkDocs`), run by the same vitest file. AC-6 → `node .github/scripts/check-all.mjs` exit 0; `wl-check-colours` on the asset folder clean (in the test).
- Red on unfixed docs: `node check-figure.mjs` → 13 AC-5 problems before the doc fold. Planted faults (backup + `cp` restore): fill attr in the real SVG → 2 tests red; "45°" removed from design-system.md → AC-5 red; delta file restored → AC-5 red; checker attr check disabled → 3 cases red; checker per-view check disabled → 2 cases red. All restored, `check-figure: ok`.
- Not changed: tokens, `apps/**`. `docs/specs/body-map-silhouette.md` still names the deleted delta files (product lane, follow-up).
