---
ticket: T-0901
classification: ci-config
lane: infra
runs:
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36434598815
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36435192622
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36438013896
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/36439121550
date: 2026-09-28
---

## What failed

- Workflow `CI` (`.github/workflows/ci.yml`), job `playwright e2e`, step **`Run pnpm exec playwright test`**. That is the test step itself, not a post-step. `checks` and `supabase` are green in every run.
- Branch `main` on push, from `480a289` (the first push after the T-0300a merge `fba6d6a`) through `dc76be8`, `396e9b8`'s parent and `ad92354`. Every run has the same signature: 41–42 Vitest "reading 'config'" / "failed to find the current suite" errors.
- The last green run was 36432300952. Before `2d6f062` ("T-0300a: … wire tests/e2e") there was no `tests/e2e/playwright.config.ts`, so the `has-e2e` gate kept the job a no-op. T-0300a added that config, the job became active, and it has never passed.
- T-0300a was merged with no `pull_request` CI run (none exists for its branch), so the job first ran on `main`.

## Evidence

Run 36438013896, job 108981288977:

```
Run pnpm exec playwright test
TAP version 13
# Subtest: AC21: pnpm check:repo exits 0 on the real repo        <- .github/scripts/*.test.mjs (node:test) loaded by Playwright
TypeError: Cannot read properties of undefined (reading 'config')
   at apps/landing/src/content/content.test.ts:36
TypeError: Module ".../packages/design-tokens/src/tokens.json" needs an import attribute of "type: json"
   at apps/web/lighthouserc.test.ts:6
Error: Vitest failed to find the current suite. One of the following is possible:
   at apps/web/scripts/check-colours.test.ts:20
SyntaxError: .../apps/web/src/components/tab-bar/tab-bar.css: Unexpected token (2:0)
> 2 | .wl-tab-bar {
   at apps/web/src/app/App.test.tsx:2
TypeError: Module ".../data/exercises/schema.json" needs an import attribute of "type: json"
   at data/exercises/test/areas.test.ts:10
   at packages/shared/test/types.test.ts:39
##[error]Process completed with exit code 1.
```

## Reproduction

All runs used a depth-1 clone (`git clone --depth 1 file://<repo>`), a fresh `pnpm install --frozen-lockfile` (pnpm 10.28.2 via npx), `CI=true`, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` unset. There was no turbo cache and no `dist/` output.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm exec playwright test` (the exact CI step) on `main` 396e9b8 | **Reproduced.** Exit 1, 42 Vitest errors, plus the same tokens.json/schema.json import-attribute and tab-bar.css errors. |
| 2 | `pnpm exec playwright test --config tests/e2e/playwright.config.ts` on `main` | **Still fails, for a second reason.** `[WebServer] Rollup failed to resolve import "@workoutlab/design-tokens/tokens.css" from apps/web/src/main.tsx` → `Process from config.webServer was not able to start. Exit code: 1` |
| 3 | Same as 2, with the webServer build command changed to `pnpm turbo run build --filter=@workoutlab/web` (scratch clone only) | **Passes.** 10 passed (17.5 s). |
| 4 | Same as 2 on `t/T-0300b-auth` 4a444a2 | Fails with the same `tokens.css` Rollup error. |
| 5 | Same as 3 on `t/T-0300b-auth` | **Passes.** 16 passed (15.4 s), `auth.spec.ts` included. |

This does not reproduce in the main checkout, because `packages/design-tokens/dist/tokens.css` already exists there from earlier turbo builds. That is why nobody saw it locally.

## Root cause

There are two independent defects. Both come from `2d6f062` (T-0300a wiring `tests/e2e`), which turned the `has-e2e` gate on.

