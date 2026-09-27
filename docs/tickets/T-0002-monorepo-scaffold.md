---
id: T-0002
title: Monorepo scaffold — pnpm + turbo, TS strict, ESLint/Prettier, Vitest, remove apps/api, CI
lane: infra
screens: []
decisions: [D-0001, D-0006, D-0007, D-0015]
deps: []
status: ready   # rework after accept pass 1 (2026-09-27); see "Accept log"
---
## Why
Every later ticket's definition of done is "`pnpm -w typecheck lint test` green". That command
has to exist, cover every workspace package, and give an honest result from a cold start or
a warm cache. D-0001 removes the separate API app. D-0006 gates deploys.

This file was written at accept time. The ticket was promoted to `ready` with only its
board line, which was a product-owner gap. The ACs below restate that board line as testable
criteria and add the items from review round 1.

## Scope
- In: pnpm workspaces and Turborepo; `tsconfig.base.json` with `strict: true`; root ESLint 9
  flat config and Prettier; Vitest in every package; delete `apps/api` (D-0001); GitHub
  Actions CI. The CI jobs for supabase, e2e and deploy may no-op until their owning tickets
  land.
- In (bootstrap, per D-0015): a minimal placeholder scaffold in `apps/web`, `apps/landing`,
  `packages/engine` and `packages/shared`. Each gets a `package.json`, a `tsconfig.json`,
  an `eslint.config.mjs`, one source file and one test. The owning lanes replace these
  placeholders later.
- Out: `packages/design-tokens` (T-0003), `infra/terraform` (T-0400/T-0401), real deploy
  (T-0402), `supabase/config.toml` (T-0100/T-0203), Playwright config (qa lane),
  `apps/landing/src/content/**` (design lane).

## Acceptance criteria
- AC1 Given a clean clone, when `pnpm install --frozen-lockfile && pnpm -w typecheck && pnpm -w lint && pnpm -w test`
  runs, then all four packages (web, landing, engine, shared) run each task and exit 0.
- AC2 Given `tsconfig.base.json`, when it is read, then `compilerOptions.strict` is `true`.
- AC3 Given the repo tree, when it is listed, then `apps/api` does not exist (D-0001).
- AC4 Given `.github/workflows/ci.yml`, when a PR runs, then the checks job runs install →
  typecheck → lint → format:check → test. The supabase and e2e jobs no-op only while
  `supabase/config.toml` or the Playwright config is missing. Deploy runs only on `main`.
- AC5 (cache honesty) Given a warm turbo cache where all tasks passed, when only a root
  config file changes (`tsconfig.base.json`, `eslint.config.mjs` or `.prettierrc.json`) and
  `pnpm -w typecheck lint` runs again, then no package task is a cache hit. Test:
  `turbo.json` declares these files in `globalDependencies`, and
  `turbo run lint --dry=json` lists them in `globalCacheInputs.files`.
- AC6 (lane hygiene) Given the branch diff against `main`, when it is listed, then it adds
  no file under `apps/landing/src/content/**`. Delete `apps/api/.gitkeep` instead of moving
  it there.
- AC7 (deterministic engine, a principle) Given `packages/engine/tsconfig.json`, when
  typecheck runs on a file in `packages/engine/src` that references `window`,
  `localStorage`, `process` or `fs`, then typecheck fails. Test: the engine tsconfig sets
  `lib: ["ES2022"]` and `types: []` for `src`. Test-only files may use a separate tsconfig
  that includes Node types.

## Paths you may change
Infra lane (`infra/**`, `.github/**`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
`tsconfig.base.json`). Also, for this ticket only:
- root `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`,
  `pnpm-lock.yaml`
- bootstrap scaffold files in `apps/web/*.*`, `apps/web/src/main.tsx`, `apps/web/src/app/**`,
  `apps/landing/**` except `apps/landing/src/content/**`, `packages/engine/**` and
  `packages/shared/**`

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0002`.

## Accept log
- 2026-09-27 pass 1: **failed**. AC1–AC4 are met. Build, QA and review all confirmed them
  with the cache forced off. AC5 (missing `globalDependencies`), AC6 (`.gitkeep` renamed
  into the design lane) and AC7 (engine tsconfig allows DOM and Node types) are not met.
  This file now lists the scope that review blocker #1 said was missing, so the bootstrap
  scaffolds are allowed.
