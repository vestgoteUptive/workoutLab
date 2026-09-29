---
id: D-0072
title: Offline caches v2 keeps refreshLibrary's single transaction, so the T-0300c e2e fixture needs the four new tables stubbed (a QA follow-up)
status: revisit
date: 2026-09-29
by: frontend-dev (T-0319 build)
area: web
---
## Context
T-0319 adds Dexie version 2 with four caches. Two of its refreshes now select tables the
T-0300c e2e fixture (`tests/e2e/fixtures/supabase-mock.ts`, the **qa** lane) does not mock:
`exercise_variants` (inside `refreshLibrary`), plus `plan_checkins`, `routines` and
`routine_items` (the three new refreshes, reached through `refreshAll`).

That fixture ends in a `501` catch-all for any unmocked `/rest/v1/**` call, by design. So on
`main` after this ticket, `tests/e2e/offline.spec.ts` "AC-C20 offline cold start" fails with
`libraryCache` at 0 rows: `refreshLibrary` throws on the unmocked `exercise_variants` select
before it enters its transaction, so the library is never written.

This was measured, not assumed. Adding four `json: []` stubs to that fixture locally turned the
suite from 23 passed / 1 failed into 24 passed, and reverting them reproduced the failure.

Two resolutions were considered:
1. **Decouple** `exerciseDetails` from `libraryCache`, so a variants outage can't block the
   library refresh.
2. **Keep the single transaction** and fix the fixture in the qa lane.

## Decision
Take option 2: keep `refreshLibrary` writing `libraryCache` and `exerciseDetails` in **one**
transaction, and fix the fixture as a QA follow-up.

Reasons:
- The T-0319 ticket says so in as many words: "It writes both tables in one transaction."
  Decoupling would contradict the ticket, and the ticket is authoritative.
- It is also the behaviour AC-6 asks for ("a refresh that fails leaves the previous cache
  intact, because the transaction isn't entered"). A reader must never see a library whose
  details are from a different fetch.
- `tests/e2e/**` is the **qa** lane in `.squad/ownership.yaml`, and T-0319's "Paths you may
  change" is `apps/web/src/lib/offline/**` only. Editing the fixture here would be a lane
  violation, and `.squad/state.md` records that unverified cross-lane grants have cost the squad
  time before (T-0203b).

The follow-up is small and fully specified: register four more routes in `mockSupabaseData`,
each `status: 200, json: []` by default, with optional fixture fields. **Registration order
matters**: Playwright runs the most-recently-registered matching handler first, and
`/rest/v1/exercises*` glob-matches `exercise_variants?...` too, so `exercise_variants*` must be
registered **after** `exercises*` — the same trap the file already documents for
`session_sets*` vs `session_sets_live*`.

## Consequences
- `tests/e2e/offline.spec.ts` AC-C20 is red on this branch (1 failed / 24). Every other check is
  green: `pnpm -w typecheck lint test --force --concurrency=1` is 19/19, 0 cached, and the web
  unit suite is 459/459 including 38 new T-0319 tests.
- The orchestrator should land the QA follow-up **with or before** this ticket's merge, so `main`
  never carries a red e2e suite. It is a fixture-only change; no product code moves.
- No product behaviour is at risk: a real device talks to a real PostgREST, where all four
  tables exist under the existing RLS. The break is an artefact of a deliberately strict mock.

## Revisit when
- A second feature needs a Dexie table. D-0067's own "Revisit when" already says `lib/offline`
  should then get a general per-feature cache API instead of a version bump, and that API is the
  moment to reconsider whether one transaction per *table group* is still the right granularity.
- The e2e fixture grows a third "table I forgot to mock" failure. That would argue for the
  fixture defaulting unmocked `/rest/v1` reads to `200 []` and 501-ing only writes.
