---
id: T-0918
title: "UF-04: defer SKIP_WAITING on route change until the destination route's lazy chunk has settled (the chunk request is aborted, and the route fails for about 1 s before the reload)"
lane: web-shell
screens: [UF-04]
decisions: []
deps: []
status: ready
---
## Why
T-0916 root cause, from the ticket QA log: `notifyRouteChange` → `activateIfSafe` posts SKIP_WAITING in the same tick the router starts the destination route's `import()`. Chromium aborts that chunk (net::ERR_ABORTED), and the user sees "Failed to fetch dynamically imported module" for about 1 s before the reload. This makes `pwa-update.spec.ts:118` flaky about 1% of the time.

## Scope
- In (`apps/web/src/lib/pwa/**`, plus the lazy-retry helper only if needed): don't post activation while a route import is pending. Wait for the import to settle (load or error), then activate.
- Out: the e2e timeouts, and allow-listing the console error.

## Acceptance criteria
- AC1 Unit: given a route change with a pending lazy import and a waiting worker, SKIP_WAITING is not posted until the import settles. Planted fault: posting immediately fails the test.
- AC2 Unit: if the import fails, activation still happens once (no stuck update).
- AC3 `pwa-update.spec.ts:118` passes `--repeat-each=300` with no console-guard failure.
- AC4 (T-0919 folded in, orchestrator 2026-10-09): the stuck-waiting mode, where SKIP_WAITING is posted but the worker stays waiting and `boot()` stays 1 at :140 and :109, is root-caused and fixed. The whole `pwa-update.spec.ts` passes `--repeat-each=300` with 0 failures, twice.

## Paths you may change
- `tests/e2e/pwa-update.spec.ts` (T-0919 folded in)
- `apps/web/src/lib/pwa/**`, `apps/web/src/app/**` (route-change hook only), `apps/web/src/features/*/lazy-retry.ts` (only if needed)

## Contract impact
None.

## Definition of done
Gate green · draft PR with green CI · commits start with `T-0918`.

## Build / accept log
