# Body figure asset (T-0315, D-0207)

An original, neutral front-and-back body figure for C-01 (UF-02.1, UF-10.1) and UF-04.2. Drawn in-house for workoutLab (D-0005); nothing is traced or copied from ExerciseDB, react-body-highlighter, Wikimedia or any other figure (D-0192). Licence: `LicenseRef-workoutLab`.

| File | What it is |
|---|---|
| `body-figure.svg` | The asset. `viewBox="0 0 256 290"`; `<g data-view="front">` (x 4..124) and `<g data-view="back">` (x 132..252). No colour attributes. |
| `draw-figure.mjs` | Generates `body-figure.svg` from hand-placed points (`node draw-figure.mjs`). Edit the points here, not the SVG. |
| `check-figure.mjs` | The T-0315 checks: AC-1..AC-3 on the SVG, AC-5 on the docs, and (T-0614) both preview sections. `node check-figure.mjs`, or `--svg <file|->` / `--preview <file|->` for one file. Also run by `packages/design-tokens/test/body-figure.test.ts` and `body-figure-cobalt.test.ts`. |
| `preview.html` | Two sections. **Cobalt** (T-0614, D-0208, the H-31 design check): C-01 steps 0–4 with the legend, attention on and off, the highlight ring, UF-04.2 primary/secondary and greyscale, on the generic `--wl-*` variables (`#wl-fig-css-cobalt`). **Legacy** (Chalk & Iron, until T-0625): sizes 140/200/240, coverage 0–4, attention halo, primary/secondary/none, greyscale and forced colours. |
| `serve-preview.mjs` | `node Design-docs/docs/design/assets/body-figure/serve-preview.mjs` builds the token CSS if it's missing, serves the repo root on 127.0.0.1:5180 and prints the preview URL. |

## Regions

Left and right sides are separate paths with the same `data-area`. Every region is a `<path class="wl-fig__region" data-area="…">`.

| Area | Front paths | Back paths | Total | Drawn as |
|---|---|---|---|---|
| chest | 2 | — | 2 | pectorals |
| back | — | 6 | 6 | trapezius (upper and mid) ×2, lats ×2, spinal erectors ×2 |
| shoulders | 2 | 2 | 4 | front and side delts; rear delts |
| arms | 4 | 4 | 8 | upper arm ×2, forearm ×2 per view (biceps/flexors front, triceps/extensors back) |
| core | 4 | — | 4 | rectus abdominis ×2, obliques ×2 |
| glutes | — | 2 | 2 | gluteus maximus and medius |
| quads | 2 | — | 2 | quadriceps |
| hamstrings | — | 2 | 2 | hamstrings (two heads) |
| calves | — | 2 | 2 | gastrocnemius and soleus |

**Neutral parts** (`wl-fig__body`, no `data-area`): the silhouette (head, neck, hands, feet, everything not covered by a region), hip flexors, inner thighs (adductors), knees and shins (front), backs of the knees and achilles (back).

**Seams** (`wl-fig__seam`, `data-seam="<area>"`, decorative): pectoral split, deltoid heads, biceps, abdominal grid, quadriceps heads (front); trapezius upper/mid, rear delt, triceps horseshoe, gluteus medius/maximus, gastrocnemius heads (back). Never named, filled or focusable (D-0207 §4).

## Sizes and targets

At 240 px tall (C-01 full) one unit is 0.83 px: a calf is about 15 × 28 px, a forearm about 13 × 35 px. Regions are never the only target: the C-01 label buttons (≥ 44 × 44 px) are the controls, and region taps forward to them (WCAG 2.5.8).

## Using it (T-0556)

Inline the SVG (no fetch, works offline), set `aria-hidden="true"`, give the hatch pattern a unique id per instance, and style it with the class rules in `preview.html` (`#wl-fig-css-cobalt` on the generic state variables; `#wl-fig-css` is the legacy set) and `design-system.md` § Body figure.
