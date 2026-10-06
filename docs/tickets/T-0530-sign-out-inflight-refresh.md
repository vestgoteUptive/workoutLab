# T-0530: sign-out must not race an in-flight cache refresh

- Lane: web-shell
- Depends on: T-0528
- Source: T-0528 code review follow-up (D-0195)

## Why
`signOutAndClearDevice` (T-0528) clears this user's cache rows. A cache refresh started before sign-out (`lib/offline/sync.ts`, driven by `onAuthStateChange`) can resolve after the clear and write the user's rows back, so their data stays on the device after sign-out.

## Acceptance criteria
- AC-1: A refresh in flight when sign-out starts never writes cache rows after the clear finishes. Either cancel it, or wait for it to settle before clearing. Prove it with a test where the refresh's fetch resolves after the clear; on a planted fault (no cancel/wait) the test fails.
- AC-2: A refresh that settles after sign-out does not throw an unhandled error.
- AC-3: Existing `lib/offline` and `lib/account` tests stay green.

## Paths you may change
- `apps/web/src/lib/offline/**`, `apps/web/src/lib/account/**`

## Contract impact
None.

## Build / accept log

### Build log (frontend-dev)
- Fix: generation counter (`lib/offline/cache-generation.ts`). Each `refresh*` in `history.ts` reads it before its fetch and re-checks it at the start of its write transaction (or right before the single `profileCache.put`); `signOutAndClearDevice` bumps it first. A stale refresh returns quietly (no throw, no write). Chosen over cancel/await: no fetch abort plumbing, no hang if a fetch stalls offline, and the check inside the IDB transaction is ordered against the clear's transaction.
- AC-1/AC-2 -> `account/__tests__/sign-out.inflight.test.ts` (history transaction path, profile put path, unhandledRejection listener); a post-sign-out refresh still writes (extra test). AC-3 -> `vitest run src/lib/account src/lib/offline`: 35 files, 316 tests green.
- Planted fault (bump removed from sign-out.ts, restored from backup): 2 of 3 tests fail. Repeat: 20 runs, 0 failures.
