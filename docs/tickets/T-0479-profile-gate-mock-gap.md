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
