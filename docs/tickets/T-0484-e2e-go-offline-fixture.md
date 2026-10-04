---
id: T-0484
title: "Shared goOffline(page, context) e2e fixture: context offline plus a Supabase write-abort gate in one call; UF-03.1/UF-03.3 and UF-09.3 offline specs move to it; audit every setOffline site"
lane: qa
screens: [UF-03.1, UF-03.3, UF-09.3, UF-09.7]
decisions: [D-0175, D-0086, D-0091, D-0158, D-0169, D-0173]
deps: [T-0906]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner (D-0175 §3 §4) from the "Proposed fix → Secondary" and
"Regression test" sections of docs/ci/CI-T-0906-uf03-list-view-offline-flush-race.md. Build flow:
wl-build-qa. About ½ day. T-0485 waits for this ticket. -->

## Why
`context.setOffline(true)` does not stop `page.route` interception (measured; see
`fixtures/guarded-test.ts`, D-0086 §4). `mockSupabaseData` answers `POST`/`PATCH` to `sessions*`
and `session_sets*` with success. So in an "offline" spec, any write the app makes still succeeds,
and the queue then correctly deletes the rows the spec is about to read. That was T-0906's CI
flake. T-0906 fixed it once, inside `uf-03-list-summary.spec.ts` (`installWriteAbortGate` +
`writeCounters`). `uf-09-offline.spec.ts` already had its own version (`recordWrites` +
`networkGate`, T-0468). A third offline spec would have to rediscover the trap.

This ticket makes one fixture that models offline faithfully for writes. It moves the specs that
read the offline queue onto it, and records which other `setOffline` sites are exposed.

It also removes a hidden coupling. T-0906's regression assertion
(`attemptsSinceArmed() >= 1`, `abortedWhileOffline >= 1`) passes only because AutoSync's mount
flush runs while `navigator.onLine` is false. T-0485 guards that flush, so it would turn the
assertion red. D-0175 §3: no offline spec may require a write attempt after going offline.

## Scope
- In:
  - **`tests/e2e/fixtures/offline.ts` (new)** exports `goOffline(page, context)`, which returns
    `Promise<OfflineGate>` (D-0175 §3).
    - **Arm, then go offline.** It registers one `page.route` for `${VITE_SUPABASE_URL}/rest/v1/**`.
      While the gate is armed, a request whose method is neither `GET` nor `HEAD` gets
      `route.abort("internetdisconnected")`. `GET`/`HEAD`, and every request while the gate is
      disarmed, get `route.fallback()`, so the spec's own mocks answer as before. The gate is
      armed before `context.setOffline(true)` is awaited, so there is no window where the context
      is offline and a write can still be fulfilled.
    - **Counters.** `writesFulfilledOffline()` counts non-GET/HEAD `rest/v1` requests that
      finished (`requestfinished`) while armed. `writesAbortedOffline()` counts those the gate
      aborted. Neither counts anything from before `goOffline` or after `goOnline`.
    - **`goOnline()`** disarms the gate, then calls `context.setOffline(false)`.
    - **Ordering hazard.** The doc comment says the gate must be the most recently registered
      matching route, so it must be called after `mockSupabaseData` and any spec route on the same
      URLs. A route registered later shadows it. A self-test pins that (AC-2).
    - **Scope of one page.** The gate is installed on the `page` it's given. A second page in the
      same context needs its own `goOffline`-style gate (out of scope; see Out).
  - **Self-tests:** a new `describe("T-0484 goOffline fixture")` in `tests/e2e/fixture-guard.spec.ts`,
    the fixture's existing self-test home (AC-1 to AC-3). The forced write is made from
    `page.evaluate(() => fetch(…, { method: "POST" }))`, which catches its own rejection, so the
    proof doesn't depend on any app flush.
  - **`tests/e2e/uf-03-list-summary.spec.ts`.**
    - `openSessionOffline` (T-0458) and `openSummaryOffline` (T-0420 AC-7) both use `goOffline`.
    - Delete `installWriteAbortGate`, `writeCounters` and `WRITE_URL_PATTERNS`.
    - In the T-0458 AC-1/AC-2 test, the `expect.poll(attemptsSinceArmed ≥ 1)` / `abortedWhileOffline ≥ 1`
      block becomes `expect(gate.writesFulfilledOffline()).toBe(0)`. Assert it once right after
      the post-reload `UF-02.1` is visible, and again after the `liveSets` read. While writes are
      refused, the queue can't drain, so the read needs no ordering.
    - The T-0420 AC-7 test asserts `writesFulfilledOffline() === 0` after its stored-row read.
    - Rewrite the header comment (lines 10–16) to point to the fixture.
  - **`tests/e2e/uf-09-focus.spec.ts`.** The two offline paths that read `wl-offline.sets`
    through `setsFor` use `goOffline`:
    - T-0304b AC-12 (the inline `context.setOffline(true)` before `page.reload()`);
    - `openOffline` (used by the T-0304f AC-5 rows and the timed-set row that polls `setsFor`).

    Each `setsFor` read is followed by `expect(gate.writesFulfilledOffline()).toBe(0)`.
    `openOffline` returns the gate. Its other callers ignore it.
  - **`tests/e2e/uf-09-offline.spec.ts`: comment only.** The `NetworkGate` comment (lines 220–229)
    claims AutoSync's mount flush "runs unconditionally". Reword it so it is true with or without
    T-0485: "an app flush (the mount flush, an auth-event or `online` flush) may run while the
    context is offline". Code is unchanged.
  - **The audit (AC-7).** For every `context.setOffline(true)` site in `tests/e2e/*.spec.ts`
    (about 40 sites in 12 files today), the build log records whether the spec, after going
    offline:
    - reads a `wl-offline` queue store (`sets`, `sessions`);
    - or asserts on write counts/bodies.

    For each site, the log gives the verdict **exposed** (a fulfilled write can change what it
    asserts) or **not exposed**, with the reason.
