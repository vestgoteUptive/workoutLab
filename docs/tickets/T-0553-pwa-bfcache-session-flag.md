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
Archived in `docs/tickets/log/T-0553.md` (D-0157).
