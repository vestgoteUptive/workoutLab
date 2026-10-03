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

## QA accept log

- 2026-10-03, qa-tester. `git status` clean, HEAD `a58183e`. Branch is behind `main` (missing
  T-0418/T-0469/T-0470/T-0468-merge/etc., several commits) but `git merge-tree
  $(git merge-base HEAD main) HEAD main` auto-merges clean (no `CONFLICT` marker; the only touched
  shared files are `.squad/board.md`, `.squad/journal/2026-10-03.md`, `.squad/state.md`,
  `docs/tickets/T-0468-...md`, all non-overlapping line ranges) — per QA §1, no action needed; the
  orchestrator's forced gate on `main` after merge covers the combination.
- **Diff review**: confirmed the only code diff is `profile-gate.test.tsx`'s `vi.mock(…)` call
  (fixed literal → `importOriginal`, spreading `...actual`), byte-identical in shape to
  `auth-guard.phase3.test.tsx`'s own mock (lines 56-59 of each match exactly). No assertion line
  touched — specifier-shape-only, as claimed.
- **Reran recorded results**: `scripts/locked.sh small npx -y pnpm@10.28.2 --filter
  @workoutlab/web exec vitest run src/app/__tests__/profile-gate.test.tsx --no-file-parallelism`
  green 92/92 (AC-2). `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec
  vitest run src/app/__tests__ src/lib/profile/__tests__ --no-file-parallelism` green, 11 files,
  290/290 (AC-3; same unrelated jsdom/axe-core canvas stderr noise builder noted).
- **No e2e spec touches this** (`screens: []`; grep of `tests/e2e/` for
  `profile-gate|EquipmentSection|currentUserId` empty) — none run, correctly.
- **Own planted fault (AC-1 independently reproduced)**: confirmed `EquipmentSection.tsx` (T-0216)
  doesn't exist in this worktree or on `main` (not merged yet), so, like the builder, reproduced
  the gap at the mock-export level rather than through T-0216's component. Added a scratch probe
  `src/app/__tests__/__t0479-qa-probe.test.tsx` (deleted after, `git status` clean) with two cases:
  (1) a fixed-literal `vi.doMock` of `lib/offline/index.js` exporting only `loadProfile`/
  `refreshProfile`, then import and read `currentUserId` off the mocked module — red,
  `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run
  src/app/__tests__/__t0479-qa-probe.test.tsx --no-file-parallelism`: `[vitest] No "currentUserId"
  export is defined on the "../../lib/offline/index.js" mock`, matching T-0216's real failure
  mode exactly; (2) the same probe using the `importOriginal` pattern — green, `currentUserId`
  resolves to a real function. Confirms the fix is load-bearing, not cosmetic.
  Separately: tried reverting just `profile-gate.test.tsx`'s own mock to the fixed literal (backup
  via `cp`, restored via `cp`) and rerunning the file alone — stayed green (92/92), because no
  case in that file itself calls `currentUserId`/`refreshAll` directly; the file only breaks once
  T-0216's component (which does call it) is mounted on `/plan/account`, consistent with the
  ticket's own "T-0216's EquipmentSection.tsx isn't built in this worktree" note. The probe above
  is the faithful fault, not this one.
- **Verdict**: AC-1 (red reproduced, own fault), AC-2 (fixed, rerun green), AC-3 (no regression,
  rerun green) all hold. Full gate not rerun (QA does not rerun the builder's gate per role rules);
  builder's recorded 19/19 + repo-checks + format:check + check-all.mjs green stands.
- Status: done (QA).
