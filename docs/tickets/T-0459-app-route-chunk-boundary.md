---
id: T-0459
title: "App shell: an error boundary around each lazy route, so a failed chunk load (a stale deploy's 404) shows \"Couldn't load this screen.\" with a Reload button instead of a blank app (D-0164 §7)"
lane: web-shell
screens: []
decisions: [D-0164, D-0045, D-0111, D-0144, D-0162]
deps: [T-0422]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0422 review. Split from T-0446 by lane (D-0164 §8). Build flow: wl-build-web. About ⅓ day. It touches app/App.tsx, so it runs the whole web e2e. -->

## Why
Every route in `app/routes.ts` is a `lazy()` chunk (D-0045 §2), and `App.tsx` has no error
boundary. After a deploy, a tab left open asks for a chunk hash that no longer exists. The import
rejects, React unmounts the tree and the app goes blank, mid-workout included. The only way out is
a manual reload that the user has no cue to try. D-0162 §3 handles the UF-05 seam chunk in-page;
route chunks need a shell-level answer, and a reload is the one that fixes a stale deploy.

## Scope
- In:
  - A small error boundary (class component) in `apps/web/src/app/` (for example
    `RouteBoundary.tsx`). In `Shell`, each route's element becomes guard → profile gate →
    **boundary** → `<Suspense>` → the lazy component (D-0164 §7).
  - The fallback: a `<div role="alert">` with "Couldn't load this screen." and a `button`
    "Reload" that calls `window.location.reload()`.
  - One boundary per route element, not one around `<Routes>` (D-0164 §7), so another route
    renders afresh.
  - Strings in a new `routeError` group in `lib/i18n/en.ts`.
