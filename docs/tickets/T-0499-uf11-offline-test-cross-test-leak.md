---
id: T-0499
title: "UF-11 offline.test.tsx: the cache-first test's real refreshAll leaks supabase.from calls into the next test (AC-B6 offline false failure)"
lane: web-feature:UF-11
screens: [UF-11.2]
decisions: [D-0178]
deps: []
status: todo
groomed:
---
<!-- Written by orchestrator 2026-10-05, from a T-0481 code-review finding. Not groomed to ready:
needs a product-owner pass to confirm the fix shape against the spy helper's own design before
a build starts. -->

## Why
`apps/web/src/features/UF-11/__tests__/offline.test.tsx`'s "AC-B6 cache first" test
(`renders the 9 target rows from the cache while the real refresh is still in flight`) sets
`realRefreshAll.current = true` and lets the REAL `refreshAll` run (to make "the refresh was
started" a true claim, not an artefact of a stubbed refresh resolving instantly). It stubs
`fetch` to a promise that never resolves, but `refreshAll`'s own data calls go through a
separately mocked `supabase.from` (`spy`), not `fetch` — those calls settle on their own,
independent of the stubbed `fetch`. The test only waits for `refreshAllSpy` to have been
*called* (i.e. that `refreshAll` started), never for the real call to finish. The unfinished
work can straggle past this test's own assertions and `afterEach`'s `spy.reset()`, landing in
the very next test ("AC-B6 offline") and failing its `expect(spy.from).not.toHaveBeenCalled()`
assertion with a spurious "called 2 times."

Found by `code-reviewer` during T-0481's review (2026-10-05), investigating a flake the
orchestrator first noticed while fast-tracking T-0481 under D-0178. Confirmed on `main` *before*
T-0481 too (3/15 and 3/12 runs failed in independent reproduction), so this is pre-existing, not
caused by T-0481 — T-0481 only perturbs React's effect timing enough to change the odds (its own
branch saw 8/15). `mount-stability.test.tsx`'s "a NEW clock function identity on every re-render
does not restart the load" test has a related but distinct race: since T-0471 mounted
`CheckinCard` on `Plan`, its own `useCheckinData` effect calls the test's `loadProfile`-counting
mock too, so a baseline call count taken right after the target rows render can land at 1
(before the card's own read) instead of 2, giving a spurious "expected 2 to be 1."

## Scope
- In:
  - Fix `offline.test.tsx`'s "cache first" test so no real async work it started is still
    in flight when the test ends. The orchestrator tried capturing and awaiting the real
    `refreshAll()` promise directly and hit a second, real problem: `createFromSpy`'s builder
    doesn't support every chain the real `refreshAll` calls use (confirmed:
    `supabase.from(...).select(...).gte(...)` throws `TypeError: ... .gte is not a function`
    inside `refreshHistory`, because the spy's builder for that call shape isn't wired). The
    fix likely needs either: (a) extending the spy builder to support every chain `refreshAll`
    exercises (check `refreshLibrary`, `refreshSessions`, `refreshCheckins`, `refreshTargets`,
    `refreshProfile`, `refreshHistory` — each table's exact chain), or (b) a narrower per-table
    wait that tolerates the real call failing fast (the error is swallowed today since nothing
    awaits it — that's arguably a second, independent gap: a silently-rejected `refreshAll` in
    this one test looks identical to a successful one that just takes longer).
  - Fix `mount-stability.test.tsx`'s baseline-count race: wait for `loadProfileCalls.n` to reach
    the post-T-0471 expected count (2, not 1) before taking the baseline, per the reviewer's
    finding.
  - Re-verify with the same repeated-run method used to find this (15-30 solo runs of each
    affected file) before calling it fixed — a single green run proves nothing for a flake this
    rare.
- Out:
  - Any production code change. Both fixes are test-only.
  - The separate, unrelated design note the same review surfaced (see Follow-up below).

## Acceptance criteria
- **AC-1** `offline.test.tsx` run alone, 20 consecutive times via `scripts/locked.sh small`,
  0 failures.
- **AC-2** `mount-stability.test.tsx` run alone, 20 consecutive times, 0 failures.
- **AC-3** Both files run together (as the orchestrator's original repro command did), 15
  consecutive times, 0 failures.
- **AC-4** The fix does not weaken either test's own original assertion (AC-B6 cache-first
  still proves a real, unstubbed refresh was genuinely in flight when the cache rendered;
  AC-B6 offline still proves zero real supabase calls when offline).

## Paths you may change
- `apps/web/src/features/UF-11/__tests__/offline.test.tsx`
- `apps/web/src/features/UF-11/__tests__/mount-stability.test.tsx`
- `apps/web/src/features/UF-11/__tests__/test-helpers.tsx`, only if extending `createFromSpy`'s
  builder turns out to be the right fix for AC-1 (check first whether a narrower fix in
  `offline.test.tsx` alone suffices).
- `docs/tickets/T-0499-uf11-offline-test-cross-test-leak.md` (log only)

## Contract impact
None.

## Follow-up (not in this ticket's scope)
The same review also flagged, as a separate design observation, not a confirmed bug: "a Plan
mount `refreshAll` still running when the card's own Accept/Keep refresh starts could let the
mount's refresh write the old profile to the cache after the card's own refresh, since nothing
orders the two." Worth a dedicated ticket to confirm whether this is reachable in practice
(both refreshes would need to be in flight at once, which requires the user to answer the card
before Plan's own 3s-capped mount refresh settles) before deciding whether it needs a fix.

## Definition of done
AC1-4 hold. `node .github/scripts/check-all.mjs` exits 0. No production code changed unless
AC-1's investigation finds it's unavoidable (if so, stop and ask for a decision instead of
changing `use-plan-data.ts`/`use-checkin-data.ts`, since that would re-open T-0481/T-0471's own
scope). Commit messages start `T-0499` and cite UF-11.2.

## Build / accept log

- 2026-10-06 build (frontend-dev). Before (HEAD b676718, offline+mount-stability files together, 15 runs): 4/15 failed, all `expected vi.fn() to not be called at all, but actually been called 2 times` (AC-B6 offline). Not reproduced for mount-stability in 15 runs, but its baseline race is closed anyway.
- Fix (tests only): (1) `createFromSpy` builder gains `.gte/.lte/.order/.limit/.maybeSingle`; new opt-in `{ emptyReads: true }` makes reads resolve with no rows so a real `refreshAll` completes. Opt-in because making it default let the real refresh in `checkin-mount.test.tsx` overwrite its seeded cache (2 tests red, run once and recorded). (2) offline.test.tsx: mock records each real `refreshAll` promise; the cache-first test awaits them and asserts `spy.from` was reached (real refresh genuinely ran), `afterEach` drains them before the next test. (3) mount-stability: baseline waits for `loadProfileCalls.n` to be stable across polls instead of reading it right after the rows render.
- AC-1/2/3: offline+mount-stability together, 30 consecutive runs, 0 failures; 10 runs under 4 busy loops (8 cores), 0; 10 runs under 12 busy loops, 0. Whole `src/features/UF-11`: 194/194.
- AC-4: assertions untouched, one added (`spy.from` called in cache-first).
- Note: runs were done in a clean `git worktree` copy because a sibling agent (T-0528) wrote uncommitted `lib/account/{index,wipe}.ts` edits into this worktree mid-task (importing a missing `sign-out.js`), breaking every import of lib/account; they are not part of this commit.
