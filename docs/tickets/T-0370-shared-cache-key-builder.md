---
id: T-0370
title: One user-scoped cache key builder in `lib/offline/db.ts`, used by every cache write and read in `lib/offline` and by the `seedLibrary` test helper
lane: web-shell
screens: [UF-04.1, UF-04.2, UF-04.3]
decisions: [D-0045, D-0088, D-0091]
deps: [T-0365]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (T-0365 review/accept follow-up, low). Build flow: wl-build-web. About ⅛ day. Web-shell: don't run in parallel with T-0366 or any other web-shell ticket. -->

## Why
`refreshLibrary()` writes `libraryCache` rows keyed `` `${userId}:${mapped.id}` `` (`lib/offline/history.ts:143`). The T-0365 helper `lib/offline/__tests__/seed-library.ts` builds the same string by hand. If the key format ever changes in production, the seed keeps writing the old format. `loadLibrary()` reads by the `userId` index, so it would still find the seeded rows, while a `get(key)` would miss them. Seeded tests (D-0091 §1) would then test a cache shape that production no longer writes. The same template appears five more times in `history.ts` and once in `feature-loaders.ts` (`exerciseDetails.get`). `db.ts` already has `setKey(userId, clientId)` with the same format, for the set queue. One builder removes the drift.

## Scope
- In:
  - `lib/offline/db.ts` exports `userScopedKey(userId: string, id: string): string`, which returns `` `${userId}:${id}` ``. `setKey` stays exported, with the same signature, and returns `userScopedKey(userId, clientId)`.
  - Every `` `${userId}:${…}` `` key in the non-test files of `apps/web/src/lib/offline/` uses `userScopedKey`: `history.ts` (library at today's line 143, exercise details at 157, and the keys at 190, 218, 255 and 280) and `feature-loaders.ts:37`.
  - `lib/offline/__tests__/seed-library.ts` uses `userScopedKey`.
- Out:
  - The key format itself. It stays `userId:id`, and no Dexie version bump is needed.
  - Test files that build `` `${USER}:${clientId}` `` for the set queue (`queue.*.test.ts`, `flush.test.ts`, `sync.triggers.test.ts`, `upgrade-v1-to-v2.test.ts`). They may stay. Moving them is optional, and only through `setKey`.
  - `features/UF-10/__tests__/test-helpers.tsx`, which duplicates the template. That file belongs to another lane, so it is a follow-up.

### Edge cases that are in scope
- **Offline / returning after 10 days off:** an existing IndexedDB written by today's code must still be read. The format is unchanged, so AC-3 proves it with rows written by a literal key.
- Time running out and zero history don't apply.

## Acceptance criteria
- **AC-1 (the builder)** `userScopedKey("u1", "back-squat")` is `"u1:back-squat"`. `setKey("u1", "c-1")` is `"u1:c-1"`. Both are unit-tested in `lib/offline/__tests__/`.
- **AC-2 (one place)** A source test reads every `.ts` file directly under `apps/web/src/lib/offline/` (excluding `__tests__/`) and `lib/offline/__tests__/seed-library.ts`, strips `//` and `/* */` comments (both `db.ts:40` and `seed-library.ts:2` quote the format in a comment), and finds no template literal matching `` /`\$\{\w+\}:\$\{/ ``. A non-vacuity check asserts that `db.ts` itself contains exactly one such template (inside `userScopedKey`), and that `history.ts`, `feature-loaders.ts` and `seed-library.ts` each reference `userScopedKey`.
- **AC-3 (behaviour unchanged)** The existing `lib/offline` suite passes unedited: `history.test.ts`, `feature-cache.test.ts`, `sessions-cache.test.ts`, `user-isolation.test.ts`, `upgrade-v1-to-v2.test.ts` and the queue tests. So do `app/__tests__/auth-guard.phase3.test.tsx` (the T-0365 seeded UF-04.3 case) and the UF-04 feature tests. One new test pins that the on-disk format didn't move:
  - It writes a `libraryCache` row with the literal key `"u1:back-squat"` and checks that `loadLibrary()` for `u1` finds it.
  - It writes an `exerciseDetails` row with the literal key `"u1:back-squat"` directly to Dexie, and checks that the `feature-loaders` detail read, which does a `get` by key, returns it.

  `loadLibrary()` reads through the `userId` index and would still pass if the format moved. The keyed `get` on `exerciseDetails` is what catches it.
- **AC-4 (drift proof, recorded)** Change `userScopedKey`'s separator to `"|"` (uncommitted).
  - Still passes: the T-0365 case in `auth-guard.phase3.test.tsx`, because seed and production agree.
  - Fails: AC-1, and AC-3's `exerciseDetails` literal-key `get`, because the format is pinned. Record the command and the results in `testsRun`, then revert.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/lib/offline/**` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0370-shared-cache-key-builder.md`: this file, for the accept log.

## Contract impact
None. `docs/data-model.md` doesn't describe the IndexedDB cache, and the key format is unchanged.

## Definition of done
Tests for every AC pass, or a recorded run for AC-4 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0370` and cite `UF-04.1` where relevant.

## Follow-ups to file
- web-feature:UF-10: `features/UF-10/__tests__/test-helpers.tsx` builds `` `${userId}:${…}` `` by hand for `libraryCache`, `targetCache` and two other caches. Switch it to `userScopedKey` after T-0370.

## Accept log
- 2026-10-01, product-owner: **done** at 8ffd961 (`t/T-0370-shared-cache-key`, `lib/offline/**` only).
  - AC-1: `key-builder.test.ts` (`userScopedKey`, `setKey`).
  - AC-2: `key-builder-source.test.ts` (comment-stripped scan; non-vacuity for `db.ts` exactly one, plus references in `history.ts`, `feature-loaders.ts` and `seed-library.ts`).
  - AC-3: existing suites unedited and green (781/781). The new literal-key tests cover `libraryCache` via `loadLibrary()` and `exerciseDetails` via the keyed `get` in `feature-loaders`.
  - AC-4: QA moved the separator to `"|"`. 9 tests in 4 files failed, including AC-1, the AC-3 keyed `get` and the queue/flush tests. The T-0365 seeded case still passed. The change was reverted.
  - DoD: root `pnpm -w typecheck lint test --force --concurrency=1` passed 19/19. Contracts unchanged. Review APPROVE.
  - Residual: the AC-2 scan catches only template literals with bare identifiers. String concatenation and member expressions slip past it. This is outside the AC's letter and is filed as a follow-up.
