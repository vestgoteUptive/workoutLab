---
id: T-0525
title: One vitest variant across the workspace (engine, shared, design-tokens and exercises resolve vitest against vite 8 today, web and landing against vite 6)
lane: infra
screens: []
decisions: [D-0159]
deps: [T-0512]
status: todo
---
<!-- Groomed by product-owner 2026-10-08 from the parked board row (owner request: groom 10 parked tickets). T-0512 is done, so the park reason no longer holds. Checked against the current install: still three vitest@5.0.2 variants. About ¼ day. -->

## Why
After T-0512 (astro 7, which brings vite 8), pnpm resolves `vitest@5.0.2`'s `vite` peer differently per package. On the current lockfile:
- `apps/web`, `apps/landing` → vitest against `vite@6.4.3` (lightningcss variant);
- `packages/engine`, `packages/shared`, `packages/design-tokens`, `data/exercises` → vitest against `vite@8.3.3`;
- a third `vitest@5.0.2 … vite@6.4.3` variant without lightningcss is also in the store.

Every package's `vitest.config.ts` imports the shared root `vitest.tmp.ts` (D-0159), which resolves its own imports through hoisting. Two vite majors under one test runner means a config or plugin that works in one package can behave differently in another, and a future lockfile change can move a package between variants without anyone noticing. One variant keeps test behaviour uniform and the gate predictable.

## Scope
- In: make every workspace package resolve the same vitest variant. Preferred default: an explicit `"vite": "^6.4.3"` devDependency in the four packages without one (`packages/engine`, `packages/shared`, `packages/design-tokens`, `data/exercises`), matching web and landing; a root `pnpm-workspace.yaml` override or `peerDependencyRules` is fine instead if it is smaller and does not touch astro's own vite 8. `pnpm install` to update the lockfile.
- Out: upgrading web or landing to vite 8; changing astro's internal vite; any vitest major bump; test file changes.

## Acceptance criteria
- **AC-1 (one variant).** Given a fresh `npx -y pnpm@10.28.2 install --frozen-lockfile` on the branch, when listing `node_modules/.pnpm` entries matching `^vitest@`, then there is exactly one. On unfixed `main` there are three (record the red listing).
- **AC-2 (every package uses it).** Given AC-1, for each of `apps/web`, `apps/landing`, `packages/engine`, `packages/shared`, `packages/design-tokens`, `data/exercises`, `readlink -f <pkg>/node_modules/vitest` points to that one directory. A repo-check test under `.github/scripts/` (run by `test:repo-checks`) asserts this from `pnpm-lock.yaml` (every `importers.<pkg>.devDependencies.vitest.version` string is identical) so a later lockfile change that splits it again fails.
- **AC-3 (astro unaffected).** Given the change, `apps/landing` still builds (`npx -y pnpm@10.28.2 --filter @workoutlab/landing build`) and its astro resolves `vite@8.x` as before.
- **AC-4 (fault proof).** On a backup copy of `pnpm-lock.yaml`, change one importer's vitest version string to a different variant suffix; the AC-2 repo-check fails naming that importer. Restore with `cp`.
- **AC-5 (gate).** The full gate with `--force` (a lockfile change, so the cache cannot be trusted) is green: `-w typecheck lint test --force --concurrency=1`, `-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`. Record the vitest test counts per package; they equal `main`'s.

## Paths you may change
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/scripts/**` (infra lane).
- Extras for this ticket: `packages/engine/package.json`, `packages/shared/package.json`, `packages/design-tokens/package.json`, `data/exercises/package.json` (the `devDependencies.vite` line only).
- This ticket file (build log).

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0525`.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log

- Build (infra, 2026-10-15). HEAD b89305f5, clean. Added `"vite": "^6.4.3"` devDependency to engine, shared, design-tokens, data/exercises; lockfile regenerated with pnpm 10.28.2 (4 importers moved from vite 8.3.3 to 6.4.3 variant). New check `.github/scripts/check-vitest-variant.mjs` + test.
- AC-1: fresh `install --frozen-lockfile` -> `ls node_modules/.pnpm | grep -c '^vitest@'` = 1. Red on unfixed main: 2 vitest@ entries (vite@6.4.3 lightningcss, vite@8.3.3 esbuild); the third (no-lightningcss) variant named in the ticket was not present in a fresh install.
- AC-2: all six `readlink -f <pkg>/node_modules/vitest` identical; repo-check test red on unfixed code (landing/web named), green after.
- AC-3: landing `astro check && astro build` green (needs design-tokens built first, as in turbo); astro resolves vite@8.3.3.
- AC-4: planted fault on lockfile (shared importer suffix `0.0.0-split`) -> `node check-vitest-variant.mjs` exit 1 naming `packages/shared`; restored with `cp` from backup, exit 0.
- AC-5: `-w typecheck lint test --force --concurrency=1` exit 0 (19 tasks). Tests: exercises 244, design-tokens 184, engine 797, shared 270, landing 164, web 4885. repo-checks 391/391; format:check 0; check-all.mjs 0. Web build green.
- e2e full: 676 passed, 3 failed (canvas-compare:50, uf-01-onboarding:352, :939) under full load; all 3 rerun green in isolation (6 passed incl. retries/projects). Treated as load flakes.
