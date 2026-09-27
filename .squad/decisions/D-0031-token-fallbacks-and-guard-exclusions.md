---
id: D-0031
title: Font fallback stacks, ramp hex values and raw-colour guard exclusions (T-0003)
status: revisit
date: 2026-09-27
by: designer (T-0003)
area: design
---
## Context
D-0019 fixes the shape of `packages/design-tokens` and the reach of the raw-colour guard. It leaves open the exact fallback fonts, the concrete `coverage-1..3` hex values, and how the guard avoids obvious false positives. For example, `#add` is valid 3-digit hex, and `url(#fade)` or a CSS id selector like `#fab {` look like colours.

## Decision
- **Ramp values:** `coverage-1` = `#585332`, `coverage-2` = `#85833D`, `coverage-3` = `#AFB849`. These are the exact OKLCH samples at t = 0.25 / 0.5 / 0.75, with ΔE_OK < 0.001 from rounding. Contrast on `bg` is 2.4 / 4.7 / 8.7, so `requiresLabel` is true for steps 0 and 1 only.
- **Font stacks** (the strings include CSS quotes):
  - display: `"Big Shoulders Display", "Arial Narrow", "Roboto Condensed", sans-serif`, using condensed system fallbacks to keep number widths close
  - body: `"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Guard exclusions,** shared by the ESLint rule and `wl-check-colours` in `eslint-plugin/colour-patterns.js`:
  - A hex is not flagged when it's part of a longer word (`#fade-in`), follows `/`, `&` or `#` (hash routes, entities), or is directly followed by a selector character (`{ . [ : > + ~`).
  - `url(#id)` fragment references are ignored.
  - In markup files only, `href`, `xlink:href`, `id`, `for` and `to` attribute values are ignored. This mirrors the JSX `href`/`to`/`id`/`htmlFor` exemption in D-0019.
  - The CLI also skips `.git/`. `public/` stays scanned.
  - Colour functions are flagged even when their channels are `var()`. Use `color-mix()` for alpha variants.

## Consequences
- The frontend derives alpha or tint variants with `color-mix(in oklch, var(--wl-color-…) N%, transparent)`, not with `rgb(var(--…) / a)` or relative-colour syntax.
- JS selector strings such as `querySelector("#add")` are still flagged. Use ids that aren't valid hex, or `getElementById`.

## Revisit when
C-01 is reviewed on a device (same trigger as D-0003/D-0013), the web fonts get self-hosted, or the guard produces false positives in feature code.
