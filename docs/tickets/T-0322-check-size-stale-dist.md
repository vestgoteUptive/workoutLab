---
id: T-0322
title: "check:size prints what it measured, fails on a missing or stale dist/, and runs from the root (pnpm -w check:size)"
lane: web-shell
screens: []
decisions: [D-0071, D-0183]
deps: []
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 003c20d (D-0183 §2). From the T-0318 QA and
accept findings. Build flow: wl-build-web. About ⅓ day. -->

## Why
`check:size` (NFR-PERF-2, T-0300a AC-A11) is the bundle budget: the initial JS ≤ 200 KB gzip and
each lazy route chunk ≤ 100 KB gzip. It lives in `apps/web/scripts/check-bundle-size.mjs` and runs
as `node scripts/check-bundle-size.mjs dist` from `apps/web`.

Today it proves less than it seems to:
- It checks whatever `dist/` happens to be there. A build from three branches ago passes, so
  "check:size green" says nothing about the code under review. Five ticket files (T-0306a,
  T-0307a/b, T-0308a/b) carry a workaround note for this.
- When `dist/` is missing, it dies with a raw `ENOENT` stack trace rather than a sentence.
- It prints nothing on success, although `checkBundleSize` already computes the entry total and
  each chunk size. A builder can't quote the measured numbers without adding logging.
- `pnpm -w check:size` errors: the script exists only in `apps/web/package.json`.

## Scope
- In:
  - `checkBundleSize(files, manifest)` also returns `entryBytes` (the gzip total it already
    computes; `0` with no entry) and `maxChunk` (`{ file, bytes }` of the largest lazy JS chunk,
    or `null` when there is none). `ok` and `findings` are unchanged.
  - A new exported `runSizeCheck(distDir, { sourceRoots })` returns
    `{ code, out: string[], err: string[] }` and does all the CLI work, so it can be tested
    without spawning. The `isMain` block calls it, prints `out` to stdout and `err` to stderr,
    and exits with `code`.
    - **Missing:** no `<distDir>/.vite/manifest.json` → `code: 1`, one `err` line naming that path
      and saying to run the web build first. No stack trace.
    - **Stale:** the newest source file's mtime is **later** than the manifest's mtime → `code: 1`,
      one `err` line naming that file and saying `dist/` is older than the source and to rebuild.
      Equal mtimes are not stale. The budgets are not checked on a stale `dist/`.
    - **Fresh:** the budget check runs as today. `out` always gets two lines:
      - `check:size: entry <n> B gzip (budget 204800)`;
      - `check:size: max chunk <n> B gzip <file> (budget 102400)`, or
        `check:size: max chunk none` when there are no lazy chunks.

      Over-budget lines go to `err` as today. `code` is 1 when `ok` is false.
  - **Source roots** (defaults, resolved from the script's own location, so the CLI works from
    any cwd): `apps/web/src`, `apps/web/index.html`, `apps/web/vite.config.ts`,
    `packages/engine/src`, `packages/shared/src`, `packages/design-tokens/src`. Walk directories
    recursively. Skip `__tests__` directories, `node_modules`, `dist`, and files matching
    `*.test.*`: they don't ship. A root that doesn't exist is skipped. `ensure-tokens-css.mjs`'s
    "not older than its inputs" check is the model.
  - A root `package.json` script: `"check:size": "pnpm --filter @workoutlab/web check:size"`.
- Out:
  - Building `dist/` from `check:size`. A stale build is a failure with a clear message, not
    something to repair silently.
  - Changing the budgets or which chunks count as initial.
  - CI wiring (no CI job runs `check:size` today; that would be its own infra ticket).
  - Rewriting the T-0322 notes in older ticket files: they are history.

### Edge cases that are in scope
- **Fresh clone, no build:** missing manifest → `code: 1`, a sentence (AC-3).
- **Branch switch after a build:** git rewrites the mtimes of changed files, so `dist/` is
  correctly stale (AC-2).
- **Only a test file changed since the build:** not stale (AC-4).
- **A build with no lazy chunks:** `max chunk none` (AC-1).

