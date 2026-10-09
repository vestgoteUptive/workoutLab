---
id: D-0215
title: "Body figure on Cobalt, design defaults T-0614 picked: seams on white fills use --wl-on-selected, the highlight-ring and attention gaps use --wl-bg, legend swatches get a 1 px --wl-ink-muted border, the preview mirrors the plan mapping locally and ships a serve script"
status: revisit
date: 2026-10-09
by: designer (T-0614)
area: design
amends: D-0211
builds-on: D-0207, D-0208, D-0210
---
## Context
T-0614 restates the D-0207 figure rules on the D-0211 §2 generic variables. The ticket names the silhouette, regions, neutral parts, hatch, attention halo and highlight ring, but not three details: the seam colour on a white fill (Chalk & Iron used `on-accent` on lime), the colour of the ring's inner gap (was `surface`), and how the legend shows steps 0 and 1, which are under 3:1 on `plan.bg`.

## Decision
1. **Seams** are 0.75 px `--wl-line` (decorative, 1.5:1 on `plan.raise`). Inside a primary, `--wl-coverage-3` or `--wl-coverage-4` region they switch to `--wl-on-selected` (plan.bg; 8.6:1 on white), keeping the class `wl-fig__seam--on-accent`. Classes and geometry don't change.
2. **Gaps.** The attention halo gap (1 px) and the highlight ring gap (2 px) are both `--wl-bg`. The stroke widths are unchanged (halo 7 / gap 3; ring 9 / gap 5).
3. **Legend swatches** (12 × 12 px) carry a 1 px `--wl-ink-muted` border so steps 0 and 1 stay visible on `--wl-bg`. The attention swatch stays a transparent fill with a 2 px `--wl-attention` border.
4. **Preview.** `preview.html` mirrors the D-0211 §2 plan slice of `apps/web/src/main.css` in its own `<style id="wl-state-plan">`, since the generic variables live in the web app, not in `tokens.css`. `check-figure.mjs` checks that the mirror reads only plan tokens. `serve-preview.mjs` builds the tokens if needed and serves the page so the owner can open it with one command.

## Consequences
- T-0615 copies `#wl-fig-css-cobalt` into `body-figure.css` (without the `[data-wl-state="plan"]` prefix, since the generic variables carry the state).
- T-0625 removes the preview's legacy section and its check.

## Revisit when
- The owner's H-31 design check asks for a different seam or gap colour.
- The web adds a `tokens.css`-level generic variable block, so the preview mirror can go.
