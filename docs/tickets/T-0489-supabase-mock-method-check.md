---
id: T-0489
title: "tests/e2e/fixtures/supabase-mock.ts: mockSupabaseData's sessions*/session_sets* routes answer every HTTP method with 200 — add a method check so AutoSync's background flush can't silently race a spec's seeded IndexedDB rows"
lane: qa
screens: []
decisions: [D-0176]
deps: []
status: ready
---
<!-- Written 2026-10-04 by orchestrator, from D-0176 (filed by T-0469's build, confirmed real and
reproducible by both its review and QA passes). Build flow: wl-build-qa. Small-to-medium: one
shared fixture, needs careful auditing of every spec that relies on the current any-method
behaviour. -->

## Why
D-0176 (read it in full: `.squad/decisions/D-0176-e2e-autosync-flush-deletes-seeded-queued-rows.md`)
found that `tests/e2e/fixtures/supabase-mock.ts`'s `mockSupabaseData` registers routes for
`sessions*`/`session_sets*` that fulfill **every HTTP method** with `200`/`201`, not just `GET`.
`AutoSync` mounts on every signed-in page load and calls `flushNow()` immediately; if a spec has
seeded a `queued` row directly into IndexedDB (as `uf-11-account.spec.ts` AC-2/AC-3 does) and that
mount happens before the spec's own assertion runs, the background flush "succeeds" against the
mock and `removeSyncedIfNotReedited` deletes the row — a race confirmed by direct measurement
(a temporary log showed the flush POST firing 3-5 times out of 5 runs under load) and reproduced
independently by two different QA passes (T-0469's own build, and its code review/QA rounds).

This is the same shape of gap D-0173 found in a different shared e2e fixture (`guarded-test.ts`'s
detector 2): a shared helper answering more than the spec in front of it actually needs, silently
enabling real app behaviour (here, AutoSync's flush) that most specs calling it don't expect to be
live.

## Scope
- In: `tests/e2e/fixtures/supabase-mock.ts`'s `mockSupabaseData`, the `sessions*` and
  `session_sets*` route handlers only. Add a method check: `GET` keeps today's behaviour (the
  fixture's cached-read shape); any other method either `route.fallback()`s to let a more specific,
  spec-local route handle it, or fails/aborts by default, mirroring the pattern already used
  locally by `mockExportRows` (`uf-11-account.spec.ts`) and `installWriteAbortGate`
  (`uf-03-list-summary.spec.ts`, T-0906).
- Out: Any other route in `mockSupabaseData` (`profiles*`, `area_targets*`, etc.) — audit them
  (see AC-2) but only change `sessions*`/`session_sets*` unless the audit finds the identical
  exposure elsewhere, in which case report it as a new finding rather than silently also fixing it.
- Out: `apps/web/src/lib/offline/AutoSync.tsx`, `flush.ts` — AutoSync's behaviour is correct,
  existing, documented (AC-C20). This ticket fixes the test fixture, not the product.

## Acceptance criteria
- **AC-1 (method-gated, proven).** After the fix, a non-GET request to `sessions*` or
  `session_sets*` through `mockSupabaseData` is NOT fulfilled with a 200/201 success — it either
  falls back to a spec-local route (if one is registered) or is refused by default.
- **AC-2 (audit).** Check every other route `mockSupabaseData` registers for the same
  any-method-fulfilled shape. Report findings in the build log (even "none found" is a valid
  result) rather than silently fixing something out of this ticket's declared scope.
- **AC-3 (D-0176's flake closed, proven).** Re-run `tests/e2e/uf-11-account.spec.ts` AC-2 and AC-3
  with `--repeat-each=10` (per D-0176's own "Revisit when" note), ideally while another worktree's
  heavy job is also running to reproduce the load conditions that triggered the original flake.
  0 failures expected. Record the run.
- **AC-4 (no regression).** Every existing e2e spec that uses `mockSupabaseData` still passes
  unedited — specifically `uf-03-list-summary.spec.ts`, `uf-09-focus.spec.ts`, `uf-09-offline.spec.ts`
  (all touched by T-0906/T-0484's own fixture work) and anything else that imports it. Full e2e
  suite green.
- **AC-5 (fault proof).** On a backup copy, revert the method check (restore any-method-200).
  Confirm `uf-11-account.spec.ts` AC-3 can flake again under the same repeated/loaded conditions
  as AC-3 above (or at minimum, confirm the specific race is reproducible once on an unpatched
  copy). Restore from backup.

## Paths you may change
- `tests/e2e/fixtures/supabase-mock.ts`.
- `docs/tickets/T-0489-supabase-mock-method-check.md` (this file, accept log only).
- **Not yours:** any spec file. If a spec needs a change because it relied on the old any-method
  behaviour, report that as a finding and stop — don't fix another lane's spec from here without
  checking the board for lane overlaps first.

## Contract impact
None. Test-infrastructure only.

## Definition of done
Every AC has a passing test or a recorded run. `scripts/locked.sh heavy` full gate green, plus the
full e2e suite (this is a shared fixture touching many specs — don't skip e2e). Commits start
`T-0489`.

## Notes
- D-0176's own "Revisit when" line names the exact verification this ticket should perform once
  landed: re-run `uf-11-account.spec.ts` AC-2/AC-3 under `--repeat-each=10` or similar, ideally
  under load, to confirm the flake is actually gone and not just statistically less likely.
- T-0488 (a related, separate finding from T-0484: `uf-08-setup.spec.ts`'s `recordSessions` route
  has the same any-method-200 shape) is a different file and ticket — don't fold it in here unless
  investigation shows it's the exact same root cause and fixing it here is trivially in scope.

## Build / accept log
Archived in `docs/tickets/log/T-0489.md` (D-0157).
