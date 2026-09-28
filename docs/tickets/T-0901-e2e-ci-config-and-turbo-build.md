---
id: T-0901
title: CI e2e job green again — pass the tests/e2e config and build web through turbo (^build)
lane: infra
screens: []                 # CI plumbing only; no screen changes
decisions: [D-0001, D-0045, D-0055]
deps: [T-0300b]
status: ready
---
## Why
The CI job `playwright e2e` has been red on `main` since T-0300a (`2d6f062`) added `tests/e2e/playwright.config.ts`. That file turned the `has-e2e` gate on (runs 36434598815, 36435192622, 36438013896, 36439121550). The diagnosis, `docs/ci/CI-T-0901-e2e-no-config-and-unbuilt-tokens.md` (classification `ci-config`), found two independent defects. **Both must be fixed. Fixing only one leaves the job red.**

1. `.github/workflows/ci.yml` runs a bare `pnpm exec playwright test` from the repo root. With no config, Playwright picks up every Vitest `*.test.ts(x)` and `.github/scripts/*.test.mjs` in the monorepo.
2. The `webServer.command` in `tests/e2e/playwright.config.ts` runs `pnpm --filter @workoutlab/web build`, which skips `^build`. On a fresh runner, `packages/design-tokens/dist/tokens.css` therefore does not exist, and Vite fails to resolve `@workoutlab/design-tokens/tokens.css`.

A red required job blocks every merge. It also hides real e2e regressions, such as T-0300b's `auth.spec.ts`.

## Scope
- In:
  - Point the e2e step in `ci.yml` at the config. Use either `pnpm exec playwright test --config tests/e2e/playwright.config.ts` or `pnpm --filter @workoutlab/web test:e2e`. The second is preferred because CI and local runs then share one entry point.
  - Change `webServer.command` in `tests/e2e/playwright.config.ts` to build through turbo, for example `pnpm turbo run build --filter=@workoutlab/web && pnpm --filter @workoutlab/web preview …`. Apply this on top of T-0300b's version of the file and keep its `webServer.env` (`VITE_SUPABASE_URL=https://abc.supabase.co`, `VITE_SUPABASE_ANON_KEY`) unchanged.
  - Add a new repo check, `.github/scripts/check-e2e-wiring.mjs`, with its test `.github/scripts/check-e2e-wiring.test.mjs`. `pnpm test:repo-checks` must run the test. Wire the check into `.github/scripts/check-all.mjs` so `pnpm check:repo` runs it too.
  - Optional: in `ci.yml`, narrow `playwright install --with-deps` to `chromium`, since chromium is the only project.
  - Optional: upload `tests/e2e/playwright-report` as an artifact with `if: failure()`.
- Out:
  - Adding `VITE_SUPABASE_*` to the workflow. The config is the single source, and T-0300b's CSP test AC-A10 depends on the fixed `https://abc.supabase.co`.
  - Moving the e2e build out of `webServer` into a separate CI step. That is T-0006's job, together with check:size and Lighthouse.
  - Any change to e2e specs, `apps/web` source, or `turbo.json` pipeline semantics.
  - Branch-protection or ruleset changes. That is a human gate.

**Never allowed:** retrying or re-running until green (`retries` bumps, `--retries`, `continue-on-error`, rerun loops), skipping the job, loosening the `has-e2e` gate, or using `if:` conditions that make the step a no-op. The job must pass on its merits.

## Acceptance criteria
Each criterion becomes at least one automated test. The repo-check test suite is `node --test ".github/scripts/*.test.mjs"`.

