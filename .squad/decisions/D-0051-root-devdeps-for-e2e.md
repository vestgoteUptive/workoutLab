---
id: D-0051
title: Root devDependencies for the e2e suite and the design-tokens isolated lint test
status: revisit
date: 2026-09-28
decided_by: orchestrator
supersedes: null
tickets: [T-0300a]
---
## Context
T-0300a needs `@playwright/test` and `@axe-core/playwright` to resolve from `tests/e2e/`. That folder is not a workspace package (D-0045 §10), so its imports resolve from the repo-root `node_modules`. The design-tokens isolated-workspace lint test (T-0003) symlinks only the root `node_modules`, so `eslint-plugin-react`, which `apps/web`'s ESLint config now loads, must also resolve from there. The root `package.json` is owned by the infra lane, and the T-0300a ticket doesn't list it.

## Decision
T-0300a may add exactly these three devDependencies to the root `package.json`: `@playwright/test`, `@axe-core/playwright` and `eslint-plugin-react`. The versions must match the ones `apps/web` declares. The lockfile may change only through `pnpm install`. No other change to root files is allowed. In particular, `.gitignore` stays untouched, because the icons are emitted into `dist/` (D-0045 §8), not into `public/`.

## Consequences
- The infra lane owns these entries from now on and may replace them with a hoist pattern, or with a `tests/e2e` workspace package, in T-0006.
- D-0049 no longer applies, since icons are never written to the source tree. T-0300a deletes it or rewrites it as `revisit`.

## Revisit when
T-0006 changes how the e2e suite resolves its dependencies.
