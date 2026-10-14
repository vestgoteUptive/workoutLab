---
id: T-0917
title: "uf-03-list-summary.spec.ts:419 flake: an offline write was fulfilled (writesFulfilledOffline 1, expected 0); root-cause it"
lane: qa
screens: [UF-03]
decisions: []
deps: []
status: doing
---
## Why
`tests/e2e/uf-03-list-summary.spec.ts` "T-0420 AC-7 UF-03.3 summary, offline" fails now and then on `expect(gate.writesFulfilledOffline()).toBe(0)` (line ~419): PR #56 run 37847552250 (passed on rerun, 8/8 locally) and PR #60 run 38513809352 (633 passed, this one failed). Two CI failures in a few days; it now blocks unrelated infra PRs.

## Scope
- In: find the root cause. Look at how `openSummaryOffline` / the offline gate in `tests/e2e/fixtures/offline.ts` counts "writes fulfilled offline", and at what writes the app can send between "Save workout" and the reload (queue flush on `online`/`visibilitychange`, the T-0906 offline-flush race, a write that is in flight when the gate flips). Decide whether the test or the app is wrong.
- If the cause is in the test or the fixture: fix it there. If it is an app bug (a write really goes out while offline), do NOT patch around it in the test: file a web follow-up ticket with the reproduction, and make the test fail deterministically for that bug.
- Never skip, disable or quarantine the test, and no timeout widening as the fix.

## Acceptance criteria
- AC1 The root cause is written in the build log with evidence (a trace, a timing log, or a deterministic reproduction), not "flaky".
- AC2 A deterministic reproduction exists (a test or a documented harness) that fails on the cause and passes on the fix, or the follow-up app ticket carries one.
- AC3 `uf-03-list-summary.spec.ts` passes `--repeat-each=100` with 2 workers under CPU load with 0 failures (or, if the cause is an app bug, the failure rate and the follow-up ticket are recorded).
- AC4 Other specs that use `writesFulfilledOffline` (uf-08-setup, uf-09-focus, fixture-guard) still pass.

## Paths you may change
- `tests/e2e/uf-03-list-summary.spec.ts`, `tests/e2e/fixtures/offline.ts` and its tests (`tests/e2e/fixture-guard.spec.ts`)
- This ticket file (build log).

## Contract impact
None.

## Definition of done
Gate green · full e2e suite green on the branch (shared fixture) · commits start with `T-0917`.

## Build / accept log
