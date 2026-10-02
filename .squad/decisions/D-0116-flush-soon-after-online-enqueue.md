---
id: D-0116
title: "Flush soon after an online enqueue: the four queue writes notify the running sync handle, which flushes after a 250 ms trailing debounce, with at most one such flush in flight; T-0303d AC-10 online returns to the direct form"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0385)
area: web
supersedes: D-0112 §1 (once T-0385 lands; the rest of D-0112 stays as history)
builds-on: D-0112 §3–§4, D-0045 §6, D-0104
---
## Context
D-0112 §4 asks for a web-shell follow-up. Today, `upsertSession`, `recordSet`, `editSet` and
`deleteSet` (`lib/offline/queue.ts`) write IndexedDB and return. Nothing flushes until the next
AutoSync mount, `online` event or `SIGNED_IN`/`TOKEN_REFRESHED`. A fully online workout therefore
reaches the server only on the next app open. The T-0303d e2e has to reload to see its row
(D-0112 §1).

## Decision
1. **Notify after commit.** Each of the four writes notifies the running sync handle once its
   IndexedDB transaction has committed. A write that fails sends no notification and rejects as it
   does today. The writes' returned promises never include the flush: they resolve when IndexedDB
   commits, never after the network (NFR-OFF). The mechanism is module-internal (for example a
   listener set in `queue.ts` that `startSync` subscribes to and `stop()` unsubscribes from). It
   is not added to the `lib/offline/index.ts` export list.
2. **When it flushes.** The flush starts only when a handle is running (signed in, D-0113's
   condition, through `AutoSync`) and `navigator.onLine` is true at notify time. It goes through
   the handle's `flushNow()`, so `settled()` covers it, and runs **250 ms after the last notify**
   (trailing debounce). A burst inside the window gives one flush.
3. **No concurrency added.** At most one enqueue-triggered flush is in flight. A notify that arrives
   while one is running queues exactly one more flush, which starts after the running one
   settles. Other triggers (`online`, auth events, mount) are unchanged.
4. **Offline, signed out, failures.**
   - Offline at notify time: nothing happens, and the `online` event flushes as today.
   - No running handle: nothing happens.
   - `network-error`: the existing `RetryScheduler` backoff takes over (D-0045 §6).
   - `blocked-auth`: no extra retry.
   - A rejection is swallowed (D-0104).
   - `stop()` cancels a pending debounce.
5. **No UI.** No toast, no spinner, nothing on UF-09 (principle 1).
6. **T-0303d AC-10 online, direct form.** After Start, with no reload, exactly one recorded
   `sessions` request carries that `id` with `time_budget_min` 30 within 5 s of the Start tap. The
   IndexedDB `pending: true` assert is dropped, because it would race the flush. The offline rows
   are unchanged. T-0385 makes this spec edit itself (a listed extra) and runs after T-0303d, so
   main never has a window where the old `pending: true` assert can flake.

## Consequences
- T-0385 implements §1 to §6. It depends on T-0303d and doesn't run in parallel with any ticket
  that lists `tests/e2e/uf-08-setup.spec.ts`.
- D-0112 §1 no longer applies once T-0385 is merged.

## Revisit when
- A workout produces enough writes that a 250 ms debounce sends noticeably many requests. Then
  widen the window or batch by session.
- A "synced" indicator per set is designed.
