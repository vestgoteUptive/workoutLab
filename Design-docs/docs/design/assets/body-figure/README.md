# Body figure asset (T-0315, D-0207; v2 T-0660, D-0225)

An original, neutral front-and-back body figure for C-01 (UF-02.1, UF-10.1) and UF-04.2. Drawn in-house for workoutLab (D-0005); nothing is traced or copied from ExerciseDB, react-body-highlighter, Wikimedia or any other figure (D-0192). Licence: `LicenseRef-workoutLab`.

v2 (T-0660, D-0225, owner pick 1b) replaced the T-0315 art. The geometry is the owner's handoff `redesign-cobalt/body-figure/body-figure.v2.svg` with its `<metadata>` manifest stripped; paths and classes are byte-identical.

| File | What it is |
|---|---|
| `body-figure.svg` | The asset. `viewBox="0 0 212 215"`; `<g data-view="front">` (x 0..100) and `<g data-view="back">` (x 112..212). No colour attributes, no seam paths. |
| `check-figure.mjs` | The checks: the SVG (AC-1..AC-3), the docs (AC-5), the figure CSS (no colour literal) and `preview.html`. `node check-figure.mjs`, or `--svg <file|->` / `--preview <file|->` for one file. Also run by `packages/design-tokens/test/body-figure.test.ts` and `body-figure-cobalt.test.ts`. |
| `preview.html` | Plan, lift, rest, compact, highlight, attention and an unmigrated (no-state) demo. It links the component's own `body-figure.css`, so what you see is what ships. Visual target: `redesign-cobalt/canvas/Body Figure Export.dc.html`. |
| `serve-preview.mjs` | `node Design-docs/docs/design/assets/body-figure/serve-preview.mjs` builds the token CSS if it's missing, serves the repo root on 127.0.0.1:5180 and prints the preview URL. |

`draw-figure.mjs` (the T-0315 generator) is gone: the v2 art is the owner's file, edit the SVG.

## Regions

Left and right sides are separate paths with the same `data-area`. Every region is a `<path class="wl-fig__region" data-area="...">`. The silhouette is four `wl-fig__body` paths per view (head, torso and legs, both arms), with no `data-area`. Front: chest 2, shoulders 2, arms 2, core 1, quads 2. Back: back 1, shoulders 2, arms 2, glutes 2, hamstrings 2, calves 2. The seams are the regions' background-coloured strokes.

## Sizes and targets

Full is 18.5 rem wide (about 300 px tall), detail 13.5 rem (about 220 px), compact 3.75 rem (about 60 px). Regions are never the only target: the C-01 label buttons (at least 44 x 44 px) are the controls, and region taps forward to them (WCAG 2.5.8).

## Using it (T-0556)

Inline the SVG (no fetch, works offline), set `aria-hidden="true"`, give the hatch pattern a unique id per instance, and style it with `apps/web/src/components/body-figure/body-figure.css` (the generic `--wl-*` state variables).
