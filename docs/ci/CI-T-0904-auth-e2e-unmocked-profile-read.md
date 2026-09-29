---
ticket: T-0904
classification: regression
lane: qa
runs:
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36613911266
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36616404206
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36620472877
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36620911978
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36621522628
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36622131270
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36622831603
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36623331042
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36623563211   # PR #9, t/T-0320-shared-file-enforcement
date: 2026-09-29
---

## What failed

- Workflow `CI` (`.github/workflows/ci.yml`), job `playwright e2e`, step **`Run pnpm exec playwright test --config tests/e2e/playwright.config.ts`**. This is the test step itself. `checks` and `supabase` are green.
- Branch `main`. Last green run is 36576269406 at `0fd3399`. Run 36613681267 at `3b67b2b` (the T-0301a merge bookkeeping) was cancelled. The first completed run after the T-0301a merge `4b4c5f9` is 36613911266 at `8cf5659`, and it is red. Every `main` run since then is red, through 36623331042 at `8bac5b4`.
- The same test fails on PR #9 (run 36623563211, `3d6cc94`), which changes no web code. That is expected, because the branch contains `main`.
- The spec is the same every time: `tests/e2e/auth.spec.ts:28` `AC-B5 guard › signed in: /welcome redirects to /`. It fails in 8 of 8 runs.
- Two other failures each appeared once and did not recur: `offline.spec.ts:58` failed with `page.reload: net::ERR_INTERNET_DISCONNECTED` in 36613911266, and `shell.spec.ts:54` failed on the AC-A7 tab order in 36620472877. Both are green in every later run, and neither is the cause of the red job. They are recorded under follow-ups, not diagnosed here.
- T-0301a had no `pull_request` CI run. No run exists for any `t/T-0301a*` branch, so the job first ran this code on `main`. This is the same gap T-0901 recorded for T-0300a.

## Evidence

Run 36623331042, job `playwright e2e`:

```
Running 24 tests using 2 workers
·······F················
  1) [chromium] › tests/e2e/auth.spec.ts:28:7 › AC-B5 guard › signed in: /welcome redirects to / ───
    Error: expect(locator).toBeVisible() failed
    Locator: locator('[data-screen-id="UF-02.1"]')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
      30 |     await injectSession(page);
      31 |     await page.reload();
    > 32 |     await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  1 failed
  23 passed (24.5s)
##[error]Process completed with exit code 1.
```

At the timeout the local page snapshot (`error-context.md`) shows only `heading "Welcome" [level=1]`. The page is still on `/welcome` (UF-01.1) and has not redirected.

A local probe spec logged the page's Supabase traffic after `injectSession` and `reload`. `auth.spec.ts` mocks only `/auth/v1/**`, so the profile gate's read goes to the network:

```
REQ    GET https://abc.supabase.co/rest/v1/profiles?select=*
FAILED https://abc.supabase.co/rest/v1/profiles?select=* net::ERR_NAME_NOT_RESOLVED
REQ    GET https://abc.supabase.co/rest/v1/profiles?select=*      <- postgrest-js retry
FAILED https://abc.supabase.co/rest/v1/profiles?select=* net::ERR_NAME_NOT_RESOLVED
...
URL http://localhost:4173/welcome [ 'UF-01.1' ]                  <- after 4 s, still on /welcome
```

## Reproduction

The scratch clone was a depth-1 `git clone --depth 1 file://<repo>` plus `git fetch --depth 1` of each commit. Each run used a fresh `pnpm install --frozen-lockfile` (pnpm 10.28.2 via npx) and `CI=1`, so `reuseExistingServer` is false and Playwright builds its own server. There was no turbo cache and no `VITE_SUPABASE_*` in the environment, since the config injects them. Each run used `--workers=1`.

Port note: `tests/e2e/playwright.config.ts` hard-codes `PORT = 4173`, and the preview runs with `--strictPort`. Outside CI, `reuseExistingServer: true` silently reuses whatever is already listening there. During this investigation, another agent's `vite preview` from the `workoutLab-worktrees/T-0307a` worktree held the port. I waited for it to exit and did not kill it. Every run below had its own freshly built server.

| # | Commit | Command | Result |
|---|---|---|---|
| 1 | `8bac5b4` | `playwright test … auth.spec.ts --repeat-each=3` | **Reproduced.** 3 of 3 failed on `auth.spec.ts:28`. The other 15 passed. |
| 2 | `0fd3399` (last green) | `… -g "signed in: /welcome" --repeat-each=2` | 2 of 2 passed. |
| 3 | `5c3b481` (T-0301a: gate, provider, `missing` stand-down only) | same | 2 of 2 passed. |
| 4 | `790312b` (T-0301a: adds the `resolved` wait) | same | Doesn't build: a tsc error, fixed two commits later in `d5e5362`. |
| 5 | `d5e5362` (the first buildable commit containing `790312b`) | same | **2 of 2 failed.** |
| 6 | `4b4c5f9` (the T-0301a merge) | same | **2 of 2 failed.** |
| 7 | `8bac5b4` + probe: `mockSupabaseRest` (501 catch-all) | same flow | Passes. The 501 is an HTTP error, so there are no retries, the gate returns `unknown` straight away, and the page redirects to `/`. |
| 8 | `8bac5b4` + probe: `profiles*` → `200 {row}` | same flow | Passes. The status is `present`, and the page redirects to `/`. |

It reproduces locally every time. It is not a flake, not load-dependent, and not a stale `:4173` server (every run had its own server).

