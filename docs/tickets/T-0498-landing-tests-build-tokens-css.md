---
id: T-0498
title: "Landing tests build packages/design-tokens/dist/tokens.css first when it is missing or stale (global setup), so a fresh worktree's landing tests pass"
lane: landing
screens: []
decisions: [D-0046, D-0178, D-0180]
deps: [T-0317]
status: ready
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-05 (groom mode, D-0180 §2). Build flow: wl-build-web.
About 1-2 hours. One global-setup change, one source test, one README sentence. -->

## Why
`apps/landing/src/layouts/Layout.astro` imports `@workoutlab/design-tokens/tokens.css`, which the
tokens package exports from its gitignored, generated `dist/tokens.css`. Landing's vitest global
setup (`apps/landing/test/global-setup.ts`) runs two real `astro build`s before any test. Under
`turbo run test` the CSS is built first (`dependsOn: ["^build"]`), but in a fresh worktree
`pnpm --filter @workoutlab/landing test`, and any direct `npx vitest run <files>` in
`apps/landing` (the D-0158 small tier agents use), fail inside `astro build` because the CSS
doesn't exist. Web solved the same gap with `apps/web/ensure-tokens-css.mjs` as its `pretest`
(T-0312); T-0317 documented web's ordering and filed this for landing.

## Scope
- In:
  - `apps/landing/test/global-setup.ts`: before the first `build(...)`, run
    `apps/web/ensure-tokens-css.mjs` with `node` (`spawnSync(process.execPath, [<abs path>],
    { stdio: "inherit" })`). If it exits non-zero, throw an `Error` whose message names
    `@workoutlab/design-tokens` and `ensure-tokens-css`, so the failure is the cause and not
    Astro's unresolved-import error. Put it in global setup, not a `pretest`, so a direct vitest
    call is covered too (D-0180 §2). Resolve the path from `landingRoot`
    (`join(landingRoot, "..", "web", "ensure-tokens-css.mjs")`).
  - `apps/landing/test/t0498-tokens-ensure.test.ts`: a source test (see AC-1).
  - `README.md`: one sentence after the "Running the web tests" paragraph: landing's tests build
    the tokens CSS themselves (global setup), including a direct vitest call.
- Out:
  - `apps/web/ensure-tokens-css.mjs` and its test: read-only (web-shell lane). Moving it into the
    design-tokens package as a shared bin is a follow-up (D-0180 §2), not this ticket.
  - `apps/landing/package.json` scripts (no `pretest` needed; `ac24-config-and-scripts.test.ts`
    stays unedited).
  - `turbo.json`, `packages/design-tokens/**`.

### Edge cases that are in scope
- **Fresh worktree** (no `dist/tokens.css`): the CSS is built once, then both Astro builds run.
- **Up to date**: the script is a no-op; `dist/tokens.css` keeps its mtime.
- **Stale** (`tokens.json` newer than the CSS): rebuilt once, the script prints
  `ensure-tokens-css: built …`.
- **Build fails**: the global setup throws the named error; no test runs against a half-built dist.

## Acceptance criteria
**Test rules.** Vitest in `apps/landing`, title prefix "T-0498 AC-n". Behaviour ACs are recorded
runs (the global setup can't be unit-tested without spawning a nested vitest); copy the command
and its last lines into the log.
- **AC-1 (wired before the builds; source test)** Given `test/global-setup.ts`, Then it contains
  `ensure-tokens-css.mjs`, and the index of that string is lower than the index of the first
  `build(` call; and it contains a `status !== 0` (or equivalent non-zero) check followed by a
  `throw`. Planted fault: on a backup copy, move the spawn below the builds → AC-1 red; restore
  with `cp`.
- **AC-2 (fresh worktree, red then green)** Given `packages/design-tokens/dist/tokens.css` moved
  to the scratch dir, When `npx vitest run` runs in `apps/landing` on **unfixed** `main`, Then it
  fails (record the error line). When the same runs on the branch, Then every landing test passes
  and `dist/tokens.css` exists again, and `cmp` against the saved copy reports no difference.
- **AC-3 (no-op when fresh)** Given the CSS exists and is newer than its inputs, When the landing
  tests run, Then `stat -c %Y packages/design-tokens/dist/tokens.css` is the same before and after.
- **AC-4 (loud failure)** On a backup copy of `global-setup.ts`, point the spawn at a missing file
  (or a script that `process.exit(1)`s). Then the run fails with the named error from Scope, not an
  Astro resolve error. Restore with `cp`. Record the message.
- **AC-5 (README)** `grep -n "landing" README.md` shows the new sentence in the tests section.

## Paths you may change
- `apps/landing/test/global-setup.ts`
- `apps/landing/test/t0498-tokens-ensure.test.ts` (new)
- `README.md` (one sentence; not owned by a lane, T-0317 precedent)
- `docs/tickets/T-0498-landing-tests-build-tokens-css.md` (build log only)

## Contract impact
None.

## Definition of done
AC-1..AC-5 hold and are recorded · `npx -y pnpm@10.28.2 --filter @workoutlab/landing typecheck`,
`npx -y pnpm@10.28.2 --filter @workoutlab/landing lint` and
`npx -y pnpm@10.28.2 --filter @workoutlab/landing test` green (each through
`scripts/locked.sh small`) · the `-w` gate once before handback (`typecheck lint test
--concurrency=1`, `test:repo-checks`, `format:check`, `check-all.mjs`) · no web e2e needed ·
commits start `T-0498`.

## Notes
- Restore anything you move out of `packages/design-tokens/dist/` before handback; it's
  gitignored, so `git status` won't warn you.
- The landing global setup also runs under `turbo run test`. There `^build` already made the CSS,
  so the spawn is a no-op and can't race web's `pretest` on the same file.

## Build / accept log
Archived in `docs/tickets/log/T-0498.md` (D-0157).
