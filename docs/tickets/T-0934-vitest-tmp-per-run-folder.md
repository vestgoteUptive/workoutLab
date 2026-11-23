---
id: T-0934
title: "Vitest temp dir ENOENT (engine, and any package): give every run its own subfolder under node_modules/.vite/vitest-tmp and clean up only that one, so overlapping runs in one package stop deleting each other's files"
lane: infra
screens: []
decisions: [D-0159, D-0169, D-0271]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-infra (agent devops). About ⅓ day. Root cause found in grooming from the code and the logs; the builder confirms it with AC1 before changing anything. -->

## Why
Two gates hit `ENOENT` in `<package>/node_modules/.vite/vitest-tmp` with no failing assertion: T-0531 (web, "while my loop ran concurrently") and T-0691 (engine, 32 files failed to load in one forced `--force --concurrency=1` run, the rerun was green). The cause is a stated assumption in D-0159 that is not true:
- `vitest.tmp.ts` `redirectVitestTmp` points `TMPDIR` at **one** folder per package, and `cleanupVitestTmp` registers `process.once("exit", () => rmSync(dir, { recursive: true }))` on **the whole folder** (D-0159 §3: "only one vitest runs per worktree").
- `scripts/locked.sh` (D-0169) allows one heavy run (a turbo gate) and one small run (`vitest run <file>`, a planted fault) at the same time. `check-vitest-tmp.test.mjs` (part of `test:repo-checks`) also starts a vitest run in `packages/shared`. Two runs in one package share the folder. When the shorter one exits, its hook deletes the folder under the longer one, whose forked workers then fail to read a transformed module: `ENOENT`, on load.

D-0271 decides the fix: a folder per run. This ticket builds it.

## Scope
- In:
  - **`vitest.tmp.ts`** (root helper):
    - `redirectVitestTmp(configUrl)` creates `<package>/node_modules/.vite/vitest-tmp/<pid>-<startMs>/`, sets `TMPDIR` and `WL_VITEST_TMP_DIR` to it and returns it. Same guards as today: nothing unless `VITEST === "true"`; an inherited `WL_VITEST_TMP_DIR` is returned as is, with no new folder and no cleanup (a child process).
    - Before creating its own, it removes sibling run folders whose pid is not alive (`process.kill(pid, 0)` throws `ESRCH`), best effort, never its own, never a folder whose pid answers.
    - `cleanupVitestTmp(dir)` removes **only** the folder it was given, at exit, and never the parent.
  - **`.github/scripts/check-vitest-tmp.test.mjs`**: the new behaviour tests (AC1 to AC5) and the updated count test.
  - **`.github/scripts/check-vitest-tmp.mjs`**: only if its text matching needs it. The call names and the `redirectVitestTmp(` / `cleanupVitestTmp(` text in each package's config do not change, so no package config is edited.
- Out:
  - Any vitest pool change, a vitest patch or downgrade (D-0159 §1).
  - `packages/*/vitest.config.ts` (every package already calls the two helpers; `packages/engine/vitest.config.ts` and the root `turbo.json` change only if AC6's measurement shows they must, which is not expected: `turbo.json` already lists `vitest.tmp.ts` in `globalDependencies`, so editing the helper invalidates the cache).
  - The machine lock (`scripts/locked.sh`) and the e2e `TMPDIR` rule.

## Acceptance criteria
Tests are `node --test` cases in `.github/scripts/check-vitest-tmp.test.mjs`, titled `T-0934 ACn`. Each runs the helper in a child `node --import tsx` process with `VITEST=true` and `cwd` `packages/shared` (the pattern of the existing T-0441 tests), under a scratch `TMPDIR`.
- **AC1 (the overlap reproduces, red before the fix).** Given two child processes A and B that both call `redirectVitestTmp` for the same package, and B writes a marker file under its `TMPDIR`, When A exits normally and runs its cleanup hook, Then B's marker file still exists. On the **unfixed** helper this is red (A removed the shared folder); the red run is recorded in the log.
- **AC2 (folder shape).** Given one child run, When it calls `redirectVitestTmp`, Then the returned dir is `<repo>/packages/shared/node_modules/.vite/vitest-tmp/<pid>-<digits>`, `process.env.TMPDIR` and `WL_VITEST_TMP_DIR` both equal it, and it exists.
- **AC3 (cleanup removes only its own).** Given run A with a sibling folder `<livePid>-1` (the test's own pid) in the parent, When A exits, Then A's folder is gone, the sibling and the parent folder remain.
- **AC4 (dead folders are pruned, live ones are not).** Given sibling folders `<deadPid>-1` (a pid taken from a child that has exited) and `<livePid>-1`, When a new run starts, Then the dead one is removed and the live one is kept. Sibling of AC3.
- **AC5 (inheritance and the non-vitest case are unchanged).** Given `WL_VITEST_TMP_DIR` already set (a child of a vitest run), Then `redirectVitestTmp` returns it, creates no folder and registers no exit handler. Given `VITEST` unset (`vite dev`, `build`, `preview`), Then `TMPDIR` is left alone and no exit handler is registered. (The two existing T-0441 rework tests keep passing.)
- **AC6 (the real packages, evidence).** Start `scripts/locked.sh heavy npx -y pnpm@10.28.2 --filter @workoutlab/engine test`, and while it runs start five short `vitest run` invocations of single engine test files one after another from `packages/engine`. Then the heavy run passes with no `ENOENT`, three times in a row. Record the counts. If you can reproduce the failure on the unfixed helper in three attempts, record that too; AC1 is the proof of record if you cannot.
- **AC7 (the existing count test, updated).** The T-0441 AC5 test ("one vitest run in packages/shared leaves nothing in a fresh TMPDIR or in its redirected vitest-tmp") now asserts the redirected `vitest-tmp` holds **no run folder** after the run (the parent may exist and be empty) and the scratch `TMPDIR` is empty.
- **AC8 (the repo check still passes on every package).** `node .github/scripts/check-all.mjs` is green: every vitest package still calls both helpers (the `vitest-tmp` rule).

Binary-condition check (D-0197 §7): one run and two overlapping runs (AC1 against AC2); a live and a dead sibling pid (AC3 against AC4); inside vitest and outside it (AC5). A tombstoned or rejected row state does not apply: nothing here migrates data.

## Paths you may change
- `.github/**` (lane; in practice `.github/scripts/check-vitest-tmp.test.mjs` and, only if its text matching needs it, `.github/scripts/check-vitest-tmp.mjs`)
- Listed extras:
  - `vitest.tmp.ts` (the root helper; it is in no lane's paths; orchestrator grant)
  - `packages/engine/vitest.config.ts` and `turbo.json`, only if AC6's measurement shows they are needed (not expected)

## Contract impact
none. It changes D-0159 §3's cleanup rule, so it relies on D-0271 (linked above). No openapi, data-model, engine-rules or token change.

## Definition of done
AC1 to AC8 proven in the log with the red run recorded · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green (the helper is a turbo global input, so force once) · `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no `vitest-tmp` folder left in any package after the runs · commits start `T-0934`.
