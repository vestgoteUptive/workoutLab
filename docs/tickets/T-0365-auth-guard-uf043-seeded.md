---
id: T-0365
title: auth-guard.phase3 "signed in renders UF-04.3" seeds back-squat and leg-press, so it asserts the built Compare screen and not the transient wrapper
lane: web-shell
screens: [UF-04.3, UF-04.1, UF-01.1]
decisions: [D-0079, D-0088, D-0091]
deps: [T-0306a]
status: ready
---
<!-- Written by product-owner 2026-10-01 (ci-spec mode) from the "Regression test / Secondary" note of docs/ci/CI-T-0905-uf04-compare-offline-redirect-race.md. Build flow: wl-build-web. About ¼ day. The jsdom twin of T-0905 (qa); no path overlap, so the two can run in parallel. -->

## Why
`apps/web/src/app/__tests__/auth-guard.phase3.test.tsx:79`, the row `"signed in: %s renders %s"` for `/library/back-squat/compare/leg-press` → `UF-04.3`, has the same latent shape as the e2e failure in T-0905. The test seeds no library. The built Compare screen (T-0306a) renders an outer `data-screen-id="UF-04.3"` wrapper during its first cache read, then redirects to `/library` because `back-squat` isn't in the cache (D-0079 §3). `waitFor` can be satisfied by that first render, so the test passes while the guard sends the user to a screen that immediately leaves. It is green today by timing. D-0088 §2 says to keep the guarantee on the same route and seed the fixture so the screen really renders. D-0091 §1–§2 say to assert the built content and that the URL holds.

## Scope
- In (`auth-guard.phase3.test.tsx` only):
  - **The signed-in UF-04.3 case gets its own `it`.** Take the compare path out of the signed-in `it.each`, for example by filtering it out of `NEW_PROTECTED_PATHS` for that `it.each` only. The signed-out `it.each` keeps all five rows.
  - **Seed the offline cache.** Before render, put two library rows in the IndexedDB cache (fake-indexeddb, `vitest.setup.ts`) for the signed-in user:
    - `back-squat` ("Back squat")
    - `leg-press` ("Leg press")

    Each row is `kind: "exercise"` with its area rows. Use `freshOfflineDb` / `signIn` from `apps/web/src/lib/offline/__tests__/test-helpers.ts`, Dexie directly, or a small new seed helper under `apps/web/src/lib/offline/__tests__/`. Do **not** import from `apps/web/src/features/UF-04/__tests__/**`, which are another lane's test helpers.
  - **No network.** The case runs with `navigator.onLine` false, so `useScreenData` skips the refresh, or with an explicit `from` stub. Either way it makes no real `supabase.from` call. The file's `lib/auth/client.js` mock has no `from`, and the other cases must not change behaviour.
  - **Assert the built screen and that the location holds.** Add a location probe to the harness, for example `useLocation` in `NavHelper`, so the test can read the current pathname. Additive only.
- Out:
  - Any other row or case in the file. D-0088 §3 says those rows stay byte-identical. That includes `/progress/back-squat`: its seeding belongs to T-0307b under D-0088's existing grant.
  - `profile-gate.test.tsx` and `routes.phase3.render.test.tsx`. Checking `profile-gate.test.tsx`'s "stands down" contrast is a separate follow-up (D-0091 consequences).
  - Any change to `apps/web/src/features/**`. AC-3's fault is local and temporary.
  - Raising any `waitFor` / `findBy` timeout.

### Edge cases that are in scope
- **Offline.** The seeded case runs offline. This is also the product's real path: the guard passes, the cache answers, and no refresh runs.
- **Zero history.** No sets are seeded. Compare needs only the library.
- **Empty cache.** The signed-in-with-nothing-cached path redirects to `/library`. It is pinned in `features/UF-04/__tests__/compare.test.tsx` (T-0306a) and by T-0905 AC-2 in e2e. AC-3.1 below shows that this test would catch it.

## Acceptance criteria
- **AC-1 (signed in, seeded: the built UF-04.3 renders and stays).** Given a valid stored session (`seedValidSession`), `navigator.onLine` false and the cache seeded with `back-squat` and `leg-press`, when `<Harness start="/library/back-squat/compare/leg-press" />` renders, then:
  - `findByRole("columnheader", { name: "Leg press" })` and `findByRole("columnheader", { name: "Back squat" })` resolve.
  - `[data-screen-id="UF-04.3"]` is in the document.
  - The probed pathname is still `/library/back-squat/compare/leg-press`.
  - `[data-screen-id="UF-01.1"]` and `[data-screen-id="UF-04.1"]` are not in the document.
- **AC-2 (signed out is unchanged).** Given no session, when the harness starts at `/library/back-squat/compare/leg-press`, then `[data-screen-id="UF-01.1"]` is in the document. This is the existing signed-out `it.each` row, byte-identical.
- **AC-3 (fault proof).** The dev runs two injected faults. Neither is committed. Record each in `testsRun` with the command, the result and the first failing assertion.
  1. **Drop the seed.** Remove the seed call. `pnpm --filter @workoutlab/web exec vitest run src/app/__tests__/auth-guard.phase3.test.tsx` then fails AC-1. The `Leg press` header never appears, or the pathname reads `/library`. The *old* row, run against the same empty cache, passes. That shows the old row was satisfied by the wrapper.
  2. **Force a lookup miss.** Make `CompareContent.tsx`'s lookup always miss. AC-1 fails.

  Revert both. `git diff main -- apps/web/src/features` must be empty.
- **AC-4 (nothing else changed or weakened).** Given the diff against `main`:
  - The four other `NEW_PROTECTED_PATHS` rows are byte-identical, and so are their signed-in and signed-out assertions and the `/session/:sessionId/summary` describe.
  - No `timeout` option is added.
  - The full file passes: 5 signed-out, 4 signed-in rows, the new UF-04.3 case, and the 4 summary cases.
- **AC-5 (isolation).** The seed doesn't leak. The cache is fresh for each test (`freshOfflineDb` in `beforeEach` or `afterEach`), and the online state is restored after the case. Running the file with `--sequence.shuffle` passes.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx`: the UF-04.3 signed-in case, the harness location probe and the seed setup only (D-0088 §2–§3).
- `apps/web/src/lib/offline/__tests__/` (web-shell): a new seed helper file, if needed. Existing helpers stay backwards-compatible.
- `docs/tickets/T-0365-auth-guard-uf043-seeded.md` (this file), for the accept log only.

## Contract impact
None.

## Definition of done
- Every AC has a passing test, or a recorded run for AC-3.
- `pnpm -w typecheck lint test` is green.
- Contracts are unchanged.
- Commits start with `T-0365:` and cite `UF-04.3`.

## Notes
- **Flow:** `wl-build-web`. Ask review to check that the diff stays inside D-0088 §2–§3: one route's case changes, and nothing else does.
