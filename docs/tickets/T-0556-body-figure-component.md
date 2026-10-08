---
id: T-0556
title: "BodyFigure shared component (components/body-figure): inline SVG from the asset, hatch pattern, forced colours, import ban"
lane: web-shell
screens: [UF-04.2, UF-02.1, UF-10.1]
decisions: [D-0207, D-0060, D-0005]
deps: [T-0315]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0207; GitHub #48; spec AC-1/2/3/12/13). Flow: wl-build-web (agent frontend-dev). About ½ day. Blocks T-0557 and T-0558. -->

## Why
D-0207 §1/§5: one presentational component draws the figure on both screens. It computes nothing (principle 3).

## Scope
- In:
  - `apps/web/src/components/body-figure/` (`BodyFigure.tsx`, `body-figure.css`, `index.ts`, `__tests__/`): the asset's markup as JSX (or a build-time import of the SVG string), props `{ regions: Partial<Record<Area, RegionStyle>>, highlighted?: Area, onRegionPointer?: (area: Area) => void, size: "compact" | "detail" | "full" }`, `RegionStyle = { fill: "none" | "primary" | "secondary" | { coverageStep: 0|1|2|3|4 }, attention?: boolean }`. Heights: compact 140, detail 200, full 240 px.
  - Colours by class and `var(--wl-color-…)` only. `primary` = `accent`; `secondary` = the `wl-fig-hatch` pattern (accent stripes on `surface-2`); `none` and a missing or out-of-range step = `surface-2`; `coverageStep` = `coverage-<n>`. The attention halo is drawn outside the 1 px border with a 1 px `surface` gap and a 2 px `warn` stroke.
  - `@media (forced-colors: active)`: primary `CanvasText`, secondary `CanvasText` hatch on `Canvas`, none `Canvas`, borders `CanvasText`, attention 3 px `Highlight`.
  - The whole `<svg>` is `aria-hidden="true"`, with no focusable child. No animation. `highlighted` draws the 2 px `accent` ring offset 2 px around that area's regions.
  - Extend the D-0060 §8 `no-restricted-imports` ban in `apps/web/eslint.config.mjs` to `components/body-figure` for `src/features/UF-03|UF-08|UF-09/**`, including the dynamic-import form the existing rule covers.
- Out: the BodyMap layout (T-0557); the UF-04 screen (T-0558); any engine call.

### Edge cases that are in scope
- **Zero data:** `regions = {}` renders all nine areas `surface-2`.
- **Missing or bad step** (`undefined`, `-1`, `7`, `2.5`): neutral `surface-2`, no throw.
- **Offline:** the markup is bundled; no fetch (test: no network call on mount).
- **Both views:** shoulders and arms get the same style in front and back.

## Acceptance criteria
Vitest in `components/body-figure/__tests__/`, jsdom, one Playwright check for AC-5.
- **AC-1 (spec AC-1)** Given the rendered SVG, then the `data-area` values per view equal the T-0315 table and `AREAS` (chest, core, quads only front; back, glutes, hamstrings, calves only back; shoulders and arms in both), and neutral parts have none.
- **AC-2 (spec AC-2)** Given the component source, CSS and the rendered SVG string, then no hex, `rgb(`, `hsl(` or colour name appears in a `fill`/`stroke`, and `pnpm lint` (`workoutlab/no-raw-colour`) passes. Every colour in `body-figure.css` is `var(--wl-color-…)` or a system colour inside the `forced-colors` block.
- **AC-3 (spec AC-3)** Given any props, then the root `<svg>` has `aria-hidden="true"` and `querySelectorAll('a,button,[tabindex],input')` inside it is empty.
- **AC-4 (styles)** Given `{ chest: {fill:"primary"}, calves: {fill:"secondary"}, back: {fill:{coverageStep:3}, attention:true} }`, then chest regions have class `wl-fig__region--primary`, calves `--secondary` (fill references the pattern `url(#wl-fig-hatch)`), back `--step-3` with the attention class on each back path, and every other area is `--none`. Steps 0 to 4 each map to `coverage-<n>`; `{coverageStep: 7}` and `-1` map to `--none`.
- **AC-5 (spec AC-13, forced colours)** Given Playwright with `forcedColors: "active"` on the component's host route (the first screen that renders it, or a test-only story route that is not shipped), then a chest region's computed `stroke` is not `transparent`/`none` and its fill is `CanvasText` for primary.
- **AC-6 (pointer)** Given `onRegionPointer` and a click on a calves path, then it is called once with `"calves"`; clicking a neutral part calls nothing; without the prop nothing is attached.
- **AC-7 (spec AC-12, import ban)** Given `ESLint.lintText` on files under `features/UF-03`, `UF-08` and `UF-09` that import `components/body-figure` (static and `import()`), then each gives a `no-restricted-imports`/syntax error; the same import under `features/UF-04` and `UF-02` is clean.
- **AC-8 (bundle)** Given `pnpm --filter web build`, then the figure adds at most 12 kB gzip to the main-route chunks (record the number in the log).

## Paths you may change
- `apps/web/src/components/body-figure/**` (new)
- `apps/web/eslint.config.mjs` (the ban only) and `apps/web/src/app/__tests__/import-bans.test.ts`
- `docs/tickets/T-0556-body-figure-component.md` (log only)
- **Not yours:** `components/body-map/**` (T-0557), `features/**`, `tokens.json`, the asset under `Design-docs/**`.

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the e2e spec for AC-5 green (the full web e2e suite is not needed unless `routes.ts` or fixtures change) · contracts unchanged · commits start with `T-0556:` and cite UF-04.2 / UF-10.1.

## Build / accept log
