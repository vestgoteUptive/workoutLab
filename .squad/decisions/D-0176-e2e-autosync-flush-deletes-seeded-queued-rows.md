---
id: D-0176
title: "e2e: AutoSync's background flush can delete a spec's seeded IndexedDB `sets` row before the spec's own assertion, because `mockSupabaseData`'s `sessions*`/`session_sets*` routes answer every HTTP method with 200 — not just GET; T-0469 AC-3 flaked on this twice, root cause confirmed directly"
status: revisit
date: 2026-10-04
by: frontend-dev (T-0469 resume, code review follow-up)
area: process
builds-on: D-0086, D-0173
---
## Context
During T-0469's code review resubmission (planting red/green fault proofs for AC-2 and AC-3,
requested by the reviewer), AC-3 (`tests/e2e/uf-11-account.spec.ts`, "a 500 keeps the user on
UF-11.4 ... and the seeded row intact") failed twice out of five total runs on unmodified,
correct code — `expect(count).toBe(1)` got `0` — with no planted fault and no change to
`AccountSettingsBody.tsx`. Both failures were on the identical assertion
(`tests/e2e/uf-11-account.spec.ts:356`).

**Root cause, confirmed by direct measurement, not inferred.** `AutoSync` (`apps/web/src/lib/
offline/AutoSync.tsx`) mounts on every signed-in page load, including `/plan/account`, and calls
`handle.flushNow()` immediately. `flushSets` (`apps/web/src/lib/offline/flush.ts`) reads every
`queued` row for the current user and `upsert`s it via `supabase.from("session_sets")...`; on a
response it treats as successful, `removeSyncedIfNotReedited` calls `db.sets.delete(key)` —
unconditionally removing the row from IndexedDB, independent of whatever the UI is doing.

`tests/e2e/fixtures/supabase-mock.ts`'s `mockSupabaseData` registers:
```
await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, (route) =>
  route.fulfill({ status: 200, json: [] }),
);
await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) =>
  route.fulfill({ status: 200, json: [] }),
);
```
— with **no method check**. A GET (the intended case: reading cached history) and a POST/PATCH
(an upsert, i.e. a real flush write) both get the same `200, json: []`, which `flushSets` reads
as "nothing came back rejected" and treats as success.

T-0469's own spec seeds a `status: "queued"` row directly into IndexedDB (bypassing `lib/offline`'s
own `recordSet`, so `onQueueWrite`'s debounced auto-flush never fires for it) specifically so AC-2
and AC-3 can assert on its presence/absence after the delete flow. The race is between (a) the
page's own `AutoSync` mount-time `flushNow()` — an async chain of Dexie reads + a real (mocked)
`supabase.from(...).upsert(...)` call — picking up that row once seeded, and (b) the test's own
`click → fill → click → assert` sequence. Whichever finishes its last DB operation first decides
the test's outcome; machine load (this host regularly runs several worktrees' heavy e2e jobs
concurrently, D-0169) shifts the race unpredictably, which matches the observed intermittency
(2 failures in 5 total runs across several `--repeat-each` batches, 0 failures when run alone with
`--workers=1`, and 0/5 failures once a local experimental method-check patch answered a non-GET
with 501 instead of 200 — the POST was observed hitting the mocked route exactly 3 of those 5
times via a temporary `console.log`, confirming the mechanism directly rather than by elimination).

AC-2 does not hit this symptom in testing so far (0 failures across ~8 runs), most likely because
its own flow also wipes the whole `wl-offline` IndexedDB (`wipeLocalUserData`) as part of a
successful delete, which would mask (not fix) the same underlying race; AC-2's assertions check
"0 for U, 1 for V" rather than "1 for U", which happens to tolerate the race's two possible
orderings better by coincidence. This is noted, not relied upon.

`tests/e2e/fixtures/supabase-mock.ts` is qa-owned (`tests/e2e/**`, `.squad/ownership.yaml`);
T-0469's "Paths you may change" lists only its own spec/fixture files, not this shared one. Per
the agent rules, this ticket does not edit it.

## Decision
1. **Default: file a qa follow-up, don't touch `supabase-mock.ts` from this ticket.** The fix is
   to add a method check to `mockSupabaseData`'s `sessions*`/`session_sets*` routes — answer GET
   with the fixture's cached-read shape as today, and `route.fallback()` (or a dedicated
   write-mock) for any other method, mirroring the pattern `mockExportRows` in
   `uf-11-account.spec.ts` and `installWriteAbortGate` in `uf-03-list-summary.spec.ts` (T-0906)
   already use locally. This is the same shape of gap D-0173 found in a different shared fixture
   (`guarded-test.ts`'s detector 2): a shared e2e helper answering more than the spec in front of
   it actually needs, silently enabling a real app behaviour (here, AutoSync's flush) that most
   specs don't expect to be live.
2. **T-0469's own AC-3 row stays as written**, not loosened or restructured to dodge the race
   (e.g. by disabling AutoSync or seeding later): it already seeds and asserts correctly; the gap
   is in a different file this ticket doesn't own.
3. **No change to `AutoSync.tsx`, `flush.ts`, or `AccountSettingsBody.tsx`.** AutoSync flushing
   queued writes as soon as a page mounts is correct, existing, documented behaviour (AC-C20);
   nothing here is a product bug.

## Consequences
- New follow-up: **add a method check to `mockSupabaseData`'s `sessions*`/`session_sets*` routes**
  (qa lane, `tests/e2e/fixtures/supabase-mock.ts`) so a non-GET falls back/fails instead of
  silently succeeding. Until it lands, any e2e spec that seeds a `queued` row directly into
  IndexedDB and asserts on its survival (today: `uf-11-account.spec.ts` AC-2/AC-3) can
  intermittently flake under load, for a reason unrelated to the screen under test.
- Re-ran `uf-11-account.spec.ts` AC-3 alone 5× (`--repeat-each=5`, default workers): 5/5 passed on
  a quieter window; re-ran the full file `--repeat-each=2` serially (`--workers=1`): 14/14 passed
  twice; re-ran the full project e2e suite: the flake reproduced once more (same assertion). This
  ticket's own gate run therefore show both green and (twice) red on this specific assertion,
  for the reason above, not because AC-3 is wrong or the T-0469 CSS/spec changes regressed it.

## Revisit when
- The qa follow-up lands (the method check in `supabase-mock.ts`); re-run AC-2 and AC-3 under
  `--repeat-each=10` or so, ideally while the machine is under load from other worktrees, to
  confirm the flake is gone, not just less likely.
