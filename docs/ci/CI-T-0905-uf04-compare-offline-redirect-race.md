---
ticket: T-0905
classification: flaky
lane: qa
runs:
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36684650472   # main, 8f0c4d9, job 109787979044
date: 2026-10-01
---

## What failed

- Workflow `CI` (`.github/workflows/ci.yml`), job `playwright e2e` (job 109787979044), step **`Run pnpm exec playwright test --config tests/e2e/playwright.config.ts`**. This is the test step itself. The upload-artifact post-step ran normally.
- Branch `main`, commit `8f0c4d9`. 47 of 48 passed. One test failed: `tests/e2e/shell.spec.ts:189` › `AC-6 the Phase 3 sub-route chunks are precached (offline)` › `/library/back-squat/compare/leg-press renders UF-04.3 offline after warming the shell`.
- The last green run is 36684025951 at `824bc9c`. The next run, 36684522238 at `5ef3d75`, was cancelled. That makes 36684650472 the first *completed* run containing the T-0306a merge `3167379` (UF-04.1/.2/.3 built screens). T-0306a had no completed `pull_request` CI run of this job before merge.

## Evidence

Job log (`gh api repos/vestgoteUptive/workoutLab/actions/jobs/109787979044/logs`):

```
Running 48 tests using 2 workers
····································F···········
  1) [chromium] › tests/e2e/shell.spec.ts:189:9 › AC-6 the Phase 3 sub-route chunks are precached (offline) › /library/back-squat/compare/leg-press renders UF-04.3 offline after warming the shell
    Error: expect(locator).toBeVisible() failed
    Locator: locator('[data-screen-id="UF-04.3"]')
    Expected: visible
    Timeout: 3000ms
    Error: element(s) not found
      199 |       await page.goto(path);
    > 201 |       await expect(page.locator(`[data-screen-id="${screenId}"]`)).toBeVisible({ timeout: 3000 });
  1 failed
  47 passed (35.2s)
```

The `error-context.md` page snapshot in the uploaded `playwright-report` artifact shows the page **on UF-04.1, not UF-04.3**. The compare route had already redirected to `/library`:

```yaml
- heading "Library" [level=1]
- text: Offline · not synced yet
- paragraph: The exercise library downloads the first time you're online.
```

## Reproduction

I used a depth-1 clone (`git clone --depth 1 file://<repo>`, HEAD `77646bb`, whose app code is identical to `8f0c4d9`), then a fresh `npx -y pnpm@10.28.2 install --frozen-lockfile`, `playwright install chromium`, and `CI=1`, which gives a fresh server with no turbo cache. Nothing else was listening on :4173. Every run used `--workers=1`.

| # | Command | Result |
|---|---|---|
| 1 | `playwright test … shell.spec.ts -g "AC-6" --repeat-each=2` | 14 of 14 passed. **The CI failure does not reproduce as a red test locally.** |
| 2 | A probe spec using the same setup as the failing test (outer mocks plus the AC-6 501 re-registration, warm on `/`, offline, `goto` compare), logging `data-screen-id` and the URL every ~50 ms, `--repeat-each=3` | 3 of 3 showed the same sequence: `/library/back-squat/compare/leg-press` → **redirect to `/library` 70–120 ms after `goto`** → `UF-04.1` from then on. `UF-04.3` was in the DOM in one sample only (t=71 ms, already mid-redirect). In the other two runs, the first sample after `goto` saw `[]`, then `UF-04.1`. |
| 3 | A probe with the library cache seeded online first (`mockSupabaseData` with `fixtures/uf-04-library-data.ts`, open `/library` online, offline, `goto` compare), then asserting `UF-04.3`, the `Leg press` column header, and that the URL is unchanged after 500 ms, `--repeat-each=5` | 5 of 5 passed. The screen stays on UF-04.3. |

The test passes locally only because Playwright's first `toBeVisible` poll lands inside the few tens of milliseconds before the redirect. On the CI runner (2 workers, slower lazy-chunk and IndexedDB timing), the first poll landed after the redirect, and the element never came back during the 3 s window. I did not see the test fail locally, but the race window is measured above and the CI snapshot shows exactly the post-redirect state.

## Root cause

