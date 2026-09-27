---
id: D-0019
title: Design tokens package shape, C-01 legend copy, and the raw-colour guard
status: revisit
date: 2026-09-27
by: product-owner (T-0003 groom)
area: design
---
## Context
T-0003 creates `packages/design-tokens`, a contract that CLAUDE.md makes the only place colours and fonts are defined. It also adds the lint rule "no hex values outside tokens". D-0003 fixes the coverage ramp and D-0013 fixes the step thresholds. Several things are still open: how the package exposes tokens, what the C-01 legend says, how far the guard reaches (hex only, or `rgb()` too? which file types?), and how to stop turbo from serving a stale lint cache when the rule changes (the T-0002 AC5 lesson).

## Decision
- **Source:** `packages/design-tokens/src/tokens.json` holds every colour (the 11 design-system tokens, `on-accent` = `#121210`, and `coverage-0..4`) and both font stacks. Nothing else in the repo contains colour values.
- **Outputs:** the main entry `@workoutlab/design-tokens` is data only (typed JSON plus `coverageTokens`, `coverageLegend` and `attentionLegend`). It exports no functions, so the UI can't derive a coverage step (D-0013, principle 3). The build writes `dist/tokens.css` with `:root` custom properties `--wl-color-<name>`, `--wl-font-display` and `--wl-font-body`. The output is deterministic and has no remote `url()` or `@import`, so it works offline.
- **Coverage ramp:** `coverage-1..3` sit at t = 0.25 / 0.5 / 0.75 of an OKLCH interpolation from `surface-2` to `accent`. They may differ from exact interpolation by ΔE_OK ≤ 0.02, which leaves room to tune contrast. Each step records `requiresLabel = contrast(step, bg) < 3.0` (D-0003).
- **Legend copy** (maps 1:1 to the D-0013 steps 0 / <0.33 / <0.66 / <1 / ≥1):
  - step 0: "None", read as "No hard sets"
  - step 1: "Under ⅓", read as "Under one third of target"
  - step 2: "Under ⅔", read as "Under two thirds of target"
  - step 3: "Under target"
  - step 4: "On target", read as "On target or over"
  - attention: "Needs attention", shown as a 2 px `warn` outline, never a fill
- **Guard, part 1:** an ESLint rule `workoutlab/no-raw-colour` lives in `packages/design-tokens/eslint-plugin/` and is registered once in the root `eslint.config.mjs`.
  - It flags hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa) and literal `rgb[a]()`, `hsl[a]()`, `hwb()`, `lab()`, `lch()`, `oklab()` and `oklch()` in JS/TS string and template literals.
  - It ignores JSX `href`, `to`, `id` and `htmlFor` values.
  - It allows `var(--wl-…)` and `color-mix()` over `var()`.
  - Named colours are out of scope.
  - `packages/design-tokens/**` is exempt.
- **Guard, part 2:** a CLI `wl-check-colours` in the same package checks the same patterns in `.css`, `.scss`, `.html`, `.astro`, `.svg` and `.webmanifest` files. It skips `node_modules`, `dist`, `.astro` and `coverage`. `public/` is **not** exempt. Like the ESLint rule, it ignores the values of `href`, `xlink:href`, `id` and `for` attributes, and it ignores CSS ID selectors (for example `#cafe {`), so fragment links such as `#add` aren't read as colours. The web and landing `lint` scripts run it over their package root.
- **No build for the guard:** the plugin and CLI are plain ESM JavaScript that runs from source, because turbo `lint` doesn't depend on `^build`. The `packages/design-tokens/**` exemption is set in that package's own `eslint.config.mjs`, since package configs extend the root config and patterns resolve per package.
- **Cache honesty:** `turbo.json` `globalDependencies` gains `packages/design-tokens/eslint-plugin/**` and `packages/design-tokens/bin/**`.
- **Fonts:** T-0003 defines only the family stacks (each ends in a generic family) and the weights. Self-hosted woff2 files are a follow-up: no third-party font CDN, for offline use and privacy.

## Consequences
- T-0003 may edit a few paths outside the design lane, and the ticket lists them: root `eslint.config.mjs` (one block), `turbo.json` (`globalDependencies` only), `apps/web/package.json` and `apps/landing/package.json` (dependency plus `lint` script), and `pnpm-lock.yaml`.
- T-0300 must generate the PWA manifest `theme_color`/`background_color` and any favicon colours from tokens at build time, because `public/` is scanned.
- T-0003 shouldn't run in parallel with a ticket that edits `turbo.json` or the root `eslint.config.mjs` (for example T-0004).

## Revisit when
The designer or a human reviews C-01 on a device (same trigger as D-0003/D-0013), or the guard produces false positives in real feature code.
