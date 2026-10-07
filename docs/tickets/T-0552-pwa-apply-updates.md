---
id: T-0552
title: "PWA applies new builds: check for a new service worker on load and on resume, and reload at a safe moment — on the next route change to, or resume on, a tab screen; never on /session/* (UF-09) or mid-form"
lane: web-shell
screens: [UF-02.1, UF-09.1, UF-11.2]
decisions: [D-0203, D-0204, D-0017, D-0045]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §6, rules in D-0204 §3–§4). HIGH PRIORITY: installed apps run stale builds today, so every fix (including the D-0203 visual work) only reaches them after a manual force-close. Flow: wl-build-web (agent frontend-dev). About ⅓ day. Touches the service-worker lifecycle and App.tsx, so the full web e2e suite runs. -->

## Why
`vite-plugin-pwa` runs with `registerType: "autoUpdate"` (skipWaiting + clientsClaim), so a new worker activates and takes control, but an open page keeps running the old JS and CSS until it is fully reloaded. An installed PWA on iOS is rarely reloaded: it resumes from the background. So users run old builds for days. D-0203 §6: check for a new build on load and when the app becomes visible again, and apply it at a safe moment: never during a workout (principle 1), otherwise on the next navigation or app resume. D-0204 §3–§4 fixes which paths are safe and rules out a reload on first install.

## Scope
- In (`apps/web/src/lib/pwa/**`, wired from `apps/web/src/main.tsx` and `apps/web/src/app/App.tsx`):
  - **Check for updates.** After registration resolves, call `registration.update()` once on load, and again on every `visibilitychange` where `document.visibilityState === "visible"`. A rejected `update()` (offline, network error) is caught and ignored: no console error, no unhandled rejection (the T-0429 rule).
  - **Detect a new build.** Record at start-up whether `navigator.serviceWorker.controller` was non-null. On `controllerchange`, mark "update pending" only if it was (D-0204 §4: the first install claiming the page is not an update).
  - **Safe paths** (D-0204 §3), a pure function `isSafeToReload(pathname)`: true for `/`, `/library`, `/library/*`, `/progress`, `/progress/*`, `/balance`, `/balance/*`, `/plan`; false for everything else, including `/session/*`, `/welcome/*`, `/account`, `/auth/callback`, `/plan/edit`, `/plan/account`, `/plan/routines/*`, `/plan/excluded`.
  - **Apply.** With an update pending, call `location.reload()`:
    - right after a route change whose new `pathname` is safe (the shell calls a `notifyRouteChange(pathname)` from a `useEffect` on `location.pathname`), or
    - on `visibilitychange` → `visible` when the current `pathname` is safe;
    - never otherwise. At most one reload per page load.
  - The module takes its dependencies as options (window, clock-free) so unit tests use a fake `ServiceWorkerContainer`, a fake `document.visibilityState`, a fake `location` with a `reload` spy, and an `EventTarget` for events. Production defaults to `window`. Dev and tests never register (as `registerServiceWorker` today).
  - Unit tests in `apps/web/src/lib/pwa/__tests__/update.test.ts`.
  - An e2e spec `tests/e2e/pwa-update.spec.ts` if feasible (AC9).
- Out:
  - An "Update ready" prompt or banner (D-0204 "Revisit when").
  - Changing `registerType`, `skipWaiting` or the precache list (T-0545 adds `woff2`).
  - Any feature folder.

### Edge cases that are in scope
- **During a workout (principle 1).** On `/session/S1` with an update pending, a resume or an in-session route change (`/session/S1` → `/session/S1/summary`) never reloads. The first navigation from the summary to `/` does (AC4).
- **Mid-form.** On `/plan/edit` or `/plan/account`, a resume never reloads; leaving to `/plan` does (AC5).
- **Auth.** `/auth/callback` and `/welcome/*` never reload, so an auth code in the URL and onboarding progress (the 60-second budget, principle 5) are never lost (AC5).
- **First install.** No previous controller → `controllerchange` does nothing (AC3).
- **Offline.** `update()` rejects; nothing is logged as an error and nothing reloads (AC2). An update that arrived before going offline still applies at the next safe moment, because the new worker serves from its precache.
- **Returning after 10 days off.** The app resumes on `/`, the resume check finds the new worker, it activates, `controllerchange` fires, and the next resume or tab tap reloads.
- **Reload loop.** After the reload the page starts with a controller and no pending flag; only a later `controllerchange` can mark one (AC6).

