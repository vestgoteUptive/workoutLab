---
ticket: T-0906
classification: flaky
lane: qa
runs:
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37152271297   # main, 381a1cb, e2e job 111288462370 (+ unit job 111288462504, see "Related")
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37151653264   # main, 470a675, e2e job 111286653837
date: 2026-10-03
---

## What failed

- Workflow `CI`, job `playwright e2e`, step **`Run pnpm exec playwright test --config tests/e2e/playwright.config.ts`** (the test step itself; 216/217 passed both times).
- Test: `tests/e2e/uf-03-list-summary.spec.ts:496` › `T-0458 UF-03.1 List view, offline (NFR-OFF-2)` › `AC-1/AC-2: Pause, List view, three rows checked by keyboard, Finish, Save, reload`.
- Branch `main`, commits `470a675` and `381a1cb`.
- **It is not deterministic on CI.** The same test passed on CI, with the same app code and `retries: 0`, at `3fd0fc7` (run 37149884526, 213/213) and `29a4649` (run 37151205115, 217/217). Both commits already contain the T-0458 merge `4d3c96b`. Between `29a4649` (green) and `470a675` (red), the only code change is `apps/web/src/app/__tests__/profile-gate.test.tsx` (T-0479, a unit-test mock), which can't affect this e2e. So the result is 2 passes and 2 fails on identical code: `flaky`, not `regression`.

## Evidence

Run 37152271297, e2e job log (run 37151653264 shows the same failure):

```
1) [chromium] › tests/e2e/uf-03-list-summary.spec.ts:496:7 › T-0458 UF-03.1 List view, offline (NFR-OFF-2) › AC-1/AC-2: ...
   Error: expect(received).toEqual(expected) // deep equality
   - Expected  - 20
   + Received  +  1
   - Array [
   -   Object { "exerciseId": "back-squat", "reps": 6, "setIndex": 0, "weightKg": 100 },
   ...
   + Array []
     > 557 |     expect(squatSets).toEqual([
       at tests/e2e/uf-03-list-summary.spec.ts:557:23
 1 failed
 216 passed (2.7m)
```

Local trace from an instrumented copy of the spec (scratch depth-1 clone at `a3043eb`, request logger only, no CPU throttle). It shows the app's `sessions` and `session_sets` upserts **after the reload, while the context is offline**, and the routes fulfilling them:

```
DBG offline at +958ms onLine=false
DBG pre-reload onLine=false +3091ms sets=3        <- all three sets queued in `sets`
DBG +3099ms GET http://localhost:4173/            <- page.reload()
DBG +3178ms POST https://abc.supabase.co/rest/v1/sessions
DBG +3190ms POST https://abc.supabase.co/rest/v1/session_sets
DBG post-reload onLine=false +3224ms sets=0       <- flush won the race: FAIL
---- (passing repeat of the same run)
DBG +3160ms POST .../rest/v1/sessions
DBG post-reload onLine=false +3168ms sets=3       <- test read first, by 4 ms: PASS
DBG +3172ms POST .../rest/v1/session_sets
```

The first uninstrumented local run had the read only **15 ms** ahead of the `session_sets` POST (`post-reload +3242ms`, POST `+3257ms`).

## Reproduction

All runs were in a scratch `git clone --depth 1 file://…` at `a3043eb` (contains T-0458 and T-0418), after `npx -y pnpm@10.28.2 install --frozen-lockfile`, with `CI=1`, through `scripts/locked.sh heavy … playwright test --config tests/e2e/playwright.config.ts tests/e2e/uf-03-list-summary.spec.ts -g "AC-1/AC-2: Pause"`.

| Condition | Result |
|---|---|
| Unmodified spec, `--repeat-each=5`, 4 workers | 5/5 pass |
| Unmodified spec, `--repeat-each=10 --workers=2`, all 8 cores busy-looped | 10/10 pass |
| Request/console logger added (a little extra work per request), `--workers=1 --repeat-each=3` | **2/3 fail**, with the exact CI assertion (`Array []`) |
| CDP `Emulation.setCPUThrottlingRate` 4× (and 1×), `--repeat-each=3` | **3/3 fail**. Caveat: opening a CDP session also turned `navigator.onLine` back to `true`, so the flush there came from the enqueue path, not from the mount. That shows the same "the routes accept the upsert" mechanism, but it isn't a faithful model of CI. |

So it reproduced locally once the timing moved by a few milliseconds. CI's slower runner (2 workers, 217 tests) sits on the losing side of the race about half the time.

## Root cause

A race between an untracked background flush and the test's IndexedDB read, which the test's offline model lets succeed:

1. **`context.setOffline(true)` does not stop `page.route` interception.** This was already measured and written down in `tests/e2e/fixtures/guarded-test.ts:137-143`. The spec's `beforeEach` installs `mockSupabaseData`, which answers `POST /rest/v1/sessions*` and `POST /rest/v1/session_sets*` with success no-ops (`fixtures/supabase-mock.ts:241-260`). So to the app, an "offline" write succeeds.
2. **After `page.reload()`, `AutoSync` runs `void handle.flushNow()` on mount** (`apps/web/src/lib/offline/AutoSync.tsx`). Unlike the enqueue path (`sync.ts`, `if (!navigator.onLine) return`) and `refreshAll` (guarded by `navigator.onLine`), it doesn't check `navigator.onLine`. In real offline Chromium, that fetch throws `TypeError`. `flush()` returns `network-error`, the sets stay queued and the backoff retries later. In this spec the mocks fulfil it instead.
3. **A successful flush deletes the sent rows from the `sets` store** (`flush.ts` `removeSyncedIfNotReedited`, `db.sets.delete(key)`). `liveSets()` in the spec reads only that store.
4. The test waits only for `[data-screen-id="UF-02.1"]` to be visible, then reads `sets`. Nothing orders that read against the fire-and-forget mount flush. If the read wins, the test passes (local, ~15 ms margin). If the flush wins, the test gets `[]` (CI, about half the time).

