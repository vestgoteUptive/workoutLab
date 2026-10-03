---
id: T-0468
title: UF-09 e2e from UF-08.4 — a 10-set offline workout that survives a closed page and flushes in order (NFR-OFF-2), two offline devices make two sessions (NFR-SYNC-4)
lane: web-feature:UF-09
screens: [UF-08.4, UF-09.1, UF-09.3, UF-09.4, UF-09.5, UF-09.6]
decisions: [D-0015, D-0045, D-0071, D-0086, D-0091, D-0110, D-0116, D-0120, D-0158, D-0168]
deps: [T-0304d, T-0304g, T-0303d]
status: ready
---
<!-- Written by product-owner 2026-10-03 (groom, D-0168 §1). Split out of T-0304h (its former AC-2
and AC-3; parent docs/tickets/T-0304-focus-mode.md AC-D8, AC-D9). Mostly e2e, in a new spec file so
it never edits T-0304h's spec. Build flow: wl-build-web. About ½ day. All deps are on main. -->

## Why
The core promise of a gym app: a workout started and logged with no network is never lost, even
when the tab is closed, and it reaches the server in order when the network comes back
(NFR-OFF-2). And two phones make two sessions, never a merge (NFR-SYNC-4). The unit tests prove
the queue; only a built browser with a service worker and a real IndexedDB proves the whole path.

## Scope
- In:
  - **A new spec** `tests/e2e/uf-09-offline.spec.ts` with its own `startFromReady` helper (the same
    walk as T-0304h's: `/` → Start workout → UF-08.1 → chip → Suggest → UF-08.2 → Looks good →
    UF-08.4 → Start; it returns the session id). It reuses `fixtures/uf-04-library-data.js`
    (`exercises`, `exerciseAreas`, `profile`) with no fixture edits.
  - **An in-spec recorder** for `sessions` and `session_sets` requests, registered after
    `mockSupabaseData` so it wins (the T-0303d AC-10 pattern).
  - **UF-09 fixes** in `features/UF-09/**` that these rows expose, each with a unit test.
- Out:
  - Reload timing and the keyboard walk (T-0304h).
  - Edits to `tests/e2e/fixtures/**`, `features/UF-08/**`, `lib/**` and other specs. If a row
    finds a bug in `lib/offline`, stop and file a follow-up (web-shell lane) instead of fixing it.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** start, 10 sets, a closed page, reopen, then a flush on reconnect (AC-1); two offline
  devices (AC-2).
- **Returning later:** a page closed and reopened resumes the same step (AC-1). The 12 h stale rule
  is T-0304a's and isn't re-tested.
- **Zero history:** the fixture profile has no history; the plan is the zero-history plan.
- **Time running out:** not applicable (rests are skipped; T-0304h owns the clock rows).

## Acceptance criteria
**Test setup.** As T-0304h: Playwright on the built app, `test`/`expect` from
`fixtures/guarded-test.js` (D-0086), `mockSupabaseAuth`, `mockSupabaseRest`,
`mockSupabaseData({exercises, exerciseAreas, profile, …})`, `mockProfilePresent`. Offline rows run
after the precache settles and assert built content after any reload or reopen (D-0091 §1). No row
depends on flush-on-enqueue timing: online asserts allow 10 s after the `online` event (D-0116).
At least one set per run goes through the real 5 s auto-save (D-0120 §9). Each test title starts
with `T-0468 AC-n`.

