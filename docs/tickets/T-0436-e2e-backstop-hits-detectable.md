---
id: T-0436
title: "e2e: a hit on the mockSupabaseRest / mockSupabaseAuth 501 backstop fails the guarded test, unless the test acknowledges it with supabaseGuard.allowBackstop naming a T-NNNN"
lane: qa
screens: []
decisions: [D-0086, D-0155, D-0072]
deps: [T-0427, T-0422]
status: done
---
<!-- Written 2026-10-02 by product-owner (groom). Follow-up (1) from the T-0427 accept log, found by T-0427 review and QA, inherited from T-0425. Build flow: wl-build-qa. About ½ day, depending on the inventory (see the split rule in AC-5). No app code changes. It waits for T-0422 (in build), which adds tests/e2e/uf-05-swap.spec.ts and additive tests/e2e/fixtures/** exports: the inventory has to include that spec, and the two tickets would share fixture files. -->

## Why
- D-0086 §2 counts the `mockSupabaseRest` (`/rest/v1/**`) and `mockSupabaseAuth` (`/auth/v1/**`)
  501 catch-alls as claims, because they keep a request off the network. `consoleGuard` exempts
  Chromium's `Failed to load resource:` line, which every 501 logs.
- So when a spec forgets a data mock, the request gets a 501, both guards pass, and only a
  behaviour assertion might notice. That is the T-0904 class of bug again (a missing mock that
  surfaces three layers away, or not at all), and the guards exist to name it.
- D-0155 §4 amends D-0086 §2: a backstop hit is reported, unless the test says it means it.

## Scope
- In:
  - **Before editing, the inventory.** Run the whole suite on main (after T-0422) with a temporary
    recorder for backstop answers. List every hit in the build log with its spec, test title,
    method, path and backstop (`rest` or `auth`). Delete the recorder afterwards.
  - `fixtures/supabase-mock.ts`: `mockSupabaseRest` and `mockSupabaseAuth` mark their 501
    (D-0155 §4: the `x-wl-e2e-backstop` header, or the context-keyed registry if the header is
    measured not to work). Bodies, status and route patterns are unchanged.
  - `fixtures/guarded-test.ts`:
    - `SupabaseGuard` gains `backstopHits(): string[]` and `allowBackstop(pattern: RegExp): void`.
      `allowBackstop` rejects `g` and `y` flags, like `consoleGuard.allow`.
    - `assertClean()` throws on an unallowed backstop hit as well as on an unclaimed request. The
      message contains a new exported literal `BACKSTOP_MESSAGE` ("supabase backstop hit"), lists
      each hit, and points at `mockSupabaseData` / `mockProfilePresent` / `mockProfileMissing`.
    - `forgetPlantedLeaks()` also clears the backstop list.
    - The header comments (D-0086 §2 wording) are updated to D-0155 §4.
  - `fixtures/source-rules.ts`: the T-0430 comment-block rule also covers `allowBackstop(` (a
    sibling function, or a generalised one).
  - `fixture-guard.spec.ts`: the new ACs below. The test "a request claimed by the 501 backstop is
    not reported" becomes its inverse (D-0155 §4 names this change). `T-0425 AC3 a claimed 501
    (Failed to load resource) passes` keeps its console assertion and acknowledges its own
    backstop hit.
  - **Each inventoried hit** gets one of these:
    - **A mock (preferred):** `200 []` for a read, or an accepted no-op for a write, through the
      existing helpers or a new additive export in `fixtures/`.
    - **An `allowBackstop`**, only where the test is about the error path, with a `T-NNNN` in the
      comment block above.
- Out:
  - App code (`apps/web/**`). A real request the app shouldn't make is a follow-up for its lane.
  - The guard's own last-resort context route and its `requestfailed` detector (D-0086 §4), which
    stay as they are.
  - `consoleGuard`'s `Failed to load resource:` exemption (it stays, D-0155 §4) and the Chromium
    `sw.js` line (T-0437).
  - "Every spec imports the guarded fixture" (T-0432).
  - `playwright.config.ts` (T-0440).

## Acceptance criteria
Test titles start with `T-0436 ACn`. Each AC test drives `installSupabaseGuard` on the test's own
context, as the existing AC-6 tests do, unless it says it uses the `auto` fixture.
- **AC-1 (a REST backstop hit is reported; red on main)** Given `/welcome`, a fresh
  `installSupabaseGuard(context)` and `mockSupabaseRest(page)`, when the page fetches
  `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`, then the status is 501, `backstopHits()`
  equals `["GET …/rest/v1/anything?select=*"]`, `unclaimed()` equals `[]`, and `assertClean()`
  throws an error containing `BACKSTOP_MESSAGE` and the URL. On main `backstopHits` doesn't
  exist; record that red run.
- **AC-2 (an auth backstop hit is reported)** As AC-1 with `mockSupabaseAuth(page)` and a `POST`
  to `/auth/v1/logout`: `backstopHits()` equals `["POST …/auth/v1/logout"]`. A non-PKCE `/token`
  grant through `mockSupabaseEmailAuth` (its handler calls `route.fallback()`) is also recorded as
  a hit.
- **AC-3 (the pair: a real mock is not a hit)** With `mockSupabaseRest(page)` and then a
  `200 []` route for `/rest/v1/served*`, a fetch of `/rest/v1/served?select=*` gives 200,
  `backstopHits()` equals `[]` and `assertClean()` doesn't throw. `mockProfilePresent` registered
  after the backstop gives the same result for `/rest/v1/profiles`.
- **AC-4 (allowBackstop)**
  - **Exempts.** After `allowBackstop(/\/rest\/v1\/anything/)`, AC-1's hit is still listed in
    `backstopHits()`, and `assertClean()` doesn't throw.
  - **Only what matches.** A second hit on `/rest/v1/other` still throws, naming only `other`.
  - **One test only.** First test: allowed, passes. Second test: the same hit with no allow fails
    at teardown (`test.fail()`), so an allow never carries over.
  - **Flags.** `allowBackstop(/x/g)` and `allowBackstop(/x/y)` throw. `/x/i` is accepted.
- **AC-5 (the auto fixture fails a test, and the suite is clean)**
  - **Fails a test.** A `test.fail()` test using the `auto` fixture hits the backstop with no
    allow. It is reported as an expected failure. On code without the change it "passed
    unexpectedly"; record that.
  - **Inventory resolved.** Every hit from the Scope inventory is resolved by a mock or an
    `allowBackstop`. The build log has a table of hit → resolution, and each `allowBackstop` is
    there with its `T-NNNN` and why the hit is wanted.
  - **The suite.** `pnpm --filter @workoutlab/web test:e2e` passes in full. No
    `forgetPlantedLeaks()` and no new `consoleGuard.allow(` outside `fixture-guard.spec.ts`. No
    existing assertion is removed, apart from the inverted D-0155 §4 test.
  - **Split rule.** If mocking the inventory would take more than about ½ day, or needs app
    changes, the builder files one follow-up per spec (T-0441 or later, from the orchestrator) and
    acknowledges those hits with `allowBackstop` naming the follow-up. The detector still lands
    here.
- **AC-6 (a missing data mock now fails; planted fault)** Temporarily remove the `routines*` route
  from `mockSupabaseData`. Then `uf-10-balance.spec.ts`'s T-0427 AC1 test fails, and its
  failure contains `BACKSTOP_MESSAGE` and `/rest/v1/routines`. Record the run, then revert.
  - **The contrast.** On main the same plant leaves that test green. That is the gap this ticket
    closes; record that run too.
  - If on main the plant turns the test red for another reason, plant a different route that
    UF-10 doesn't depend on (`plan_checkins*` or `routine_items*`), and say which in the build log.
- **AC-7 (the comment rule covers allowBackstop)** The source-rules function reports a planted
  `supabaseGuard.allowBackstop(/x/)` with no `T-NNNN` in the comment block above, and passes one
  that has it. A test over every `tests/e2e/*.spec.ts` except `fixture-guard.spec.ts` finds no
  violation.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`). In practice:
  - `fixtures/guarded-test.ts`, `fixtures/supabase-mock.ts`, `fixtures/source-rules.ts`,
    `fixture-guard.spec.ts`;
  - the specs the inventory names, for a mock or an acknowledgement only.
- **Listed extras:**
  - `docs/tickets/T-0436-e2e-backstop-hits-detectable.md`: this file, for the build and accept logs.

## Contract impact
None. Test infrastructure only. D-0155 §4 amends D-0086 §2, which isn't a contract.

## Coordination
- **After T-0422** (dep). It adds `uf-05-swap.spec.ts` and fixture exports, and edits
  `uf-09-focus.spec.ts`.
- **With T-0440, allowed in parallel.** T-0440 edits `playwright.config.ts` and adds
  `fixtures/preflight.ts` and `e2e-config.spec.ts`. This ticket edits none of those, and T-0440
  edits none of this ticket's files. Both keep the `VITE_SUPABASE_URL` export of the config.
  Whichever lands second merges `main` and reruns the whole e2e suite.
- **Before T-0437 and T-0432.** Both edit `guarded-test.ts` or `fixture-guard.spec.ts`.
- **With T-0416 or T-0417, not at once** if the inventory names `uf-09-focus.spec.ts` or
  `uf-03-list-summary.spec.ts`. Whichever lands second merges `main` first.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · `pnpm -w typecheck
lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the
whole suite, run under the test lock with `TMPDIR=$HOME/.cache/wl-pw-tmp` until T-0440 lands) ·
`format:check` and `check:repo` green · contracts unchanged · commits start `T-0436` (for example
`T-0436: report hits on the 501 backstop in supabaseGuard`).

## Build / accept log

- 2026-10-03 qa (wl-build-qa). Branch off main 94ebcfd, clean start. Marking: the `x-wl-e2e-backstop`
  header (`rest` | `auth`) on both 501 catch-alls; the guard reads it from the context `response`
  event (measured to work; no registry needed). Added `mockSupabaseEmptyReads` (200 [] for the ten
  AutoSync tables, no profiles) in `fixtures/supabase-mock.ts`.
- **Inventory** (detector landed first, whole suite run, 22 failing tests, 143 passing; every hit
  a GET read, no writes). Specs not listed (offline, uf-02/03/04/05/08/09/10/11, csp-session-plan,
  sw-registration, e2e-config) had zero hits, including `uf-05-swap.spec.ts`.

  | spec | tests | hits | resolution |
  | --- | --- | --- | --- |
  | auth.spec.ts | 4 (AC-B5 signed-in x2, B2/B4, B3) | the ten AutoSync reads (+ profiles where the test overrode it) | mock: `mockSupabaseEmptyReads` in `beforeEach` |
  | shell.spec.ts | 13 (A7 tab bar, A13 axe x5, AC-6 offline x7) | AutoSync reads; the AC-6 describe's re-registered backstop also shadowed `profiles*` | mock: `mockSupabaseEmptyReads` in outer `beforeEach`; AC-6 describe re-mocks reads + `mockProfilePresent` (gate is `present`, no longer `unknown`; tests unaffected) |
  | uf-01-onboarding.spec.ts | 3 (UF-01.5 AC-14 a/b/c) | AutoSync reads | mock: `mockSupabaseEmptyReads` in `beforeEach` |
  | fixture-guard.spec.ts | 2 (AC-6 backstop test, T-0425 AC3) | `/rest/v1/anything` (planted on purpose) | first inverted per D-0155 §4; second `allowBackstop` |

  No `allowBackstop` in any product spec; no `forgetPlantedLeaks`, no new `consoleGuard.allow`
  outside `fixture-guard.spec.ts`. No split needed (about 1 h of mocks).
- **AC -> test** (all in `fixture-guard.spec.ts` unless noted): AC-1 `T-0436 AC1 a REST backstop hit
  is reported`; AC-2 `T-0436 AC2 an auth backstop hit ...` (logout + non-PKCE /token); AC-3 `T-0436
  AC3 a real mock is not a hit`; AC-4 four tests (`exempts only what matches`, first/second test pair
  with `test.fail()`, `rejects g and y flags, accepts i`); AC-5 `the auto fixture fails a test that
  hits the backstop` (test.fail) + `forgetPlantedLeaks also clears the backstop list` + the whole
  suite below; AC-6 planted fault below; AC-7 `T-0436 AC7 the comment rule covers allowBackstop` +
  `every supabaseGuard.allowBackstop( outside this file names a T-NNNN above`. D-0155 §4 inversion:
  `a request claimed by the 501 backstop is reported as a hit, and allowBackstop exempts it`.
- **Red on main guard** (guarded-test.ts at HEAD, no header): `fixture-guard.spec.ts` 11 failed /
  50 passed: `backstopHits is not a function` (AC-1/2/3/4/5), and both `test.fail()` tests ("passed
  unexpectedly").
- **Planted fault (AC-6):** `routines*` removed from `mockSupabaseData`. With the detector,
  `uf-10-balance.spec.ts` T-0427 AC1 fails with `supabase backstop hit` and `GET .../rest/v1/routines?select=...`
  (2 consecutive runs; 6 other tests in the file fail too). On main's guard the file is 8/8 green
  (the contrast). First attempt: T-0427 AC1 stayed green with the detector, because the routines read
  was still in flight at teardown. Fixed by adding `await page.waitForLoadState("networkidle")` to
  that test (assertion added, none removed). Restored from backup; `uf-10-balance` 8/8.
- **Gate:** whole web e2e (`TMPDIR=$HOME/.cache/wl-pw-tmp`, under flock) 176 passed;
  `-w typecheck lint test --concurrency=1` exit 0 (turbo-cached); `-w test:repo-checks`, `check-all.mjs`,
  `-w format:check` green.
- Known limit (follow-up): the check runs at teardown, so a read still in flight after a test's last
  assertion can be missed (as the uf-10 first attempt showed). A generic settle in the auto fixture
  costs about 0.5 s per test; not done here.

- 2026-10-03 qa (verify). Clean at 02d7516; `git merge main` conflicted in `shell.spec.ts` (comment only; kept main's UF-06.2 wording plus the T-0436 block), merge commit e1e38f8. Main added `uf-06-progress.spec.ts`: zero backstop hits.
- Reproduced: AC-6 plant (`routines*` route renamed) -> uf-10 T-0427 AC1 red with `supabase backstop hit` and `GET .../rest/v1/routines?select=id,name,updated_at`. Main's guard (guarded-test.ts from 02d7516~1) -> fixture-guard 11 failed / 51 passed (`backstopHits`/`allowBackstop is not a function`). QA fault: `x-wl-e2e-backstop` header on the real `exercises*` mock -> fixture-guard + uf-10 8 failed (real mock counted as hit). All restored from backup; tree clean.
- Whole web e2e after merge: 183 passed. Cached `-w typecheck lint test` exit 0, `test:repo-checks` 146 pass / 0 fail, check-all 0, format:check clean.
- Verdict: done, all AC proven.

- 2026-10-03 product-owner (accept). HEAD 7c20cc8, tree clean. AC-1..AC-4 and AC-7 each have
  `T-0436 ACn` tests in `fixture-guard.spec.ts`. AC-5: the auto-fixture `test.fail()` test, the
  inventory table (22 hits, all fixed with mocks, no product `allowBackstop`, no split needed) and
  the whole e2e (183). AC-6: the plant was red with the detector and green on main's guard. Reds
  are recorded: main's guard gave 11 failed, and the QA header fault gave 8 failed. The D-0155 §4
  inversion is the only assertion changed. No `apps/**` or contract diff. Principles unaffected
  (test infra only). Review follow-ups are filed as T-0455. Verdict: **done**.