## Acceptance criteria
Unit tests use a fake container with `controller`, `ready`/`getRegistration` resolving to `{ update: vi.fn() }`, and `dispatchEvent(new Event("controllerchange"))`; a fake document whose `visibilityState` the test sets before dispatching `visibilitychange`; a fake `location` `{ pathname, reload: vi.fn() }`.

- **AC1 (checks on load and resume)** Given prod and a registration, When the module starts, Then `update` is called once. When `visibilitychange` fires with `visible` twice and once with `hidden`, Then `update` has been called 3 times in total.
- **AC2 (offline check is silent)** Given `update` rejects with `TypeError("Failed to fetch")`, When the module starts and a `visible` event fires, Then no `console.error` is called, no unhandled rejection is raised (vitest's `unhandledRejection` hook stays clean), and `reload` is not called.
- **AC3 (first install never reloads)** Given `controller` was null at start-up and the path `/`, When `controllerchange` fires and then a `visible` event and a route change to `/library`, Then `reload` is never called.
- **AC4 (workout routes never reload)** Given a controller at start-up, the path `/session/S1`, and `controllerchange` fired, When a `visible` event fires and then a route change to `/session/S1/summary`, Then `reload` is not called. When the route then changes to `/`, Then `reload` is called exactly once.
- **AC5 (unsafe paths)** For each of `/session/setup`, `/session/S1`, `/welcome/goal`, `/account`, `/auth/callback`, `/plan/edit`, `/plan/account`, `/plan/routines/new`, `/plan/routines/r1`, `/plan/excluded`: `isSafeToReload` is false, and with an update pending a `visible` event on that path does not reload. For each of `/`, `/library`, `/library/back-squat`, `/progress`, `/progress/back-squat`, `/balance`, `/balance/chest`, `/plan`: `isSafeToReload` is true.
- **AC6 (safe moments reload once)** Given a controller at start-up, the path `/plan`, and `controllerchange` fired, When a `visible` event fires, Then `reload` is called once; When another `visible` event and a route change to `/` follow, Then `reload` is still called exactly once. Separately, given the path `/plan/edit` and an update pending, When the route changes to `/plan`, Then `reload` is called once.
- **AC7 (no update, no reload)** Given a controller at start-up and no `controllerchange`, When 3 `visible` events and 3 route changes to safe paths fire, Then `reload` is never called.
- **AC8 (not in dev or without support)** Given `prod: false`, or a window without `serviceWorker`, Then the module does nothing and throws nothing; `notifyRouteChange` is a no-op.
- **AC9 (e2e, if feasible)** Given the built app at `/` with the worker active and controlling, When the test serves a changed `/sw.js` (a `page.route` that appends a comment to the real body) and dispatches `visibilitychange` (or calls the exported check), and the new worker takes control, Then navigating to `/library` reloads the page once (a `window.__wlBoot` marker set by an init script is reset), and the same sequence on `/session/S1` with a running session does **not** reload while on that route. If Chromium/Playwright can't drive the update reliably, the log records the attempt and why, and AC1–AC8 are the proof.
- **AC10 (fault)** Planted on a backup copy, restored with `cp`, each recorded in the log: (a) drop the start-up controller check → AC3 fails; (b) make `isSafeToReload` return true for `/session/*` → AC4 fails.
- **AC11 (nothing else changes)** The existing `register.test.ts` and `tests/e2e/sw-registration.spec.ts` pass unchanged; the full web e2e suite is green.

Checklist (D-0197 §7): first install vs returning (AC3 vs AC4/AC6); online/offline (AC2 vs AC1); safe vs unsafe path (AC5, AC6); update vs no update (AC6 vs AC7).

## Paths you may change
- `apps/web/src/lib/pwa/**` (lane)
- `apps/web/src/main.tsx` (lane)
- `apps/web/src/app/App.tsx` (lane, the one `notifyRouteChange` effect in `Shell`)
- `tests/e2e/pwa-update.spec.ts` (new file)

## Contract impact
None.

## Definition of done
Every AC has a passing test (AC9 or its recorded reason) · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · the full web e2e suite green (service-worker lifecycle and App.tsx) · contracts unchanged · commits start with `T-0552:` and cite UF-09.1 / UF-02.1.

## Build / accept log