- Out:
  - An automatic reload, a retry without reload, or a `sessionStorage` reload guard (D-0164
    Revisit).
  - Error reporting or telemetry.
  - The `LazyAutoSync` lazy import (it renders nothing; a failure there isn't a blank screen).
  - Feature-level boundaries (UF-09's seam boundary, T-0451).

### Edge cases that are in scope
- **Offline:** a chunk that isn't precached fails offline the same way and shows the same
  fallback (AC-1). Reload offline is the user's choice. The service worker serves what it has.
- **Mid-workout:** on `/session/:id` the fallback has no tab bar (as the route has none), and the
  `session` guard isn't re-run by a reset (AC-3). After a reload, the focus state is restored
  (D-0111 §6).
- **Leaving by the tab bar:** a route with the tab bar still shows it under the fallback. Another
  tab's route renders normally (AC-2).
- **Zero history, 10 days off, time running out:** no effect.

## Acceptance criteria
**Test setup.** The `App.test.tsx` harness (`<Shell>` in a `MemoryRouter`, the `auth-context` mock
signed in). A `vi.mock` of `./routes.js` (via `importOriginal`) replaces one route's `load` with
`() => Promise.reject(new TypeError("Failed to fetch dynamically imported module"))`. Use a route
the harness already reaches (for example `/progress`, UF-06.1). `window.location.reload` is
replaced with a spy for the test (restored after). React's console error for a caught error is
expected and silenced only inside these tests.

**Test rules.** Both values of every binary condition get a test. **AC-1, AC-2 and AC-4 must fail
on `main`**: the build log records each red run (the render throws, or nothing is on screen). It
also records one planted fault turning AC-2 red: a single boundary around `<Routes>` instead of
one per route.

- **AC-1 (the fallback)** Given the `/progress` load rejects, When `<Shell>` renders at
  `/progress`, Then an alert reads "Couldn't load this screen." with one button "Reload", and no
  `[data-screen-id]` is in the DOM. Clicking "Reload" calls `window.location.reload` once.
  **The pair:** with the real `load`, `/progress` renders `[data-screen-id="UF-06.1"]` and no alert.
- **AC-2 (another route renders)** From the fallback on `/progress`, a navigation to `/library`
  (the tab bar's "Library" link) renders `[data-screen-id="UF-04.1"]` and no alert. Navigating
  back to `/progress` (still rejecting) shows the fallback again.
- **AC-3 (guards still come first)**
  - **Signed out.** At `/progress` signed out, with its load a rejecting spy, the guard redirects
    to the auth flow, no fallback shows, and the load spy has 0 calls (the chunk is never asked
    for, as the App.tsx comment promises).
  - **Mid-workout.** At `/session/S1` signed in, with the session route's load rejecting, the
    fallback shows with no `nav` (no tab bar). Flipping the auth mock to signed out afterwards
    doesn't redirect (the `session` guard's mount-time decision holds, AC-B7).
- **AC-4 (any error under the route)** A route component that throws during render shows the same
  fallback. A component that renders normally inside the boundary is untouched (the existing
  `App.test.tsx`, `routes.phase3.render.test.tsx` and `profile-gate.test.tsx` pass unedited).
- **AC-5 (a11y, strings, shell rules)** The two strings are in `en.routeError`
  (`react/jsx-no-literals` green). The vitest axe helper finds 0 violations on the fallback, and
  "Reload" is reachable by Tab. `profile-gate.source.test.ts` (the gate applied in one place, from
  `isGatedPath(route)`) and `import-bans.test.ts` pass unedited. `check:size` stays within the
  NFR-PERF-2 entry budget.

## Paths you may change
- `apps/web/src/app/**`, `apps/web/src/components/**` (the lane: `web-shell`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/en.ts`: add the `routeError` group only.
  - `docs/tickets/T-0459-app-route-chunk-boundary.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded (the AC-2 one) · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · `check:size` green · the whole web e2e green (`app/App.tsx` changed) ·
contracts unchanged · commits start `T-0459`.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** no shared file with T-0394, T-0451, T-0446, T-0448, T-0454, T-0417, T-0457 or
  T-0458. Its whole-suite e2e run shares the machine's test lock with every other e2e run.
  T-0441 (infra, vitest tmp) touches vitest config, not app code.
- **Board:** a new row (web-shell, deps T-0422, `ready`, `wl-build-web`). The T-0446 row keeps only
  the seam zone.

## Build / accept log

### Build log (web-dev, 2026-10-03)
- Start: `git status` clean, HEAD a6f3e9d. Added `app/RouteBoundary.tsx` (class boundary, `role="alert"` + Reload), `en.routeError`, and one `<RouteBoundary key={route.path}>` per route in `Shell` (guard → gate → boundary → Suspense → lazy). The `key` is needed: React Router reuses the element slot, so without it the failed state follows the user to the next route.
- Tests: `app/__tests__/route-boundary.test.tsx` (fresh module graph per test: `React.lazy` caches a rejection for good).
- AC→test: AC-1 "AC-1: a rejecting chunk…" + "AC-1 pair"; AC-2 "AC-2: another route renders…"; AC-3 "signed out" (0 load calls) and "mid-workout" (no nav, no redirect after sign-out); AC-4 "a component that throws…"; AC-5 axe 0 violations, Reload `tabIndex` 0 and focusable (jsdom has no Tab handling, no user-event installed), plus unedited `profile-gate.source`, `import-bans`, `App.test`, `routes.phase3.render`, `profile-gate`.
- Red on unfixed `App.tsx` (HEAD copy): AC-1, AC-3 mid-workout, AC-4, AC-5 failed (no alert); AC-2 and the AC-1 pair failed too (lazy cache leak, then no alert). Green after the fix: 7/7.
- Planted fault (on a backup copy, restored with `cp`): one boundary around `<Routes>` instead of per route: AC-2 red, the other 6 green. Without the `key` AC-2 was also red (first fixed run).
- Gate: `-w typecheck lint test` all green except one flaky `UF-07/t0453.focus` (passes alone, 10/10; T-0460/T-0461 territory, not this ticket). `test:repo-checks` 155 pass, `format:check`, `check-all`, `check:size` green. Whole web e2e: 190 passed.