The test still encodes the T-0318 stub-era assumption: the stub `Compare` rendered `data-screen-id="UF-04.3"` unconditionally and loaded nothing. T-0306a (`3167379`) replaced it with the built screen. That screen correctly redirects an exercise id that isn't in `loadLibrary()` (D-0079 §3; `apps/web/src/features/UF-04/CompareContent.tsx`, `if (current === undefined) … <Navigate to="/library" replace />`).

The AC-6 `describe` re-registers the 501 REST catch-all, and the warm-up visits `/` only. So the IndexedDB library is empty when the test goes offline. Offline, `useScreenData` marks the refresh done straight away (`pending` is false), so the screen redirects after its first read. The outer `<div data-screen-id="UF-04.3">` in `features/UF-04/index.tsx` exists only for that first IndexedDB read, and the test's pass or fail depends on whether the poll lands in that window.

The product behaviour is correct. An offline user with an empty cache who deep-links a compare URL lands on the Library's "downloads the first time you're online" state. That is not a defect in `web-feature:UF-04` or `web-shell`. It is a stale test that now races. The test's real purpose (the compare chunk is precached and renders offline) is still valid, but the test no longer sets up the state that the built screen needs to stay on UF-04.3.

`/progress/back-squat` (UF-06.2) in the same table still passes because UF-06 is still the stub on `main`. It will hit the same trap when T-0307b merges, since its built screen also redirects an unknown exercise id (D-0088 context).

## Proposed fix

Lane `qa`, file `tests/e2e/shell.spec.ts` only. Do not weaken the timeout, add retries, or drop the row.

1. Take the UF-04.3 row out of the generic `OTHER_SUB_ROUTES` loop and give it its own test in the same AC-6 `describe`. Register `mockSupabaseData(page, { sets: [], exercises, exerciseAreas, exerciseVariants, areaTargets: [], profile })` from `fixtures/uf-04-library-data.ts` *after* the describe's 501 backstop, so it wins. Warm the cache online by opening `/library` and waiting for a `[data-field="name"]` row. Then `await navigator.serviceWorker.ready`, go offline, and `goto('/library/back-squat/compare/leg-press')`.
2. Assert the built screen, not just the wrapper: `[data-screen-id="UF-04.3"]` visible, `getByRole("columnheader", { name: "Leg press" })` visible, and `expect(page).toHaveURL(/\/library\/back-squat\/compare\/leg-press$/)` still holding after the screen has rendered. The URL assertion is what turns a redirect into a deterministic failure instead of a timing-dependent pass.
3. Add the contrast case, so the empty-cache path is pinned instead of being raced: with the existing 501 setup (empty cache), offline `goto` the same compare URL, then assert `toHaveURL(/\/library$/)` and `[data-screen-id="UF-04.1"]` visible (D-0079 §3).
4. Update the T-0318/T-0904 comment above the `describe` to say that rows for built screens seed their data. Note that `/progress/back-squat` must get the same treatment when T-0307b lands.

Verified in a scratch clone: step 1–2's shape passed 5 of 5 under the guarded fixture (no unclaimed Supabase requests).

**Acceptance criteria for T-0905**

- AC-1: The UF-04.3 offline test seeds the library online, renders UF-04.3 offline with the `Leg press` column header, and asserts the compare URL is unchanged after render.
- AC-2: A contrast test asserts that an offline compare deep-link with an empty cache lands on `/library` (UF-04.1).
- AC-3: Fault-proof: with `CompareContent.tsx`'s lookup changed to always miss, which forces the redirect, AC-1 fails deterministically. Remove the injected fault before commit.
- AC-4: `CI=1 pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/shell.spec.ts -g "AC-6" --repeat-each=10` is 100% green, and the full e2e suite is green.
- AC-5: No other row of `OTHER_SUB_ROUTES` changes, and no timeout increases.

## Regression test

The AC-1 and AC-2 tests above, in `tests/e2e/shell.spec.ts` (AC-6 describe). AC-1's URL-unchanged assertion would have turned this from a CI-only, timing-dependent failure into a deterministic local failure at T-0306a build time.

Secondary (lane `web-shell`, D-0088 grant): `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx:79` ("signed in: %s renders UF-04.3") has the same latent shape. `waitFor` can be satisfied by the wrapper's first render before the compare body redirects. It is green today, but per D-0088 §2 its fixture should seed the `back-squat` and `leg-press` library rows so it asserts the built screen and not the transient wrapper.
