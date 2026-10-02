---
id: T-0436
title: "e2e: a hit on the mockSupabaseRest / mockSupabaseAuth 501 backstop fails the guarded test, unless the test acknowledges it with supabaseGuard.allowBackstop naming a T-NNNN"
lane: qa
screens: []
decisions: [D-0086, D-0155, D-0072]
deps: [T-0427, T-0422]
status: ready
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