- Out:
  - Migrating `uf-09-offline.spec.ts`'s `recordWrites`/`networkGate`. It records write bodies
    across two contexts and already models offline correctly. If it is worth rebuilding on top of
    `goOffline`, add that as a follow-up.
  - Making reads fail offline. Reads keep falling through to mocks (D-0175 §3, "Revisit when").
  - Changing any other spec's offline site. An **exposed** site outside the three files above
    becomes a follow-up row (qa) in the result, not an edit here.
  - `apps/**` and `packages/**`. AC-6's product edit is local and temporary.
  - `fixtures/guarded-test.ts` and `fixtures/supabase-mock.ts`. `supabaseGuard` already exempts
    `net::ERR_INTERNET_DISCONNECTED` and `consoleGuard` already exempts Chromium's
    `Failed to load resource:` line (T-0906 relied on both). If the self-test shows otherwise,
    that's a `needs-triage`, not a guard edit (D-0173).
  - Raising timeouts, adding `retries`, `test.slow`, `.skip` or `.fixme` (D-0086 §6).

### Edge cases that are in scope
- **Offline:** this whole ticket. The gate makes "offline" mean what it means on a device: a
  write fails with a network error and the row stays queued (NFR-OFF-2).
- **Returning online:** `goOnline()` disarms before the context goes online, so the `online`
  event's flush reaches the mocks (AC-3).
- **Time running out:** no timeout grows. The UF-09 auto-save (5 s) and get-ready rows keep
  their existing `{ timeout: 10_000 }` waits unchanged.
- **Zero history:** every migrated spec seeds `sets: []`. The queue rows under test are the ones
  logged offline.
- **Returning after 10 days off:** an auth-event flush (`TOKEN_REFRESHED`) while offline is
  the realistic version of this. It is the reason `setsFor` gets the gate even though nothing
  exposes it today (Notes).
- **Route shadowing:** a mock registered after `goOffline` silently disables it. AC-2 makes that
  visible.

## Acceptance criteria
Every e2e command runs from the repo root with `CI=1` and
`--config tests/e2e/playwright.config.ts`, through `scripts/locked.sh heavy`. `testsRun` records
each command with its pass/fail counts.

- **AC-1 (writes abort, reads pass).** Given an injected session, `mockSupabaseData` registered,
  `/` loaded and `goOffline(page, context)` awaited:
  - when the page `fetch`es `POST ${VITE_SUPABASE_URL}/rest/v1/session_sets`, then the fetch
    rejects with a `TypeError`, `writesAbortedOffline()` is 1 and `writesFulfilledOffline()` is 0;
  - the same holds for `PATCH …/rest/v1/sessions?id=eq.x` and `POST …/rest/v1/plan_checkins`
    (counts 2 and 3);
  - `GET …/rest/v1/exercises` under the same gate resolves 200 with the mock's body;
  - `navigator.onLine` is `false`.

  The guarded fixture's teardown passes: no unclaimed request and no console error.
- **AC-2 (shadowing is visible).** Given `goOffline` awaited and *then* a spec route on
  `${VITE_SUPABASE_URL}/rest/v1/session_sets*` that fulfills 201, when the page POSTs to it, then
  the fetch resolves and `writesFulfilledOffline()` is 1. That is the documented hazard, pinned so
  the doc comment can't drift.
- **AC-3 (goOnline).** Given AC-1's state, when `goOnline()` resolves, then `navigator.onLine` is
  `true` and the same POST resolves through `mockSupabaseData`. Both counters still read what they
  read before `goOnline` (nothing counted after disarm).
- **AC-4 (UF-03 migrated, no attempt required).** In `uf-03-list-summary.spec.ts`:
  - `installWriteAbortGate`, `writeCounters` and `WRITE_URL_PATTERNS` are gone.
  - `openSessionOffline` and `openSummaryOffline` call `goOffline`.
  - No assertion requires `writesAbortedOffline() >= 1` or any other attempt count.
  - The T-0458 AC-1/AC-2 and T-0420 AC-7 tests assert `writesFulfilledOffline() === 0` as in
    Scope, and the rest of their assertions are byte-identical.
