---
id: T-1015
title: "Targeted local test runs: scripts/test-affected.mjs, agent roles and gate updated, CI on every squad-branch push (D-0285)"
lane: infra
screens: []
decisions: [D-0285, D-0169]
deps: []
status: ready
---
## Why
D-0285: agents and the orchestrator spend most test tokens on full-suite local runs; CI should carry the full suite.

## Scope
- In:
  - `scripts/test-affected.mjs`: from `git diff --name-only <base>...HEAD` (same base rule as `check-lane-paths`), print and optionally run (a) typecheck+lint of changed packages, (b) `vitest related --run` per package for changed source/test files, (c) the e2e specs for changed UF folders plus edited specs, (d) `full` when any D-0285 §2 shared path changed. Flags: `--dry-run` (print plan only), `--e2e` (include Playwright). Uses `scripts/locked.sh` like every test run; quiet reporters.
  - Root `package.json` script `test:affected`.
  - `agents/roles/_common.md` and the build/QA/review roles: replace full-gate instructions with `pnpm test:affected` per D-0285; then `node scripts/sync-agents.mjs` (never edit `.claude/agents/` or `.agentlab/` by hand).
  - `CLAUDE.md` Definition of done per D-0285 §5.
  - `.github/workflows/ci.yml`: also run on `push` to `main-*`, without double runs for the same commit when a PR is open (e.g. push to `main` and `main-*` plus `pull_request` only for PRs from other branches, or concurrency keyed on the SHA).
  - The orchestrator gate commands in `.claude/skills/tick` (or wherever the gate is documented) drop `--force`.
- Out: changing what the tests check.

## Acceptance criteria
- AC1 Given a diff touching only `apps/web/src/features/UF-09/rest.tsx`, `test-affected --dry-run` lists web typecheck+lint, `vitest related` for that file, and `tests/e2e/uf-09*`, and not `full`.
- AC2 Given a diff touching `apps/web/src/lib/offline/db.ts` (or engine, shared, tokens, contracts, e2e fixtures, configs), it prints `full`.
- AC3 Given a diff touching only `docs/` or `.squad/`, it lists only the repo checks.
- AC4 Given an edited e2e spec, that spec is listed.
- AC5 A unit test for the planner covers AC1–AC4 (pure function over a file list); a planted fault in the mapping fails it.
- AC6 `ci.yml` triggers on push to `main-*`; a repo-check test asserts the trigger and the no-double-run rule.
- AC7 Agent roles and CLAUDE.md say what D-0285 says; `sync-agents.mjs --check` (or equivalent) is clean.

## Paths you may change
- `.claude/commands/tick.md` (orchestrator grant: the gate is documented there)
- `scripts/**`
- `package.json` (scripts only)
- `agents/roles/**`, then the generated `.claude/agents/**` and `.agentlab/**` via `node scripts/sync-agents.mjs` only
- `CLAUDE.md`
- `.github/workflows/ci.yml`, `.github/scripts/**`
- `.claude/skills/**`

## Contract impact
none (process; D-0285).

## Definition of done
Every AC has a test · repo checks green · commit messages start with `T-1015`.

## Build / accept log
