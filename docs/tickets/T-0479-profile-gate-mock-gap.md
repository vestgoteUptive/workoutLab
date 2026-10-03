---
id: T-0479
title: "profile-gate.test.tsx's lib/offline mock is a fixed literal, missing currentUserId/refreshAll — follow the sibling importOriginal pattern (T-0216 build finding)"
lane: web-shell
screens: []
decisions: []
deps: []
status: ready
---
<!-- Written 2026-10-03 by orchestrator (T-0216 build finding). Build flow: wl-build-web. Small. -->

## Why
`apps/web/src/app/__tests__/profile-gate.test.tsx` mocks `../../lib/offline/index.js` with a fixed
literal object (`loadProfile`, `refreshProfile`, `...uf06Loaders`), unlike its siblings in the same
directory (`auth-guard.phase3.test.tsx`, `routes.phase3.render.test.tsx`), which both spread
`...actual` from `importOriginal()`. T-0216 (UF-11.4 Equipment section) calls `currentUserId()` on
mount, which the fixed-literal mock doesn't export, so it throws and the route's error boundary
shows "Couldn't load this screen." — failing AC-6's `/plan/account` case (2 tests). This is a
pre-existing gap in the test harness, exposed by T-0216, not caused by it.

## Scope
- In:
  - `apps/web/src/app/__tests__/profile-gate.test.tsx`: change the `vi.mock("../../lib/offline/index.js", …)` at line 56 to the `importOriginal` pattern `auth-guard.phase3.test.tsx` already uses (spread `...actual`, override only `loadProfile`/`refreshProfile`/`uf06Loaders`). No other line changes; no assertion changes.
- Out: any other file. This is a one-line mock-shape fix, not new test coverage.

## Acceptance criteria
- **AC-1 (red on main)** On unfixed `main` plus T-0216's `EquipmentSection.tsx` mounted (or simply: confirm the 2 failing `/plan/account` cases in T-0216's own gate run), the mock throws on `currentUserId()`.
- **AC-2 (fixed)** After the `importOriginal` switch, every test in `profile-gate.test.tsx` passes, including any case that mounts a route calling `currentUserId()` or `refreshAll()`.
- **AC-3 (no regression)** The full `app/__tests__` and `lib/profile/__tests__` suites pass unedited.

## Definition of done
Tests pass · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
`-w format:check`, `node .github/scripts/check-all.mjs` green, each via `scripts/locked.sh heavy` ·
contracts unchanged · commits start `T-0479`.

## Build / accept log

- 2026-10-03, frontend-dev. Branch was one commit behind `main` (missing the ticket-filing commit
  `6ae8b0f`, which only touched `.squad/board.md`/`.squad/state.md`/this file); wrote this ticket
  file into the worktree directly rather than merging orchestrator bookkeeping into the lane
  branch.
- **AC-1 (red on main) repro**: T-0216's `EquipmentSection.tsx` isn't built in this worktree, so
  reproduced the gap directly against the mock shape instead. A scratch probe test (deleted before
  handback) did `vi.doMock("../../lib/offline/index.js", () => ({ loadProfile, refreshProfile }))`
  (the unfixed fixed-literal shape) and accessed `currentUserId` on the imported module —
  `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run
  src/app/__tests__/__t0479-probe.test.tsx` red: vitest itself throws `[vitest] No "currentUserId"
  export is defined on the "../../lib/offline/index.js" mock` and its own error message recommends
  the `importOriginal` pattern. Confirmed real exports of `lib/offline/index.ts` (`currentUserId`,
  `offlineDb`, `flush`, `startSync`, `ensurePersistentStorage`, …) are absent from the fixed-literal
  mock — exactly the shape T-0216 hit. The probe's second case, using the `importOriginal` fix,
  passed (rerun green, 2/2 after a minor assertion tidy).
- **Fix (AC-2)**: changed line 56 of `profile-gate.test.tsx` from the fixed literal to
  `vi.mock("../../lib/offline/index.js", async (importOriginal) => { const actual = await
  importOriginal<typeof import(...)>(); return { ...actual, loadProfile, refreshProfile,
  ...uf06Loaders }; })`, matching `auth-guard.phase3.test.tsx`'s pattern exactly. No assertions
  touched. `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run
  src/app/__tests__/profile-gate.test.tsx --no-file-parallelism` green: 92/92.
- **AC-3**: `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run
  src/app/__tests__ src/lib/profile/__tests__ --no-file-parallelism` green: 11 files, 290/290
  (unrelated jsdom/axe-core canvas stderr noise, not a failure).
- **Full gate** (cached, no `--force` — no contract touched): `scripts/locked.sh heavy npx -y
  pnpm@10.28.2 -w typecheck lint test --concurrency=1` green — 19/19 tasks, 248 test files,
  3441/3441 tests (16/19 cached). `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w
  test:repo-checks` green — 159/159. `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w format:check`
  green. `node .github/scripts/check-all.mjs` exit 0.
- Status: done.
