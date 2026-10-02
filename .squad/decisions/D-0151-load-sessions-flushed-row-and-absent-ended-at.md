---
id: D-0151
title: "loadSessions: a flushed queued row defers to a cache refreshed after its flush; an absent queued ended_at key has no say in the finish"
status: revisit
date: 2026-10-02
by: product-owner (grooming T-0431)
area: web
amends: D-0148
builds-on: D-0148, D-0053 §7, D-0045 §6, D-0068 §2, D-0058 §1
tickets: [T-0431]
---
## Context
D-0148 lets a queued `sessions` row win over the cached server row at an equal `ended_at` (§3).
That is right for a row that is still `pending: true`: it is newer local truth that hasn't been
sent yet. The T-0420 Save (UF-03.3) depends on it, because it re-sends the stored row with the
same `ended_at` and a new or cleared `effort_rating`.

A flushed row is different. After a successful flush the queue keeps the entry with
`pending: false`, because its `finished` marker has to outlive the send (D-0053 §7). The entry is
never dropped. So once the server has moved on (another device cleared or changed the rating at
the same `ended_at`) and `refreshSessions` has pulled that newer row into the cache, the old
flushed entry still wins under D-0148 §3, and the stale rating comes back on this device. That
lasts forever: nothing ever retires the entry.

Deferring every `pending: false` row to the cache is too broad. The cache can be older than the
flush. Example: finish, flush, refresh, then a T-0420 Save that changes the rating, then a flush.
The cache still holds the old rating at the same `ended_at`. If the flushed row deferred, the
rating the user just saved would disappear until the next refresh. The cache rows carry no
fetch time, so the loader can't tell these two cases apart without a new marker.

Second gap: `loadSessions` reads `row.ended_at ?? null`, so a queued row with no `ended_at` key
counts as an explicit `ended_at: null`. A strictly later cached finish then wins whole (D-0148 §2)
and replaces a present queued `effort_rating`. The plain upsert (D-0045 §6) does the opposite: an
absent key leaves the column untouched, and a present `effort_rating` is written. So the device
shows a rating that the server doesn't hold.

## Decision
1. **A local marker, `cacheCurrent`.** `QueuedSession` (`apps/web/src/lib/offline/db.ts`) gets an
   optional, non-indexed `cacheCurrent?: true`. It means that a `refreshSessions` has replaced the
   cache from a request issued after this entry became `pending: false`. No Dexie version bump is
   needed: the field is non-indexed, and an entry written by an older build has no field, which
   reads as unmarked.
2. **`refreshSessions` sets it.** Before its `select`, it takes a snapshot of this user's queued
   entries that are `pending: false`. After a successful `select`, one `rw` transaction over
   `sessionCache` and `sessions` replaces the cache (as today) and marks each snapshotted entry
   whose current entry is still `pending: false` and still structurally equal to the snapshot
   (`row` and `finished`, the T-0411 compare). The mark is `{ ...current, cacheCurrent: true }`. A
   failed `select` marks nothing. An entry that was `pending: true` at the snapshot is never
   marked, even if a flush finishes it during the request.
3. **Every new queue write clears it.** `upsertSession` writes a fresh entry without
   `cacheCurrent` (this is today's code shape; a test pins it). The flush's `pending: false` write
   leaves it absent.
4. **A marked entry defers to the cache.** In `loadSessions`, for an entry with
   `pending === false`, `cacheCurrent === true` **and** a cached row:
   - `endedAt` still follows D-0148 §1 (the later instant). A finish never disappears (D-0053 §7).
   - `effortRating`, `energy`, `startedAt` and `timeBudgetMin` come from the cached row.

   With no cached row (the server returned nothing for that id, for example outside the 56-day
   window), the queued row is used as is (D-0148 §5).
5. **Every other entry keeps D-0148** (`pending: true`, `pending: false` without the mark, or an
   entry from an older build), with §6 below. This keeps the T-0420 Save winning at an equal
   `ended_at`: while it is pending, after its flush, and until a refresh brings the server row
   (which by then carries the saved rating).
6. **An absent queued `ended_at` key has no say in the finish.** When `Object.hasOwn(row,
   "ended_at")` is false:
   - `endedAt` is the cached `endedAt`, or `null` with no cached row;
   - `effortRating` follows D-0148 §3: a present `effort_rating` key wins (null included), and an
     absent one keeps the cached value.

   An explicit `ended_at: null` keeps D-0148 §2 (a non-null cached finish wins whole, so a queued
   null never un-finishes a session).

## Consequences
- T-0431 (web-shell) implements §1–§6 in `db.ts`, `history.ts` and `feature-loaders.ts`, with a
  paired test for each rule and the planted faults recorded.
- `sessions-merge.test.ts` and `sessions-cache.test.ts` stay green unedited. Each of their
  flushed-row cases fills the cache before it writes the flushed entry, so the entry is unmarked
  and D-0148 applies as before.
- No contract change. `docs/data-model.md` and `api/openapi.yaml` describe Postgres and the Edge
  Functions. The IndexedDB entry shape is web-shell's own.
- `syncStatus` and `flushSessions` are unaffected: they read only `pending`.

## Revisit when
- The cache rows get a fetch time or a server `updated_at`. A timestamp compare could then
  replace the marker.
- v1 starts calling `/finish` from the device (the D-0148 revisit trigger).
