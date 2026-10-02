---
id: T-0208
title: "Finish: effort_rating follows the endedAt max (D-0058)"
lane: backend
screens: [UF-03.3]
decisions: [D-0053, D-0058]
deps: [T-0203c]
status: done
---
## Why
D-0053 §7 made `POST /sessions/{id}/finish` a max over `endedAt`, but `effort_rating` was written
independently. The same set of finishes then produced different rows depending on replay order
(rated 07:31 + unrated 07:40). That is silent data loss in the offline-replay case the rule exists
for. D-0058 makes the winning finish decide the whole row.

## Provenance
The code fix landed before this ticket was worked, in T-0203c: commit `b240f7c` ("finish is
commutative on the whole row") and `bf5224e` (AC27/AC28 integration tests). T-0208 changes no
function code. It adds rule-by-rule tests that pin D-0058 (`b5afa8a` unit, `4379fe8` integration,
`9cd2a7c` review-gap tests), and it realigns T-0203's AC27/AC28 text with D-0058.

## Scope
- In: tests for each D-0058 rule and consequence, both unit (`resolveFinishPatch` via
  `finishSessionCore`, `writeSessionFinish`) and over the wire; T-0203 AC27/AC28 wording.
- Out: the tie-break between two different ratings at the same winning `endedAt` (follow-up);
  sub-millisecond `endedAt` precision (follow-up); the concurrent read-modify-write race (separate
  follow-up already named in D-0058).

## Acceptance criteria
Let `stored` = `sessions.ended_at`, `req` = the request's `endedAt`, compared as instants.
- AC1 (rule 1) Given `stored` null or `req > stored`, When A finishes, Then `ended_at = req` and
  `effort_rating = request.effortRating ?? null`. The patch carries an explicit `effortRating: null`
  when unrated, and `writeSessionFinish` sends `effort_rating = null`.
- AC2 (rule 2) Given `req = stored`, When the request carries a rating, Then only `effort_rating`
  is written. When it carries none, Then nothing is written and an existing rating stays.
- AC3 (rule 3) Given `req < stored`, When A finishes (rated or not), Then nothing is written.
- AC4 (rule 4) Given any of the above, Then 200 with the summary of the row as the database stored
  it after the call (not the patch).
- AC5 (commutativity) Given the finishes {rated 07:31, unrated 07:31, unrated 07:40, rated 07:40}
  (at most one distinct rating per `endedAt`), When they are replayed in all 24 orders, Then every
  order ends on the same full row. Same when the winning `endedAt` is never rated (row rating null).
- AC6 (AC28 twins) Given two fresh sessions, When one gets [07:40, 07:31] and the other
  [07:31, 07:40], with a rating on exactly one finish, Then both full rows and both last responses
  are equal, pinned with the rating on either finish.
- AC7 (instant compare) Given the same instant written with an offset, Then it is a rule 2 retry.
  A string-later but older instant is rule 3. A 500 ms difference counts (milliseconds are kept).

## Paths you may change
Backend lane: `supabase/tests/**`. Product owner: `docs/tickets/T-0203-*.md` (AC27/AC28 text),
this file.

## Contract impact
none. D-0058 states no change to `api/openapi.yaml`, `docs/data-model.md` or migrations.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision
linked · commit messages start with `T-0208`.

## Build / accept log
Archived in `docs/tickets/log/T-0208.md` (D-0157).