## Root cause

This is a regression from T-0301a (profile gate). The first bad commit is **`790312b`** ("routing + source tests for the gate"), first buildable at `d5e5362`, and it reached `main` with the merge `4b4c5f9`. That commit made `RedirectIfSignedIn` wait for the profile gate on `/welcome/*` (D-0073 §1). The logic lives in `welcomeStandsDown(pathname, status, resolved)` in `apps/web/src/lib/auth/guards.tsx`, which returns `true` while `!resolved`.

The spec breaks because three things combine:

1. **The test fixture (qa).** `auth.spec.ts` was written in T-0300b, before the gate existed. Its `beforeEach` calls only `mockSupabaseEmailAuth`, which covers `/auth/v1/**`. It never mocks `/rest/v1/**`. The file's own header says "this spec never hits the network", and since T-0301a that is no longer true. Once signed in, `ProfileStatusProvider` calls `resolveProfileStatus()` (`apps/web/src/lib/profile/status.ts`), which runs `supabase.from("profiles").select("*").maybeSingle()` against the real `https://abc.supabase.co`. `lib/offline`'s refresh fires ten more unmocked selects at the same time.
2. **postgrest-js retries network errors.** `@supabase/postgrest-js@2.117.2` wraps every GET in `fetchWithRetry`. When `fetch` *throws* (here `ERR_NAME_NOT_RESOLVED`), it retries up to 3 times with 1 s, 2 s and 4 s backoff. The promise therefore settles only after about 7 s, and only then returns `{error}` → `unknown` → `resolved = true`. An HTTP error status (for example a 501 from a route mock) is not retried, which is why probe 7 passes.
3. **The `resolved` wait.** Until the gate resolves, `/welcome` stands down and renders UF-01.1. The redirect to `/` that the test expects would come only after about 7 s, which is past the 5 s `expect` timeout. Before `790312b`, `RedirectIfSignedIn` redirected at once when the status was `unknown`, so the unmocked read did no harm.

So the product code does what D-0073 §1 specifies, and the test is missing a fixture that the new contract needs. The owning lane for the fix is **qa** (`tests/e2e/**`). The test is not weakened: it still asserts a signed-in user is redirected off `/welcome`, now with the profile state it assumes (`present`) made explicit.

There is also a product-side observation for web-shell (secondary, not the CI fix). On a real network that throws instead of answering (captive portal, DNS failure, a flaky mobile link with `navigator.onLine === true`), a signed-in user who opens `/welcome` sees onboarding for about 7 s before the redirect. The same retry delays every gated read, because `unknown` arrives only after the backoff. That conflicts with the spirit of D-0064 §9 ("a broken read must not be able to interrupt the app") and principle 5.

## Proposed fix

**Primary (qa, `tests/e2e/auth.spec.ts`, and optionally `tests/e2e/fixtures/supabase-mock.ts`):**

- In `auth.spec.ts`'s `beforeEach`, register `mockSupabaseRest(page)` *before* `mockSupabaseEmailAuth(page)`. It is the 501 backstop, and it has to be registered first to be matched last. Then add a `profiles*` route that returns a present row (`200`, one object with `user_id: FAKE_USER_ID`). The spec then never reaches the network, and the "signed in: /welcome redirects to /" case explicitly tests the `present` branch of AC-7.
- Preferably, factor that into a fixture helper, for example `mockProfilePresent(page)` / `mockProfileMissing(page)` in `supabase-mock.ts`. Every signed-in spec should state its profile state instead of inheriting a network error.
- Don't raise the `expect` timeout, and don't rely on the 501 catch-all alone. A 501 gives `unknown`, which passes, but only by accident of the error path, not the case the test names.

**Secondary (web-shell, `apps/web/src/lib/profile/status.ts`), separate ticket:** make the gate read fail fast. Call `.retry(false)` on the `profiles` query (postgrest-js 2.117 exposes it), or bound it with `.abortSignal(AbortSignal.timeout(N))`. That way a throwing network gives `unknown` in well under a second, and `/welcome` isn't held open by backoff. It needs a unit test in `lib/profile/__tests__/profile-status.test.tsx` in which a `fetch` that rejects resolves to `unknown` within the bound. It is not needed for green CI.

**Process (orchestrator):** T-0301a merged with no `pull_request` CI run, the same gap T-0901 found. Feature merges touching `apps/web/src/**` or `tests/e2e/**` should require a green PR CI run first.

## Regression test

- **e2e (qa, `tests/e2e/auth.spec.ts` or a new `tests/e2e/profile-gate.spec.ts`):** add the missing twin of the failing case. Signed in with `profiles` → `200 null` (`missing`), `/welcome` stays on UF-01.1 and does *not* redirect (T-0301a AC-7 at e2e level). Keep the `present` case redirecting to `/` within the default timeout. Together they pin both branches of `welcomeStandsDown`.
- **Fixture guard (qa):** a `page.on("requestfailed")` / `page.on("request")` hook in a shared fixture that fails the test on any request to `VITE_SUPABASE_URL` that no route claimed. It would have turned this into an immediate "unmocked `/rest/v1/profiles`" error instead of a 5 s visibility timeout. This enforces the "never hits the network" promise in the spec headers.
- **Unit (web-shell, with the secondary fix):** `resolveProfileStatus()` with a rejecting `fetch` returns `unknown` in under 1 s (fake timers), which pins the no-retry or timeout behaviour.
