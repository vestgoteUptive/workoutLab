---
id: T-0429
title: "PWA shell: register the service worker from the app bundle with a rejection handler (injectRegister off), so a failed sw.js fetch logs no error and throws no unhandled rejection; drop the T-0425 SW allow"
lane: web-shell
screens: []
decisions: [D-0001, D-0086]
deps: [T-0425, T-0430]
status: done
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

## Build log (frontend-dev, 2026-10-02)
- **Files.** `apps/web/src/lib/pwa/register.ts` (new): `registerServiceWorker({prod?, win?})`, a
  no-op unless `import.meta.env.PROD` and `"serviceWorker" in navigator`; registers `/sw.js`
  (scope `/`) on `load`, or at once when `readyState` is `complete`; a rejection gives one
  `console.warn`, never `console.error`. Hand-written, no new dependency. `src/main.tsx` calls it
  once. `vite.config.ts`: `injectRegister: false` (`registerType: "autoUpdate"`, the manifest and
  workbox options unchanged). `build.test.ts`: T-0429 AC4 (no `registerSW.js`, `sw.js` still
  there; `index.html` has no `registerSW` and every `<script>` has a `src`). New
  `lib/pwa/__tests__/register.test.ts` (5 unit tests). New guarded `tests/e2e/sw-registration.spec.ts`
  (AC1, AC2). `tests/e2e/fixture-guard.spec.ts`: the allow and the `consoleGuard` parameter are gone
  from "setOffline does not suspend interception", and T-0430 AC5 (which pinned that allow's
  T-0429 comment) is replaced by T-0429 AC3 (no `consoleGuard` in the test body; no `.ts` under
  `tests/e2e/` contains the registration error string, checked by a string built from two parts so
  the check doesn't match itself). The now-unused `commentBlockAbove` import is dropped.
- **Red on main (fix not applied, tests added).** AC1: `test:e2e sw-registration.spec.ts` → AC1
  fails with `consoleGuard.errors()` = `["pageerror: t0429-register-failed"]` (and the same line at
  the fixture's teardown); AC2 passes (the injected script also registers once). AC4:
  `vitest run build.test.ts -t T-0429` → 2 of 2 red (`registerSW.js` exists; `index.html`
  contains `registerSW`).
- **Planted fault (AC2).** `injectRegister: "auto"` next to the new call: AC2 red, `Expected: 1,
  Received: 2` (AC1 too: 2 calls and the injected script's unhandled `pageerror`). Reverted.
- **Finding (AC3), and the build default proposed as D-0154 for the orchestrator.** With the
  rejection caught, the setOffline test still failed on every run (20/20 at `--repeat-each=20`)
  with `console.error: An unknown error occurred when fetching the script. (:0)`. That line is
  Chromium's own message for the failed `sw.js` fetch. The browser logs it, not the page, so no
  `catch` can stop it; the unhandled rejection, the app's part, is gone. Default: the test now
  awaits `navigator.serviceWorker.ready` before `setOffline(true)` (the pattern `shell.spec.ts`
  and `offline.spec.ts` use), so it no longer races the worker install. The interception
  assertion is unchanged. In real use, a device that goes offline before the first install
  still gets that one browser line in its own devtools; the next online load registers.
  Follow-up (e2e fixture owner): decide whether `guarded-test.ts` should exempt that browser line
  the way it exempts `Failed to load resource:`.
- **AC3 repeat.** `flock /tmp/workoutlab-tests.lock pnpm --filter @workoutlab/web test:e2e
  fixture-guard.spec.ts -g setOffline --repeat-each=20` → 40 passed (20 × the setOffline test,
  20 × the AC3 source check, which matches the grep too).
- **Runs.** `pnpm --filter @workoutlab/web typecheck` green, `lint` green, `test` 164 files /
  2560 tests green; `pnpm --filter @workoutlab/web test:e2e` (whole suite) 139 passed, AC5's
  shell/offline/uf-02/uf-08/uf-09 specs unedited; `pnpm -w exec turbo run typecheck lint test
  --force --concurrency=1` 19/19 tasks, `test:repo-checks` 146 pass; `check:size` green;
  `pnpm -w format:check` green; `pnpm check:repo` green. The CSP is unchanged (`script-src
  'self'`), and the built `index.html` has a single `<script>`, the module entry with a `src`.

## QA log (qa-tester, 2026-10-02)
- **Verdict: pass.** The tree was clean at 8ae4f3c, and every run below was under `flock /tmp/workoutlab-tests.lock`.
- **AC1 red reproduced.** With main's `vite.config.ts` (`injectRegister: "auto"`) and `main.tsx` restored and the
  new tests kept, `test:e2e sw-registration.spec.ts` gives AC1 red: `consoleGuard.errors()` =
  `["pageerror: t0429-register-failed"]`, and the fixture teardown fails on the same line. AC2 passes.
  In the same state, `vitest run build.test.ts -t T-0429` gives 2 of 2 red (`index.html` carries
  `<script id="vite-plugin-pwa:register-sw" src="/registerSW.js">`). Reverted.
- **AC2 planted fault reproduced.** With `injectRegister: "auto"` next to the bundle call, AC2 is red
  (`Expected: 1, Received: 2`). AC1 is also red (2 calls, plus the injected script's pageerror). Reverted.
- **Extra fault (QA).** With `.catch` changed to `.then` in `register.ts` (the rejection goes unhandled),
  e2e AC1 is red (pageerror) and the unit test "a rejected registration logs one warning and no error"
  is red (Unhandled Rejection). Reverted. So AC1 depends on the handler itself, not only on
  `injectRegister`.
- **D-0154 / AC3.** The interception assertion in "setOffline does not suspend interception" is
  unchanged (`501` and `guard.unclaimed()` = the one offline URL); the only change is the added
  `serviceWorker.ready` await. `grep -rl "Failed to register a ServiceWorker" tests/e2e` is empty.
  `test:e2e fixture-guard.spec.ts sw-registration.spec.ts -g "setOffline|T-0429" --repeat-each=10`
  gives 40 passed, so it isn't flaky.
- **Gates.** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: 4/4
  tasks, 169 files / 2661 tests green. `test:e2e` (whole suite): 142 passed. `check:size` exit 0,
  `-w format:check` exit 0, `node .github/scripts/check-all.mjs` exit 0. The contracts and the AC5
  specs (shell, offline, uf-02, uf-08, uf-09) are unchanged against main.

## Accept log (product-owner, 2026-10-02)
- **Verdict: done.** Branch `t/T-0429-sw-registration-catches-failure` at 7c113ab. Review approved, QA pass.
- **AC1 met.** `T-0429 AC1` in `sw-registration.spec.ts` (guarded, no allow) passes. The red run on main
  (`pageerror: t0429-register-failed`) was recorded by the build and reproduced by QA. QA's extra
  `.catch`→`.then` fault shows the test depends on the handler itself.
- **AC2 met.** One registration, scope `/`, `scriptURL` ends in `/sw.js`. The planted fault
  (`injectRegister: "auto"` restored) gave `Expected: 1, Received: 2` and was reverted.
- **AC3 met, with D-0154 accepted.** The allow and the `consoleGuard` parameter are gone. No e2e file
  contains the registration error string (grep empty, plus the `T-0429 AC3` source check). The test
  passed 20/20 at `--repeat-each=20`, and QA ran 40/40 at 10 repeats. The one change to that test is the
  `navigator.serviceWorker.ready` await from D-0154 §1. Its interception assertion is unchanged, so
  nothing was weakened. The line `An unknown error occurred when fetching the script.` is Chromium's own
  message, and page code can't suppress it. So "logs no error" in the title can only be held for the
  app's part: no `console.error` from app code and no unhandled rejection. AC1 and the unit test pin that
  part. We accept that scope. The browser line counts as outside the app's control, which fits
  NFR-OFF: the user can't act on it, and the next online load registers. T-0437 decides how the
  fixture treats that line.
- **T-0430 AC5 replaced.** That test pinned the comment on the allow that this ticket was told to remove.
  The ticket asked for the removal, and `T-0429 AC3` covers a stronger property in its place. So
  replacing it is acceptable, not a weakening.
- **AC4 met.** `build.test.ts -t T-0429`: no `registerSW.js`, no `registerSW` reference, every `<script>`
  has a `src`, `sw.js` present. Red on main recorded (2 of 2).
- **AC5 met.** The shell, offline, uf-02, uf-08 and uf-09 specs are unchanged against main and pass in the
  whole-suite run (142). `check:size` is green.
- **DoD.** Typecheck, lint and test green (QA 2661 tests; build ran the workspace gate 19/19). Whole e2e,
  `format:check` and `check-all`/`check:repo` green. Contracts unchanged, CSP unchanged.
- **Principles.** No workout-flow, engine or onboarding surface is touched. Offline use after install is
  preserved.
- **Follow-ups.** T-0437 (e2e fixture owner) decides on exempting Chromium's sw.js fetch line in
  `guarded-test.ts`, and folds in review's optional idea of widening the AC3 source scan to that second
  string. The T-0420 lane can drop any allow for this SW error in its UF-03 spec once this lands.
