---
id: T-0553
title: "PWA update guard: rewrite the wl-in-session entry when a /session/* page is restored from bfcache"
lane: web-shell
screens: [UF-09]
decisions: [D-0206]
deps: [T-0552]
status: ready
---

## Why
T-0552 code review (D-0206). A tab on `/session/*` removes its `wl-in-session:<tabId>` entry on `pagehide`. If the page is then restored from the bfcache (`pageshow` with `persisted === true`), nothing writes the entry back until the next resume or route change. During that window, another tab could post SKIP_WAITING while this tab is mid-workout.

## Acceptance criteria
- AC-1: on `pageshow` with `persisted === true` on a `/session/*` route, the entry is written again with a fresh timestamp. Unit test with a fake window. A planted fault (no handler) fails it.
- AC-2: on a non-session route, `pageshow` writes nothing.
- AC-3: existing `src/lib/pwa` tests stay green.

## Paths you may change
- `apps/web/src/lib/pwa/**`

## Contract impact
None.

## Build / accept log

- Build (frontend-dev): `update.ts` gets a `pageshow` handler that calls `trackSession(pathname)` only when `persisted === true` (writes on /session/*, removes elsewhere). New `__tests__/update-bfcache.test.ts`. AC-1: persisted pageshow after pagehide rewrites entry with fresh timestamp. AC-2: /plan and persisted=false write nothing. AC-3: existing pwa tests green (37/37).
- Planted fault (handler never fires): AC-1 test red (1 failed, 36 passed); restored from backup copy, green.
- Gate: `-w typecheck lint test` green, format:check clean, check-all exit 0.
