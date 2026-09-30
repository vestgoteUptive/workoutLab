---
id: T-0904
title: CI e2e green again. auth.spec.ts mocks the profile gate's read (present/missing helpers), and a fixture guard fails any Supabase request no route claimed
lane: qa
screens: [UF-01.1, UF-02.1]
decisions: [D-0045, D-0055, D-0064, D-0073, D-0086]
deps: []
status: ready
---
<!-- Written by product-owner 2026-09-29 (ci-spec mode) from docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md (classification: regression, first bad commit 790312b, merged in 4b4c5f9). Build flow: wl-build-qa (agent qa). About ½ day. The product-side fail-fast read is T-0351 (web-shell), not this ticket. -->

## Why
The `playwright e2e` job has been red on `main` since the T-0301a merge (`4b4c5f9`). It failed in 8 of 8 runs, most recently 36623331042 at `8bac5b4`, and it is red on PR #9 too. Every merge is blocked. The failing test is `tests/e2e/auth.spec.ts:28`, `AC-B5 guard › signed in: /welcome redirects to /`. The diagnosis is `docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md`.

The product code does what D-0073 §1 specifies: `/welcome` stands down until the profile gate resolves. `auth.spec.ts` mocks only `/auth/v1/**`, though, so the gate's `GET /rest/v1/profiles?select=*` goes to the real network. The request throws `ERR_NAME_NOT_RESOLVED`, postgrest-js 2.117 retries it with 1 s, 2 s and 4 s backoff, and the gate resolves `unknown` after about 7 s. That is past the 5 s `expect` timeout. The spec header says "this spec never hits the network", and nothing enforces it. `shell.spec.ts` has the same leak in its AC-A7, AC-A10 and AC-A13 tests. They still pass only because `unknown` doesn't redirect on `/`.

This ticket fixes the fixture. Each signed-in spec states its profile state explicitly. A guard makes "never hits the network" a checked property, so the next leak shows up as an immediate "unclaimed request" failure naming the URL, not as a 5 s visibility timeout.

