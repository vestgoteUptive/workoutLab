---
id: D-0015
title: T-0002 bootstraps minimal package scaffolding outside infra's normal paths
status: decided
date: 2026-09-27
by: devops
area: infra
---
## Context
T-0002 ("Monorepo scaffold: pnpm + turbo, TS strict, ESLint/Prettier, Vitest, remove
`apps/api`, CI workflow") is infra-owned, but its own acceptance bar — "every package has
`typecheck`, `lint` and `test` scripts, and `pnpm -w typecheck lint test` runs everything" —
cannot be met without touching `apps/web/**`, `apps/landing/**`, `packages/engine/**` and
`packages/shared/**`, all of which are owned by other lanes per `.squad/ownership.yaml`.
Before this ticket, those folders held only `.gitkeep`.

## Decision
Infra (T-0002) creates the minimal, working scaffold for every app/package that already has
a slot in the repo tree: `package.json` (with `typecheck`/`lint`/`test`/`dev`/`build` scripts
as applicable), a package-local `tsconfig.json` extending `tsconfig.base.json`, a
package-local `eslint.config.mjs` that imports the root config, and one placeholder
source file + one placeholder test so the scripts have something real to run. Content
belongs to the owning lane from here on:
- `apps/web/**` → web-shell (T-0300 replaces the placeholder `App`)
- `apps/landing/**` → landing (T-0309)
- `packages/engine/**` → engine (T-0101/T-0200+)
- `packages/shared/**` → data (T-0102)
`packages/design-tokens/**` is left uncreated; T-0003 (design) creates it from scratch.

## Consequences
Owning lanes should treat the placeholder files as scaffolding to replace, not as prior art
to preserve. If a lane disagrees with a choice made here (a dependency, a config option),
it can change it inside its own paths without needing a new decision — this entry only
justifies infra having touched those paths once, at bootstrap.

## Revisit when
Any lane wants a materially different toolchain choice than what's scaffolded here (e.g. a
different test runner or bundler) — that becomes a normal in-lane change, not a re-litigation
of this decision.
