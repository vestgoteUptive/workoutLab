---
id: T-0431
title: "loadSessions (D-0151): a flushed queued session row defers to a cache refreshed after its flush, and an absent queued ended_at key has no say in the finish"
lane: web-shell
screens: [UF-03.3]
decisions: [D-0151, D-0148, D-0053, D-0045, D-0058]
deps: [T-0324]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. From the T-0324 review. D-0151 (written in this groom) amends D-0148. Build flow: wl-build-web. About ½ day. T-0324 is done, so this is ready now. Its paths are apps/web/src/lib/offline/**, which T-0420 (UF-03, being built) only imports, so the two can run in parallel. -->

## Why
- **D-0151 Context:** a flushed queued row (`pending: false`, kept for the D-0053 §7 `finished`
  marker) is never dropped. Under D-0148 §3 it beats the cached row at an equal `ended_at`
  forever. So a rating that was cleared or changed on another device, and that a refresh has
  already pulled into the cache, reappears on this device.
- **D-0151 §6:** a queued row with no `ended_at` key counts as `ended_at: null` today. A later
  cached finish then replaces a present queued `effort_rating`, which the server upsert would
  have written (D-0045 §6).
- **Must keep:** the T-0420 Save (UF-03.3) re-sends the stored `ended_at` with a new or cleared
  rating. That save must win at an equal instant while it is pending, after its flush, and until
  a refresh brings the server row back.
- **Principle 4 (adaptive targets):** UF-11 reads `effortRating` through this loader, so a stale
  rating feeds the check-in.

## Scope
- In (D-0151 §1–§6):
  - `apps/web/src/lib/offline/db.ts`: `QueuedSession.cacheCurrent?: true` (optional and
    non-indexed, so there is no Dexie version bump), with a doc comment citing D-0151.
  - `apps/web/src/lib/offline/history.ts` `refreshSessions`:
    - take a snapshot of this user's `pending: false` entries before the `select`;
    - after a successful `select`, in one `rw` transaction over `sessionCache` and `sessions`,
      replace the cache and mark each snapshotted entry that is still `pending: false` and still
      structurally equal (`row` and `finished`, the T-0411 `sameValue` compare; export or move it
      from `flush.ts`).
  - `apps/web/src/lib/offline/feature-loaders.ts` `loadSessions`: the marked-entry rule (§4) and
    the absent-`ended_at` rule (§6). Update the doc comment.
  - New tests in `apps/web/src/lib/offline/__tests__/sessions-merge-flushed.test.ts`, on the
    `sessions-merge.test.ts` harness. A `hold(table)`/`release(table)` pair may be added to
    `__tests__/select-spy.ts` for AC-4.
- Out:
  - Any change to D-0148 §1–§5 for unmarked entries, `syncStatus`, or which entries
    `flushSessions` sends.
  - Cache fetch timestamps or a server `updated_at` (the D-0151 revisit trigger).
  - UF-03 code (T-0420 owns it) and `docs/data-model.md`.

### Edge cases that are in scope
- **Offline:** a refresh that fails (offline or an error) marks nothing (AC-4).
- **Coming back after 10 days off:** an entry flushed before the break is marked by the first
  refresh after it, so the other device's newer rating shows (AC-1).
- **Older build:** an entry without the field reads as unmarked (AC-2).
- **Zero history:** no cached row for the id means the queued row is used as is (AC-4).

## Acceptance criteria
**Test setup.** The `sessions-merge.test.ts` harness: fake-indexeddb, the select-spy supabase
mock, `signIn(USER_A)`, NOW `2026-09-27T10:00:00.000Z`, TZ `Europe/Stockholm`, S1 starts
`2026-09-17T09:00:00.000Z` with a 45-minute budget. "Flush S1" means writing the entry as the
flush does (`{...current, pending: false}`), or calling the real flush with an upsert stub. "A
refresh" means `spy.setRows("sessions", […])` followed by `refreshSessions(NOW, TZ)`. E = `2026-09-17T10:40:00.000Z`.

**Test rules.** Both values of every binary condition get a test. AC-1 and AC-5 are red on main
(the expected value differs from what main returns). The build log records each planted fault
below turning its AC red, applied alone and then reverted:
- defer on any `pending: false`, ignoring the mark (AC-2 red);
- never set the mark (AC-1 red);
- mark without the structural compare (the AC-4 re-queued-and-flushed case red);
- `row.ended_at ?? null` kept for an absent key (AC-5 red).

- **AC-1 (a flushed, then refreshed entry defers to the cache, D-0151 §2 §4; red on main)**
  - Given a flushed S1 entry with `ended_at` E and `effort_rating` 3, when a refresh returns S1 at
    E with `effort_rating: null`, then `loadSessions()` gives S1 `endedAt` E and `effortRating`
    `null`. The stored entry has `cacheCurrent: true`. Main gives 3.
  - **The pair.** The same refresh returning `effort_rating: 5` gives 5 (main gives 3).
  - **Other fields.** The refresh returns `energy: "high"` and `time_budget_min: 30` against the
    queued `"normal"` and 45: the loader gives `"high"` and 30.
- **AC-2 (a cache older than the flush doesn't win, D-0151 §5)**
  - Given a refresh with S1 at E / 3, then a flushed entry at E / `null` written after it, the
    loader gives `null` (the entry is unmarked).
  - **The T-0420 sequence.** A flushed S1 at E / 3, then a refresh at E / 3 (marked), then
    `upsertSession({...row, effort_rating: null})` gives `null`, and the entry has no
    `cacheCurrent`. Flush S1: still `null`, still no `cacheCurrent`. A refresh at E / `null`:
    still `null`. The same sequence with `effort_rating: 4` gives 4 at every step.
  - **An older build.** A `pending: false` entry with no `cacheCurrent` field, under a refresh at
    E / 5 written before it, gives its own value (D-0148 §3).
- **AC-3 (a finish never disappears under the mark, D-0151 §4, D-0053 §7)** A flushed S1 at E / 3,
  then a refresh returning S1 with `ended_at: null` and `effort_rating: 2`, gives `endedAt` E and
  `effortRating` 2. **The pair:** a refresh at `2026-09-17T10:50:00.000Z` / 2 gives `endedAt`
  10:50 and 2.
- **AC-4 (the scope of the mark, D-0151 §2 §3)**
  - **A failed refresh** (`spy.fail("sessions", …)`) leaves the entry unmarked and the loader at
    3.
  - **A pending entry** (`pending: true`, E / 3) is never marked by a refresh at E / `null`, and
    the loader gives 3 (D-0148 §3).
  - **Re-queued during the request.** With the `select` held, `upsertSession` re-queues S1 at E /
    4, the select is released, and the entry ends up `pending: true` with no mark (loader 4).
  - **Re-queued and flushed during the request.** The same, and also flushed before the release:
    the entry is `pending: false` and unmarked (loader 4). This is the structural-compare case.
  - **Another user.** USER_B's flushed S1-B entry is untouched by USER_A's refresh.
  - **No cached row.** A marked entry whose id the refresh didn't return is used as is (D-0148
    §5): E / 3.
- **AC-5 (an absent queued `ended_at` key, D-0151 §6; red on main)**
  - Given a cache with S1 at `2026-09-17T10:05:00.000Z` / 5, and a `pending: true` S1 entry whose
    row has no `ended_at` key and has `effort_rating: 2`, the loader gives `endedAt` 10:05 and
    `effortRating` 2. Main gives 5.
  - **The pair: an explicit null.** The same with `ended_at: null` gives 10:05 / 5 (D-0148 §2).
  - **Both keys absent** give 10:05 / 5.
  - **No cached row,** with `ended_at` absent and `effort_rating` 2, gives `endedAt` `null` and 2.
- **AC-6 (nothing else moves)** `sessions-merge.test.ts`, `sessions-cache.test.ts`,
  `offline-loaders.test.ts` and the flush and `syncStatus` tests pass unedited. `syncStatus()`
  counts only `pending: true` entries, marked or not.

## Paths you may change
- `apps/web/src/lib/**` (the lane: `web-shell`), in practice `lib/offline/db.ts`, `history.ts`,
  `feature-loaders.ts`, `flush.ts` (to export the compare) and `lib/offline/__tests__/**`.
- **Listed extras:**
  - `docs/tickets/T-0431-load-sessions-flushed-row-defers.md`: this file, for the build and accept
    logs.
- Read-only: `.squad/decisions/D-0151-load-sessions-flushed-row-and-absent-ended-at.md`,
  `D-0148`, `apps/web/src/features/UF-03/**`.

## Contract impact
None. The marker is a local IndexedDB field (D-0151 Consequences), and `docs/data-model.md` and
`api/openapi.yaml` are unchanged.

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force
--concurrency=1` green · contracts unchanged · commits start `T-0431` and cite the screen (for
example `T-0431 UF-03.3: a flushed session row defers to a newer cache (D-0151)`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** safe with T-0420 (UF-03, reads `lib/offline` only) and with T-0429 (web-shell, a
  different set of paths: `vite.config.ts`, `main.tsx` and `lib/pwa`). If T-0420 merges first,
  its UF-03 tests must stay green here unedited. A failure there means that this ticket broke
  D-0151 §5.

## Build / accept log
Archived in `docs/tickets/log/T-0431.md` (D-0157).
