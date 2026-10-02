---
id: D-0154
title: "e2e: the setOffline guard test waits for the service worker before going offline; Chromium's own sw.js fetch error is not app-catchable"
status: revisit
date: 2026-10-02
by: orchestrator (from the T-0429 build)
area: qa
builds-on: D-0086, T-0425, T-0430
tickets: [T-0429]
---
## Context
T-0429 moved service-worker registration into the bundle (`apps/web/src/lib/pwa/register.ts`) with a
rejection handler, so a failed `sw.js` fetch no longer throws an unhandled rejection. But when the
context goes offline before the first install, Chromium itself logs
`An unknown error occurred when fetching the script.` as a console error. No page code can catch it.
So `fixture-guard.spec.ts` "setOffline does not suspend interception" still failed under the
consoleGuard after its T-0425 allow was removed.

## Decision
1. That test awaits `navigator.serviceWorker.ready` after the first `page.goto` and before
   `context.setOffline(true)`, as `shell.spec.ts` and `offline.spec.ts` already do. Its interception
   assertion is unchanged. It takes no `consoleGuard` and has no allow.
2. The app-side guarantee (a failed registration gives one `console.warn`, never `console.error` or
   a pageerror) is tested by `tests/e2e/sw-registration.spec.ts` and `lib/pwa/__tests__/register.test.ts`.
3. Whether `guarded-test.ts` should exempt that Chromium line, the way it exempts
   `Failed to load resource:`, is a follow-up for the e2e fixture owner (T-0437), not settled here.

## Revisit when
- A spec needs to go offline before the first service-worker install (then decide T-0437 first).
