---
id: T-0905
title: CI e2e green again. The UF-04.3 offline row of shell.spec.ts AC-6 seeds the library and asserts the URL holds, with an empty-cache contrast that lands on UF-04.1
lane: qa
screens: [UF-04.3, UF-04.1]
decisions: [D-0079, D-0086, D-0088, D-0091]
deps: [T-0306a, T-0904]
status: ready
---
<!-- Written by product-owner 2026-10-01 (ci-spec mode) from docs/ci/CI-T-0905-uf04-compare-offline-redirect-race.md (classification: flaky, qa lane; the product is correct per D-0079 §3). Build flow: wl-build-qa (agent qa). About ½ day. The jsdom twin of this bug is T-0365 (web-shell). -->

## Why
The `playwright e2e` job is red on `main` at `8f0c4d9` (run 36684650472, job 109787979044). This is the first completed run after the T-0306a merge `3167379`. 47 of 48 tests pass. The one that fails is `tests/e2e/shell.spec.ts:189` › `AC-6 the Phase 3 sub-route chunks are precached (offline)` › `/library/back-squat/compare/leg-press renders UF-04.3 offline after warming the shell`. The CI page snapshot shows UF-04.1 ("Offline · not synced yet"), not UF-04.3.

The product does the right thing. The built Compare screen redirects an exercise id that isn't in the cache to `/library` (D-0079 §3). The test still carries the T-0318 stub-era assumption: it warms on `/` only, re-registers the 501 REST backstop, and goes offline with an empty IndexedDB library. The outer `<div data-screen-id="UF-04.3">` exists only for the ~70–120 ms of the first cache read. Locally the first `toBeVisible` poll lands inside that window. On the CI runner it landed after. The test's purpose (the compare chunk is precached and its screen renders offline) is still valid, but the test has to set up the state that keeps the screen on UF-04.3. D-0091 records the rule: route tests on built screens seed their data and assert the URL holds.

## Scope
- In (`tests/e2e/shell.spec.ts`, AC-6 describe only):
  - **Take the UF-04.3 row out of `OTHER_SUB_ROUTES`** and give it its own test in the same describe.
    - Register `mockSupabaseData(page, { sets: [], exercises, exerciseAreas, exerciseVariants, areaTargets: [], profile })` from `tests/e2e/fixtures/uf-04-library-data.ts`. Register it inside the test, *after* the describe's 501 `beforeEach` backstop, so it wins (the most recently registered route runs first).
    - Warm the cache online: `goto('/')`, `injectSession`, `goto('/library')`, and wait for a `[data-field="name"]` row to be visible.
    - Then `await navigator.serviceWorker.ready`, `context.setOffline(true)`, and `goto('/library/back-squat/compare/leg-press')`.
  - **Assert the built screen:**
    - `[data-screen-id="UF-04.3"]` is visible.
    - `getByRole("columnheader", { name: "Leg press" })` is visible.
    - Once both are visible, `expect(page).toHaveURL(/\/library\/back-squat\/compare\/leg-press$/)` holds.
  - **Add the empty-cache contrast test.** Keep the existing 501 setup: no `mockSupabaseData` and a warm-up on `/` only. Go offline and `goto` the same compare URL. Assert `toHaveURL(/\/library$/)` and that `[data-screen-id="UF-04.1"]` is visible (D-0079 §3).
  - **Add a URL-unchanged assertion to the shared `OTHER_SUB_ROUTES` loop body** (D-0091 §2). After the existing `toBeVisible`, add `await expect(page).toHaveURL(new RegExp(`${escape(path)}$`))`, using a regex escape of `path`. This is trivially true for the remaining stubs. It turns the next built screen that redirects into a deterministic failure.
  - **Update the comment above the describe.** Rows for built screens seed their data (D-0091 §1). The T-0904 note about the 501 shadowing `profiles*` still applies to the stub rows. `/progress/back-squat` (UF-06.2) is to be taken out of the loop and seeded by T-0307b (D-0091 §4–§5).