- **AC-1 (an offline workout, NFR-OFF-2, parent AC-D8)**
  - **Offline start.** After the precache settles, the context goes offline. `startFromReady` with
    the budget chip that gives ≥ 11 planned sets (the builder finds it, records it in the build
    log, and the test asserts the count from the IndexedDB session row's plan).
  - **Ten sets.** Skip warm-up, then 10 sets are logged through Done set followed by the auto-save
    or Save. Rests are skipped, UF-09.6 is passed with I'm ready, and a timed item is passed with
    `page.clock`.
  - **Close and reopen.** The step's `data-screen-id` and heading are noted, and the page is
    closed. A new page in the same context opens `/session/<id>` and shows the same
    `data-screen-id` and heading.
  - **IndexedDB.** `wl-offline.sets` holds exactly 10 rows for that session, with distinct
    `clientId`s, `isWarmup` false, and `setIndex`/`exerciseId` in plan order.
  - **Requests.** No `sessions` or `session_sets` request was recorded while offline.
  - **Online.** Going online, within 10 s the recorder sees the `sessions` row for that id, then
    10 `session_sets` rows. Each has that `session_id` and a distinct `client_id`, and none is sent
    before the session row.
- **AC-2 (two devices, NFR-SYNC-4, parent AC-D9)**
  - **Setup.** A second `browser.newContext()` gets the same mocks and its own
    `installSupabaseGuard(context)`.
  - **Two starts.** Both contexts go offline after their precache settles. Each runs
    `startFromReady` and logs 1 set.
  - **Online.** Both go online. Within 10 s, the two recorders together hold exactly two `sessions`
    rows, with different ids. Each context's one `session_sets` row references its own context's
    session id, and neither id appears in the other context's set rows (no merge).
  - **Requests.** Both guards report no unclaimed request.
- **AC-3 (one screen at a time, principle 1)** At every assert point above, `[data-screen-id]` has
  count 1, and `getByRole("navigation")` has count 0 on `/session/<id>`.

**Red proof (planted faults, on a backup copy, restored with `cp`; record each red run in the
build log).** These rows test code on main, so they are green there.
- AC-1: in `features/UF-09/**`, skip the `recordSet` call for the 10th set (or reuse one
  `clientId`). The IndexedDB count or distinct-ids assert must fail.
- AC-1: make the host ignore the stored focus state on restore, so the reopened page shows
  UF-09.1. The close-and-reopen assert must fail.
- AC-2: make the second context reuse the first context's session id (for example a fixed id
  injected through `page.addInitScript` overriding `crypto.randomUUID` in that context only). The
  two-ids assert must fail. This one fault lives in the test, not in app code; revert it the same
  way.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), for fixes these rows expose.
- **Listed extras:**
  - `tests/e2e/uf-09-offline.spec.ts`
  - `apps/web/src/lib/i18n/flows/uf-09.ts`
  - `docs/tickets/T-0468-focus-e2e-offline-and-two-devices.md`
- Notes on the extras: the spec is new (D-0071 §10); the strings file gets added keys only, and
  only for a fix that needs a string; this ticket file is for the build and accept logs.
- Read-only imports (not grants): the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The rows observe the `sessions` and `session_sets` requests the T-0300c queue already sends
(D-0045 §6, D-0015).

## NFRs owned
OFF-2 end-to-end (AC-1), SYNC-4 (AC-2).