- **AC-5 (UF-09 setsFor paths gated).** In `uf-09-focus.spec.ts`, T-0304b AC-12 and `openOffline`
  use `goOffline`, and every `setsFor` read is followed by `writesFulfilledOffline() === 0`. The
  rows' other assertions are byte-identical.
- **AC-6 (fault proofs).** None of these is committed. Restore each from a `cp` backup.
  1. **Gate off.** In `fixtures/offline.ts`, make the armed branch `route.fallback()`. AC-1 fails,
     and the T-0458 AC-1/AC-2 test fails on `writesFulfilledOffline() === 0`. On `main`, AutoSync's
     mount flush is fulfilled by the mock. Run with `--repeat-each=3 --workers=1`: 3/3 red each.
  2. **T-0485 compatibility.** Locally add `if (navigator.onLine)` around `void handle.flushNow()`
     in `apps/web/src/lib/offline/AutoSync.tsx` (the T-0485 change), rebuild, and run
     `uf-03-list-summary.spec.ts`, `uf-09-focus.spec.ts` and `uf-09-offline.spec.ts`. All are
     green. This shows that no migrated assertion needs the mount flush.

  Afterwards `git diff main -- apps/` is empty. Record both runs (command, counts, first failing
  assertion) in `testsRun`.
- **AC-7 (audit recorded).** The build log has one table row per `context.setOffline(true)` site,
  with file:line, what it reads or asserts after going offline, and exposed/not exposed with the
  reason. Every **exposed** site outside the three edited files appears in `followUps` (lane
  `qa`). `uf-09-focus.spec.ts`'s `setsFor` row states the finding in Notes (or corrects it, with
  evidence).
- **AC-8 (stable, nothing weakened).**
  - `--repeat-each=5 --workers=2` over `fixture-guard.spec.ts -g "T-0484"`,
    `uf-03-list-summary.spec.ts` and `uf-09-focus.spec.ts` reports 0 failed.
  - The full web e2e (`tests/e2e/fixtures/**` changed, D-0158) exits 0, with the count recorded.
  - No `timeout:` is added or increased.
  - `playwright.config.ts`, `guarded-test.ts` and `supabase-mock.ts` are unchanged.
  - Every touched spec still imports `test`/`expect` from `./fixtures/guarded-test.js`.

## Paths you may change
- `tests/e2e/fixtures/offline.ts` (new)
- `tests/e2e/fixture-guard.spec.ts` (the new `describe` only)
- `tests/e2e/uf-03-list-summary.spec.ts`
- `tests/e2e/uf-09-focus.spec.ts` (the T-0304b AC-12 row, `openOffline` and the `setsFor` call
  sites only)
- `tests/e2e/uf-09-offline.spec.ts` (the `NetworkGate` comment only)
- `docs/tickets/T-0484-e2e-go-offline-fixture.md` (this file, for the build and accept logs)
- **Not yours:** `apps/**`, `packages/**`, `tests/e2e/playwright.config.ts`,
  `tests/e2e/fixtures/guarded-test.ts`, `tests/e2e/fixtures/supabase-mock.ts`, `.github/**`,
  `docs/ci/**`.

## Contract impact
None. This is a test-convention change, recorded in D-0175 §3.

## Definition of done
Every AC has a passing test or a recorded run (AC-6, AC-7). While working, run
`scripts/locked.sh heavy` on the single specs. Once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and the **whole** web e2e (fixtures changed). Follow T-0440's
message if port 4173 or `/tmp` stops the run. Contracts are unchanged. Commits start `T-0484` and
cite the screens, for example `T-0484 UF-03.1: goOffline fixture for offline specs`.

## Notes
- **Flow:** `wl-build-qa`.
- **Product-owner finding on `uf-09-focus.spec.ts` `setsFor` (lines 249–307, 351–366, 464–495):
  not currently exposed.**
  - `seedSessionRow` writes the session with `pending: false`, so after the offline
    `page.reload()` AutoSync's mount flush has nothing to send.
  - The set under test is logged *after* that reload.
  - The enqueue-triggered flush is guarded by `navigator.onLine` (`sync.ts`,
    `if (stopped || !navigator.onLine) return`).
  - No `online` event fires while the spec is offline.

  The paths left are a `SIGNED_IN`/`TOKEN_REFRESHED` auth-event flush or a backoff retry from an
  earlier failed flush. Neither happens in today's runs, but either would be fulfilled by the mock
  and empty `sets` exactly as T-0906 did. It's cheap to gate, so this ticket gates it (AC-5)
  rather than leaving a latent copy of T-0906.
- **Why the self-test forces its own write.** T-0906's proof ("at least one aborted write") used
  the app's mount flush as the probe. T-0485 removes that probe on purpose, so the proof would
  break for a correct change. A `fetch` from `page.evaluate` is a probe no product change can take
  away.
- **Follow-up candidates (not in this ticket):**
  - rebuild `uf-09-offline.spec.ts`'s `recordWrites` on `goOffline`;
  - give `goOffline` a `{ reads: "abort" }` option when a spec needs failing reads;
  - one row per exposed site from AC-7.

## Build / accept log
