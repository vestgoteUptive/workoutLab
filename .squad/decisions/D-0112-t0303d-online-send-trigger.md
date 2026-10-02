---
id: D-0112
title: T-0303d AC-10 online — the session row is sent at the next AutoSync trigger (a reload), not "within 5 s of Start"; flush-on-enqueue is a web-shell follow-up
status: revisit
date: 2026-10-02
by: triage (check of groom t/groom-0303b-0304a)
area: process
builds-on: D-0110 §5, D-0045 §6, D-0108 §2
---
## Context
T-0303d AC-10 (online) says: after Start, "within 5 s the recorded `sessions` request contains a row with that `id`". Nothing in `lib/offline` sends a row that soon after an online enqueue:
- `upsertSession` (`lib/offline/queue.ts`) writes IndexedDB and returns. It never calls a flush.
- `startSync` (`lib/offline/sync.ts`) flushes only on an `online` event, a supabase-js `SIGNED_IN`/`TOKEN_REFRESHED` event, or `flushNow()`.
- `AutoSync` (`lib/offline/AutoSync.tsx`) calls `flushNow()` once, when it mounts. It is mounted once, at app level (`app/App.tsx` `AutoSyncGate`). A client-side `navigate("/session/<id>")` doesn't remount it.
- `RetryScheduler` sets a timer only after a `network-error` outcome.

So on an online run the row stays `pending: true` until the next trigger. The 5 s assert would fail, or pass only by chance (a token refresh). T-0303d can't fix this: `lib/offline/**` is web-shell's and is excluded from its paths. D-0110 §5 ("the AutoSync queue flushes the row later") is accurate, but it doesn't say when.

## Decision
1. **T-0303d AC-10 online assert.** After Start, the spec asserts that IndexedDB `wl-offline.sessions` holds the id with `pending: true`. It then reloads the page, which mounts AutoSync and runs its `flushNow()`. Within 5 s of the reload it asserts that exactly one recorded `sessions` request carries that `id` and `time_budget_min` 30. The spec must not depend on a send before the reload, and must not assert that one is absent.
2. **The offline row is unchanged.** Going online fires the `online` event, which flushes. "Exactly one `sessions` request carrying that id" stays.
3. **D-0110 §5, clarified.** "Later" means the next AutoSync trigger: app mount/reload, the `online` event, or a `SIGNED_IN`/`TOKEN_REFRESHED` auth event. Start itself makes no fetch (unchanged).
4. **Follow-up (web-shell, not this groom).** Flush soon after an enqueue while online, for `upsertSession`, `recordSet`, `editSet` and `deleteSet`. Today a fully online workout's sets reach the server only at the next app open, reconnect or token refresh. The ticket that adds this updates T-0303d AC-10 back to the direct form.

## Consequences
- The product owner amends T-0303d AC-10 (online) on the groom branch to match §1 before T-0303d becomes ready.
- T-0304a is unaffected. Its e2e writes no rows.

## Revisit when
- The web-shell flush-on-enqueue ticket lands. Then §1 can assert the send without a reload.
