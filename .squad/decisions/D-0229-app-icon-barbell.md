---
id: D-0229
title: "App icon and favicon: the C 'Stången' barbell built from the LABS block shapes replaces the T-0616 roundel; plan.bg ground, plan.ink shapes, no wordmark"
status: decided
date: 2026-10-15
by: owner (chose option C on the app-icon canvas)
area: design
---
## Context
The installed PWA icon and the favicon were a white roundel on cobalt (T-0616, D-0211). The owner
asked for three icon proposals inspired by the Uptive LABS prototype logo (chunky blocks and
quarter circles, Uptive's U as the base form). Three were drawn: A LAB grid, B arch, C barbell.
A variant with the word "workout" in the icon was dropped by the owner.

## Decision
1. The app icons (192, 512, 512 maskable) and `favicon.svg` draw the **C barbell**, in a 100 x 100
   design grid: outer plates `M32 24V76H27A7 7 0 0 1 20 69V31A7 7 0 0 1 27 24Z` and its mirror
   `M68 24H73A7 7 0 0 1 80 31V69A7 7 0 0 1 73 76H68Z`, inner collars `M34 35H41V65H34Z` and
   `M59 35H66V65H59Z`, bar `M41 46H59V54H41Z`, scaled to the icon size.
2. Colours stay the T-0616 pair: `color.plan.bg` ground, `color.plan.ink` shapes. No new token.
3. No text in the icon; the OS shows the app name under it.
4. The same drawing serves the maskable icon: every ink pixel lies inside the 80 % safe zone.

## Consequences
- `apps/web/scripts/gen-icons.mjs` replaces the roundel; its tests keep the two-colour, centre-ink,
  corner-bg and safe-zone checks and add a shape check that fails for the old roundel.
- Installed apps pick up the new icon on their next update; iOS may keep the old home-screen icon
  until the app is re-added.
