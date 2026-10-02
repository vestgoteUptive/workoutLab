---
id: T-0429
title: "PWA shell: register the service worker from the app bundle with a rejection handler (injectRegister off), so a failed sw.js fetch logs no error and throws no unhandled rejection; drop the T-0425 SW allow"
lane: web-shell
screens: []
decisions: [D-0001, D-0086]
deps: [T-0425, T-0430]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. From the T-0425 build and accept logs (the one real finding of the console guard). Build flow: wl-build-web. About ⅓ day. It depends on T-0430 because both edit the same test in tests/e2e/fixture-guard.spec.ts: T-0430 relabels the allow, and this ticket removes it. It can run in parallel with T-0427 (no shared file) and T-0431 (different web-shell paths). Ready when T-0430 is done. -->

## Why
- **T-0425 finding:** `apps/web/vite.config.ts` sets `injectRegister: "auto"`. The emitted
  `registerSW.js` calls `navigator.serviceWorker.register("/sw.js", { scope: "/" })` with no
  `catch`. When the `sw.js` fetch fails, the page logs `An unknown error occurred when fetching
  the script.` and throws an unhandled rejection: `Failed to register a ServiceWorker …`. That
  happens when the device goes offline right after the first load, on a flaky network, or when
  the browser blocks it. Today the e2e "setOffline does not suspend interception" carries a
  `consoleGuard.allow` for exactly this.
- **NFR-OFF:** a failed registration isn't an error the user can act on. The next load retries.
  So it should be silent, and offline use must keep working once the SW is installed.

## Scope
- In:
  - `apps/web/vite.config.ts`: `injectRegister: false`. Keep `registerType: "autoUpdate"`, the
    manifest and the workbox options.
  - `apps/web/src/lib/pwa/register.ts` (new): `registerServiceWorker()` does nothing unless
    `import.meta.env.PROD` is set and `"serviceWorker" in navigator`. It registers
    `/sw.js` with scope `/` on `window` `load` (or at once if the document has already loaded),
    and it catches the rejection. The catch logs at most one `console.warn` and never
    `console.error`.
    - **Default:** hand-written, no new dependency. `virtual:pwa-register` needs `workbox-window`,
      which isn't installed, and the lockfile is infra's.
  - `apps/web/src/main.tsx`: call it once.
  - `apps/web/build.test.ts`: the AC4 checks.
  - `tests/e2e/sw-registration.spec.ts` (new, guarded): AC1 and AC2.
  - `tests/e2e/fixture-guard.spec.ts`: remove the allow, and its `consoleGuard` parameter, from
    "setOffline does not suspend interception".
  - A unit test for `register.ts`, optional (`lib/pwa/__tests__/`).
- Out:
  - Update prompts and reload-on-update UX (`autoUpdate` keeps today's behaviour).
  - SW caching rules. The CSP (`script-src 'self'` keeps holding, because registration now ships
    inside the bundle).
  - Any other spec's allows.

## Acceptance criteria
Test titles start with `T-0429 ACn`.
- **AC1 (a rejected registration is silent; red on main)** In `sw-registration.spec.ts`, imported
  from `./fixtures/guarded-test.js`:
  - **Setup.** A `page.addInitScript` replaces `ServiceWorkerContainer.prototype.register` with a
    function that adds 1 to `window.__t0429Calls` and returns
    `Promise.reject(new Error("t0429-register-failed"))`.
  - **When** `/welcome` loads, `[data-screen-id="UF-01.1"]` is visible, and 500 ms pass after the
    `load` event, **then** `window.__t0429Calls` is 1, `consoleGuard.errors()` equals `[]`, and
    the test passes with no `allow`.
  - **On main,** `registerSW.js` leaves the rejection unhandled, and the test fails at teardown
    with `pageerror: t0429-register-failed`. Record that red run.
- **AC2 (the pair: a normal registration still works, exactly once)**
  - Online `/welcome` with a counting wrapper that delegates to the real `register`.
  - `navigator.serviceWorker.ready` resolves.
  - `registration.scope` is `${BASE_URL}/`, and the active worker's `scriptURL` ends in `/sw.js`.
  - `getRegistrations()` has length 1, and the wrapper counted exactly 1 call.
  - **Planted fault.** With `injectRegister: "auto"` restored next to the new call, the count is
    2 (red). Record it, then revert.
- **AC3 (the T-0425 allow is gone)**
  - "setOffline does not suspend interception" has no `consoleGuard.allow` and no `consoleGuard`
    parameter.
  - No file under `tests/e2e/` contains `Failed to register a ServiceWorker`.
  - The test passes with `--repeat-each=20` (record the command and result in the build log).
- **AC4 (the build, `apps/web/build.test.ts`)**
  - `dist/registerSW.js` doesn't exist.
  - `dist/index.html` has no `registerSW` reference and no inline `<script>` (every `<script>`
    has a `src`).
  - `dist/sw.js` still exists (the existing check).
  - Red on main: today's `index.html` references `registerSW.js`.
- **AC5 (offline still works)** The existing SW and offline e2e pass unedited:
  - `shell.spec.ts` (the cold offline load after `serviceWorker.ready`, AC-6);
  - `offline.spec.ts`, `uf-02-today.spec.ts`, `uf-08-setup.spec.ts` and `uf-09-focus.spec.ts`
    (each awaits `serviceWorker.ready`).

  `check:size` stays green.

## Paths you may change
- `apps/web/*.*`, `apps/web/src/main.tsx` and `apps/web/src/lib/**` (the lane: `web-shell`), in
  practice `apps/web/vite.config.ts`, `apps/web/build.test.ts`, `apps/web/src/main.tsx` and the
  new `apps/web/src/lib/pwa/**`.
- **Listed extras:**
  - `tests/e2e/sw-registration.spec.ts`: a new guarded spec for AC1 and AC2.
  - `tests/e2e/fixture-guard.spec.ts`: the AC3 removal in "setOffline does not suspend
    interception".
  - `docs/tickets/T-0429-sw-registration-catches-failure.md`: this file, for the build and accept
    logs.

## Contract impact
None. Registration moves from an injected script into the bundle. The manifest, `sw.js` and the
CSP are unchanged.

## Coordination
- After T-0430, which relabels the same allow comment. Parallel with T-0427 and T-0431.
- T-0420 (UF-03) is building `uf-03-list-summary.spec.ts`. If its build log carries an allow for
  this SW error, it can be dropped once this lands (a follow-up for that lane).

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · `pnpm -w typecheck
lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the
whole suite) · `check:size`, `format:check` and `check:repo` green · contracts unchanged · commits
start `T-0429` (for example `T-0429: register the service worker with a rejection handler`).
