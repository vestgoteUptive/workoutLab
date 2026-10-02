---
id: T-0378
title: Stop the signed-in shell's background cache refresh from raising an unhandled rejection when a Supabase read fails; degrade to the cached data
lane: web-shell
screens: [UF-02.1]
decisions: [D-0104, D-0045, D-0067]
deps: []
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331), from a T-0301d QA follow-up. Build flow: wl-build-web. About ¼ day. Paths: lib/offline only, so no overlap with T-0331. T-0301c's signed-in e2e relies on this, so T-0301c should list T-0378 as a dep. -->

## Why
Once a user is signed in, `lib/offline/AutoSync.tsx` calls `void refreshAll(new Date(), tz)`. `refreshAll` is a `Promise.all` of seven refreshes, and each one `throw`s its Supabase `error`. When any read fails, the rejection is unhandled. That can be `session_sets_live`, `exercises`, `area_targets`, or any of the others. In the browser it surfaces as a `pageerror` (T-0301d QA), and real users see it on flaky networks.

The backoff timer in `lib/offline/retry.ts` has the same shape: `void this.runNow()`.

The app is offline-first, so a failed background refresh must leave the cached data on screen and stay silent (D-0104).

## Scope
- In:
  - `AutoSync.tsx`: the `refreshAll(...)` call gets a rejection handler that swallows the error (D-0104 §2).
  - `retry.ts`: the timer's `runNow()` gets a rejection handler. A rejection doesn't change `delayMs` or schedule another timer (D-0104 §3).
  - New Vitest tests in `apps/web/src/lib/offline/__tests__/`.
- Out:
  - `refreshAll`'s own contract. It still rejects (D-0104 §1). The awaiting callers in `features/UF-04/data.ts` and `features/UF-10/use-balance.ts` stay unchanged.
  - `components/offline-status/OfflineStatus.tsx` (`loadLastSyncedAt` is a Dexie read, not Supabase). If it needs the same guard, that's a follow-up.
  - Any e2e change. `tests/e2e/**` is the qa lane, and T-0301c's signed-in e2e is the end-to-end proof.
  - Any user-visible change: no toast, no banner, no new string.

### Edge cases that are in scope
- **Offline / flaky network:** a read fails mid-refresh. The cached rows for that table stay, and the other tables still refresh (AC-2).
- **Returning after 10 days off:** the first online start after a long gap makes every read at once. One failure must not cost the user the rest (AC-2).
- **Zero history:** the empty cache stays empty. The screens already show their empty states, and nothing throws (AC-1).
- **Time running out:** doesn't apply. Nothing new is awaited, and the refresh was never on the render path.

## Acceptance criteria
Tests use `fake-indexeddb` (from `vitest.setup.ts`) and the `select-spy.ts` pattern for `supabase.from`. "No unhandled rejection" is observed with a `process.on("unhandledRejection", …)` listener that is added in the test and removed afterwards. The test asserts that the listener got 0 calls after the work settles, after at least two macrotask turns (`await new Promise(r => setTimeout(r, 0))` twice). Vitest's own unhandled-error failure also counts as a failure.

- **AC-1 (AutoSync: a failed read doesn't throw).** Given a signed-in `useAuth()` (`status: "signed-in"`, a stored session with `user.id = "u1"`), `navigator.onLine = true`, and `supabase.from("area_targets")` answering `{ data: null, error: { message: "boom", code: "501" } }` with every other table answering `{ data: [], error: null }`, when `<AutoSync />` mounts and the work settles, then:
  - the `unhandledRejection` listener has 0 calls;
  - `console.error` has 0 calls (spied).
- **AC-2 (degrade: the cache is kept and the others still refresh).** Seed the cache for `u1` first:
  - one `targetCache` row (chest, 20);
  - one `libraryCache` row (`back-squat`).

  Then mount AutoSync under the same AC-1 conditions, with `exercises` answering one row (`leg-press`, with its area rows). After the work settles:
  - `loadTargets()` for `u1` still returns the chest 20 row;
  - `loadLibrary()` for `u1` returns `leg-press`.

  Run a second variant where *every* table fails. Then both seeded rows are still there, and the listener has 0 calls.
- **AC-3 (the retry timer doesn't throw).** Given a `RetryScheduler` whose `run` resolves `"network-error"` on the first call and rejects `new Error("refetch failed")` on the second, with fake timers, when `runNow()` is awaited and the timer is advanced by 2000 ms, then:
  - the listener has 0 calls;
  - `currentDelayMs` is 4000, the value after one scheduled retry, unchanged by the rejection;
  - no further timer is pending (`vi.getTimerCount()` is 0).
- **AC-4 (`refreshAll` still rejects).** Given `area_targets` failing as in AC-1, when `await refreshAll(NOW, TZ)` is called directly, then it rejects. This pins D-0104 §1 for the UF-04 and UF-10 callers.
- **AC-5 (fault proof, recorded).** Remove the handler in `AutoSync.tsx`: AC-1 fails. Remove the handler in `retry.ts`: AC-3 fails. Record each in `testsRun` and revert both.
- `pnpm -w typecheck lint test` is green. The existing `lib/offline` suites and `features/UF-04` and `features/UF-10` pass unedited.

## Paths you may change
- `apps/web/src/lib/offline/**` (the lane: `web-shell`). The edits go in `AutoSync.tsx`, `retry.ts`, and new test files under `__tests__/`. The existing helpers stay backwards-compatible.
- **Listed extras:**
  - `docs/tickets/T-0378-background-refresh-no-unhandled-rejection.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with a recorded run for AC-5 · `pnpm -w typecheck lint test --force --concurrency=1` green · `check:size` green, because AutoSync is the lazy chunk · contracts unchanged · commits start `T-0378` and cite `UF-02.1` (for example `T-0378 UF-02.1: background refresh degrades instead of throwing`).

## Notes
- **Flow:** `wl-build-web`.
- **For the orchestrator:** T-0301c's signed-in e2e (AC-14a/b) expects no `pageerror`. Run T-0378 before T-0301c.

## Build / accept log
Archived in `docs/tickets/log/T-0378.md` (D-0157).
