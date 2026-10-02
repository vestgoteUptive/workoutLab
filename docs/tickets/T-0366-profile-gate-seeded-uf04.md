---
id: T-0366
title: profile-gate.test.tsx AC-6 "gate stands down" rows for UF-04.2 and UF-04.3 seed the library, so they assert the built screens staying put and not the transient wrapper
lane: web-shell
screens: [UF-04.2, UF-04.3, UF-04.1, UF-01.1]
decisions: [D-0064, D-0071, D-0073, D-0079, D-0088, D-0091]
deps: [T-0365]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner from the D-0091 consequences (T-0365 follow-up). Build flow: wl-build-web. About ¼ day. Web-shell: don't run in parallel with T-0370, T-0331, T-0301b or T-0301c (T-0301b and T-0301c have D-0097 grants on this same file). -->

## Why
`apps/web/src/app/__tests__/profile-gate.test.tsx` AC-6 iterates the 13 gated paths twice, once `unknown` (offline, no cached profile) and once `present` (online, cached profile). For each path it asserts that the route renders its own screen and stays put. Two of those paths are built screens that redirect an exercise id they can't find in the cache (D-0079 §3):
- `/library/back-squat` (UF-04.2), and
- `/library/back-squat/compare/leg-press` (UF-04.3).

The file seeds no library. `lib/offline/index.js` is mocked, but UF-04 reads `lib/offline/history.js` directly, against an empty fake-indexeddb. Each screen renders its outer `data-screen-id` wrapper first, and leaves for `/library` once the cache read (and, online, its own `refreshAll`) settles. So `waitFor(screenOf(id))` can be met by the wrapper. The `locationRef` check after one `act` tick passes only if the redirect lands later than that tick. This is the latent race D-0091 describes, and T-0365 already fixed it in `auth-guard.phase3.test.tsx`. D-0091 §1–§2 and D-0088 §2: seed the fixture on the same route, assert the built content, and assert that the URL holds.

## Scope
- In (`profile-gate.test.tsx`, plus a helper under `lib/offline/__tests__/` if needed):
  - **A per-pattern fixture map** for the two UF-04 patterns, used only by the AC-6 `unknown` and `present` iterations:
    - `"/library/:exerciseId"`: seed `back-squat`.
    - `"/library/:exerciseId/compare/:otherId"`: seed `back-squat` and `leg-press`.

    The iteration stays derived from `gatedPaths(routes)`. The map adds a seed and a "built content" check per pattern. It doesn't add or remove paths.
  - **Seeding.** `unknown` (offline): seed the Dexie cache for user `u1` (the id `seedValidSession()` stores), with `seedLibrary` from `lib/offline/__tests__/seed-library.ts` and a fresh DB per test (`freshOfflineDb`). `present` (online): the screen runs its own `refreshAll`, which rewrites the cache from `supabase.from`. So also give the select spy `exercises`, `exercise_areas` and `exercise_variants` rows for the same exercises, so the refresh writes the same two exercises back. Alternatively, show in a comment why the refresh can't empty the cache. Either way, the seed must survive the screen's refresh.
  - **Assertions** for these two rows: the built content, then a settled tick, then the location unchanged and UF-04.1 absent.
- Out:
  - Every other AC-6 row, and every other describe in the file. They stay byte-identical, except for the shared lookup of the fixture map in the two `it.each` bodies.
  - `/progress/back-squat` (UF-06.2). It is still the stub on `main`, and T-0307b owns its seeding (D-0091 §4, D-0088).
  - The AC-5 `missing` rows. They redirect to `/welcome/save` before any UF-04 read, so they are unaffected.
  - `apps/web/src/features/**`. Any `timeout` option. The AC-10 order-dependence (T-0331).

