---
id: D-0204
title: "D-0203 grooming defaults: the web-shell and UF-11.2 work each split in two; who proves which gutter check; the PWA update reloads only on a fixed set of safe paths and never on first install; T-0540 rebases on the Plan rework; a Big Shoulders fallback source"
status: revisit
date: 2026-10-07
by: product-owner (groom)
area: product
builds-on: D-0203, D-0157, D-0199, D-0202
---
## Context
D-0203 turns GitHub #37/#45 into a font, layout and type foundation plus the UF-11.2 and UF-11.4 reworks and a PWA update rule (§6). Grooming it into tickets (T-0544 … T-0552) left a few things open that the specs don't settle.

## Decision
1. **Splits (D-0157 §7, about half a day each).**
   - The web-shell work is two tickets: T-0545 (fonts in the web app: import, preload, precache; F-3 to F-5) and T-0546 (global type scale and the shared `.wl-page`/`.wl-card`/`.wl-row`/`.wl-label`/button/input classes; T-1, T-4, G-1 on the non-UF-11 screens). They touch different files and may run in parallel.
   - The UF-11.2 rework is two tickets in the same folder, run serially: T-0548 (`.wl-page` on `/plan` and `/plan/edit`, the header and purpose line, the "Your plan" card, the Targets card with the Balance link) and T-0549 (the check-in card restyle, the Check-ins and Routines cards, the one-primary-action rule, the loading and cold-cache states).
2. **Who proves which visual-foundation check.** The UF-11 screens get no gutter until they adopt `.wl-page`, so:
   - T-0546 proves G-1 on `/`, `/library`, `/progress` and `/balance` (they already pad 16 px), plus T-1's `h1`/`body` font-family checks and T-4.
   - T-0548 proves G-1 to G-4, T-2 and T-3 on `/plan` and G-1/G-2 on `/plan/edit`.
   - T-0550 proves G-1, G-2 and G-4 on `/plan/account`.
3. **PWA update (D-0203 §6): safe paths.** A new build that has taken control reloads the page only when the current path is in this fixed set: `/`, `/library`, `/library/*`, `/progress`, `/progress/*`, `/balance`, `/balance/*`, `/plan`. It reloads either right after a route change lands on one of them, or when the app becomes visible again while on one. Everything else waits for the next navigation to a safe path:
   - `/session/*` (UF-08, UF-09, UF-03.3): principle 1;
   - `/welcome/*`, `/account`, `/auth/callback`: onboarding and sign-in flows (a reload can drop an auth code in the URL or onboarding progress);
   - `/plan/edit`, `/plan/account`, `/plan/routines/*` and any later `/plan/*` editor: they hold unsaved input.
4. **No reload on first install.** A `controllerchange` while the page started with no controller (`navigator.serviceWorker.controller` was null at start-up) is the first install claiming the page. It is not a new build and never triggers a reload. At most one reload per page load.
5. **T-0540 order.** T-0540 (the "Excluded exercises · n" row and UF-11.5) gains T-0548 as a dependency and places its row in the slot T-0548 leaves between the "Your plan" card and the Targets card, using `.wl-card` + `.wl-row`. The D-0202 "Favorite exercises · n" row (UF-11.6, not yet ticketed) goes directly above it in the same slot.
6. **Font source fallback.** If `@fontsource-variable/big-shoulders-display` is unavailable or deprecated at the pinned version, T-0544 may take the latin `wght` woff2 from the successor Fontsource package of the same upstream project (OFL), keeps `font-family: "Big Shoulders Display"` in `fonts.css` (the `tokens.json` name, unchanged), and records the package and why in `SOURCES.md`. A file with an `opsz` axis gets `font-variation-settings` or `font-optical-sizing` set so it renders the display cut. Any Reserved Font Name still stops the ticket with triage.

## Consequences
- Nine tickets instead of seven; the orchestrator's letters map as: A T-0544, B T-0545 + T-0546, C T-0547, D T-0548 + T-0549, E T-0550, F T-0551, P T-0552.
- An installed app on a stale build updates the next time the user opens or switches to a tab screen, never mid-workout or mid-form.

## Revisit when
- The owner wants the PWA to show an "Update ready" prompt instead of reloading silently.
- A new route is added: decide whether it joins the safe-path set (the list lives in `apps/web/src/lib/pwa/`).
