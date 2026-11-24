---
id: D-0285
title: "Targeted local test runs: agents run only the tests their change touches; the orchestrator gate uses turbo's cache and the affected e2e specs; CI runs the whole suite on every push to the squad branch"
status: decided
date: 2026-11-24
by: orchestrator (owner request 2026-11-24)
area: process
amends: CLAUDE.md "Definition of done", D-0169
---
## Context
Owner, 2026-11-24: "When running tests on a feature we should try to run only added or edited tests. GitHub could cover whole test suites. [We are] losing a lot of Claude tokens on long test suites, e2e and Playwright."

Observed cost drivers this week: every ticket ran `turbo run typecheck lint test --force` (no cache, ~10 min) plus large Playwright globs, often with `--repeat-each`; agents queued on the heavy lock (D-0169) and polled; logs were read in full. The full suite still caught real cross-feature bugs (T-0985 broke the shell tab-bar e2e), so it must keep running somewhere before code reaches `main`.

## Decision
1. **Agents (build, QA, review)** run only what their change touches:
   - typecheck and lint of the changed packages (cheap, always);
   - unit tests related to the changed files (`vitest related <files> --run`, through `scripts/test-affected.mjs`);
   - e2e specs for the flows they changed (map `features/UF-NN` → `tests/e2e/uf-NN*`, plus any spec file they edited);
   - no `--repeat-each` unless the ticket is about a flaky test; quiet reporters, summary and failures only.
2. **Shared-surface changes run the full local suite**: `apps/web/src/app/**`, `apps/web/src/lib/**`, `apps/web/src/components/**`, `packages/engine/**`, `packages/shared/**`, `packages/design-tokens/**`, contracts (`docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md`, `tokens.json`), `supabase/**`, `tests/e2e/fixtures/**`, Playwright/vitest/turbo config. `scripts/test-affected.mjs` decides this from the diff.
3. **Orchestrator gate** runs `turbo run typecheck lint test` **without `--force`** (the cache skips unchanged packages), the repo checks, and the affected e2e specs from (1)/(2).
4. **CI runs everything** on every push to the squad branch (`main-*`) as well as on PRs and `main`. After a merge the orchestrator checks the CI result instead of re-running the full suite locally. A red CI run on the squad branch is fixed first, before new merges.
5. The Definition of done becomes: every AC has a passing test; the affected checks from (1)–(3) are green locally; CI is green on the squad branch before the PR to `main` merges; contracts unchanged or decided; IDs cited.

## Consequences
Fewer tokens and less lock waiting. Cross-feature regressions in feature-only changes are now caught by CI after the merge to the squad branch rather than before it; (2) keeps the full local run where that risk is highest, and (4) keeps the squad branch from staying red.
