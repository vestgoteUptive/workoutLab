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
