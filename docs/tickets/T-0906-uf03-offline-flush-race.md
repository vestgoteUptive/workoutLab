---
id: T-0906
title: CI e2e green again. The T-0458 UF-03.1 List view offline test aborts Supabase writes while offline, so the mount flush can't drain the queued sets before the test reads them
lane: qa
screens: [UF-03.1]
decisions: [D-0086, D-0091, D-0155]
deps: [T-0458]
status: ready
---
<!-- Written by product-owner 2026-10-03 (ci-spec mode) from docs/ci/CI-T-0906-uf03-list-view-offline-flush-race.md (classification: flaky, qa lane; a test-harness bug, NFR-OFF-2 holds on a real device). Build flow: wl-build-qa (agent qa). About ¼ day. It applies the existing uf-09-offline.spec.ts `recordWrites` abort pattern (T-0468), so it needs no new decision. -->

## Why
The `playwright e2e` job went red on `main` at `470a675` (run 37151653264) and `381a1cb` (run 37152271297). In each run, 216 of 217 tests passed. The failing test is `tests/e2e/uf-03-list-summary.spec.ts:496` › `T-0458 UF-03.1 List view, offline (NFR-OFF-2)` › `AC-1/AC-2: Pause, List view, three rows checked by keyboard, Finish, Save, reload`. After the offline reload, `liveSets` returns `[]` instead of the three `back-squat` sets. The same code passed on CI at `3fd0fc7` and `29a4649`, so this is a flake and not a regression.

The cause is in the test harness, not the product:
1. `context.setOffline(true)` does not stop `page.route` interception (`fixtures/guarded-test.ts:137-143`). The spec's `beforeEach` registers `mockSupabaseData`, which answers `POST …/rest/v1/sessions*` and `…/session_sets*` with success.
2. After `page.reload()`, `AutoSync` calls `flushNow()` on mount without checking `navigator.onLine`. The mock accepts the writes, and `flush.ts` correctly deletes the sent rows from the `sets` store.
3. Nothing in the test orders its `sets` read against that fire-and-forget flush. Locally the read wins by about 4–15 ms. On CI's slower 2-worker runner, the flush wins about half the time.

On a real offline device, the upsert throws, `flush()` returns `network-error` and the sets stay queued. The spec's header comment also claims something false: "The context goes offline first, so AutoSync never flushes anything." The fix is to model offline properly by aborting Supabase writes while offline. `tests/e2e/uf-09-offline.spec.ts` (`recordWrites`, lines ~245-300, T-0468) already does this. The fix also orders the read after the refused flush attempt instead of racing it. No timeout or retry fixes this race, because it is against an un-awaited background task.

