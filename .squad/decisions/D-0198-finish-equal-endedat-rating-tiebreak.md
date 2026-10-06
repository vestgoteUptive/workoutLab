---
id: D-0198
title: "Two different ratings at the same winning endedAt: the higher rating wins (order-independent) — recommended default for T-0217, parked because the finish endpoint is off the user path"
status: revisit
date: 2026-10-06
by: product-owner (groom)
area: backend
amends: D-0058
---
## Context
D-0058 rule 2: when a finish arrives with `endedAt` equal to the stored one, it is a retry, and it
writes `effort_rating` whenever it carries one. So two finishes with the same `endedAt` and
different ratings (rated 3 on one device, 4 on another, both closing at 07:40:00.000) end on
whichever arrived last. That is the one case where D-0058's "any replay order converges" does not
hold (T-0208 review, T-0217).

Today this only affects `POST /sessions/{id}/finish`. The web app does not call it: it finishes a
session through the offline queue's `sessions` upsert (D-0045 §6, D-0151). So no prod user can hit
the case now.

## Decision
Recommended default: **at an equal winning `endedAt`, the higher rating wins.** Rule 2 becomes
"write `effortRating` when the request carries one and it is greater than the stored rating, or
the stored rating is null". The row is then a pure function of the set of finishes (max `endedAt`,
then max rating at that `endedAt`), so it converges in any order.

What this changes: D-0058's AC29 reads a same-`endedAt` re-rate as a *correction* (3 then 2 gives
2). Under this default a lower re-rate at the same instant is ignored. The UI never re-sends a
finish with the same `endedAt` and a lower rating, so the loss is theoretical.

Alternative, if the human prefers: keep last-arrival-wins and document it as the one exception to
D-0058's convergence.

## Consequences
- T-0217 stays parked until a client calls the finish endpoint. Building it then: change rule 2 in
  `supabase/functions/sessions/core.ts` `resolveFinishPatch`, rewrite AC29's meaning, and add a
  unit test with two ratings at one `endedAt` in both orders.
- T-0218 (sub-millisecond `endedAt` precision) belongs to the same parked cluster.

## Revisit when
- A client starts calling `POST /sessions/{id}/finish`, or
- the human picks the alternative.
