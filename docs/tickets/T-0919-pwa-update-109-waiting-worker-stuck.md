---
id: T-0919
title: "pwa-update.spec.ts:109 is still about 1% flaky after T-0915: the adopted worker gets SKIP_WAITING but stays waiting; investigate registration.update() racing the test's register('/sw.js?t0552=2')"
lane: qa
screens: [UF-04]
decisions: []
deps: [T-0918]
status: todo
---
## Why
T-0916 found a second flake: T-0915's adopt path works and SKIP_WAITING is posted, yet Chromium leaves the worker waiting, and a resend 3 s later doesn't help. About 1% of runs.

## Scope
- In: `tests/e2e/pwa-update.spec.ts`. Find the root cause. If the cause is in app code, file a web-shell follow-up.
- Out: widening timeouts.

## Acceptance criteria
- AC1 The root cause is in the log, and the fix is either applied in the spec or filed.
- AC2 `pwa-update.spec.ts` passes `--repeat-each=300`.

## Paths you may change
- `tests/e2e/pwa-update.spec.ts`

## Contract impact
None.

## Definition of done
check-all green · commits start with `T-0919`.

## Build / accept log
