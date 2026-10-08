---
id: T-0006
title: Turbo test hashes cover the repo files package tests read (engine library + engine-rules, shared contracts, web inventory), and check-decision-ids flags a slugless D-NNNN.md
lane: infra
screens: []
decisions: [D-0023, D-0158, D-0178]
deps: [T-0004]
status: todo
---
<!-- Groomed by product-owner 2026-10-08 from the parked board row (owner request: groom 10 parked tickets). Narrowed from the 2026-10-06 row: the pgTAP AC1 column-block drift check and the D-0032/D-0023 prose fixes are dropped (low value, nothing reads them at runtime). About ⅓ day. -->

## Why
Since D-0178 the builder's one full gate runs with the Turbo cache on (no `--force`). Turbo hashes a package's `test` task from the files **inside that package** only. Several package tests read files at the repo root:
- `packages/engine/test/*` read `docs/engine-rules.md` (a contract) and `data/exercises/library/*.json` (e.g. `rule-7-session.test.ts:255`, `rule-0-2-favorites-histories.test.ts`).
- `packages/shared/test/*` read `api/openapi.yaml` and `docs/data-model.md` (`openapi.test.ts`, `types.test.ts`, `database.test.ts`).
- Some `apps/web` tests read repo files (e.g. `lib/account/__tests__/export-tables-drift.test.ts`).

So a content-lane ticket that only edits a library JSON gets a **replayed green** engine test from cache, and the break only shows on `main`'s forced merge gate, as rework after merge. CI has no Turbo cache, so CI is unaffected; this is about the local cached gate D-0178 made the norm. The second, unrelated gap: `check-decision-ids.mjs` matches `^(D-\d{4,})-`, so a file named `D-0123.md` (no slug) is silently ignored instead of flagged.

## Scope
- In:
  - Root `turbo.json`: a per-package `test` task entry (e.g. `"@workoutlab/engine#test"`) for each package whose tests read repo-root files, with `inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/<path>", …]` and the same `dependsOn: ["^build"]` as the generic task. Inventory first: `grep -rlE '"\.\.", "\.\.", "\.\."|\.\./\.\./\.\./|REPO_(DIR|ROOT)' packages/*/test apps/*/src data/*/test` and list each file read per package in the build log.
  - `.github/scripts/check-decision-ids.mjs` + its test: a `.squad/decisions/D-\d{4,}.md` file (no slug) is a finding `decision-missing-slug`.
  - A repo-check test (under `.github/scripts/`, picked up by `test:repo-checks`) that pins the AC-1/AC-2 inputs in `turbo.json`.
- Out: the pgTAP `001_schema.test.sql` column-block drift check; D-0032/D-0023 text edits; Turbo remote cache in CI; any test file inside the packages (they keep reading the same paths); `--force` policy (D-0158/D-0178 unchanged).

## Acceptance criteria
Hash proofs use `npx turbo run test --filter=<pkg> --dry=json` and compare the task's `hash`. A touched file is a whitespace change made on a `cp` backup and restored from it (proof hygiene); record each before/after hash pair in the build log.

- **AC-1 (engine library).** Given `main`'s turbo.json plus this change, when one byte of whitespace is appended to `data/exercises/library/ankle-hops.json`, then the `@workoutlab/engine#test` hash differs from the hash before the edit. On unfixed `main` the same edit leaves the hash unchanged (record that red run).
- **AC-2 (engine-rules and shared contracts).** Given the change, when `docs/engine-rules.md` is touched, then `@workoutlab/engine#test`'s hash changes; when `api/openapi.yaml` or `docs/data-model.md` is touched, then `@workoutlab/shared#test`'s hash changes.
- **AC-3 (web inventory).** Given the inventory in the log, for each repo-root file an `apps/web` test reads, touching it changes `@workoutlab/web#test`'s hash. If the inventory finds another package (e.g. `@workoutlab/exercises`) reading repo-root files, the same holds for it.
- **AC-4 (no over-invalidation).** Given the change, when the root `README.md` is touched, then the `@workoutlab/engine#test` and `@workoutlab/shared#test` hashes are unchanged (inputs are not set to the whole repo).
- **AC-5 (pinned).** Given the repo-check test, when the `$TURBO_ROOT$/data/exercises/library/**` input is removed from the engine entry in a backup copy of `turbo.json`, then `npx -y pnpm@10.28.2 -w test:repo-checks` fails naming that input; restored, it passes.
- **AC-6 (slugless decision).** Given a fixture dir with `D-0999.md` (valid front-matter `id: D-0999`), when `checkDecisionIds` runs, then it returns exactly one finding with rule `decision-missing-slug` naming that file. Given `D-0999-some-slug.md` with the same content, then no finding. `README.md` and `INDEX.md` are still ignored.
- **AC-7 (gate).** `node .github/scripts/check-all.mjs` passes on the real tree; the cached full gate (`-w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`) is green.

## Paths you may change
- `turbo.json`, `.github/scripts/check-decision-ids.mjs`, `.github/scripts/check-decision-ids.test.mjs`, `.github/scripts/fixtures/**`, one new `.github/scripts/turbo-inputs.test.mjs` (infra lane).
- This ticket file (build log).

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0006`.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
