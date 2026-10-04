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

**Fix (AC-1).** `tests/e2e/fixtures/supabase-mock.ts`'s `mockSupabaseData`: `sessions*`/
`session_sets*` routes now check `route.request().method()`. GET keeps today's `200 []`. Any
other method calls `route.abort("internetdisconnected")`, not `route.fallback()` — a first version
fell back to `mockSupabaseRest`'s 501 catch-all, which is answered with `route.fulfill` and is
reported as an unexpected "backstop hit" by `guarded-test.ts`'s Supabase guard (measured: it turned
AC-2/AC-3 from "flaky" to "reliably failed on an unrelated guard"). Aborting instead mirrors
`fixtures/offline.ts`'s `goOffline` write-abort gate: the browser's `fetch` rejects with a
`TypeError`, `flush.ts` treats the failed upsert as "not sent" (row stays `queued`), and
`guarded-test.ts`'s own `requestfailed` detector already exempts
`net::ERR_INTERNET_DISCONNECTED`. A spec that registers its own method-aware route for these
tables after calling `mockSupabaseData` (`uf-09-offline.spec.ts`'s `recordWrites`,
`uf-08-setup.spec.ts`'s `recordSessions`, `uf-11-account.spec.ts`'s `mockExportRows`) is
unaffected: Playwright runs the most-recently-registered matching handler first, so that route
claims the request before this one ever sees it.

**AC-2 audit.** Checked every other route `mockSupabaseData` (and `mockSupabaseEmptyReads`,
`mockProfilePresent`/`mockProfileMissing`) registers: `exercises*`, `exercise_areas*`,
`area_targets*`, `profiles*`, `session_sets_live*`, `exercise_variants*`, `plan_checkins*`,
`routines*`, `routine_items*`. All share the same unconditional-200-any-method shape, but none
share `sessions*`/`session_sets*`'s risk profile: the app only writes to them from a direct,
in-test user action (`uf-07-routines.spec.ts`'s routine save/delete, `UF-11`'s check-in/equipment
saves), never from an unconditional background mount-time call race-prone against a spec's own
seeded assertion. Every spec that drives one of those writes already registers its own
method-aware local route (confirmed for `routines*`/`routine_items*` in
`uf-07-routines.spec.ts`'s `captureWrites`); no spec asserts on a write to any of these tables
silently succeeding through `mockSupabaseData`'s own fulfilled-200 default. Finding: **none found**
beyond `sessions*`/`session_sets*` — no further change made, per scope.

**AC-5 fault proof (done before AC-3, same mechanism).** Backed up the fixed file
(`cp` to scratch), edited `mockSupabaseData` on the live file to drop the method check (restoring
exact pre-fix any-method-200 `sessions*`/`session_sets*`, a fault of this ticket's own authorship),
ran `TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y pnpm@10.28.2 exec playwright test
--config tests/e2e/playwright.config.ts -g "AC-3 server error" --repeat-each=10 --workers=4`:
**1 failed / 9 passed** — `expect(count).toBe(1)` got `0` at `uf-11-account.spec.ts:356`, the
exact assertion and failure mode D-0176 recorded. Restored the fixed file from the scratch backup
with `cp` (not `git checkout`).

**AC-3 re-verification (D-0176's "Revisit when").** Same command for both
`"T-0469 AC-2 delete|T-0469 AC-3 server error"`, `--repeat-each=10 --workers=4`, on the fixed code:
first pass (machine otherwise idle) **20/20 passed**; second pass run while two other worktrees
(T-0478, T-0488) had heavy `pnpm -w typecheck lint test` / e2e jobs running concurrently (the exact
load condition D-0176 named) — **20/20 passed**. Full `uf-11-account.spec.ts`, `--repeat-each=3`:
**21/21 passed**.

**AC-4 regression — one finding, reported per "Not yours: any spec file."**
`tests/e2e/fixture-guard.spec.ts`'s own `T-0484 goOffline fixture` describe, test
`"AC-3 goOnline disarms then goes online; counters frozen, the same POST now resolves"`
(line 677), fails on the fixed fixture: after `gate.goOnline()` disarms the write-abort gate, the
test posts directly to `session_sets` from page context and asserts `result.status === 200`,
relying on `mockSupabaseData`'s *old* any-method-200 shape as the thing that proves "the same POST
now resolves." With the method check in place that POST is aborted instead, so `result.status` is
never set the way the assertion expects. This is T-0484's own self-test (D-0175 §3), a spec file,
not `supabase-mock.ts` — out of this ticket's "Paths you may change." Reported here rather than
fixed; needs a qa-lane follow-up to update that one assertion (e.g. assert the write is no longer
aborted/fulfilled-offline after `goOnline`, without depending on a fake 200 from the shared
fixture). Every other spec importing `mockSupabaseData` was unaffected: full e2e suite
**230/231 passed**, the 1 failure being this exact, already-explained case.

**Full e2e suite** (`TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y pnpm@10.28.2 exec
playwright test --config tests/e2e/playwright.config.ts`): 230 passed, 1 failed (the
`fixture-guard.spec.ts` finding above, not a new flake — deterministic on every run).

**Full gate:** `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test
--concurrency=1` — 255 test files / 3539 tests passed, typecheck/lint clean (cache hit). `pnpm -w
test:repo-checks` — 159/159 passed. `pnpm -w format:check` — clean. `node
.github/scripts/check-all.mjs` — exit 0.

**Files changed:** `tests/e2e/fixtures/supabase-mock.ts` only, plus this log.

### Orchestrator follow-up (2026-10-04)
Fixed the `fixture-guard.spec.ts` AC-3 gap directly rather than filing a separate ticket, since the
builder had already fully diagnosed it and the fix is exactly the pattern the ticket's own doc
comment names: the test now registers its own method-aware `session_sets*` route (GET passthrough,
non-GET fulfilled) *after* `mockSupabaseData`, before calling `goOffline` — the same shape
`uf-09-offline.spec.ts`'s `recordWrites` and `uf-08-setup.spec.ts`'s `recordSessions` already use.
`goOffline`'s own route (registered later still) wins during the armed window and counts the
abort; after `goOnline()` disarms it, `goOffline`'s handler falls back to this local route, which
fulfills with 200 as the test expects. Verified: `-g "AC-3 goOnline"` passes in isolation, and the
full e2e suite is now **231/231**, confirming AC-4 fully met. No other spec needed a change.
