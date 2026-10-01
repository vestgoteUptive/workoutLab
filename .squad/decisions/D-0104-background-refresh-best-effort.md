---
id: D-0104
title: "Background cache refreshes are best-effort: a fire-and-forget refresh that fails is caught at its call site, keeps the previous cache, and never becomes an unhandled rejection"
status: revisit
date: 2026-10-01
by: product-owner (groom T-0378)
area: web
builds-on: D-0045 §6–§7, D-0067, T-0300c AC-C20
---
## Context
`lib/offline/AutoSync.tsx` starts `refreshAll(new Date(), tz)` with `void` once signed in and
online. `refreshAll` is a `Promise.all` over seven refreshes, and each one `throw`s its Supabase
`error`. When any read fails (a 501 from the e2e fixture for an unmocked table, a 5xx, an RLS
error, a network drop mid-request), the rejection is unhandled. In the browser that shows up as a
Playwright `pageerror` (T-0301d QA). T-0301c's signed-in e2e would hit this, and so would real
users on flaky networks.

The `RetryScheduler` timer in `lib/offline/retry.ts` also calls `void this.runNow()`. If its
`run()` rejects, for example because `flush`'s `onSynced` refetch fails, that rejection is unhandled
too.

The awaiting callers are `features/UF-04/data.ts` (`.then(done, done)`) and `features/UF-10/use-balance.ts`
(`withCap`). They already handle the rejection and rely on `refreshAll` rejecting.

## Decision
1. **`refreshAll`'s contract stays the same.** It still rejects when any refresh fails, and
   awaiting callers are unchanged.
2. **Fire-and-forget call sites catch.** The two call sites are `AutoSync`'s `refreshAll` and
   `RetryScheduler`'s timer `runNow`.
   - Each attaches a rejection handler that swallows the error.
   - A failed refresh leaves the previous cache rows for that table in place. The refreshes
     already write each table in its own Dexie transaction after its own read, so this needs no
     new code.
   - The other refreshes in the same `Promise.all` still finish their writes.
   - There is no `console.error`. A `console.warn` is allowed, but tests don't require it.
3. **The retry schedule doesn't change.** A rejection from the timer's `runNow` doesn't schedule
   an extra retry. The sync queue's own backoff (D-0045 §6) stays the only retry policy.
4. **No user-facing change.** The offline status (NFR-OFF-6) already says what the user needs.
   No toast and no banner.

## Consequences
- T-0378 implements §2 with Vitest tests in `lib/offline/__tests__/`.
- T-0301c's signed-in e2e no longer needs to mock every AutoSync read just to avoid a
  `pageerror`. It still mocks the reads its own assertions depend on.
- T-0327's rule ("a third unmocked-table failure → default unmocked reads to `200 []`") is
  unaffected. This decision removes the crash, not the 501.

## Revisit when
- A user-visible "last refresh failed" state is designed. Then the catch should record the failure
  instead of dropping it.
- A second fire-and-forget refresh call site appears. Then wrap `refreshAll` in one exported
  `refreshAllInBackground()` instead of adding a third catch.
