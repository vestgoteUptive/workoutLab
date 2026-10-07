---
id: T-0531
title: Account deletion must not race an in-flight cache refresh
lane: web-shell
screens: [UF-11.4]
decisions: [D-0195, D-0136]
deps: [T-0530]
status: todo
---

## Why
T-0530 added a cache-generation counter that sign-out bumps, so a refresh still in flight can't write the user's rows back after the clear. `wipe.ts` / `deleteAccountAndSignOut` have the same race but don't bump the counter. A refresh that resolves after the wipe can leave a deleted user's cached rows on the device.

## Acceptance criteria
- AC-1: `deleteAccountAndSignOut` (and `wipeLocalUserData`, if it's called separately) bumps the counter before the wipe and again after the server delete or `signOut` returns. Test: the refresh resolves after the wipe and writes nothing. A planted fault (no bump) fails it.
- AC-2: existing `lib/account` and `lib/offline` tests stay green, and the delete flow's behaviour is unchanged otherwise.

## Paths you may change
- `apps/web/src/lib/account/**`, `apps/web/src/lib/offline/**`

## Contract impact
None.

## Build / accept log
- Build (2026-10-07): `delete.ts` bumps `invalidateCacheWrites()` before the wipe and again after signOut/session-key removal; `wipeLocalUserData` bumps at start and end (covers a separate call). New `__tests__/delete.inflight.test.ts`.
- AC-1 -> delete.inflight.test.ts (refresh resolving after wipe, refresh started during signOut, wipe alone: all write nothing). AC-2 -> existing account+offline suites green (36 files, 339 tests).
- Planted fault (all bumps removed, backup copy restored by cp): 3 of 4 tests failed. Loop: 20 x the test file, 20/20 green.
- Gate: typecheck lint test --concurrency=1 green (first run hit an ENOENT in web test while my loop ran concurrently; rerun clean), format:check green, check-all rc printed above. No e2e.
