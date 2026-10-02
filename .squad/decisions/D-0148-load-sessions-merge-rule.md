---
id: D-0148
title: "loadSessions merge: a present queued key wins (null included), endedAt is the later of the two, and a later cached finish keeps its own rating"
status: revisit
date: 2026-10-02
by: product-owner (grooming T-0324)
area: web
builds-on: D-0053 §7, D-0058, D-0045 §6, D-0067 §3
tickets: [T-0324]
---
## Context
`loadSessions` (`apps/web/src/lib/offline/feature-loaders.ts`) merges the cached server sessions
with this user's queued `sessions` rows. Today it coalesces every field:
`row.effort_rating ?? previous?.effortRating ?? null`, and the same for `ended_at`.

- NULL is a legitimate `effort_rating` (D-0058 §1 writes `request.effortRating ?? NULL`; the data
  model allows null). A queued row that clears the rating with an explicit `effort_rating: null`
  shows the stale cached rating again. UF-03.3 Save (T-0420) sends exactly that when the user
  saves with no chip picked.
- `ended_at` is coalesced too, so an earlier queued `ended_at` overrides a later cached one, which
  is the opposite of the D-0053 §7 "latest endedAt wins" rule.

Queued rows go to the server as a plain supabase-js upsert (D-0045 §6, D-0068 §2). A key that is
absent from the upsert leaves the column untouched; a key that is present, null included, writes
it. So the loader has to tell an absent key from an explicit null.

## Decision
For a session id that has both a cached row (`previous`) and a queued row (`row`):

1. **`endedAt` is the later of the two.** When both are non-null and both parse with
   `Date.parse`, the later instant wins. On an equal instant the queued string is kept. When only
   one is non-null, that one wins. When either string doesn't parse, the queued non-null value
   wins (today's behaviour). `null` only when both are null. Compare instants, never strings
   (`+02:00` and `Z` offsets both occur).
2. **The cached finish wins whole when it is strictly later.** When the cached `endedAt` is
   strictly later than the queued one (or the queued one is null), `effortRating` is the cached
   value. The winning finish decides the row (the D-0058 §1 rule, applied on the device).
3. **Otherwise a present key wins, null included.** When the queued `ended_at` is later than,
   equal to, or the only non-null, `effortRating` is `row.effort_rating ?? null` if the key
   `effort_rating` is present in `row` (`Object.hasOwn`), and `previous?.effortRating ?? null`
   if the key is absent. The equal-instant case counts here because it is the T-0420 edit: Save
   re-sends the stored row with the same `ended_at` and a new or cleared rating.
4. `energy` keeps its coalesce (`row.energy ?? previous?.energy ?? "normal"`): the column is
   `not null`, so an explicit null can't be a real state.
5. With no cached row, the queued row is used as is, as today.

## Consequences
- T-0324 implements this in `loadSessions` and tests each rule with its pair.
- The existing `sessions-cache.test.ts` cases (an absent key keeps the cached rating 5; a queued
  `ended_at: null` never un-finishes a cached session) stay green unedited.
- No contract change: `effort_rating` is already nullable and the upsert shape is unchanged.
- Rule 3 differs from D-0058 §2 (a retry at an equal `endedAt` may add a rating but not clear
  it). D-0058 §2 governs `POST /sessions/{id}/finish`, which v1 doesn't call (D-0068 §2). The
  queued upsert writes the whole row, so on the device a clear at an equal instant is real.

## Revisit when
- v1 starts calling `/finish` from the device, or a server trigger starts enforcing the
  `ended_at` max on the plain upsert.
