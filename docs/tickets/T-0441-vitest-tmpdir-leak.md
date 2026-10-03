---
id: T-0441
title: "Vitest leaves a /tmp/<nanoid>/{client,ssr} transform dir per run: find the source, redirect it to a gitignored per-package cache dir, remove it at run end, and guard it with a repo check"
lane: infra
screens: []
decisions: [D-0159, D-0158, D-0157]
deps: []
status: ready
---
<!-- Written 2026-10-03 by product-owner (groom). Build flow: wl-build-infra. About ⅓–½ day: one diagnosis, the same small change in six vitest packages, one check and its tests. If AC-1 shows the cause is not what D-0159 assumes and the fix needs more than config or scripts, stop after AC-1, log the finding, and return `needs-triage` instead of growing the ticket. No app code, no contract change. -->

## Why
- Every `vitest run` leaves a `/tmp/<21-char nanoid>/` dir with `client/` and `ssr/` subdirs of
  transformed modules (`__vite_ssr_import__`). Each is about 12 MB, and about 120 appear an hour
  across worktrees. On 2026-10-02, 3 GB of them filled the `/tmp` tmpfs quota. Writes failed with
  `EDQUOT` and Chromium failed e2e pages with `ERR_INSUFFICIENT_RESOURCES` (the 84 false reds in
  `state.md`). On 2026-10-03 there were about 200 such dirs in `/tmp`.
- Today the only defence is a note in `state.md` and `agents/roles/_common.md` telling agents to set
  `TMPDIR` for e2e. Nothing stops the leak itself.
- Probable source (D-0159 Context, from reading vitest 5.0.2 `dist/chunks/index.*.js`):
  - The `Vitest` core's `_tmpDir = join(tmpdir(), nanoid())` is passed to its module fetcher.
  - The fetcher writes `<tmpDir>/<env>/<sha1>` copies when `makeTmpCopies` is on (the forks pool)
    and the fs module cache is off.
  - Only `TestProject.tmpDir` is removed, by `close()` → `clearTmpDir()`. The core's dir never is.
  - AC-1 confirms or corrects this.

## Scope
- In:
  - **Diagnosis (AC-1).** Find which vitest behaviour creates the dir, and prove it with a count
    before and after one run.
  - **Fix (AC-2, AC-3).** Apply D-0159 §2 and §3 in all six packages whose `test` script is
    `vitest run`: `apps/web`, `apps/landing`, `packages/engine`, `packages/shared`,
    `packages/design-tokens` and `data/exercises`. The last four have no vitest config today.
    - Either add a minimal `vitest.config.ts` to each. It must keep vitest's defaults for those
      packages, so the same test files run and the counts stay the same.
    - Or make the change in their `test` scripts.
  - **Guard (AC-4, AC-5).** A new `.github/scripts/check-vitest-tmp.mjs` with a
    `check-vitest-tmp.test.mjs`. Wire it into `check-all.mjs`, so CI's `pnpm test:repo-checks`
    and `check-all` both run it.
- Out:
  - Patching `node_modules`, changing `pool`, or downgrading vitest (D-0159 §1). A lockfile-only
    vitest patch bump is allowed only if it alone makes AC-2 pass.
  - Any `rm` of `/tmp/*` globs from a script or test (D-0159 §3). Clearing the dirs already in
    `/tmp` on this machine is a one-off for the orchestrator (see the follow-ups below).
  - Playwright's temp files and the e2e `TMPDIR` rule (T-0440, D-0155 §6).
  - Editing `state.md` or `agents/roles/_common.md`. That is the orchestrator's follow-up after the
    merge (AC-6).

## Acceptance criteria
Test titles start with `T-0441 ACn`. Run every vitest command under
`flock /tmp/workoutlab-tests.lock`.

