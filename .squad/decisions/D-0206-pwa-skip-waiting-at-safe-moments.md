---
id: D-0206
title: "PWA updates: the app posts SKIP_WAITING to a waiting service worker, but only at a safe moment (no client in /session/*), then reloads on controllerchange; skipWaiting/clientsClaim stay off in the Workbox config"
status: decided
date: 2026-10-07
by: orchestrator (T-0552 build finding and code review)
amends: D-0204 (T-0552's premise), D-0203 §6
---
## Context
D-0203 §6 and D-0204 assumed `registerType: "autoUpdate"` made the worker skip waiting. It doesn't: the built `sw.js` skips waiting only on a `SKIP_WAITING` message. T-0429 replaced `registerSW.js` with a hand-written register, and since then nothing has sent that message. New workers stayed in waiting forever, so installed apps ran stale builds (the cause behind the stale UF-11 screens in GitHub #37/#45).

Activating a new worker runs `cleanupOutdatedCaches`. A page still running the old build then loses its lazy chunks, e.g. the UF-09 overlays loaded through `retryableLazy`. Activating mid-workout would break principle 1 offline.

## Decision
1. The app posts `SKIP_WAITING` itself, from `lib/pwa/update.ts`.
2. It posts only at a safe moment: a load, a resume or a route change on a safe path, and only while no open client of the app is on `/session/*`. Cross-tab state goes through BroadcastChannel or storage, as implemented in T-0552. Once the new worker takes control, the page reloads once.
3. `skipWaiting` / `clientsClaim` stay **off** in the Workbox config. Activating unconditionally is exactly the failure in the Context.
4. If the user never leaves a session route, the update waits. Being stale is acceptable; breaking a workout isn't.

## Revisit when
- Lazy chunks get a cache-independent fallback, e.g. a network-first retry with the new manifest. Then activation timing matters less.