## Scope
- In:
  - **`tests/e2e/fixtures/supabase-mock.ts`:** add `mockProfilePresent(page, row?)` and `mockProfileMissing(page)`. Both route `${VITE_SUPABASE_URL}/rest/v1/profiles*`.
    - `present` answers `200` with one row carrying `user_id: FAKE_USER_ID` and the same profile fields `offline.spec.ts` uses (`goal`, `level`, `equipment`, `rhythm_min`, `rhythm_max`, `priority_areas`, `onboarded_at`, `plan_changed_at`).
    - `missing` answers `200` with an empty result.
    - Use the body shape real PostgREST returns for the `Accept` header that `maybeSingle()` sends: `[row]` / `[]` for `application/json`. The ACs test behaviour (which screen renders), so a wrong shape fails a test instead of passing silently.
    - Both helpers are registered *after* `mockSupabaseRest`, so they win over the 501 backstop.
    - Keep the existing exports and their behaviour. `mockSupabaseData` keeps its own `profiles*` route.
  - **`tests/e2e/auth.spec.ts` `beforeEach`:** register `mockSupabaseRest(page)` first, then `mockSupabaseEmailAuth(page)`, then `mockProfilePresent(page)`. All four signed-in paths (the `/welcome` redirect, the magic-link callback, the 6-digit code) then run with `present` explicitly. Under `missing`, `/` would redirect to `/welcome/save` (T-0301a AC-5).
  - **The missing twin (T-0301a AC-7 at e2e level):** add a test in `auth.spec.ts` for the case "signed in, profile missing, `/welcome` stays on UF-01.1". It calls `mockProfileMissing(page)` in the test body, which overrides the `beforeEach` `present` route because the most-recently-registered route runs first.
  - **The fixture guard:** a new file `tests/e2e/fixtures/guarded-test.ts` exports `test` (from `base.extend`) and `expect`. It has one `auto: true` fixture that runs for every test importing it:
    - It registers **one context-level route**, `context.route(`${VITE_SUPABASE_URL}/**`)`. Playwright consults context routes only after every matching page route has fallen back, so the guard is the true last resort, whatever order a spec's `beforeEach` registers its own routes in.
    - A request that reaches this route is **unclaimed**. The guard records its method and URL and answers `501` with the body `unclaimed supabase request in e2e: <METHOD> <URL>`. It does not `abort`: an aborted fetch throws, postgrest-js would retry it for about 7 s, and the failure would come back as a timeout.
    - At fixture teardown, if anything was recorded, the test fails with a message listing every unclaimed request. The message must include the literal `unclaimed supabase request` and each URL.
    - It exports the pure helper `installSupabaseGuard(context)`, which returns `{ unclaimed(): string[]; assertClean(): void }`, so AC-6 can prove the guard without nesting a Playwright run (a nested run would fight over the `--strictPort` 4173 server).
  - **Definition of "claimed" (D-0086).** A request to `VITE_SUPABASE_URL` is claimed when **any** `page.route` or `context.route` handler registered before the guard is consulted answers it with `route.fulfill` or `route.abort`. The file that registered the handler doesn't matter. The 501 catch-alls (`mockSupabaseAuth`, `mockSupabaseRest`) count as claims, because they keep the request off the network, which is the property being enforced. The guard therefore does **not** replace them, and specs that rely on the 501 backstop for AutoSync (`offline.spec.ts`, the `shell.spec.ts` AC-6 block) stay green. A handler that calls `route.continue()` lets the request reach the network. That is unclaimed, and the guard reports it. A request that fails because the context is offline (`context.setOffline(true)`) never reaches any route and is not reported.
  - **Migrate the three existing specs** (`auth.spec.ts`, `shell.spec.ts`, `offline.spec.ts`) to import `test`/`expect` from `./fixtures/guarded-test.js`. In `shell.spec.ts`, every test that calls `injectSession` outside the AC-6 block (AC-A7 ×2, AC-A10, AC-A13 for its five signed-in routes) gets `mockSupabaseRest` and `mockProfilePresent` before its first navigation. Put them in that describe's `beforeEach` or in the test itself. Without them, the guard would fail those tests. Correct the stale header comments in `auth.spec.ts` and `shell.spec.ts` ("nothing needs `page.route` mocking here" is false since T-0301a).
  - **The guard self-test,** a new spec `tests/e2e/fixture-guard.spec.ts` (AC-6, AC-7).
  - **`.squad/decisions/D-0086-e2e-supabase-guard.md`** (new, `status: revisit`, `area: qa`). It records the definition of "claimed" above, the opt-in import, the reason for fulfilling 501 instead of aborting (postgrest-js retry), and the "every signed-in spec states its profile state" convention.
- Out:
  - **Any `apps/web/**` change.** The gate read's fail-fast behaviour (`.retry(false)` / `AbortSignal.timeout`) is **T-0351** (web-shell).
  - **Raising any timeout.** Don't raise the `expect` or test timeout, and don't pass a per-assertion `timeout:` to the redirect assertion. Don't touch `retries` (T-0901 AC8 forbids it).
  - **Relying on the 501 backstop alone for the redirect test.** It gives `unknown`, which happens to redirect. The test is named for, and must exercise, the `present` branch.
  - **Specs on in-flight branches** (T-0306a, T-0307b, T-0308a). They add their own fixture files and may import `@playwright/test` directly. They stay unguarded and unbroken. Migrating them is a follow-up after they merge. No repo check forces the guarded import in this ticket, because such a check would turn their rebase red.
  - **The two one-off failures** in the diagnosis (`offline.spec.ts:58` `ERR_INTERNET_DISCONNECTED`, and `shell.spec.ts:54` tab order). They didn't recur and are follow-ups.
  - `tests/e2e/playwright.config.ts`: no change is needed. If the dev finds one is needed, it must not touch `retries`, `timeout`, `expect.timeout` or `webServer`.

### Edge cases that are in scope
- **Offline.** `context.setOffline(true)` requests never reach the guard. The two offline specs (AC-A5, AC-C20) and the AC-6 offline block stay green under the guard (AC-8).
- **Zero history, signed in, no profile.** That is the `missing` twin (AC-3). `/welcome` must *not* bounce a brand-new user to `/`, or onboarding (principle 5) could never run.
- **Returning after 10 days off.** A fresh device, a row exists, `present` → `/`. That is the redirect case (AC-1, AC-2).
- **Time running out.** The redirect must land within the default 5 s `expect` timeout, not after the ~7 s retry backoff (AC-1). No timeout is raised to get there (AC-9).
- **Route order hazards.** `mockSupabaseRest` registered *after* `mockProfilePresent` would shadow it, because the most-recently-registered route wins. AC-2's `present` assertion catches that order. The guard sits at context level, so page-route order can't shadow it.

## Acceptance criteria
Every command runs from the repo root with `CI=1` (so `reuseExistingServer` is false and Playwright builds its own server, and no stale `:4173` server is reused) and `--config tests/e2e/playwright.config.ts`. `VITE_SUPABASE_*` is **unset** in the shell, because the config injects it. The result's `testsRun` records each command and its pass/fail counts.

- **AC-1 (the failing test passes, 3 of 3).** Given the ticket branch, when `CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/auth.spec.ts -g "signed in: /welcome redirects to /" --repeat-each=3 --workers=1` runs, then it reports **3 passed, 0 failed**. The test body is unchanged: it goes to `/welcome`, calls `injectSession`, reloads, and expects `[data-screen-id="UF-02.1"]` to be visible with the default timeout.
- **AC-2 (the `present` branch is what redirects, not the error path).** Given the same test, when it runs, then the `profiles*` request it triggers is answered by `mockProfilePresent` (200) and not by the 501 backstop. Assert this in the test with a `page.waitForResponse` on `/rest/v1/profiles` whose `status()` is `200`. This fails if `mockSupabaseRest` is registered after the profile route, or if the helper is dropped.
- **AC-3 (the missing twin: `/welcome` stays on UF-01.1).** Given signed in via `injectSession` and `mockProfileMissing(page)`, when the test goes to `/welcome` and reloads, then `[data-screen-id="UF-01.1"]` is visible, the `profiles*` response was `200`, **and** `/welcome` is still the location once the page settles. The test waits for that `profiles` response and then asserts `expect(page).toHaveURL(/\/welcome$/)`, and `UF-02.1` is **not** on the DOM. This is T-0301a AC-7 at e2e level. Together, AC-1 and AC-3 pin both branches of `welcomeStandsDown`: a guard that always redirected fails AC-3, and one that never redirected fails AC-1.
- **AC-4 (the whole of auth.spec.ts, repeated).** `CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/auth.spec.ts --repeat-each=3 --workers=1` gives **0 failed**. That covers the 6 existing tests plus the twin, ×3 = 21 passed. The magic-link and 6-digit-code tests reach `UF-02.1` with `present`.
- **AC-5 (no request leaves the browser).** Given every spec file that imports `./fixtures/guarded-test.js` (at least `auth.spec.ts`, `shell.spec.ts` and `offline.spec.ts`), when the full suite runs, then the guard records **zero** unclaimed requests, and no test fails with `unclaimed supabase request`. A source assertion in `fixture-guard.spec.ts` reads those three spec files and checks that each imports from `./fixtures/guarded-test.js` and none imports `test` from `@playwright/test`, so a later edit can't silently opt a spec out.
- **AC-6 (the guard is proven by a planted unmocked request).** In `tests/e2e/fixture-guard.spec.ts`, using `installSupabaseGuard(context)` on the test's own context:
  1. **Planted, unclaimed:** with no page route for it, `page.evaluate(() => fetch("https://abc.supabase.co/rest/v1/planted_unmocked?select=*"))` resolves with status `501`, `guard.unclaimed()` equals `["GET https://abc.supabase.co/rest/v1/planted_unmocked?select=*"]`, and `guard.assertClean()` throws an error whose message contains `unclaimed supabase request` and that URL.
  2. **Claimed by a route from another file (contrast):** a `page.route` registered in the test body (standing in for another branch's own fixture file) fulfils `.../rest/v1/other_fixture*` with `200`. Fetching it leaves `guard.unclaimed()` **empty**.
  3. **Claimed by the 501 backstop (contrast):** with `mockSupabaseRest(page)` registered, fetching `.../rest/v1/anything` leaves `guard.unclaimed()` empty.
  4. **`route.continue()` is unclaimed:** a `page.route` that calls `route.continue()` on `.../rest/v1/passthrough*` results in that URL being recorded.
  
  The fetches run from a page that `page.goto("/welcome")` loaded while signed out, so the app itself makes no Supabase REST call during the test.
- **AC-7 (the auto fixture actually fails a test).** In `fixture-guard.spec.ts`, a test marked `test.fail()` (Playwright's "expected to fail" annotation) uses the auto-guarded `test`, makes the same planted fetch, and **asserts nothing else**, so the guard's teardown is its only possible failure source. The dev also records one manual proof in `testsRun`: temporarily remove `mockProfilePresent` from `auth.spec.ts`'s `beforeEach` and run AC-1's command with `--repeat-each=1`. The run must fail, and its output must contain `unclaimed supabase request` and `/rest/v1/profiles`. Record the wall time to failure. Then restore the helper. Do not commit the broken state.
- **AC-8 (the whole suite is green locally under CI=1).** `CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts --workers=1` exits `0`. Every spec under `tests/e2e/` passes, including the offline specs (AC-A5, AC-C20, the AC-6 block) and AC-A10's origin check. Record the pass count, which is the current 24 plus the twin plus the guard specs. `pnpm -w typecheck lint test` is green.
- **AC-9 (no timeout was raised).** Given the branch diff against `main`, then `tests/e2e/playwright.config.ts` is unchanged, or at least its `retries`, `timeout`, `expect` and `webServer` keys are unchanged. And no `timeout:` option, `test.setTimeout` or `test.slow` is added anywhere in `auth.spec.ts`. A source assertion in `fixture-guard.spec.ts` checks the `auth.spec.ts` half by reading the file for `timeout` / `setTimeout` / `slow(` and finding none.
- **AC-10 (CI is green on a draft PR).** Given a draft PR from `t/T-0904-auth-e2e-profile-mock` to `main`, when the `CI` workflow runs on `pull_request`, then `playwright e2e` concludes `success` on its **first attempt** with no re-runs, and `checks` (including T-0320's `check-lane-paths`) and `supabase` stay green. The run URL goes in the result notes. The ticket can't be accepted without it (the T-0901 precedent: T-0301a merged without a PR run, which is how this regression reached `main`).

## Paths you may change
- `tests/e2e/auth.spec.ts`: the `beforeEach` order, the twin test, the AC-2 response assertion, the guarded import and the header comment. Don't edit the bodies of the existing tests except to add AC-2's `waitForResponse`.
- `tests/e2e/shell.spec.ts`: the guarded import, the `mockSupabaseRest` + `mockProfilePresent` registration for its signed-in tests, and the header comment. No assertion changes.
- `tests/e2e/offline.spec.ts`: the guarded import only.
- `tests/e2e/fixtures/supabase-mock.ts`: add `mockProfilePresent` / `mockProfileMissing`. Existing exports stay the same.
- `tests/e2e/fixtures/guarded-test.ts` (new)
- `tests/e2e/fixture-guard.spec.ts` (new)
- `.squad/decisions/D-0086-e2e-supabase-guard.md` (new, `status: revisit`)
- `docs/tickets/T-0904-auth-e2e-profile-mock.md` (this file), for the accept log only.
- **Not yours:** `tests/e2e/playwright.config.ts` (see Out, and raise a follow-up if it's needed), anything under `apps/**` or `packages/**` (T-0351 is the product fix), `.github/**`, `docs/ci/**`, and `.squad/board.md` / `.squad/state.md`.

## Contract impact
None. No schema, API, engine or token change. D-0086 is a test-convention decision, not a contract change.

## Definition of done
Every AC has a passing test, or a recorded run for AC-7's manual half and AC-10 · `pnpm -w typecheck lint test` green · the full e2e suite green under `CI=1 --workers=1` (AC-8) · draft-PR `playwright e2e` green on its first attempt, URL recorded (AC-10) · no timeout or retries raised (AC-9) · D-0086 written and cited · contracts unchanged · commits start with `T-0904:` and cite `UF-01.1` / `UF-02.1` where relevant.

## Notes
- **Flow:** `wl-build-qa`. Brief QA to fault-inject independently. For example: swap the route registration order, drop `mockProfileMissing`'s override, or have a handler `route.continue()`. Then confirm that AC-2, AC-3 and AC-6.4 each go red.
- **Merge-conflict hazard:** T-0306a, T-0307b and T-0308a may append to `shell.spec.ts` (T-0318 did) or add `*.spec.ts` files with their own fixtures. This ticket touches `shell.spec.ts`'s import line and `beforeEach`s only. Whoever rebases second resolves the conflict and keeps both sides.
- **Follow-ups (not in this ticket):**
  1. After T-0306a, T-0307b and T-0308a merge, migrate their specs to `guarded-test.js` and state their profile state (qa).
  2. Once every spec is migrated, add a check that every `tests/e2e/*.spec.ts` imports `guarded-test.js` (qa or infra).
  3. T-0351: the gate read fails fast (web-shell, already filed).
  4. The two one-off e2e failures from the diagnosis, `offline.spec.ts:58` and `shell.spec.ts:54` (qa, watch only).
  5. The process gap: require a green `pull_request` run before merging feature branches that touch `apps/web/src/**` or `tests/e2e/**` (orchestrator).