### Edge cases that are in scope
- **Offline:** the `unknown` iteration is the offline path, served from the cache with no refresh.
- **Online refresh racing the seed:** the `present` iteration (see Seeding).
- **Empty cache:** the redirect to `/library` stays pinned by `features/UF-04/__tests__/compare.test.tsx`, `detail.test.tsx` and T-0905's e2e. AC-3 shows that this file would now catch it.
- Zero history: no sets are seeded, and these screens need only the library.

## Acceptance criteria
- **AC-1 (the check, recorded)** Before changing anything, run `pnpm --filter @workoutlab/web exec vitest run src/app/__tests__/profile-gate.test.tsx` with `CompareContent.tsx`'s lookup forced to miss (not committed). Record in `notes` whether the current `unknown`/`present` UF-04.3 rows still pass, which would show they can pass on the wrapper. Do the same for UF-04.2 with `LibraryDetail`'s lookup forced to miss. Revert. `git diff main -- apps/web/src/features` is empty.
- **AC-2 (`unknown`, seeded: the built screens render and stay)** Given signed in, offline, no cached profile, and the cache seeded for `u1`, When the harness starts at `/library/back-squat`, Then `findByRole("heading", { level: 1, name: "Back squat" })` resolves. After one more settled `act`, `locationRef` is `/library/back-squat`, and UF-04.1 and UF-01.1 are absent. When it starts at `/library/back-squat/compare/leg-press`, Then `findByRole("columnheader", { name: "Back squat" })` and `{ name: "Leg press" }` resolve, `locationRef` holds, and UF-04.1 and UF-01.1 are absent.
- **AC-3 (`present`, seeded, online)** Same as AC-2 under `statePresent()` (online, cached profile), with the screen's own `refreshAll` running against the spy. Same assertions. The test also asserts that the spy saw at least one `exercises` select, which proves the refresh ran and didn't empty the cache.
- **AC-4 (fault proof, recorded)** Run each of these with the file, uncommitted, and record the command and the first failing assertion in `testsRun`:
  1. Drop the seed: AC-2 and AC-3 fail. The heading or columnheader never appears, or the location reads `/library`.
  2. Force the `CompareContent.tsx` lookup to miss: the UF-04.3 rows fail.
  3. Drop only the spy rows from AC-3 (keep the Dexie seed): the `present` rows fail.

  Revert all three. `git diff main -- apps/web/src/features` is empty.
- **AC-5 (nothing else changed or weakened)** The gated-set describe still pins 12 `protected` + `/session/setup` = 13 paths. Every other row of AC-6, and every other describe, is unchanged in `git diff main`. No `timeout` option is added. The full file passes.
- **AC-6 (isolation)** The cache is fresh for each test (`freshOfflineDb` in `beforeEach` and `afterEach`), and the spy rows are reset by the existing `spy.reset()`. `vitest run src/app/__tests__/profile-gate.test.tsx --sequence.shuffle -t "AC-6|the gated set"` passes 3 times in a row. That filter covers the AC-6 describe and the gated-set describe. The whole file isn't shuffled, because T-0331's AC-10 lazy-chunk order-dependence is out of scope here.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/app/__tests__/profile-gate.test.tsx` and `apps/web/src/lib/offline/__tests__/**` (the lane: `web-shell`). In the test file: the AC-6 fixture map, the seed setup and the two rows' assertions (D-0088 §2–§3, D-0091 §1–§2). In the helpers folder: a new helper file if needed, with existing helpers kept backwards-compatible.
- **Listed extras:**
  - `docs/tickets/T-0366-profile-gate-seeded-uf04.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Every AC has a passing test, or a recorded run for AC-1 and AC-4 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0366` and cite `UF-04.2` / `UF-04.3`.

## Notes
- **Flow:** `wl-build-web`. Ask review to check that the diff stays inside D-0088 §2–§3: two rows' fixtures and assertions, and nothing else.
- If T-0370 lands first, `seedLibrary` already uses the shared key builder. Nothing here depends on that.

## Build / accept log
Archived in `docs/tickets/log/T-0366.md` (D-0157).
