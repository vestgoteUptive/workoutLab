---
id: T-0530
title: Sign-out must not race an in-flight cache refresh
lane: web-shell
screens: [UF-11.4]
decisions: [D-0195]
deps: [T-0528]
status: doing
---

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
Archived in `docs/tickets/log/T-0530.md` (D-0157).
