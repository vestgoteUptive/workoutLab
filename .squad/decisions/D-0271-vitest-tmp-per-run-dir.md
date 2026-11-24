---
id: D-0271
title: "Vitest temp dir: one subfolder per run (pid and start time) under node_modules/.vite/vitest-tmp, removed by its own run only; stale ones are pruned; overlapping runs in one package no longer delete each other's files (T-0934)"
status: decided
date: 2026-11-23
by: product-owner (groom T-0934)
area: infra
amends: D-0159
builds-on: D-0159, D-0169
---
## Context
Several gates saw `ENOENT` in `<package>/node_modules/.vite/vitest-tmp` while no assertion failed: T-0531 ("first run hit an ENOENT in web test while my loop ran concurrently"), T-0691 (engine, 32 files failed to load in one forced gate run). D-0159 §2 and §3 made every run in a package share **one** folder and made each run remove **the whole folder** at exit, on the stated assumption "only one vitest runs per worktree".

That assumption is false. `scripts/locked.sh` (D-0169) lets one heavy run (a gate through turbo, e2e) and one small run (`vitest run <file>`, a planted fault) go at the same time, and the repo-check test `check-vitest-tmp.test.mjs` also starts a vitest run in `packages/shared`. When the shorter run exits, its `process.once("exit")` hook deletes the folder under the longer run, whose workers then read a transformed module that no longer exists: `ENOENT`, on load.

## Decision
1. **A folder per run.** `redirectVitestTmp` creates `node_modules/.vite/vitest-tmp/<pid>-<startMs>/` and sets `TMPDIR` to it. `cleanupVitestTmp` removes only that subfolder at exit. The parent `vitest-tmp` folder stays (it may be empty). The `WL_VITEST_TMP_DIR` inheritance for child processes is unchanged: a child neither creates nor cleans up.
2. **Prune the dead.** At start, a run removes sibling subfolders whose pid is no longer alive (`process.kill(pid, 0)` throws `ESRCH`), best effort, never its own and never a live run's. A crash or `kill -9` therefore cannot grow the folder for long (the §3 goal).
3. **No other change.** No pool change, no vitest patch, no per-package config edit: every package already calls `cleanupVitestTmp(redirectVitestTmp(import.meta.url))`, and the repo check (D-0159 §4) still matches that text. `turbo.json` already lists `vitest.tmp.ts` in `globalDependencies`, so the change invalidates the test cache by itself.
4. **Guard.** The behaviour test gains an overlap case: two processes in one package, the first exits, the second's folder and file survive. The D-0159 §4 count test now expects the parent folder to hold no run folder after a run.

## Consequences
Concurrent runs in one package are safe. `/tmp` and disk usage stay bounded as D-0159 intended. D-0159 §3's sentence "or the whole `vitest-tmp/` folder (only one vitest runs per worktree)" no longer applies; the rest of D-0159 stands.
