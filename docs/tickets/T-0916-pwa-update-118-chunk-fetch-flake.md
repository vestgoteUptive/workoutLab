---
id: T-0916
title: "pwa-update.spec.ts:118 flake: lazy chunk fetch cut off by activation or reload trips the console guard (root-cause it, no timeout widening)"
lane: qa
screens: [UF-04]
decisions: []
deps: [T-0915]
status: todo
---
## Why
Side finding in `docs/ci/CI-T-0914-*.md`: line 118 failed 1 of 15 times locally with `Failed to fetch dynamically imported module`.

## Scope
- In: `apps/web/tests/e2e/pwa-update.spec.ts`. Find the root cause; if the cause is in app code, file a follow-up in the owning lane.
- Out: widening timeouts, or allow-listing the console error without a cause.

## Acceptance criteria
- AC1 The root cause is written in the log, and either fixed in the spec or a follow-up is filed.
- AC2 `pwa-update.spec.ts` passes `--repeat-each=30` locally.

## Paths you may change
- `apps/web/tests/e2e/pwa-update.spec.ts`

## Contract impact
None.

## Definition of done
Gate green · commits start with `T-0916`.

## Build / accept log

### QA log (2026-10-09, on HEAD 2df82a8 + T-0915; tree clean apart from this log)
- Reproduced `:118` 4/500 (`--repeat-each=500`, spec line only). Not reproduced in 30+60 earlier repeats (rate about 1%).
- Instrumented a throwaway copy of the spec (deleted): per-request and console timeline of a failing run:
  `navigate /library` at 2169 ms -> the lazy route chunk `assets/index-BkXuEqSO.js` (imported by the entry `index-D8sJH2Gt.js`) is requested
  at 2184 ms and fails `net::ERR_ABORTED` at once (same ms) -> `TypeError: Failed to fetch dynamically imported module` logged at about
  2480 ms -> the update reload only happens at about 3215 ms (and the same chunk then loads fine, 3304 ms).
- Root cause (AC1): app-side race, not a test timing problem. `notifyRouteChange("/library")` calls `activateIfSafe`, which posts
  `SKIP_WAITING` in the same tick that the router starts `import()` for the destination route. The old worker is replaced while that chunk
  request is being dispatched, so Chromium aborts it; the route chunk never renders and the error is logged (retry fails too) before the
  reload. Users would see a failed route for ~1 s before the reload. No timeout and no allow-list can honestly fix this in the spec.
- Follow-up (web-shell, `apps/web/src/lib/pwa/update.ts` + shell router): do not post `SKIP_WAITING` from the route-change hook until the
  destination route has rendered (e.g. defer to after the lazy route settles / next idle), or make lazy-retry swallow-and-retry
  a chunk failure that coincides with `controllerchange`. Then add a unit test (activation not posted while a route import is pending).
- No spec change made (AC1 satisfied by follow-up). The spec stays red about 1% until the follow-up lands; do not allow-list it.
- Second finding, `:109` (UF-04 AC9) failed 1 of 60, plus 7 of about 2200 in debug repeats: the new worker is adopted and `SKIP_WAITING` IS
  posted by T-0915's code (logged), yet Chromium leaves the worker `waiting` for good (a resend 3 s later does not help; no page request
  in flight). A standalone register + immediate post loop (900 runs) never stuck, so the trigger is specific to the live app page.
  Unresolved; follow-up: investigate (web-shell/qa), candidate is the app's own `registration.update()` racing the test's
  `register(?t0552=2)` on one registration.
- AC2: not met at `--repeat-each=30` for the whole spec in every run (the `:109` flake shows in 1 of 2 runs); see handback.

