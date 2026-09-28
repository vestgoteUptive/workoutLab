---
id: D-0058
title: Finish is commutative on the whole row — effort_rating follows the endedAt max
status: decided
date: 2026-09-28
supersedes: none
amends: D-0053 §7
lane: backend
tickets: [T-0203c]
---

## Context

T-0203c implemented `POST /sessions/{id}/finish` against D-0053 §7. The review found, and the
orchestrator independently reproduced, that the same *set* of finishes converges on a different
row depending on replay order:

- A = `{endedAt: 07:31, effortRating: 4}`, B = `{endedAt: 07:40}` (no rating)
- order `[A, B]` → `{ended_at: 07:40, effort_rating: 4}`
- order `[B, A]` → `{ended_at: 07:40, effort_rating: null}`

`ended_at` converges; `effort_rating` does not. Verified twice: through the live HTTP endpoint on
the local stack with two fresh sessions, and by replaying `resolveFinishPatch`'s pure logic.

**The implementation is not at fault.** `supabase/functions/sessions/core.ts:65-77` is a faithful
reading of §7's three bullets. The defect is in D-0053 §7 itself: its bullets say a
newer-or-equal request writes `effort_rating` "when the request carries it", while an older
request "writes nothing" — so a rating's survival depends on arrival order. Yet the same §7
closes with "the rule is a max, so it's commutative: any replay order of the same set of finishes
ends in the same row." Those two statements are inconsistent. A max over `ended_at` alone does
not make the *row* order-independent once a second, independently-written column exists.

This matters in the case §7 exists for: UF-03.3 lets the user rate a workout, and an offline queue
can hold a rated finish plus a later unrated one (a rating added on one device, a later correction
from another). One ordering silently loses the rating.

## Decision

**`effort_rating` is part of the same max as `ended_at`. The winning finish decides the whole row.**

Let `stored` = `sessions.ended_at`, `req` = the request's `endedAt`.

1. `stored` is null, or `req > stored` — this finish **wins**: write `ended_at = req`, and write
   `effort_rating = request.effortRating ?? NULL`. The winner's rating replaces what was there,
   including clearing it when the winning finish carries no rating. This is what makes the row
   order-independent.
2. `req = stored` — a retry of the winning finish: write `effort_rating` only when the request
   carries it. A retry may add a rating; it must not clear one.
3. `req < stored` — write nothing.
4. In every case, return 200 with the summary for the row as stored after the call.

Under these rules the row is a function of the winning `endedAt` plus the ratings seen at that
`endedAt`, so any replay order of the same set converges. Rule 1's `?? NULL` is the operative
change from D-0053 §7.

## Consequences

- `resolveFinishPatch` must write `effortRating: null` on a strict win with no rating present,
  rather than leaving the column untouched. The patch type must therefore allow `null`.
- **The ACs must pin both orders with a rating on exactly one of the two finishes.** AC28's twins
  currently use rating-free requests, which is why a green suite missed this. A rating-free pair
  cannot detect the defect.
- D-0053 §7 is amended, not superseded: everything else in it (the `endedAt` max, the 400 on
  `endedAt < started_at`, the 200-with-summary contract) stands.
- No change to `api/openapi.yaml`, `docs/data-model.md` or any migration. `effort_rating` is
  already nullable.

## Alternatives rejected

- **"Keep any rating ever sent" (max over ratings, never clear).** Also commutative, and it never
  loses user input — but it detaches the rating from the finish it belongs to: a rating given to a
  7:31 finish would survive onto a 7:40 finish the user rated differently or not at all. The row
  would no longer describe one coherent finish.
- **Leave §7 as written and drop the commutativity claim.** Rejected: offline replay is the whole
  point of the rule, and an order-dependent row is a silent data-loss bug, not a documented
  limitation.
- **Serialise finishes with a conditional update or trigger.** Orthogonal — that closes the
  concurrent read-modify-write race (a separate follow-up), not the ordering semantics.