- **Decision on the UF-06.2 row: leave it to T-0307b. This ticket does not harden it beyond the loop's URL assertion.** On `main`, UF-06.2 is still the stub. It loads nothing and renders its id unconditionally, so there is no built content to assert, and seeding a progress fixture now would test nothing. The loop's new URL assertion means T-0307b's own PR run fails deterministically on that row instead of by luck. D-0091 §5 grants T-0307b that row.
- Out:
  - Any `apps/**` or `packages/**` change. The redirect is correct product behaviour.
  - Raising any timeout, adding `retries`, `test.slow` or `test.setTimeout`, or deleting a row instead of fixing it (D-0086 §6, T-0901 AC8).
  - Changing the data or seeding of the other `OTHER_SUB_ROUTES` rows (`/progress/back-squat`, `/plan/edit`, `/plan/routines/new`, `/plan/routines/R1`).
  - `tests/e2e/fixtures/**`. The existing `uf-04-library-data.ts` and `mockSupabaseData` are enough. If the dev finds a fixture change is needed, raise it as a follow-up.
  - `auth-guard.phase3.test.tsx` (that is T-0365) and `profile-gate.test.tsx` (a web-shell follow-up).

### Edge cases that are in scope
- **Offline.** This is the whole ticket. A user who has opened the Library once can deep-link a compare URL offline and stay on it (AC-1). A user whose cache was never filled lands on the Library's "downloads the first time you're online" state, not on a blank screen (AC-2).
- **Zero history.** `sets: []`. Compare needs only the library, not any logged sets, so it renders for a brand-new user with a cached library.
- **Returning after 10 days off.** The cache is whatever was last synced. Offline, no refresh runs (`useScreenData` marks the refresh done straight away), so the seeded rows are what the screen decides from. This is the AC-1 path.
- **Time running out.** No timeout grows. The default 5 s `expect` and the existing `{ timeout: 3000 }` on the visibility check are enough once the state is right (AC-5).
- **Route order hazard.** If `mockSupabaseData` is registered before the describe's 501 backstop, the backstop shadows it, the cache stays empty and AC-1 fails on the URL. That failure is the intended signal.

## Acceptance criteria
Every command runs from the repo root with `CI=1` and `--config tests/e2e/playwright.config.ts`, with `VITE_SUPABASE_*` unset in the shell. `testsRun` records each command and its pass/fail counts.

- **AC-1 (seeded library: UF-04.3 renders offline and stays).** Given an injected session, `mockSupabaseData` with `uf-04-library-data.ts` registered after the 501 backstop, `/library` opened online until a `[data-field="name"]` row is visible, and `serviceWorker.ready` resolved, when the context goes offline and the page navigates to `/library/back-squat/compare/leg-press`, then `[data-screen-id="UF-04.3"]` is visible, the column header `Leg press` (role `columnheader`) is visible, and after both are visible the URL still matches `/\/library\/back-squat\/compare\/leg-press$/`.
- **AC-2 (empty cache: contrast, redirect pinned).** Given an injected session, only the 501 REST backstop (no library data), a warm-up on `/` and `serviceWorker.ready` resolved, when the context goes offline and the page navigates to `/library/back-squat/compare/leg-press`, then the URL matches `/\/library$/` and `[data-screen-id="UF-04.1"]` is visible. Together AC-1 and AC-2 pin both branches of the `current === undefined` lookup in `CompareContent.tsx`.
- **AC-3 (fault proof: the new test fails on the old setup).** The dev runs two injected faults. Neither is committed.
  1. **Product fault.** In `apps/web/src/features/UF-04/CompareContent.tsx`, change the lookup so it always misses (e.g. `const current = undefined`). Run AC-1's test with `--repeat-each=3 --workers=1`. It fails 3 of 3, and the failure is on `toHaveURL` or the `Leg press` header, not a timeout on the wrapper.
  2. **Old-setup fault.** Remove the `mockSupabaseData` call and the `/library` warm-up from AC-1's test, which restores the T-0318 setup. Run the same command. It fails 3 of 3.

  Revert both. `git diff main -- apps/` must be empty. Record both runs (command, counts, the first assertion that failed) in `testsRun`.
