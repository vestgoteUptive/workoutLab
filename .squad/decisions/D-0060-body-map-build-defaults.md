---
id: D-0060
title: C-01 Body map build defaults (T-0300d) — tile layout, number format, keyboard, loading, axe without vitest-axe
status: revisit
date: 2026-09-29
by: frontend-dev (T-0300d build)
area: web
---
## Context
T-0300d builds C-01 (`apps/web/src/components/body-map`) from `Design-docs/docs/design/components/c-01-body-map.md`, D-0003, D-0013, D-0019 and D-0045 §4. There is no body-map drawing in the prototype (`UF02-1-Today.dc.html` has none) and no screen file, and a few build details aren't settled anywhere.

## Decision
1. **Layout.** Until design delivers a silhouette, the nine areas are rounded tiles on a 3-column CSS grid in a rough body order: shoulders; chest, back, arms; core; glutes, quads, hamstrings; calves. Each tile has a fill shape, the area name and the `load / target` label, all on `bg`, so the label always uses `text`, never `on-accent`. `compact` uses smaller shapes. The legend renders in both variants, below the map and outside the compact link.
2. **Data in.** Props are `{variant, areas?: Pick<AreaBalance, "area"|"load"|"target"|"coverageStep"|"needsAttention">[], loading?, onSelectArea?, locale?}`. The fill is `var(--wl-color-coverage-<coverageStep>)` and the outline is `2px solid var(--wl-color-warn)` on the fill shape, both set inline. A `coverageStep` outside 0–4, or a missing area, renders a neutral `surface-2` fill (it's an engine bug, and the UI doesn't guess a step).
3. **Numbers.** `formatSetCount` (`lib/format/number.ts`): integers have no decimals, and fractional values have exactly one, with Intl's half-expand rounding in the device locale (7.25 → "7.3", sv-SE 7.5 → "7,5"). So 7.96 reads "8.0", which signals it isn't a whole 8. A value such as 19.96 / 20 reads "20.0 / 20" while the engine's step can be 3. The fill still follows the engine.
4. **Accessible names.** `full`: "<Area>, <load> of <target> hard sets, <srLabel with the first letter lower-cased>[, needs attention]". While loading, the buttons are disabled and named "<Area>, loading", and the section has `aria-busy`. An area missing from `areas` while not loading gets the neutral name "<Area>". An out-of-range step adds no srLabel, and the attention suffix is `attentionLegend.srLabel` from the tokens (T-0300d review). `compact`: one link to `/balance` named "Body map, last 14 days. Open all areas", with nothing focusable inside it. Visible area names and labels are `aria-hidden` inside the named control. The legend items show `label` (aria-hidden) and carry `srLabel` as visually hidden text.
5. **Keyboard.** The area buttons handle Enter (keydown) and Space (keydown, and keyup is cancelled) themselves and call `preventDefault`, so a key press selects exactly once and the handler can be unit-tested without user-event. Selecting calls `onSelectArea(area)` and then navigates to `/balance/:area`. C-01 must render inside the router.
6. **Loading motion.** A 1.6 s opacity pulse on the fills, only when `matchMedia("(prefers-reduced-motion: reduce)")` is false. No `matchMedia` counts as "reduce". The stylesheet also sets `animation: none` under the media query.
7. **axe in unit tests.** `vitest-axe` isn't installed, and the lockfile changes only through the orchestrator's `pnpm install`. The AC-D10 test runs `axe-core` 4.13 directly. It resolves the package through `@axe-core/playwright` (an existing devDependency), with `color-contrast` off because jsdom has no layout. This is the engine `vitest-axe` wraps.
8. **Import restriction.** `no-restricted-imports` with the regex `(^|/)components/body-map(/|$)` applies to `src/features/UF-03|UF-08|UF-09/**`. The AC-D11 test lints virtual files at those paths with `ESLint.lintText`, so no fixture files are needed.

## Consequences
- The feature tickets (T-0302 UF-02.1, T-0307 UF-10.1) import `BodyMap` from `components/body-map` and pass the engine's `BalanceResult.areas`. T-0300d doesn't touch their stubs.
- A follow-up for the orchestrator/infra: add `vitest-axe` (or `axe-core`) as a direct devDependency of `apps/web` and switch the AC-D10 helper to it.
- A follow-up for qa: a Playwright check that real Enter/Space on an area button navigates once (native activation is cancelled).

## Revisit when
- Design delivers a body silhouette or a C-01 screen spec, or reviews C-01 on a device (the D-0003/D-0013 trigger).
- A feature needs C-01 outside a router.