- **AC-1 (source found and proven, recorded in the build log).**
  - **Given** a clean worktree on `main`, with `TMPDIR` set to a fresh empty scratch dir `S` (so
    other worktrees can't add to the count), **when** `npx vitest run` runs once in
    `packages/shared`, **then** `S` holds exactly one new dir matching `^[A-Za-z0-9_-]{21}$`. That
    dir has a `client/` or `ssr/` subdir. Record the before and after counts and the sizes.
  - Repeat the run in `apps/web`. Record the vitest code line(s) responsible: the file, the field
    and why nothing removes it. If the cause differs from D-0159 Context, say so and keep going
    only if the fix stays inside `## Paths you may change`.

- **AC-2 (no new temp dir after the fix).**
  - **Given** the fixed branch and a fresh empty `S` as `TMPDIR`, **when** `npx vitest run` runs in
    each of the six packages, **then** `S` holds no new entry afterwards. The test-file and test
    counts match the AC-1 runs, or the package's count on `main`.
  - The same holds for a single-file run (`npx vitest run <one test file>`) in `apps/web`.
  - During the run, the transform copies land under `<package>/node_modules/.vite/vitest-tmp/`.
    The builder shows this once in the log, for example with an `ls` taken by a slow test or a
    `watch`. After the run, that folder holds no leftover run dir.

- **AC-3 (gitignored, no repo noise).** **Given** the six fixed runs from AC-2, **when**
  `git status --porcelain` runs, **then** it prints nothing new, and `git check-ignore` confirms that
  `<package>/node_modules/.vite/vitest-tmp` is ignored for each package.

- **AC-4 (static guard, red on main).**
  - **Given** the repo, **when** `check-vitest-tmp.mjs` runs, **then** it lists every
    `package.json` under `apps/*`, `packages/*` and `data/*` whose `test` script invokes `vitest`.
  - It reports a finding for each one that lacks the redirect (D-0159 §2) or the cleanup (§3). The
    finding names the package and what is missing.
  - On `main` it reports all six packages. Record that red run.
  - On the branch it reports none. `node .github/scripts/check-all.mjs` includes it.
  - Unit tests in `check-vitest-tmp.test.mjs` use fixtures under `.github/scripts/fixtures/`:
    - a package with no config is flagged;
    - a config with the redirect but no cleanup is flagged;
    - a fixed package passes;
    - a package whose `test` script isn't vitest is ignored.

- **AC-5 (behaviour guard).**
  - **Given** `check-vitest-tmp.test.mjs`, **when** `pnpm test:repo-checks` runs, **then** one test
    spawns `vitest run` on one small test file in `packages/shared`, with `TMPDIR` set to a fresh
    `mkdtemp` dir, and asserts that the dir is empty afterwards. It must not count `/tmp`.
  - **Planted fault.** Take a backup copy with `cp`, then remove the cleanup from
    `packages/shared`. The test goes red, and AC-4 goes red too. Restore the file from the copy and
    log both reds.

- **AC-6 (follow-up named).** **Given** the merge, **then** the handback lists the orchestrator
  follow-up: shorten the `/tmp` trap in `.squad/state.md` and the `TMPDIR` sentence in
  `agents/roles/_common.md` to point at this fix, and run `node scripts/sync-agents.mjs`. The
  ticket's build log carries the same note. Checked at accept, with no automated test, because it
  edits no code.

## Paths you may change
- The `infra` lane, in practice `.github/scripts/check-vitest-tmp.mjs` (new),
  `.github/scripts/check-vitest-tmp.test.mjs` (new), `.github/scripts/fixtures/vitest-tmp/**`
  (new), `.github/scripts/check-all.mjs`, `.gitignore` (only if AC-3 needs it) and
  `pnpm-lock.yaml` (only for the D-0159 §1 patch bump).
- **Listed extras:**
  - `apps/web/vite.config.ts`
  - `apps/web/package.json`
  - `apps/landing/vitest.config.ts`
  - `apps/landing/package.json`
  - `packages/engine/vitest.config.ts`
  - `packages/engine/package.json`
  - `packages/shared/vitest.config.ts`
  - `packages/shared/package.json`
  - `packages/design-tokens/vitest.config.ts`
  - `packages/design-tokens/package.json`
  - `data/exercises/vitest.config.ts`
  - `data/exercises/package.json`
  - `vitest.tmp.ts`: a shared helper at the repo root, imported by the configs, so the redirect and
    cleanup live in one place.
  - `docs/tickets/T-0441-vitest-tmpdir-leak.md`: this file, for the build and accept logs.

## Contract impact
None. This changes test infrastructure only. `docs/engine-rules.md`, `api/openapi.yaml`,
`docs/data-model.md` and the design tokens are untouched.

## Coordination
- **Allowed in parallel with app tickets.** Any ticket that edits one of the six configs or `test`
  scripts must merge `main` after this lands. The only one today is `apps/web/vite.config.ts`.
  Check the board before starting.
- If a new `vitest.config.ts` in engine, shared, design-tokens or exercises changes test discovery,
  AC-2's count check catches it. Don't fix that by changing `include`. Copy vitest's defaults
  exactly.

## Follow-ups (orchestrator)
- After the merge, shorten the `/tmp` notes in `.squad/state.md` and `agents/roles/_common.md`, then
  run `node scripts/sync-agents.mjs` (AC-6).
- One-off: clear the `/tmp/<21-char>` dirs already left on this machine, by hand, when no vitest run
  holds the lock.

## Definition of done
Tests for every AC pass, with the AC-1 counts, the AC-4 red run on `main` and the AC-5 planted
fault recorded. The cached gate is green (`npx -y pnpm@10.28.2 -w typecheck lint test
--concurrency=1`), and so are `-w test:repo-checks`, `-w format:check` and
`node .github/scripts/check-all.mjs` (D-0158 §1). Contracts are unchanged. Commits start `T-0441`.

## Build / accept log

### Build log (devops, 2026-10-03)
- Start: clean tree, HEAD 8676da0.
- **AC-1 (confirmed, D-0159 Context holds).** Fresh `S` (0 entries), `TMPDIR=S`. `packages/shared` run (10 files, 238 tests): `S` gained `OjOEDfT450eFX-5Lvw5qB/` (844K, `ssr/` only). `apps/web` run (180 files; 1 failed only because `packages/design-tokens/dist/tokens.css` was unbuilt in the fresh worktree, 2738 passed): `S` gained `ua4DWH6a3uZGHxpM7TT9E/` (12M, `client/` + `ssr/`). (A `tsx-1000/` dir also showed up in the first run; it is tsx's own per-user cache, not nanoid, and did not appear after the fix.) Code: `vitest/dist/chunks/index.C-uw7tH9.js:20433` `Vitest._tmpDir = join(tmpdir(), nanoid())`, passed at :20503 to `createFetchModuleFunction(..., this._tmpDir)`; `ModuleFetcher.fetch` :6314-6322 writes `<tmpDir>/<env>/<sha1>` when `makeTmpCopies` and no fs cache. Only `TestProject.tmpDir` (:12021) is removed by `clearTmpDir` (:12286); nothing removes the core's.
- **Mechanism (why).** `createVitest` (cli-api) runs `resolveConfig` (which loads the vite/vitest config) before `new Vitest(...)`, so setting `process.env.TMPDIR` at config top level is in time for `_tmpDir`, `TestProject.tmpDir` and the forked workers. It works for `vitest run <file>` and `related` since it lives in the config, not the script. New root `vitest.tmp.ts`: `redirectVitestTmp(import.meta.url)` (TMPDIR = `<pkg>/node_modules/.vite/vitest-tmp`) and `cleanupVitestTmp(dir)` (`process.once("exit")` removes that folder only; never /tmp globs). No `pool` change, no node_modules patch. Used by `apps/web/vite.config.ts`, `apps/landing/vitest.config.ts`, and new empty-default `vitest.config.ts` in engine, shared, design-tokens, data/exercises.
- **AC-2.** Fresh `S`, fixed branch: shared 10/238, engine 40/655, design-tokens 7/74, exercises 16/215, landing 11/115 (needs tokens built), web 180 files / 2738 passed (same as AC-1, same unbuilt-tokens failure on one file); `S` empty after each. Single-file run in `apps/web` (`src/app/auth-guard.test.tsx`, 21 tests): `S` empty. During an engine run: `node_modules/.vite/vitest-tmp/s4dyWeWlyDGu71sLw3ds_/ssr` (368K); afterwards the folder is gone.
- **AC-3.** `git status --porcelain` shows only intended files; `git check-ignore -v` shows `.gitignore:1:node_modules/` for `apps/web` and `packages/shared` `node_modules/.vite/vitest-tmp`.
- **AC-4.** Red on main (HEAD archive + new check): 6 findings (apps/landing, apps/web, packages/design-tokens, packages/engine, packages/shared, data/exercises). Branch: 0; `check-all.mjs` includes it. Unit tests: no-config, redirect-without-cleanup, fixed, non-vitest, real repo (fixtures in `.github/scripts/fixtures/vitest-tmp/`).
- **AC-5.** `check-vitest-tmp.test.mjs` spawns `vitest run test/session-plan.test.ts` in `packages/shared` with a `mkdtemp` TMPDIR and asserts it is empty and that `packages/shared/node_modules/.vite/vitest-tmp` is empty. Planted fault (backup `cp`, `cleanupVitestTmp` removed from shared config, restored from the copy): AC-4 real-repo test red (`packages/shared ... lacks the end-of-run cleanup`) and the AC-5 test red. First draft of AC-5 only counted `S`, stayed green under the fault (the redirect empties `S`), so the redirected folder is asserted too.
- **AC-6 follow-up (orchestrator).** After the merge, shorten the `/tmp` trap in `.squad/state.md` and the `TMPDIR` sentence in `agents/roles/_common.md` to point at D-0159 / T-0441, then run `node scripts/sync-agents.mjs`. Also clear the old `/tmp/<21-char>` dirs once by hand when no vitest run holds the lock.
