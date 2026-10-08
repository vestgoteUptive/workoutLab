---
id: T-0554
title: "Prod release applies supabase/seed.sql on every apply (psql, idempotent upsert); the CLI's --include-seed skips a changed seed"
lane: infra
screens: []
decisions: [D-0201, D-0192]
deps: [T-0543]
status: ready
---

## Why
The first automatic release (run 37710972038, 2026-10-08) deployed the functions, but prod still has 78 exercises instead of 87. `supabase db push --include-seed` printed "Remote database is up to date". The CLI only seeds a file it hasn't applied before, so a *changed* `seed.sql` (T-0523) never reaches prod, through the automatic job or the manual script. The seed is idempotent: 437 `on conflict … do update` statements, no delete, truncate or drop, wrapped in begin/commit.

## Acceptance criteria
- AC-1: `infra/scripts/supabase-prod-release.sh apply` runs `supabase/seed.sql` with `psql -v ON_ERROR_STOP=1 --single-transaction -f supabase/seed.sql` after `db push` and before the function deploys. The connection comes from `PG*` environment variables and `PGSSLMODE=require`, never argv (reuse prod-backup.sh's parsing or move it into a shared helper). Output goes through the existing `mask()`.
- AC-2: `plan` says that the seed will be applied, e.g. "would apply N migrations + seed (always)".
- AC-3: the existing L4 seed guard (no DROP/TRUNCATE/DELETE) still runs before apply, so a destructive seed fails closed.
- AC-4: tests with a stubbed `psql` on PATH:
  - apply calls psql with the seed file, the flags above and no password in argv;
  - a non-zero psql exit fails the release, so the deploy doesn't run;
  - the ordering is db push, then seed, then functions.

  Planted fault: drop the seed step, and the test goes red.
- AC-5: `check-deploy-workflow.mjs` and the release tests stay green, and the workflow file needs no change unless a step must install psql (it's already installed for the backup).
- AC-6: README: the seed is applied on every release, and why (CLI seed tracking).

## Paths you may change
- `infra/**`, `.github/**`

## Contract impact
None.

## Build / accept log

- Built: shared `infra/scripts/pg-env.sh` (PG* + PGSSLMODE=require, used by prod-backup.sh and the release script); `apply` runs `psql -v ON_ERROR_STOP=1 --single-transaction -f supabase/seed.sql` through mask() after db push, before deploys; failure exits before deploys; plan prints "seed (always)"; mask also covers decoded PGPASSWORD. README + supabase-release.md updated. L4 guard already runs in deploy.yml, unchanged (AC-3); workflow unchanged (AC-5).
- AC map: AC-1 test "T-0554 AC-1"; AC-2 updated plan assertion; AC-4 three tests (order, failing psql, planted fault); AC-5 check-deploy-workflow; AC-6 README.
- Planted fault: sed replaced `psql` with `true` in the release script -> 4 T-0554 tests red; restored from backup copy.
- Gate: node --test (release, backup, deploy-workflow) 47/47; test:repo-checks 366/0; format:check, check-all, check-deploy-workflow green.