The spec's own header states the false premise: "The context goes offline first, so AutoSync never flushes anything."

**Product bug or test timing?** It's a **test-harness bug**, not an offline write/flush bug in the product. The three sets are written to IndexedDB before each row shows as checked (the spec asserts `Mark set N not done` is checked, and `ListView` only flips after `ctx.recordSet` resolves on the IDB commit). The reload doesn't lose them. They are "lost" only because a mocked server accepted them, and the queue then correctly dropped them. On a real offline device the upsert fails and they stay queued (NFR-OFF-2 holds). This also isn't a "waits too tight" problem: no longer timeout fixes it, because the race is against an unawaited background task. The mount flush ignoring `navigator.onLine` is a harmless inconsistency in the product (the fetch just fails offline). It isn't the defect.

## Proposed fix

**Primary (lane `qa`, `tests/e2e/uf-03-list-summary.spec.ts`):** make the T-0458 test model offline faithfully, using the pattern `tests/e2e/uf-09-offline.spec.ts:257-285` already uses (T-0468). Once the context goes offline, the Supabase *write* routes must `route.abort("internetdisconnected")` instead of fulfilling. Do this with an `online` gate, or with routes for `${VITE_SUPABASE_URL}/rest/v1/sessions*` and `…/session_sets*` (non-GET) registered **after** `mockSupabaseData`, since the last-registered page route wins. The mount flush then gets a `TypeError` → `network-error`, and the three sets deterministically stay in `sets`. `supabaseGuard` already exempts `net::ERR_INTERNET_DISCONNECTED` failures, and `consoleGuard` already exempts Chromium's `Failed to load resource:` line. Also fix the header comment's claim that AutoSync never flushes.

A deterministic alternative (if the AC is read as "the sets end up stored", whether queued or sent) is to record every `session_sets` upsert body the mock receives and assert the union of the queued rows and the sent rows. That changes what the test proves, though. The abort gate keeps it an offline-persistence test, which is what NFR-OFF-2 asks for. Don't raise timeouts and don't add retries.

**Secondary (lane `qa`, `tests/e2e/fixtures/**`), optional:** add a shared `goOffline(page, context)` helper that sets the context offline *and* installs the abort gate for Supabase writes, so no other offline spec can fall into the same trap. `uf-09-focus.spec.ts` also reads the `sets` store after an offline reload (`setsFor`, lines 249-307). Its sets are written after the reload's mount flush, so it isn't exposed today, but a `TOKEN_REFRESHED`-triggered flush would hit it the same way.

**Optional product hardening (lane `web-shell`, `apps/web/src/lib/offline/AutoSync.tsx`):** guard the mount flush with `if (navigator.onLine)`, as `refreshAll` beside it already is. In real offline this changes nothing (the fetch would fail anyway) except saving one doomed request and a 2 s backoff timer. Don't let it substitute for the qa fix: the e2e must not depend on it.

## Regression test

In the fixed spec, after the reload and the `liveSets` read, also assert that the mock recorded **zero fulfilled** `POST …/session_sets*` / `POST …/sessions*` while offline, and that at least one write was aborted (proving the mount flush ran and was refused). Then wait for quiescence before the read: for example, `expect.poll` on "an aborted `session_sets` POST has been seen" (or a 500 ms settle after it), then read `sets`. That way the read always comes after the flush attempt rather than racing it. A planted fault proves the guard: remove the abort gate (fulfil the writes again) and the zero-fulfilled-writes assertion must fail on every run, not just under load.

## Related: T-0418 `rest.test.tsx` failure in run 37152271297

The same run's `typecheck / lint / unit test` job failed at step `Run pnpm turbo run test --concurrency=1` (job 111288462504; `gh run view --log-failed` omits it, but `gh api …/jobs/111288462504/logs` has it):

```
FAIL src/features/UF-03/__tests__/rest.test.tsx > T-0418 AC-3 rest view (UF-03.2) > the chrome announcer speaks '10 seconds' at <= 10 s and 'Go' at expiry, with no own aria-live
AssertionError: expected '10 seconds' to be 'Go' // Object.is equality
  281|     vi.setSystemTime(nowMs + 120_000);
  282|     await waitFor(() => expect(announcer()).toBe("Go"));
```

**Different root cause; the only thing shared is that CI is slower.** The test fakes only `Date` (`vi.useFakeTimers({ toFake: ["Date"] })`). REST_END and "Go" come only on the host's next **real** `setInterval` re-render (`RERENDER_MS = 1000`, `features/UF-09/use-rerender.ts`). Testing Library's `waitFor` defaults to a 1000 ms timeout. So the wait window is exactly one tick period with zero margin, and on a loaded runner the tick, render and effect chain lands just after 1000 ms (the failing test took 2105 ms). It's a test-timing issue in lane `web-feature:UF-03`. The deterministic fix is to stop depending on the real interval: also fake `setInterval`/`setTimeout` and `vi.advanceTimersByTime(1000)` after `setSystemTime`, or drive the re-render explicitly. It shouldn't be fixed by raising the `waitFor` timeout. It should get its own ticket. It doesn't belong in T-0906.