- **AC1: CI runs Playwright with the e2e config.** Given `.github/workflows/ci.yml` on the ticket branch, when `check-e2e-wiring` parses the `e2e` job's steps, then exactly one step runs Playwright tests. That step's `run` either contains `playwright test` together with `--config tests/e2e/playwright.config.ts`, or equals `pnpm --filter @workoutlab/web test:e2e`. The check exits 0 on the real repo, and the test asserts this.
- **AC2: webServer builds workspace dependencies first.** Given `tests/e2e/playwright.config.ts`, when its `webServer.command` is read, then the command contains `turbo run build` with `--filter=@workoutlab/web`, or an equivalent turbo invocation that runs `^build`. It must come before `preview`. As a result, `packages/design-tokens/dist/tokens.css` exists before `vite build` runs on a runner with no `dist/` and no turbo cache.
- **AC3: the repo check rejects a bare playwright step.** Given a fixture `ci.yml` whose `e2e` job step is `run: pnpm exec playwright test` with no `--config` and no `test:e2e`, when `check-e2e-wiring` runs against it, then it exits non-zero and its message names the job (`e2e`) and the offending step. A second fixture with `--config tests/e2e/playwright.config.ts` passes, and a third fixture using `pnpm --filter @workoutlab/web test:e2e` also passes.
- **AC4: a test asserts that the webServer command runs ^build.** Given a fixture config whose `webServer.command` is `pnpm --filter @workoutlab/web build && pnpm --filter @workoutlab/web preview`, when `check-e2e-wiring` runs against it, then it exits non-zero with a message saying the build skips `^build`. Given the real `tests/e2e/playwright.config.ts`, the check passes. The check reads the config as text or AST. It does not execute the build.
- **AC5: a fresh clone passes locally.** Given `git clone --depth 1 file://<repo>` of the ticket branch, `pnpm install --frozen-lockfile`, `CI=true`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` unset, no `dist/` and no turbo cache, when the exact command from the CI e2e step runs, then it exits 0. Every spec under `tests/e2e/` passes, including `auth.spec.ts` from T-0300b, and no Vitest or node:test file is collected. The dev records the command, pass count and duration in the result `testsRun`.
- **AC6: CI is green on a draft PR.** Given a draft PR from `t/T-0901-e2e-ci-config-and-turbo-build` to `main`, when the `CI` workflow runs on `pull_request`, then the `playwright e2e` job concludes `success` on its first attempt with no re-runs. Its log shows the Playwright specs executing, not a skipped `has-e2e` gate. `checks` and `supabase` stay green. The run URL goes in the result notes.
- **AC7 (optional): report artifact on failure.** Given the e2e step fails, when the job finishes, then `playwright-report` (repo root — see D-0055: the html reporter has no `outputFolder` set and `tests/e2e/` has no `package.json`, so Playwright's default resolves upward to the repo root, not `tests/e2e/playwright-report`) is uploaded as an artifact, via `actions/upload-artifact` with `if: failure()` and `if-no-files-found: warn` (not `ignore`, so a wrong path surfaces instead of silently uploading nothing). If implemented, `check-e2e-wiring` asserts that the upload step exists with `if: failure()`.
- **AC8: no forbidden workarounds.** Given the ticket branch, when `check-e2e-wiring` inspects the `e2e` job and `tests/e2e/playwright.config.ts`, then it fails if any of the following is present: `continue-on-error: true` on the Playwright step, a `--retries` flag, a `retries` value greater than 0 in the config under `CI`, or an `if:` on the Playwright step other than the existing `steps.has-e2e.outputs.present == 'true'` gate. A test covers each case with a failing fixture.

## Paths you may change
- infra lane: `.github/**`, namely `.github/workflows/ci.yml`, `.github/scripts/check-e2e-wiring.mjs`, `.github/scripts/check-e2e-wiring.test.mjs`, `.github/scripts/check-all.mjs`, and fixtures under `.github/scripts/fixtures/e2e-wiring/**`. Also `package.json`, but only if a script entry is needed.
- **Extra path, granted by the orchestrator:** `tests/e2e/playwright.config.ts`. This path belongs to the qa lane and is granted here so both fixes ship as one ticket. Change only the `webServer.command` line and whatever the retries check needs. Rebase on top of T-0300b's version.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green (includes `pnpm test:repo-checks`) · `pnpm check:repo` green · AC5 fresh-clone run recorded · AC6 draft-PR run green on its first attempt, with the URL recorded · contracts unchanged · commit messages start with `T-0901`.

## Notes
- **Flow:** `wl-build-infra` (agent `devops`).
- **A draft PR is required.** T-0300a merged without a `pull_request` CI run, which is how this defect reached `main`. This ticket cannot be accepted without a green `pull_request` run of `playwright e2e` (AC6). The dev opens the draft PR from the ticket branch, the orchestrator or a human handles the push per `.squad/gates.md`, and no merge happens until the job is green.
- **Ordering with T-0300b:** T-0300b is `doing` and also edits `tests/e2e/playwright.config.ts`. This ticket starts after T-0300b merges and applies the `webServer.command` fix on top of its version.
- Diagnosis and reproduction table: `docs/ci/CI-T-0901-e2e-no-config-and-unbuilt-tokens.md`.

- 2026-09-28 orchestrator: accept conditions met. The AC7 path was fixed (repo-root playwright-report, if-no-files-found: warn, per D-0055), and draft PR #7 run 36463832294 is green on its first attempt (playwright e2e, supabase db tests and checks all pass), which proves AC6.