## Definition of done
Tests for every AC pass · the new spec passes twice in a row with no flake · `uf-09-offline.spec.ts`
and `offline.spec.ts` green; the whole web e2e only if a UF-09 fix lands outside a test (D-0158) ·
`npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
`-w format:check` and `node .github/scripts/check-all.mjs` green, each inside
`flock /tmp/workoutlab-tests.lock` · contracts unchanged · commits start `T-0468` and cite the
screen (for example `T-0468 UF-09.3: ten offline sets survive a closed page`).

## Notes
- **Parallel.** Same lane as T-0304h but no shared file: either order. If one lands a
  `features/UF-09/**` fix, the other merges main before its gate. The playwright run takes the
  machine-wide lock, so the two never run e2e at the same time anyway.
- **Load.** Two browser contexts double the memory; if `/tmp` is near full, follow the T-0440
  message (`TMPDIR=$HOME/.cache/wl-pw-tmp`).

## Build / accept log

### Build (frontend-dev, 2026-10-03)
Branch `t/T-0468-uf09-offline-e2e`, HEAD `af4bfcf` at start, tree clean. Added one new file,
`tests/e2e/uf-09-offline.spec.ts`; no `features/UF-09/**` fix was needed (no row exposed an app
bug). Set-count builder (scratch `packages/engine/src/__tests__/zzz-probe.test.ts`, run then
deleted, repo clean before/after): at zero history with this spec's library/profile fixtures, the
"45 minutes" chip gives 5 items / 15 sets (bench-press×4, inverted-row×3, back-squat×3,
calf-raise×3, leg-curl×2), none timed — used for AC-1 (≥ 11 required). "30 minutes" (1 set) is
enough for AC-2/AC-3.

Two defaults picked (not contract changes, recorded for traceability rather than as new D-NNNNs
since they only affect this spec's own helpers):
- **Offline-safe navigation into a lazy route.** A click-driven SPA transition into a never-yet-
  loaded `React.lazy` chunk, made while `context.setOffline(true)`, failed with "Unable to preload
  CSS for …" even once the workbox precache held the asset and even after visiting the route once
  online earlier (every lazy mount re-inserts its own `<link>`, not just the first). Fixed by
  having `openHome`/`startFromReady` reach UF-08.1 only through `page.goto("/session/setup")`
  (the `uf-08-setup.spec.ts` offline row's own pattern: hard navigation online, then the same hard
  navigation again once offline) — never a click from `/`. UF-09's own chunk load (Start →
  `/session/<id>`, also offline) was not affected by this in practice.
- **A test-controlled `networkGate` for `recordWrites`.** `context.setOffline(true)` does not
  stop a mocked `page.route` handler from fulfilling (D-0086 §4's own finding). `AutoSync`'s
  mount-time `handle.flushNow()` (`apps/web/src/lib/offline/AutoSync.tsx`) runs unconditionally,
  with no `navigator.onLine` guard, so the "close and reopen" row's fresh second page was flushing
  the whole 10-set queue through the mock before the test ever called `setOffline(false)` —
  observed as the reopened page losing all 10 `wl-offline.sets` rows. `recordWrites` now takes a
  `{online: boolean}` gate and aborts a write (`route.abort("internetdisconnected")`) while it is
  false, flipped to `true` only when the test itself goes online — so a recorded "send" always
  matches what a real offline device would have done.

**AC → test map** (`tests/e2e/uf-09-offline.spec.ts`):
- AC-1 → `T-0468 AC-1 start, 10 sets, a closed page, reopen, then flush on reconnect` — offline
  start with the 45-minute chip (≥ 11 planned sets asserted from the stored plan), 10 sets through
  Done set/Save with one real 5 s auto-save, close-and-reopen same `data-screen-id`/heading, exactly
  10 distinct-`clientId` non-warmup `wl-offline.sets` rows in plan order, no `sessions`/
  `session_sets` request while offline, then online within 10 s: the session row lands, then 10
  `session_sets` rows, session write before any set write.
- AC-2 → `T-0468 AC-2 both offline, each logs a set, both online: two sessions, no merge` — two
  `browser.newContext()`s, each with its own `installSupabaseGuard`, each offline + 1 set, both
  online: exactly 2 distinct `sessions` ids across both recorders, each context's `session_sets`
  rows carry only its own session id, neither guard reports an unclaimed request.
- AC-3 → `T-0468 AC-3 every assert point above holds one [data-screen-id] and no navigation` —
  one `[data-screen-id]` and zero `navigation` landmarks after Start and after 3 logged sets,
  offline.

**Red proof** (each fault on a backup copy under `/tmp`, restored with `cp`; `git status` clean
before and after all three):
- AC-1 (IndexedDB count): `features/UF-09/session.tsx` `writeSet` — every 10th call fabricates a
  `clientId`/queued row instead of calling `queueRecordSet`, so that row never reaches
  `wl-offline.sets`. Red: `sets` has length 9, not 10 (caught exactly at the `toHaveLength(10)`
  assert).
- AC-1 (close-and-reopen): `features/UF-09/load.ts` — `readFocusState`'s result is discarded
  (`const stored = null`), so a restore always falls back to `initialFocusState` (UF-09.1). Red:
  the `data-screen-id` match on the reopened page fails ("element(s) not found").
- AC-2 (two-ids, fault lives in the test): both `pageA` and `contextB` get an
  `addInitScript`-planted `crypto.randomUUID` returning the same fixed UUID. Red:
  `expect(idA).not.toBe(idB)` fails with both equal to the fixed id.

**Gate.** `scripts/locked.sh heavy env CI=1 npx -y pnpm@10.28.2 exec playwright test --config
tests/e2e/playwright.config.ts tests/e2e/uf-09-offline.spec.ts` green (3/3), repeated
(`--repeat-each=2 --workers=1`, 6/6) with no flake; `tests/e2e/offline.spec.ts`,
`tests/e2e/uf-09-ready.spec.ts` (T-0304h) and `tests/e2e/fixture-guard.spec.ts` stay green
(74/74) — not touched by this ticket, so only confirmed, not gated on. Full gate, once, Turbo
cache on: `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` green (3352 tests, 242
files); `-w test:repo-checks` green (159); `-w format:check` green (after one `prettier --write`
on the new spec); `node .github/scripts/check-all.mjs` green. No contract touched. `tests/e2e/**`
is outside the pnpm workspace (`pnpm-workspace.yaml`) so it is not part of `-w typecheck`/`lint`;
confirmed the new file alone has zero `tsc --noEmit` errors under `apps/web`'s compiler options
(ad hoc scratch tsconfig, not committed) — the directory's only automated checks are Playwright
itself and `fixture-guard.spec.ts`'s source-rule scan, both green.

### Code review (code-reviewer, 2026-10-03)
Static review only, `git diff main...HEAD`. Verdict: **approve**.

- **Lane/paths.** `git diff main...HEAD --name-only` is exactly the two granted extras
  (`tests/e2e/uf-09-offline.spec.ts`, this ticket file); `git diff main...HEAD --name-only --
  apps/ packages/` is empty — no `features/UF-09/**` fix landed, matching the build log's "no row
  exposed an app bug". No contract path touched; `Contract impact: None` holds.
- **AC coverage.** Each of AC-1/AC-2/AC-3 has one named test matching its text (≥ 11 planned
  sets from the stored plan, 10 sets with distinct `clientId`s/no-warmup/plan order, no request
  while offline, online-within-10s with session-before-set ordering; two contexts/two session
  ids/no cross-session set/guard clean; one `[data-screen-id]` and zero navigation landmarks at
  every point). No `.skip`/`.only`/`xit` in the spec.
- **Planted faults are real.** Spot-checked the two app-code fault sites the log describes:
  `features/UF-09/session.tsx` calls `queueRecordSet` (aliased `recordSet`) per logged set, and
  `features/UF-09/load.ts` resolves `stored = readFocusState(...)` before falling back to
  `initialFocusState` — both match the described fault shape (skip the queue call /
  discard the stored read). The third fault is in the test's own `addInitScript`, as the ticket
  allows.
- **Finding 1 (hard nav instead of click into a lazy route offline).** Checked
  `tests/e2e/uf-08-setup.spec.ts`: it already uses the identical `page.goto("/session/setup")`
  reload pattern for its own offline row, so this is a pre-existing, already-accepted Playwright
  workaround for a Chromium/Workbox dynamic-`import()`-CSS quirk, not a new one invented to hide
  a bug. No AC here exercises a first-time click into a never-loaded chunk while offline as a
  product scenario (every row goes offline only after `precacheSettled`, then reaches
  `/session/setup` by reload) — genuinely a test-navigation-method artifact, not a product bug.
- **Finding 2 (`networkGate` around `AutoSync.flushNow()`).** Confirmed in
  `apps/web/src/lib/offline/AutoSync.tsx`: `void handle.flushNow()` runs unconditionally, no
  `navigator.onLine` guard. But `flush.ts`/`retry.ts` show the real-network path is already safe:
  a real `fetch` failure (offline, or merely slow/flaky) throws/rejects as a `TypeError`, which
  `flush.ts` catches and reports as `"network-error"`, which `RetryScheduler` backs off on — it
  never "fails noisily" in production. The only thing genuinely missing is an early
  `navigator.onLine` short-circuit to skip a doomed immediate attempt; that's an optimization, not
  a correctness gap, and the existing backoff path already covers a flaky-but-not-literally-
  offline connection. `context.setOffline` not blocking a mocked `page.route` is a Playwright-only
  interaction (no real network layer underneath a mock) — the gate is a faithful test-only stand-
  in, not evidence of a missing production guard. No follow-up needed; agree this stays
  unfixed-in-app-code per D-0168 §1 ("test-only unless a row finds a bug" — none found).
- **Gate/flake.** Build log records `--repeat-each=2 --workers=1` 6/6 green (double run, no
  flake), full `typecheck lint test`/`test:repo-checks`/`format:check`/`check-all.mjs` green, all
  via `scripts/locked.sh`. Taken as logged; not independently re-run (static review).

No findings requiring changes.

### QA accept log (qa-tester, 2026-10-03)
`git status` clean except this file's own prior unstaged review-log entry; HEAD `113e4b8e`.
Branch-behind-main: `git merge-tree <merge-base> HEAD main` — zero conflict markers; `comm -12` of
files changed on `main` since merge-base vs. files changed on this branch is empty (no overlap).
Clean, non-conflicting behind-main; left unmerged per D-0169 §2, no action taken.

**AC → test map, re-verified:** AC-1 → `T-0468 AC-1 start, 10 sets, a closed page, reopen, then
flush on reconnect`; AC-2 → `T-0468 AC-2 both offline, each logs a set, both online: two sessions,
no merge`; AC-3 → `T-0468 AC-3 every assert point above holds one [data-screen-id] and no
navigation`. Each test fails without its feature (see red runs below) and passes on `main`'s code.

**Red runs reproduced (each on a backup copy under `/tmp`, restored with `cp`, `git status` clean
before/after each):**
- AC-1 IndexedDB count (`features/UF-09/session.tsx` `writeSet`, every 10th call fabricates a row
  instead of calling `queueRecordSet`): red at `toHaveLength(10)`, received length 9. Matches build
  log.
- AC-1 close-and-reopen (`features/UF-09/load.ts`, stored focus state discarded): red at the
  reopened page's `data-screen-id` locator, "element(s) not found" (`[data-screen-id="UF-09.5"]`
  timeout). Matches build log.
- AC-2 two-ids (test-only fault, `crypto.randomUUID` fixed via `addInitScript` on both contexts):
  red at `expect(idA).not.toBe(idB)`, both equal to the fixed id. Matches build log.
- **QA's own fault** (`features/UF-09/chrome.tsx`): added a stray `<nav aria-label="qa-fault-
  stray-nav" />` to the focus chrome. Red at AC-3's `expectOneScreen`:
  `getByRole("navigation")` count 1, expected 0 — caught by the same assert AC-3 names.

**Flake check.** `scripts/locked.sh heavy … playwright test tests/e2e/uf-09-offline.spec.ts
--repeat-each=2 --workers=1` → 6/6 green. Single run (no repeat) → 3/3 green, 18.8s, after every
fault restore, confirming byte-identical restores.

**Regression suite.** `scripts/locked.sh heavy … playwright test tests/e2e/offline.spec.ts
tests/e2e/uf-09-ready.spec.ts tests/e2e/fixture-guard.spec.ts` → 74/74 green, matching the build
log.

**Gap found (not a named AC, but within "check for console errors"): AC-2's second
`browser.newContext()` (`contextB`/`pageB`) never gets `installConsoleGuard(contextB)` — only
`installSupabaseGuard(contextB)` is installed explicitly; the suite's auto `consoleGuard` fixture
only covers the fixture-provided first `context`/`page` (`contextA`/`pageA`). Demonstrated: a
probe that makes `pageB` emit a deliberate `console.error` via `addInitScript` still passes AC-2
(1 passed) — confirmed, then reverted (`cp` restore, `git status` clean). `fixture-guard.spec.ts`'s
source-rule scan (`ownConsoleListeners`) only flags a spec installing its *own* console/pageerror
listener; it does not flag a second context that installs none at all, so nothing else in the
repo catches this. Not a product bug and doesn't falsify AC-1/AC-2/AC-3 as written, so this does
not fail the ticket's own ACs, but a console error unique to the two-device code path would go
completely unnoticed by this spec. Flagged as a follow-up for the builder (same lane, same file,
one line: `installConsoleGuard(contextB)` + `guard.assertClean()` at AC-2's teardown) rather than
fixed here, to keep this run to verification only.

**Verdict: done.** Every AC has a named test that fails without its feature and passes with it;
regression suite and flake-repeat both green; branch cleanly mergeable (no action required of
QA). One coverage gap (console errors on AC-2's second context) raised as a follow-up, not a
blocker.

### Fix (frontend-dev, 2026-10-03)
Fixed QA's gap: `tests/e2e/uf-09-offline.spec.ts` AC-2 now calls `installConsoleGuard(contextB)`
right after `installSupabaseGuard(contextB)`, and asserts `consoleGuardB.assertClean()` at
teardown alongside `guardA.assertClean()`/`guardB.assertClean()` — the same pattern the auto
`consoleGuard` fixture already applies to the fixture's own `context`/`page`. Header comment
updated to say why `contextB` needs its own guard.

**Probe reproduced, then reverted.** Backup at `cp tests/e2e/uf-09-offline.spec.ts
/tmp/.../uf-09-offline.spec.ts.bak` before planting; restored with `cp` after, `git status` clean
both times; `git diff` after restore shows only the intended fix (+16/-1).
- Planted QA's probe (a deliberate `pageB.evaluate(() => console.error(...))` right before AC-2
  goes offline): red, `scripts/locked.sh heavy … test:e2e -- uf-09-offline.spec.ts -g "AC-2"` → 1
  failed at `fixtures/guarded-test.ts:282` (`assertClean`), naming
  `console.error: T-0468 QA probe: deliberate console.error on pageB` — confirms the new
  `consoleGuardB` now catches exactly what QA's probe demonstrated slipped through before.
- Restored from the backup (probe removed, fix intact, confirmed via `grep` for `QA probe` /
  `installConsoleGuard` / `consoleGuardB`): green, same command → 206/206 passed.

**Gate.** `scripts/locked.sh heavy … test:e2e -- uf-09-offline.spec.ts -g "AC-2"` (which runs the
whole configured spec list, not just the grep match) green twice in a row on the restored file:
206/206 passed. No other file changed; no regression expected or seen elsewhere in that run.

### Accept (product-owner, 2026-10-03)
`git status` clean, HEAD `7c54df4`. `git diff main...HEAD --name-only` is exactly the two granted
paths (`tests/e2e/uf-09-offline.spec.ts`, this ticket file) — no contract touched, no
`features/UF-09/**` app-code change, matching "test-only" per D-0168.

**AC-1.** Named test present; both planted-fault red proofs (IndexedDB 10th-row fabrication,
discarded restored focus state) reproduced by QA with matching failure messages, green on main's
code. Done.

**AC-2.** Named test present; test-only fixed-UUID fault reproduced red by QA, green restored.
QA's own gap — `contextB` had no console guard, demonstrated with a working probe (a deliberate
`console.error` on `pageB` still passed AC-2) — is directly closed by `7c54df4`:
`installConsoleGuard(contextB)` installed right after the existing `installSupabaseGuard(contextB)`,
`consoleGuardB.assertClean()` added at teardown. The fix re-ran QA's exact probe on a backup copy:
red at `assertClean`, naming the planted `console.error` (confirming the new guard now catches
what previously slipped through), then restored and green, 206/206 twice. Diff matches the
described shape exactly (`git show 7c54df4`). Done.

**AC-3.** Named test present, QA confirmed one `[data-screen-id]`/zero navigation landmarks at
every point, including through the fix (no change to AC-3's test or assertions). Done.

**Definition of done.** Spec green twice with no flake (build and QA both ran
`--repeat-each=2 --workers=1`; fix reran the full spec twice, 206/206 both times); regression
specs (`offline.spec.ts`, `uf-09-ready.spec.ts`, `fixture-guard.spec.ts`) green 74/74 per QA, untouched
by the fix; full gate (`typecheck lint test`, `test:repo-checks`, `format:check`, `check-all.mjs`)
green per build log, not re-run here (not required for accept; orchestrator forces the full gate on
`main` after merge). Contracts unchanged. Lane/paths respected — diff is exactly the two granted
extras. Commits start `T-0468` and cite screens. No `.skip`/`.only` (code review). Every AC has a
named test that fails without its feature and passes with it, including the fix's own AC-2 gap,
proven with QA's own probe as both the red and the green case.

**Verdict: done.** No missing ACs, no principle violation, no open follow-up blocking accept. QA's
console-guard follow-up is resolved by this fix, not merely noted.