## Acceptance criteria
Each test title starts with `T-0322 AC-n`. Tests go in `apps/web/scripts/check-bundle-size.test.ts`
(beside the existing AC-A11 tests, which must pass **unmodified**). Use temp directories made with
`mkdtempSync(join(tmpdir(), "wl-size-"))`, removed in `afterEach`, and set mtimes with
`utimesSync`. No real build.

- **AC-1 (measured numbers)**
  - **Given** a fixture dist: `.vite/manifest.json` with entry `assets/index-abc.js` (10 KB of
    random bytes) and one lazy chunk `assets/route-xyz.js` (5 KB), the manifest's mtime newer
    than every file in one fixture source root.
  - **When** `runSizeCheck(dist, { sourceRoots: [src] })` runs.
  - **Then** `code` is 0, `err` is empty, and `out` has a line matching
    `/^check:size: entry \d+ B gzip \(budget 204800\)$/` and one matching
    `/^check:size: max chunk \d+ B gzip assets\/route-xyz\.js \(budget 102400\)$/`. The two
    numbers equal `checkBundleSize`'s `entryBytes` and `maxChunk.bytes` for the same input.
  - With the lazy chunk removed from the manifest, `out` has `check:size: max chunk none`.
- **AC-2 (stale dist fails, red on main)**
  - **Given** AC-1's fixture with the manifest mtime set to `T` and `src/app/main.tsx` set to
    `T + 60 s`.
  - **Then** `code` is 1, and `err` has one line that contains `src/app/main.tsx` and matches
    `/older than/`.
  - Also through the CLI: spawn `node apps/web/scripts/check-bundle-size.mjs <dist>` (default
    source roots) with the manifest mtime set to `new Date(0)`. It exits 1 and stderr matches
    `/older than/`.

  **Red:** on main the CLI spawn exits 0.
- **AC-3 (missing dist)** `runSizeCheck(<empty temp dir>, …)` → `code` 1, `err` has one line that
  contains `.vite/manifest.json`, and no `err` line starts with `    at ` (no stack trace).
- **AC-4 (test files don't count)** AC-1's fixture plus `src/__tests__/a.test.ts` and
  `src/lib/b.test.tsx`, both with mtimes `T + 60 s` (the manifest at `T`). **Then** `code` is 0.
- **AC-5 (a fresh over-budget build still fails)** AC-1's fixture with a 210 KB random entry →
  `code` 1, and `err` has the existing "entry budget exceeded" line.
- **AC-6 (fresh CLI passes)** Spawn the CLI on AC-1's fixture dist with the manifest mtime set to
  one hour in the future (default source roots) → exit 0, stdout has both AC-1 lines.
- **AC-7 (root script)** A test reads the repo-root `package.json` and asserts
  `scripts["check:size"] === "pnpm --filter @workoutlab/web check:size"`. Also, by hand: after a
  fresh `npx -y pnpm@10.28.2 --filter @workoutlab/web build`, `npx -y pnpm@10.28.2 -w check:size`
  exits 0. Record its two measured lines in the build log.

**Red proof.** Run AC-2 (the CLI spawn), AC-3 and AC-7's test on main: all must fail. Then plant
one fault on a backup copy: compare with `<` instead of `>` in the stale check. AC-2 must fail and
AC-6 must still pass. Restore with `cp`. Record every run.

## Paths you may change
- `apps/web/scripts/check-bundle-size.mjs`
- `apps/web/scripts/check-bundle-size.test.ts`
- **Listed extras:**
  - `package.json` (repo root, the infra lane): the one `check:size` script line only.
  - `docs/tickets/T-0322-check-size-stale-dist.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red runs and the planted fault recorded.
- While you work, from `apps/web`:
  `../../scripts/locked.sh small npx vitest run scripts/check-bundle-size.test.ts`.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169). Nothing under `apps/web/src` changes, so no e2e run (D-0178).
- Contracts are unchanged.
- Commits start `T-0322`.

## Notes
- **Parallel:** runs alongside T-0336 (`.github/scripts/**` only) and T-0330 (web-shell test
  files under `apps/web/src`). No shared file. Root `package.json` is touched by no other ready
  ticket.
- The `apps/web/scripts/**` path is not in web-shell's lane glob (`apps/web/*.*` covers only
  top-level files), so it is granted here by name.

## Build / accept log
Archived in `docs/tickets/log/T-0322.md` (D-0157).
