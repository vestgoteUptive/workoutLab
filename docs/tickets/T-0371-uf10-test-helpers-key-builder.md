---
id: T-0371
title: UF-10 test-helpers.tsx builds its cache keys with userScopedKey / setKey from lib/offline/db.ts
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0091]
deps: [T-0370]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331), from a T-0370 follow-up. Build flow: wl-build-web. About ⅛ day. Test-only. Paths: features/UF-10/__tests__ only. No overlap with any other ticket in this groom. -->

## Why
`apps/web/src/features/UF-10/__tests__/test-helpers.tsx` `seedCache` builds four cache keys by hand with `` `${userId}:${…}` ``, around lines 60, 77, 98 and 102:

- `historyCache`
- `sets`
- `libraryCache`
- `targetCache`

T-0370 made `userScopedKey` in `lib/offline/db.ts` the one place that format lives, and `setKey` the set-queue form. If the format moves, this helper keeps seeding the old keys. The UF-10 loaders read by the `userId` index, so they would still pass, while any keyed `get` would miss. That is the drift D-0091 §1 warns about: seeded tests must test the cache shape that production writes.

## Scope
- In:
  - `seedCache` imports `userScopedKey` and `setKey` from `../../../lib/offline/db.js`. That module is already imported there, for `resetOfflineDbForTest`.
    - `historyCache`, `libraryCache` and `targetCache` keys use `userScopedKey(userId, …)`.
    - `sets` keys use `setKey(userId, spec.id)`.
  - One new test in `features/UF-10/__tests__/`, for example `test-helpers.test.ts`. It pins that the seeded keys are the production keys.
- Out:
  - `lib/offline/**`, which is the web-shell lane.
  - Any UF-10 screen or production file.
  - Other UF-10 tests. They pass unedited.

### Edge cases that are in scope
- **Offline / returning after 10 days off:** the UF-10 suites seed an offline cache. The key format is unchanged, so they behave the same.
- **Zero history:** `seedCache(db, {})` still writes nothing (AC-2).
- Time running out doesn't apply.

## Acceptance criteria
- **AC-1 (no hand-built keys).** `test-helpers.tsx`, with comments stripped, contains no `` `${…}:${…}` `` template literal and no `+ ":" +` concatenation. It contains `userScopedKey(` and `setKey(`. A source test in the new test file checks both.
- **AC-2 (seeded keys are production keys).** Given a fresh offline DB, when `seedCache(db, …)` runs with `userId: "u1"`, one set `S-1`, one queued set `Q-1`, a library exercise `back-squat` and a target `chest`, then each of these returns the seeded row:
  - `db.historyCache.get(userScopedKey("u1", "S-1"))`
  - `db.sets.get(setKey("u1", "Q-1"))`
  - `db.libraryCache.get(userScopedKey("u1", "back-squat"))`
  - `db.targetCache.get(userScopedKey("u1", "chest"))`

  Given `seedCache(db, {})`, the four tables are empty.
- **AC-3 (behaviour unchanged).** Every existing UF-10 test passes unedited. These include `balance.render.test.tsx`, `balance.engine.test.tsx`, `qa-real-path.test.tsx`, `mount-stability.test.tsx` and `never-in-workout.test.tsx`.
- **AC-4 (drift proof, recorded).** Change `userScopedKey`'s separator in `lib/offline/db.ts` to `"|"`, without committing. AC-2 still passes, because the helper follows the builder. Then also restore one hand-built key in the helper. AC-2 now fails for that table. Record both runs in `testsRun` and revert. `git diff main -- apps/web/src/lib` must be empty.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/features/UF-10/__tests__/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `docs/tickets/T-0371-uf10-test-helpers-key-builder.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with a recorded run for AC-4 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0371` and cite `UF-10.1` (for example `T-0371 UF-10.1: seed cache keys via userScopedKey`).

## Notes
- **Flow:** `wl-build-web`. This ticket doesn't touch `profile-gate.test.tsx` or `auth-guard.test.tsx`.

## Build / accept log
Archived in `docs/tickets/log/T-0371.md` (D-0157).
