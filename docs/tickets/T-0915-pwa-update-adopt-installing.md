---
id: T-0915
title: "lib/pwa/update.ts adopts registration.installing in watch() and re-adopts waiting/installing on every check() (pwa-update.spec.ts:109 flake)"
lane: web-shell
screens: [UF-04]
decisions: []
deps: []
status: todo
---
## Why
Diagnosis: `docs/ci/CI-T-0914-*.md`, failure 2. A worker that is still installing when `watch()` attaches is never adopted, and a later resume can't recover it. Flaky (1 in 60 CI runs) and not caused by recent changes.

## Scope
- In (`apps/web/src/lib/pwa/**`): `watch()` adopts `registration.installing`. Every `check()` re-adopts `waiting`/`installing`, deduped with a WeakSet.
- Out: the e2e timeouts. Don't widen them.

## Acceptance criteria
- AC1 Unit test: a worker installing before `watch()`, with no `updatefound` event, reaches waiting, then a resume applies it with one reload.
- AC2 Unit test: a waiting worker found on resume via `check()` is applied once (the dedupe holds; no double reload).
- AC3 `pwa-update.spec.ts` passes `--repeat-each=20`.

## Paths you may change
- `apps/web/src/lib/pwa/**`

## Contract impact
None.

## Definition of done
Gate green · green draft-PR CI · commits start with `T-0915`.

## Build / accept log
Archived in `docs/tickets/log/T-0915.md` (D-0157).
