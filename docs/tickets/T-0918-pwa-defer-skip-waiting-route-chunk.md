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
- AC3 (re-scoped by the orchestrator 2026-10-13) `pwa-update.spec.ts:118` shows no chunk abort (`net::ERR_ABORTED`) and no 'Failed to fetch dynamically imported module' console-guard failure in `--repeat-each=300`. Met: 0 such failures in 4 x ~300 runs. A residual ~0.3-4% failure is the separate stuck-waiting mode, tracked by T-0919.
- AC4 (moved out 2026-10-13): the stuck-waiting mode is a Chromium service-worker activation wedge, not app logic. It moves to T-0919 (`docs/tickets/T-0919-*.md`), which needs a decision on how the spec may handle it (see its log).

## Paths you may change
- `tests/e2e/pwa-update.spec.ts` (T-0919 folded in)
- `apps/web/src/lib/pwa/**`, `apps/web/src/app/**` (route-change hook only), `apps/web/src/features/*/lazy-retry.ts` (only if needed)

## Contract impact
None.

## Definition of done
Gate green · draft PR with green CI · commits start with `T-0918`.

## Build / accept log

### Build log (2026-10-09, from HEAD 97df1c9, clean)
- Change: `trackRouteImport()` in `update.ts` counts pending route imports; `activateIfSafe` returns while any is pending, and the settle (load or error) re-runs it once. `App.tsx` wraps `route.load()` with it.
- AC1 -> `update.test.ts` "T-0918 AC1" (not posted while pending; once after settle). AC2 -> "T-0918 AC2" (rejected import still posts exactly once). Planted fault (removed the `pendingImports > 0` guard, restored from backup): both tests red, exit 1; restored: 41/41 green.
- Gate: typecheck lint test exit 0; format:check 0; check-all 0; test:repo-checks 0.
- AC3 (re-scoped by the orchestrator 2026-10-13) `pwa-update.spec.ts:118` shows no chunk abort (`net::ERR_ABORTED`) and no 'Failed to fetch dynamically imported module' console-guard failure in `--repeat-each=300`. Met: 0 such failures in 4 x ~300 runs. A residual ~0.3-4% failure is the separate stuck-waiting mode, tracked by T-0919.

### AC4 investigation (stuck-waiting mode), 2026-10-09 — NOT resolved
Failing state, measured in about 3000 instrumented runs (rate 0.3 to 4%, higher under load): the new worker `?t0552=2` is `installed`, the old one `activated`, SKIP_WAITING is posted once at `/library` by the app, and the registration stays `waiting`. A direct `self.skipWaiting()` inside the waiting worker (Playwright `worker.evaluate`) returns a promise that stays pending, so the message handler is not the problem: Chromium does not activate. Unstuck by only CDP `ServiceWorker.skipWaiting` / `stopAllWorkers`. Nothing page-side helps: reposting SKIP_WAITING, `registration.update()`, pinging the controller, fetching precached files, all 4.5 s later. The old worker has no pending `respondWith`/`waitUntil` at JS level (patched and read at failure). A navigation opened in a second page of the same context also hung while stuck.
Ruled out: (a) a second registration or a different worker: the app's own `register("/sw.js")` resolves at about 70 to 110 ms after load, about 1 s before the test's `register("/sw.js?t0552=2")` (logged), one SKIP_WAITING post, and one waiting worker. A deterministic plant that delays the app's `/sw.js` register until after the publish also passed 20/20. (b)/(c) no listener or WeakSet issue: the post is made to the waiting worker that stays waiting.
Tried as fixes, none gave 0 failures (`-g "UF-09.1 AC9"`): wait for the app's register + networkidle in `controlled()` 3/300; CDP stopAllWorkers before publish 1/300; skip `registration.update()` while a worker is waiting 3/400; baseline (no change from me) 1/300 and 4/400 in the debug copy. So my T-0918 change does not measurably change the stuck rate; the 11/300 run was taken under heavy machine load.
Conclusion: a Chromium service-worker activation wedge (skipWaiting pending while the active worker is not treated as idle), not app or spec logic. Needs a decision: quarantine this assertion with a documented Chromium wedge (e.g. a test-only CDP `ServiceWorker.skipWaiting` after the app has posted and 3 s have passed, asserting the post and the single reload), or accept CI retries for it. Not applied, because both change what the test proves.
