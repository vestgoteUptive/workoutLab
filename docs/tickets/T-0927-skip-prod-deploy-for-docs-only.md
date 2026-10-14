---
id: T-0927
title: "Skip the production release and deploy when everything since the last real deploy touched only squad and docs files (fewer PWA reload prompts for users)"
lane: infra
screens: []
decisions: []
deps: []
status: doing
---
## Why
Every green CI run on `main` deploys prod, including `chore(squad)` bookkeeping commits. Each deploy ships a new service-worker build, so an installed iOS PWA reloads on the next cold start (T-0552). Owner reported "every page flickers and reloads" (2026-10-14). Most deploys carry no app change.

## Scope
- In: `.github/workflows/deploy.yml` (production + release jobs only; previews unchanged) and one helper script with a node test under `.github/scripts/`.
- Out: any change to the PWA update logic, to previews, or to what a real deploy does.

## Design (read before building)
- `workflow_run` has no `paths:` filter, and one push can hold several commits. Judging only the head commit is WRONG: an app change in an earlier commit of the same push, followed by a docs-only head commit, must still deploy.
- So compare the head SHA with the **last SHA that was actually deployed** (a prior run of this workflow whose `production` job succeeded; look it up with the GitHub API via `gh api` and `GITHUB_TOKEN`, needs `actions: read`). If the changed-file list between those two commits contains ANY path outside the ignorable set, deploy. Ignorable set (an allowlist, everything else deploys): `.squad/**`, `docs/**`, `Design-docs/**`, `*.md` at any depth, `docs/tickets/**`.
- **Fail open:** if the last deployed SHA cannot be found, the API errors, the SHA is not an ancestor/reachable (history rewrite), or the diff fails, DEPLOY. Never skip on uncertainty.
- Implement the decision as a small script (`.github/scripts/deploy-needed.mjs`) taking the changed paths and printing `deploy=true|false`, so it is unit-testable; a `gate` job (or step) feeds `release` and `production` through `needs`/`if`. A skipped run must still show a clear summary line why.
- Migrations (`supabase/**`), functions, `infra/**`, `.github/**`, `package.json`, lockfile, `apps/**`, `packages/**`, `data/**`, `scripts/**` etc. all count as deployable.

## Acceptance criteria
- AC1 Unit: only ignorable paths → `false`. Planted fault: add `apps/` to the ignorable set → test fails.
- AC2 Unit: a list that mixes ignorable and one deployable path (e.g. `.squad/board.md` + `supabase/migrations/x.sql`) → `true`.
- AC3 Unit: empty list, or an unparsable list → `true` (fail open).
- AC4 The workflow, when the gate says false, skips `release` and `production` (not fails) and writes the reason to the step summary; when true or on any lookup error, behaviour is unchanged.
- AC5 The base SHA is the last SHA whose production job succeeded, not the previous commit (a test over the helper's base-selection function with a fixture run list, including cancelled/skipped runs).
- AC6 `check-all` green (it lints workflows). Draft PR green before merge (touches `.github/**`).

## Paths you may change
- `.github/workflows/deploy.yml`, `.github/scripts/deploy-needed.mjs`, `.github/scripts/deploy-needed.test.mjs`, `.github/scripts/fixtures/**`
- This ticket file (build log).

## Contract impact
None.

## Definition of done
Gate green · draft PR with green CI · commits start with `T-0927`.

## Build / accept log