## Scope
- In (`tests/e2e/uf-03-list-summary.spec.ts` only):
  - **Add an offline write gate for the T-0458 AC-1/AC-2 test.** Add a local helper next to `openSessionOffline`, modelled on `recordWrites` in `uf-09-offline.spec.ts`. It registers `page.route` handlers for `${VITE_SUPABASE_URL}/rest/v1/sessions*` and `${VITE_SUPABASE_URL}/rest/v1/session_sets*`, and has these properties:
    - The handlers are registered **after** the `beforeEach`'s `mockSupabaseData`. The last-registered route runs first, so the gate wins.
    - A `GET` request is passed on unchanged with `route.fallback()`, so `mockSupabaseData` keeps answering reads.
    - A non-`GET` request while the gate is offline calls `route.abort("internetdisconnected")` and is counted as **aborted**.
    - A non-`GET` request while the gate is online calls `route.fallback()`, so the online warm-up behaves exactly as it does today.
    - The gate goes offline in the same step as `context.setOffline(true)`. That is before `seedRunningSession` and before the `goto('/session/S1')` that follows it, because that navigation's mount flush could already send the seeded session.
  - **Count fulfilled writes independently of the gate.** Use `page.on("requestfinished")` for non-`GET` requests to those two URL patterns, counted only after the context went offline. A write the gate aborts fires `requestfailed`, not `requestfinished`. A write fulfilled by any route counts as **fulfilled**. Because this counter doesn't rely on the gate's own bookkeeping, removing the gate makes it non-zero (AC-3).
  - **Order the read after the flush attempt.** After `page.reload()` and the UF-02.1 visibility check, and **before** `liveSets` and `storedSession`:
    - `await expect.poll(() => writeAttemptsSinceReload)` until it is `>= 1`. A write attempt is any non-`GET` `request` event to either pattern after the reload, whether it is aborted or fulfilled. Use the default `expect.poll` timeout.
    - Then assert `fulfilledWhileOffline === 0`.
    - Then assert `abortedWhileOffline >= 1`.
    - Then read `sets`.

    Count any write attempt, not only `session_sets`. A flush that is refused on `sessions` may never send `session_sets`.
  - **Keep every existing assertion of AC-1/AC-2 byte-identical.** That covers the three checked rows, row 4 unchecked, the UF-03.3 Save flow, the `squatSets` `toEqual` of three rows, `effort_rating` 3, a non-null `ended_at`, no `/functions/v1/` calls and `supabaseGuard.unclaimed()` empty.
  - **Fix the file's header comment.** Remove "The context goes offline first, so AutoSync never flushes anything." Say instead that `setOffline` does not stop `page.route`, that AutoSync's mount flush runs regardless, and that the T-0458 AC-1/AC-2 test therefore aborts Supabase writes while offline and waits for the refused flush before it reads `sets`.
  - The gate may be installed through `openSessionOffline` (so AC-3's axe test gets it too) or only in the AC-1/AC-2 test body. Either is fine, as long as the gate is in place no later than `context.setOffline(true)`.
- Out:
  - Any `apps/**` or `packages/**` change. The optional `if (navigator.onLine)` guard on the mount flush in `AutoSync.tsx` is a separate web-shell ticket. This e2e must not depend on it (AC-5).
  - `tests/e2e/fixtures/**`. The optional shared `goOffline(page, context)` helper is a separate qa ticket (follow-up 1).
  - The T-0420 AC-7 describe in the same file (`openSummaryOffline`, its two tests). Its reload reads only the `sessions` store, and it has not flaked. Follow-up 1 covers it.
  - Raising any timeout. Adding `retries`, `test.slow` or `test.setTimeout`. Adding a fixed `waitForTimeout` in place of the poll. Skipping the test (D-0086 §6 and the T-0905 AC-5 precedent).
  - Replacing the persistence assertion with "queued ∪ sent". That would turn an offline-persistence test (NFR-OFF-2) into a weaker one.
  - The T-0418 `rest.test.tsx` failure seen in run 37152271297. It has a different cause (follow-up 3).

### Edge cases that are in scope
- **Offline.** This is the whole ticket. After an offline Save and reload, the three sets are still queued in IndexedDB because the flush was refused, not because it lost a race (AC-1, AC-2).
- **Online warm-up.** Before `setOffline`, writes still go through `mockSupabaseData` exactly as today. The gate only aborts while offline, so `cachesFilled` and `precacheSettled` don't change.
- **Backoff retries.** After the refused mount flush, AutoSync's backoff may try again (about 2 s later) during the rest of the test. Those attempts are aborted too. They can only raise `abortedWhileOffline` and never `fulfilledWhileOffline`. The assertions are written so that extra aborted attempts don't matter.
- **Guard.** An aborted write fails with `net::ERR_INTERNET_DISCONNECTED`, which `supabaseGuard` already exempts. Chromium's `Failed to load resource:` console line is already exempt in `consoleGuard`. An abort is not `ERR_ABORTED`, so the D-0173 detector-2 gap does not apply. If the guard still trips, raise a follow-up. Do not edit the fixture (AC-6).
- **Time running out.** No timeout grows. The default `expect.poll` timeout is enough, because the mount flush fires within about 100 ms of the reload (diagnosis trace: +80–90 ms).
- **Zero history.** `sets: []` on the server. The only sets are the three the test logs offline.

## Acceptance criteria
Every command runs from the repo root through `scripts/locked.sh heavy` (D-0169), with `CI=1`, `--config tests/e2e/playwright.config.ts` and `VITE_SUPABASE_*` unset in the shell. `testsRun` records each command and its pass/fail counts.

- **AC-1 (writes are refused while offline, and the refusal is observed).** Given the T-0458 setup: an injected session, caches filled, the precache settled, the write gate registered after `mockSupabaseData` and switched offline together with `context.setOffline(true)`, S1 seeded, three rows checked by keyboard, Finish, then Save to `/`. When the page reloads and `[data-screen-id="UF-02.1"]` is visible, then:
  - `expect.poll` sees at least 1 non-`GET` request to `…/rest/v1/sessions*` or `…/rest/v1/session_sets*` after the reload.
  - The number of such requests that fired `requestfinished` since the context went offline is exactly `0`.
  - The number the gate aborted is `>= 1`.
- **AC-2 (the queued sets survive the reload, in order after the flush attempt).** Given AC-1's assertions have passed, when the test then reads the `sets` store, then:
  - the live `back-squat` sets for S1, sorted by `setIndex`, equal exactly `[{setIndex 0, 100 kg, 6 reps}, {setIndex 1, 100 kg, 6 reps}, {setIndex 2, 100 kg, 6 reps}]`;
  - the stored session has `effort_rating` 3 and a non-null `ended_at`;
  - there were no `/functions/v1/` calls;
  - `supabaseGuard.unclaimed()` is `[]`.

  These are the existing T-0458 assertions, unchanged.
- **AC-3 (fault proof: removing the gate fails on every run).** The dev plants one fault. It is not committed. Make it on a backup copy of the spec and restore it with `cp`, per the proof-hygiene rule.
  1. **No gate.** Make the gate's non-`GET` offline branch call `route.fallback()` instead of `route.abort("internetdisconnected")`, so `mockSupabaseData` fulfils the writes again. Run `scripts/locked.sh heavy env CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/uf-03-list-summary.spec.ts -g "AC-1/AC-2: Pause" --repeat-each=3 --workers=1`. It fails **3 of 3**. Every failure is the `fulfilledWhileOffline === 0` assertion, not the `squatSets` `toEqual` and not a timeout. That proves the test now fails deterministically on the bug instead of depending on the race.
  2. **Late gate.** Register the gate only after `page.reload()` (or switch it offline only after the reload). Run the same command. It fails at least 1 of 3, on the zero-fulfilled assertion or on `squatSets`. Record the count. This fault is informational. It shows why AC-1 requires the gate to be in place before the post-offline navigations.

  Restore the spec and confirm it matches the committed version. `git diff main -- apps/ packages/ tests/e2e/fixtures/` must be empty. Record both runs (command, counts, first failing assertion) in `testsRun`.
- **AC-4 (stable, repeated, at CI's worker count).** Run `scripts/locked.sh heavy env CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/uf-03-list-summary.spec.ts --repeat-each=10 --workers=2`. It reports 0 failed. Then the full suite (`scripts/locked.sh heavy env CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts`) exits 0 with the same test count as `main` (217 today; this ticket adds no test). If the count differs, record why. The cached full gate (`-w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`) is green.
- **AC-5 (nothing else weakened; no product dependency).** Given the branch diff against `main`:
  - Only `tests/e2e/uf-03-list-summary.spec.ts` and this ticket file change.
  - Inside the spec, the T-0420 AC-7 describe and `openSummaryOffline` are byte-identical.
  - Every pre-existing `expect` in the T-0458 describe is byte-identical.
  - No `timeout:` value is added or increased. No `retries`, `test.slow`, `test.setTimeout`, `waitForTimeout`, `.skip` or `.fixme` is added.
  - `tests/e2e/playwright.config.ts`, `tests/e2e/fixtures/**`, `apps/**` and `packages/**` are unchanged. AC-1 therefore passes against today's `AutoSync.tsx`, whose mount flush ignores `navigator.onLine`.
- **AC-6 (guarded, per D-0086 / D-0155).** The spec still imports `test`/`expect` from `./fixtures/guarded-test.js`, and the source check in `fixture-guard.spec.ts` still passes. AC-1/AC-2 triggers no unclaimed Supabase request and no unacknowledged 501-backstop hit. The aborted writes are claimed by the gate's routes, and their `ERR_INTERNET_DISCONNECTED` failures are exempt, so the guard's teardown passes without any fixture change.
- **AC-7 (header comment tells the truth).** The file's header comment no longer contains "AutoSync never flushes anything". It says that `setOffline` doesn't stop `page.route`, that the mount flush runs anyway, and that the T-0458 test aborts writes while offline. Reviewed in the diff.
- **AC-8 (CI green on a draft PR).** Given a draft PR from `t/T-0906-uf03-offline-flush-race` to `main`, when `CI` runs on `pull_request`, then `playwright e2e` concludes `success` on its first attempt, and `checks` and `supabase` stay green. Put the run URL in the result notes. The ticket can't be accepted without it (the T-0904 AC-10 and T-0905 AC-7 precedent).

## Paths you may change
- `tests/e2e/uf-03-list-summary.spec.ts`: the header comment, the T-0458 describe, `openSessionOffline`, and one new local gate helper. Add a `VITE_SUPABASE_URL` import from `./fixtures/supabase-mock.js` if it isn't already imported.
- `docs/tickets/T-0906-uf03-offline-flush-race.md` (this file), for the build/accept log only.
- **Not yours:**
  - `apps/**` and `packages/**`.
  - `tests/e2e/fixtures/**` and `tests/e2e/playwright.config.ts`.
  - The other `tests/e2e/*.spec.ts` files.
  - `.github/**` and `docs/ci/**`.
  - `.squad/board.md` and `.squad/state.md`.

## Contract impact
None. There is no schema, API, engine or token change. This applies the existing T-0468 abort pattern, so no new decision is needed. D-0091 (offline route tests set up the state the built screen needs) is the convention it follows.

## Definition of done
- Every AC has a passing test, or a recorded run for AC-3 and AC-8.
- AC-4's `--repeat-each=10 --workers=2` run is 0 failed.
- The full e2e suite is green under `CI=1`.
- The cached full gate is green.
- No timeout or retry is raised (AC-5).
- Contracts are unchanged.
- Commits start with `T-0906:` and cite `UF-03.1`.

## Notes
- **Flow:** `wl-build-qa`. Ask QA to fault-inject independently. Suggested faults:
  - AC-3 fault 1 (fallback instead of abort) must go red 3/3.
  - Make the `expect.poll` count only `session_sets` attempts. It may then time out when the flush stops at `sessions`. That shows why AC-1 counts any write.
  - Count "fulfilled" from the gate's own bookkeeping instead of `requestfinished`. Fault 1 then stays green. That shows the counter must be independent of the gate.
- **Why no decision.** The abort gate is already the established pattern in `uf-09-offline.spec.ts`, and D-0091 covers "offline e2e sets up a faithful state". D-0173 (the `ERR_ABORTED` guard gap) does not apply, because the abort reason is `internetdisconnected`. D-0174 is unrelated.
- **Follow-ups (not in this ticket):**
  1. qa: a shared `goOffline(page, context)` helper in `tests/e2e/fixtures/**` that sets the context offline and installs the write-abort gate. Move `uf-03-list-summary.spec.ts` (both describes), `uf-09-focus.spec.ts` (`setsFor`, exposed if a `TOKEN_REFRESHED` flush fires) and other offline specs onto it.
  2. web-shell: guard `AutoSync`'s mount `flushNow()` with `if (navigator.onLine)`, as `refreshAll` already is. This is hardening only. The e2e must keep passing without it (AC-5).
  3. web-feature:UF-03: the T-0418 `rest.test.tsx` "Go" announcer test waits exactly one real 1000 ms tick (the run 37152271297 unit job). Fake `setInterval` and advance it, rather than raising the `waitFor` timeout. It gets its own ticket.
  4. Orchestrator (repeat of T-0904/T-0905): require a green `pull_request` run before merging branches that touch `tests/e2e/**`. T-0458 merged on a local pass that won the race.
