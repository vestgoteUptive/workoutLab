---
id: T-0616
title: "PWA manifest theme_color/background_color, the build-time theme-color meta and the generated app icons move to the plan palette (plan.bg square with a plan.ink roundel, same geometry), read from tokens"
lane: web-shell
screens: []
decisions: [D-0208, D-0210, D-0211, D-0045, D-0019]
deps: [T-0601]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ¼ day. Runs after Today is cobalt (T-0601), so the install splash matches the first screen. The landing favicon is T-0585 (landing lane). Full web e2e suite (shell/manifest). -->
## Why
The installed app's splash, icon and status-bar colour come from `vite.config.ts` and `scripts/gen-icons.mjs`, which read the legacy `bg` and `accent` (D-0045 §8). Once Today is cobalt, the splash and icon should be too. T-0589 already sets `theme-color` at runtime; this ticket sets the build-time default.

## Scope
- **In:**
  - `vite.config.ts`: the manifest `theme_color` and `background_color` = `tokens.color.plan.bg`, and the injected `<meta name="theme-color">` = `plan.bg`.
  - `scripts/gen-icons.mjs`: a `plan.bg` square with a `plan.ink` roundel, with the same sizes, margin ratio and maskable safe zone.
  - The regenerated icons, if they're committed today.
  - `scripts/gen-icons.test.ts` and `build.test.ts` assertions updated deliberately.
- **Out:**
  - The landing favicon (T-0585).
  - The runtime meta (T-0589).

## Acceptance criteria
- **AC1 (manifest).** **Given** `vite build` **then** `manifest.webmanifest` has `theme_color` and `background_color` equal to `tokens.color.plan.bg` (`#2337C6`, read from tokens in the test).
- **AC2 (meta).** `dist/index.html`'s theme-color meta equals `plan.bg`, and the CSP meta is byte-identical to before.
- **AC3 (icons).**
  - Every generated icon SVG uses exactly the two colours `plan.bg` and `plan.ink`.
  - The rendered PNG's centre pixel is `plan.ink` and its corner pixel is `plan.bg`.
  - The maskable icon's roundel sits inside the 80 % safe zone.
- **AC4 (no flat reads).** A grep test finds no `tokens.color.bg`, `color.accent` or `tokensJson.color.bg` in `apps/web/vite.config.ts` or `apps/web/scripts/**`.
- **AC5 (runtime agrees).** On `/` after load, the runtime `theme-color` (T-0589) equals the build-time value, so there's no flash. In `/session/*` lift, the runtime value is `lift.bg`. Both are tested.

Checklist (D-0197 §7):
- The first load (the build-time meta) and an in-app state change (runtime) are both covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/vite.config.ts`, `apps/web/build.test.ts` (lane)
- `apps/web/scripts/gen-icons.mjs`, `apps/web/scripts/gen-icons.test.ts`, `apps/web/public/**` (listed extras)
- `docs/tickets/T-0616-pwa-manifest-icons-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0616`.

## Build / accept log
