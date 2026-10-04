---
id: T-0485
title: "AutoSync: skip the mount flushNow() while navigator.onLine is false, like refreshAll beside it (hardening only; no e2e may rely on it)"
lane: web-shell
screens: []
decisions: [D-0175, D-0045, D-0104, D-0116, D-0158, D-0169]
deps: [T-0484]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner (D-0175 §4) from the "Optional product hardening" section
of docs/ci/CI-T-0906-uf03-list-view-offline-flush-race.md. Build flow: wl-build-web. About ¼ day.
Waits for T-0484: on today's main, T-0906's e2e assertion needs this very flush to happen. -->

## Why
`AutoSync` (`apps/web/src/lib/offline/AutoSync.tsx`) does two things on a signed-in mount:
- it runs `refreshAll` only `if (navigator.onLine)`;
- it calls `void handle.flushNow()` unconditionally.

On a real offline device that flush can't succeed. The fetch throws, `flush()` returns
`network-error`, and the `RetryScheduler` arms a backoff timer (2 s first). The `online` listener
`startSync` registers in the same call already covers the return of the network, and so does the
enqueue path (`sync.ts`, `if (stopped || !navigator.onLine) return`). This ticket makes the mount
path consistent with both. It saves one doomed request and one backoff timer per offline launch.

**This is hardening, not a fix.** The product is correct without it: rows stay queued offline
(NFR-OFF-2). The real guard for offline e2e specs is T-0484's `goOffline` write-abort gate. No
e2e test may depend on this guard. T-0484 AC-6.2 proves none does, and that is why this ticket
waits for T-0484. On today's `main`, T-0906's assertion
`expect.poll(() => counters.attemptsSinceArmed()).toBeGreaterThanOrEqual(1)` in
`uf-03-list-summary.spec.ts` passes *only* because this flush runs offline. Merged first, this
ticket would turn CI red (D-0175 §4).

## Scope
- In:
  - **`AutoSync.tsx`:** call `handle.flushNow()` only when `navigator.onLine` is `true` at mount,
    beside the existing `refreshAll` guard. `startSync({ tz })` is still called unconditionally.
    Its `online` listener, queue-write listener and auth listener are what flush once the device
    is back. The cleanup (`handle.stop()`) is unchanged.
  - **The comment** above the effect says why the mount flush is guarded and that the `online`
    event covers it (D-0045 §6, D-0116).
  - **A test** at `apps/web/src/lib/offline/__tests__/autosync-online-gate.test.tsx` (new).
- Out:
  - `sync.ts`, `flush.ts`, `retry.ts`. The scheduler, the backoff and the enqueue path are
    unchanged.
  - Any change to `refreshAll`'s guard or its best-effort handling (D-0104, `autosync-best-effort.test.tsx`
    stays unedited).
  - Any e2e spec. If a spec goes red because of this change, it was relying on the unguarded
    flush. That's a `needs-triage` against T-0484, not an edit here.
  - A `flushNow` guard inside `startSync` itself. Callers of `flushNow` that hold a promise
    (`settled()` in tests) keep today's behaviour.

### Edge cases that are in scope
- **Offline at launch, then online:** the queued rows flush on the `online` event (AC-2). Nothing
  waits for the next launch.
- **Online at launch:** unchanged. One mount flush (AC-1 pair).
- **Signed out:** unchanged. No `startSync`, no flush, no refresh (AC-3).
- **Returning after 10 days off, still offline:** the cached data shows (no refresh, no flush).
  The first `online` event sends everything queued.
- **`navigator.onLine` wrong in the "online" direction** (captive portal): unchanged from today.
  The flush is attempted and fails into backoff.
- **Time running out / zero history:** not applicable.

## Acceptance criteria
**Test setup.** jsdom with `vi.spyOn(navigator, "onLine", "get")`, `useAuth` mocked signed in,
as in `autosync-best-effort.test.tsx`. AC-1 and AC-3 mock `../sync.js` with a spied
`startSync` → `{ flushNow: vi.fn(() => Promise.resolve()), stop: vi.fn() }`. AC-2 uses the real
`startSync` with `../flush.js`'s `flush` spied (resolving `"empty"`), `../current-user.js`'s
`currentUserId` returning a fixed id (the scheduler skips `flush` without one),
`../../auth/client.js` mocked with an `auth.onAuthStateChange` that returns
`{ data: { subscription: { unsubscribe } } }`, and `../history.js`'s `refreshAll` stubbed. Each test title starts with `T-0485 AC-n`. Negative asserts wait at least
50 ms of real time.

- **AC-1 (offline mount: no flush).** Given `navigator.onLine` is `false`, when `<AutoSync />`
  mounts signed in, then `startSync` is called once, `flushNow` is called 0 times and
  `refreshAll` is called 0 times. **Pair:** with `navigator.onLine` `true`, `flushNow` is called
  exactly once and `refreshAll` once.
- **AC-2 (the online event still flushes).** Given the real `startSync`, `navigator.onLine`
  `false` and `<AutoSync />` mounted signed in, then after 50 ms `flush` has been called 0 times.
  When `navigator.onLine` becomes `true` and `window` dispatches `online`, then `flush` is called
  exactly once with the signed-in user id. **Contrast:** with `navigator.onLine` `true` at mount,
  `flush` is called once before any `online` event.
- **AC-3 (signed out unchanged).** Given `useAuth` returns `signed-out` and `navigator.onLine`
  either `true` or `false` (both values tested), `startSync` is never called.
- **AC-4 (fault proof).** The build log records the new AC-1 failing on unfixed `main`
  (`flushNow` called once offline). The planted fault "invert the guard (`!navigator.onLine`)"
  turns both AC-1 rows and AC-2's contrast red. Restore it from a `cp` backup.
- **AC-5 (no e2e depends on it).** Given T-0484 merged, the whole web e2e is green
  (`lib/**` changed outside a feature folder, D-0158). The log names
  `uf-03-list-summary.spec.ts`, `uf-09-offline.spec.ts` and `uf-09-focus.spec.ts` as passing.
  `autosync-best-effort.test.tsx` and `sync.triggers.test.ts` pass unedited.

## Paths you may change
- `apps/web/src/lib/offline/AutoSync.tsx`
- `apps/web/src/lib/offline/__tests__/autosync-online-gate.test.tsx` (new)
- `docs/tickets/T-0485-autosync-mount-flush-online-guard.md` (this file, for the build and
  accept logs)
- **Not yours:** `tests/e2e/**`, `apps/web/src/features/**`, the rest of `lib/offline`.

## Contract impact
None. No schema, API, engine or token change. The offline sync behaviour in
`docs/data-model.md` is unchanged, because rows stay queued until a flush succeeds.

## Definition of done
Every AC has a passing test or a recorded run (AC-4, AC-5). While working:
`scripts/locked.sh small npx vitest run <files>`. Once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and the **whole** web e2e under `scripts/locked.sh heavy`.
Contracts are unchanged. Commits start `T-0485`, for example
`T-0485: AutoSync skips the mount flush offline`.

## Notes
- **Flow:** `wl-build-web`.
- **Order:** after T-0484 (D-0175 §4). Also, T-0486 (web-shell, `doing`) is in the same lane.
  It touches `AccountDeletedNotice` only, but lanes run one ticket at a time.
- If the build finds any jsdom test that expects a mount flush while offline, that test is
  asserting the inconsistency this ticket removes. The build lists it in the log and raises a
  triage. It doesn't edit the test (never weaken a test).

## Build / accept log
Archived in `docs/tickets/log/T-0485.md` (D-0157).