- **AC-4 (stable, repeated).** `CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/shell.spec.ts -g "AC-6" --repeat-each=10 --workers=2` reports 0 failed. That is the CI worker count. The full suite (`CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts`) then exits 0 with 49 passed: 48 today, minus the moved row, plus AC-1's test, plus AC-2's test. If the count differs, record why. `pnpm -w typecheck lint test` is green.
- **AC-5 (nothing else weakened).** Given the branch diff against `main`:
  - `OTHER_SUB_ROUTES` differs only by the removed UF-04.3 entry. The other four entries are byte-identical.
  - The loop body differs only by the added URL assertion.
  - No `timeout:` value is increased or added, and no `test.slow`, `test.setTimeout`, `retries` or `.skip`/`.fixme` is added anywhere in `shell.spec.ts`.
  - `tests/e2e/playwright.config.ts` and `tests/e2e/fixtures/**` are unchanged.
- **AC-6 (guarded, per D-0086).** `shell.spec.ts` still imports `test`/`expect` from `./fixtures/guarded-test.js`, and the existing source assertion in `fixture-guard.spec.ts` still passes. AC-1's test makes no unclaimed Supabase request. Every `/rest/v1/*` request it triggers online and offline is answered by `mockSupabaseData` or by the 501 backstop, so the guard's teardown passes.
- **AC-7 (CI green on a draft PR).** Given a draft PR from `t/T-0905-uf04-compare-offline-e2e` to `main`, when `CI` runs on `pull_request`, then `playwright e2e` concludes `success` on its first attempt, and `checks` and `supabase` stay green. Put the run URL in the result notes. The ticket can't be accepted without it (the T-0904 AC-10 precedent: T-0306a merged without a PR run of this job, and that is how this reached `main`).

## Paths you may change
- `tests/e2e/shell.spec.ts`: the AC-6 describe only. That covers the two new tests, the removed UF-04.3 row, the loop's URL assertion, the fixture import line for `uf-04-library-data.js` / `mockSupabaseData`, and the describe comment.
- `docs/tickets/T-0905-uf04-compare-offline-e2e.md` (this file), for the accept log only.
- **Not yours:**
  - `apps/**` and `packages/**`. AC-3's injected fault is local and temporary.
  - `tests/e2e/fixtures/**` and `tests/e2e/playwright.config.ts`.
  - `.github/**` and `docs/ci/**`.
  - `.squad/board.md` and `.squad/state.md`.

## Contract impact
None. No schema, API, engine or token change. D-0091 is a test-convention decision.

## Definition of done
- Every AC has a passing test, or a recorded run for AC-3 and AC-7.
- `pnpm -w typecheck lint test` is green, and the full e2e suite is green under `CI=1` (AC-4).
- AC-4's `--repeat-each=10` run is 0 failed.
- No timeout or retry is raised (AC-5).
- Contracts are unchanged.
- Commits start with `T-0905:` and cite `UF-04.3` / `UF-04.1`.

## Notes
- **Flow:** `wl-build-qa`. Ask QA to fault-inject on its own. Suggested faults:
  - Register `mockSupabaseData` *before* the 501 backstop. AC-1 must go red on the URL.
  - Drop the `/library` warm-up. AC-1 goes red.
  - Make the contrast test seed the library. AC-2 goes red.
- **Rebase hazard.** If T-0308a or T-0308b has merged a built `/plan/edit` or `/plan/routines/*` screen that redirects on an empty cache, the loop's new URL assertion will fail that row. That is the same bug surfacing, not a fault in this ticket. qa owns `shell.spec.ts`, so the dev seeds that row in this ticket the same way as AC-1 (its own test, the owning feature's e2e fixture). Record which row in the notes. Do not drop the assertion.
- **Follow-ups (not in this ticket):**
  1. The orchestrator adds the D-0091 §5 grant (the `/progress/back-squat` row of `shell.spec.ts` AC-6) to T-0307b's `## Paths you may change` on main. T-0307b then seeds UF-06.2 the way AC-1 seeds UF-04.3.
  2. T-0365 (web-shell): the jsdom twin in `auth-guard.phase3.test.tsx`.
  3. web-shell: check whether `profile-gate.test.tsx`'s "gate stands down" contrast on `/library/back-squat` and `/library/back-squat/compare/leg-press` can pass on a transient wrapper (D-0091 consequences).
  4. Orchestrator (repeat of the T-0904 follow-up 5): require a green `pull_request` run before merging feature branches that touch `apps/web/src/**` or `tests/e2e/**`.