1. **The CI step doesn't pass a config (infra lane, `.github/workflows/ci.yml`).** `pnpm exec playwright test` runs from the repo root, and there is no root `playwright.config.ts`. Playwright therefore falls back to `testDir = cwd` and its default `testMatch` (`**/*.@(spec|test).?(c|m)[jt]s?(x)`). It then imports every Vitest `*.test.ts(x)` in the monorepo, plus `.github/scripts/*.test.mjs`, which is why node:test TAP output appears. These files load outside Vitest's runner: `describe` has no suite, JSON imports have no `with { type: "json" }`, and CSS imports have no Vite transform. This confirms the orchestrator's hypothesis. The config exists at `tests/e2e/playwright.config.ts`, and `apps/web`'s `test:e2e` script already passes `--config ../../tests/e2e/playwright.config.ts`. CI just doesn't use it.
2. **The webServer build skips workspace dependencies (qa lane, `tests/e2e/playwright.config.ts`).** The webServer command is `pnpm --filter @workoutlab/web build && … preview`. That runs only `apps/web`'s own `build` (`tsc -b && vite build`). It doesn't run `^build`, so `@workoutlab/design-tokens` never runs `scripts/build-css.mjs`. `./tokens.css` is exported from `./dist/tokens.css`, which is gitignored, so on a fresh runner the import in `apps/web/src/main.tsx` can't resolve. Turbo's `build.dependsOn: ["^build"]` handles this, but only when the build goes through turbo.

The orchestrator also asked about a missing web build and missing env. **Refuted.** The config's `webServer` builds the app itself and injects `VITE_SUPABASE_URL` (and, on T-0300b, `VITE_SUPABASE_ANON_KEY`). Playwright merges `webServer.env` over `process.env`. CI needs no extra env and no separate build step once defect 2 is fixed. Runs 3 and 5 passed with both variables unset.

## Proposed fix

The two fixes are independent, and both are needed. Either one alone leaves the job red.

1. **infra, `.github/workflows/ci.yml`, e2e job:** replace the test step with `pnpm exec playwright test --config tests/e2e/playwright.config.ts`. Alternatively use `pnpm --filter @workoutlab/web test:e2e`, so CI and local runs share one entry point. Optional cleanup: `playwright install --with-deps chromium`, since the only project is chromium, to cut install time. Also optional: upload `tests/e2e/playwright-report` as an artifact when the job fails.
2. **qa, `tests/e2e/playwright.config.ts`, `webServer.command`:** change it to `pnpm turbo run build --filter=@workoutlab/web && pnpm --filter @workoutlab/web preview`. Turbo then builds `design-tokens` (and any future `^build` deps) first. This also fixes a local `pnpm test:e2e` on a fresh clone. Keep `env: { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY }` as T-0300b has it.

**For T-0300b to stay green:** it needs nothing beyond these two fixes. `auth.spec.ts` is picked up by the config's `testMatch: "**/*.spec.ts"`, and the fake anon key reaches the build through `webServer.env`. Don't add `VITE_SUPABASE_*` to the workflow: the config is the single source, and CSP test AC-A10 depends on the fixed `https://abc.supabase.co`. If T-0300b merges first, fix 2 must be applied on top of its version of `playwright.config.ts` (same line, trivial rebase). If fix 2 lands first, T-0300b rebases onto it.

## Regression test

- **Repo check (infra):** add `.github/scripts/check-e2e-wiring.test.mjs`, run by `pnpm test:repo-checks`. It should assert that the `e2e` job's playwright step in `ci.yml` passes `--config tests/e2e/playwright.config.ts` or invokes `test:e2e`. Bare `playwright test` would fail it, which catches defect 1.
- **Config test (qa):** add a test in `tests/e2e/` or a repo check that loads `tests/e2e/playwright.config.ts` and asserts `webServer.command` builds through turbo (`turbo run build --filter=@workoutlab/web`), not `pnpm --filter … build`. That catches defect 2. The real guard for defect 2 is the CI e2e job itself on a fresh runner, so every `tests/e2e`/`apps/web` merge needs a `pull_request` CI run before merging. T-0300a merged without one.
