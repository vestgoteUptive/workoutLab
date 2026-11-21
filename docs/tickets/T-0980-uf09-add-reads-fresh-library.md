---
id: T-0980
title: "Adding an exercise during a workout fails if the session loaded before the exercise library was cached (UF-09.9)"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.10]
decisions: [D-0246, D-0247]
deps: [T-0949, T-0950]
status: todo
---
## Why
Found by T-0950 QA (about 1 run in 20). `features/UF-09/load.ts:73-80` reads the cached library once at session load and falls back to `[]`. `session.tsx` `insertItem` passes that snapshot (`ctx.library`) to the engine. A session loaded before the shell's first library refresh (cold start, reload right after sign-in) fails every add with `RangeError: <id> is not in the library` and the sheet shows "Couldn't add …". The sheet itself reads `loadLibrary()` on open, so it lists rows the add then rejects.

## Scope
- In: `insertItem` reads the library at call time (`loadLibrary()`, the same source the sheet uses), falling back to `ctx.library` only when that read fails or is empty.
- Out: other uses of `ctx.library`, engine changes.

## Acceptance criteria
- AC1 Given a session whose `ctx.library` is `[]` and a cached library that holds the chosen exercise, When Add is tapped, Then the item is inserted and the status line announces it (no alert).
- AC2 Given `loadLibrary()` rejects and `ctx.library` holds the exercise, Then the add still succeeds.
- AC3 Given both are empty, Then the existing "Couldn't add …" alert shows and nothing is written.
- AC4 e2e: a paused session seeded before the library cache fills (cold library) adds an exercise; repeat-each 10 green.

## Paths you may change
`apps/web/src/features/UF-09/**`, `tests/e2e/uf-09-add-exercise.spec.ts`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · commit messages start with `T-0980` and cite UF-09.9.

## Build / accept log
- Build (T-0980, UF-09.9): `insertItem` now reads `loadLibrary()` at call time, falls back to `ctx.library` when the read rejects or is empty, and names the added item from the same library. AC1-AC3 -> `UF-09/__tests__/t0980.add-fresh-library.test.tsx`; AC4 -> `tests/e2e/uf-09-add-exercise.spec.ts` "T-0980 AC4 cold library" (library fetch held until the session has loaded; `seedPaused` got `waitForLibrary: false`), 10/10 with `--repeat-each 10`. Red on old code: AC4 3/3 failed, AC1 failed. Faults (cp-restored, cmp-checked): ignore fresh read -> AC1 red; drop snapshot fallback -> AC2 red; reject -> failed -> AC2 red. Gate: web tsc, lint, test (5290) green, format:check green, uf-09* e2e 90/90. check-all: only `ticket-not-on-base` (ticket file not on main yet; orchestrator).
