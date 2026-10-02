---
id: T-0385
title: "Flush soon after an online enqueue (upsertSession/recordSet/editSet/deleteSet); T-0303d AC-10 online back to the direct form"
lane: web-shell
screens: [UF-08.4, UF-09]
decisions: [D-0116, D-0112, D-0104, D-0045]
deps: [T-0303d]
status: ready
---
## Why
On a fully online workout the queued rows sit in IndexedDB until the next app open, `online`
event or token refresh (D-0112 Context). D-0116 adds the missing trigger. Each queue write
notifies the running sync handle, and the handle flushes 250 ms after the last notify. The T-0303d
e2e workaround (reload, then assert) can then go back to the direct assert. That edit is in this
ticket, not a separate follow-up, so main never carries a `pending: true` assert that the new flush
could race (D-0116 §6). That is also why this ticket runs after T-0303d.

## Scope
- In:
  - The notify in `lib/offline/queue.ts` for the four writes, after commit.
  - The subscription, the 250 ms trailing debounce, the single-flight rule and `stop()` cleanup
    in `lib/offline/sync.ts`.
  - Vitest tests under `lib/offline/__tests__/`.
  - The T-0303d AC-10 online rows in `tests/e2e/uf-08-setup.spec.ts`.
- Out:
  - Any UI.
  - Changes to the backoff, the `online` or auth triggers, `refreshAll`, or the
    `lib/offline/index.ts` export list.
  - Batching by session.

## Acceptance criteria
- AC1 Given `startSync` running, `navigator.onLine` true and fake timers, when `upsertSession(row)` resolves, then no flush has started at t = 249 ms, and exactly one `flush` runs at t = 250 ms and sends that row.
- AC2 Given the same setup, when `recordSet`, `editSet` and `deleteSet` resolve at t = 0, 50 and 100 ms, then exactly one flush starts, at t = 350 ms.
- AC3 Given the same setup and a `fetch` that never settles, when `upsertSession(row)` is awaited, then it resolves once IndexedDB commits, and no network request has been made by that point (the write never waits for the flush).
- AC4 Given `navigator.onLine` false, when `recordSet` resolves and 1 s passes, then no flush runs. Dispatching `online` then flushes exactly once, as today.
- AC5 Given no running handle (never started, or `stop()` called), when `upsertSession` resolves and 1 s passes, then no flush runs. Given a pending debounce, when `stop()` is called at t = 100 ms, then no flush runs at t = 250 ms.
- AC6 Given an enqueue-triggered flush that hangs, when another `recordSet` resolves and 1 s passes, then no second flush has started. When the first flush settles, exactly one more flush starts.
- AC7 Given the flush resolves `network-error`, when the enqueue flush runs, then the `RetryScheduler` schedules its 2 s retry (D-0045 §6) and this path adds no extra flush. Given the flush rejects, then no unhandled rejection is recorded and `settled()` resolves.
- AC8 Given the IndexedDB write rejects, when `recordSet` is called, then it rejects as today and no flush runs.
- AC9 Given the existing `lib/offline` tests, including the export-list pin and the T-0378 best-effort tests, when they run, then they pass unchanged.
- AC10 (e2e, T-0303d AC-10 online, D-0116 §6) Given the T-0303d online run (`/` → Start workout → chip 30 → Suggest → Looks good → Start), when Start is tapped, then within 5 s, with no reload, exactly one recorded `sessions` request carries that `id` with `time_budget_min` 30. The IndexedDB `pending: true` assert and the reload step are removed. The offline and Back rows are unchanged.

## Paths you may change
- `apps/web/src/lib/offline/**` (the lane: `web-shell`). The edits go in `queue.ts`, `sync.ts` and new tests under `__tests__/`.
- **Listed extras:**
  - `tests/e2e/uf-08-setup.spec.ts`: only the T-0303d AC-10 "Online" rows (drop the `pending: true` read and the reload, assert the send within 5 s of Start).
  - `docs/tickets/T-0385-flush-on-online-enqueue.md`: this file, for the accept log.

## Contract impact
none (D-0116 supersedes D-0112 §1 once this ticket lands)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0385` and cite screen IDs.

## Build log (2026-10-02, frontend-dev)
- **queue.ts.** A module-internal listener set: `onQueueWrite(listener) → unsubscribe` (exported from `queue.ts` for `sync.ts` only, not added to `index.ts`). `recordSet`, `editSet`, `deleteSet` and `upsertSession` call `notifyQueueWrite()` right after their `put()` resolves (the commit), so a failed write rejects as before and notifies nobody. A throwing listener is caught, so the write's promise depends on the IDB commit alone. In `upsertSession` the notify sits before `ensurePersistentStorage`, i.e. right after the session `put`.
- **sync.ts.** `startSync` subscribes. A notify while `navigator.onLine` is false, or after `stop()`, does nothing. Otherwise it (re)arms a 250 ms trailing `setTimeout`. When it fires, `enqueueFlush()` runs `scheduler.runNow()` (so `network-error` gets the existing `RetryScheduler` backoff) and `track()`s it (so `settled()` covers it and a rejection is swallowed). A flag keeps at most one enqueue flush in flight: a debounce that fires during one sets a "queued" flag, and exactly one more flush starts once the running one settles; that follow-up is part of the tracked promise. `stop()` sets `stopped`, clears the debounce and unsubscribes. Backoff, `online`/auth triggers, `refreshAll` and the export list are untouched.
- **Tests.** `lib/offline/__tests__/sync.enqueue-flush.test.ts`, 18 tests. Only `setTimeout`/`clearTimeout` are faked (fake-indexeddb runs on `setImmediate`); `flush` is wrapped around the real one to count starts; unhandled rejections are recorded per test and asserted empty after a real 50 ms wait. Both values: online (AC1, AC2, AC4 second row) and offline (AC4); running handle (AC1) and never-started/stopped (AC5, with a live-handle positive control); signed in (AC1) and signed out (AC5, the write rejects, no flush); in flight (AC6) and not in flight (AC6 second row); write OK and write rejects for sets and sessions (AC8).
- **Red on unfixed code.** With `HEAD`'s `sync.ts` + `queue.ts`: 12 of 18 red (every "a flush happens" row). Planted faults, each red, then reverted: fixed window instead of trailing (AC2), no single-flight (AC6), `stop()` keeps the debounce (AC5), ignores `navigator.onLine` (AC4), notify before the put (AC8), 0 ms debounce (AC1, AC2, AC5), no catch on the enqueue flush (AC7). e2e AC-10 online on unfixed code: red, `Expected: >= 1, Received: 0`, poll timed out with no reload.
- **AC-10 (e2e).** The online row drops the `pending: true` read and the reload. It takes `tappedAt` before Start, polls for a `sessions` request carrying the id for the rest of 5 s, asserts it was within 5 s, exactly one request, `time_budget_min` 30. The offline and Back rows are unchanged; the section comment above them now cites D-0116 instead of "the next AutoSync trigger (a reload)".
- **Runs.**
  - web `typecheck`, `lint` green; web `test`: 121 files, 1806 tests green (`lib/offline`: 20 files, 132 tests, existing ones unchanged, AC9).
  - e2e `offline`, `uf-08-setup`, `uf-09-focus`: 20 passed.
  - `-w format:check` clean; `check-all.mjs` exit 0.
