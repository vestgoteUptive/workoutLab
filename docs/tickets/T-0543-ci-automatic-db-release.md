---
id: T-0543
title: CI releases prod Supabase (migrations, seed, functions) automatically before the Pages deploy, with a destructive-migration guard and an age-encrypted pg_dump backup
lane: infra
screens: []
decisions: [D-0201, D-0186, D-0184]
deps: []
status: ready
---

## Why
D-0201. The owner wants database releases to happen on merge to main, fully automatically, instead of being run by hand (H-27 style).

## Acceptance criteria
- AC-1: `deploy.yml` has a `release` job with the same `if` conditions as `production` (workflow_run of CI on main, conclusion success, event push, same repository, `vars.PROD_DEPLOY_ENABLED == 'true'`). `production` has `needs: release`. `concurrency: { group: prod-release, cancel-in-progress: false }`.
- AC-2: the release job runs, in order: (a) the destructive-migration guard, (b) the backup, (c) `supabase-prod-release.sh plan`, (d) `CONFIRM_PROD_RELEASE=${{ vars.SUPABASE_PROD_REF }} … apply`. Any failing step stops the job, and so the deploy.
- AC-3: guard script `infra/scripts/migration-guard.mjs` with node tests. It takes the list of pending migration files (from the release script's plan, or by comparing `supabase/migrations` against the remote migration history) and fails on DROP/TRUNCATE/ALTER…TYPE/ALTER…DROP/DELETE FROM/RENAME, unless the header `-- release: destructive-approved D-NNNN` is present and that decision file exists with `status: decided`. Tests cover each pattern (a red case), the allow header (a green case), a header naming a missing or non-decided decision (red), comments containing the words (not matched), and no pending migrations (green).
- AC-4: backup script `infra/scripts/prod-backup.sh`. It runs `pg_dump` (schema `public`, plus `auth` if permitted, else logs that it was skipped), pipes the output through `age -R infra/backup/age-recipient.txt` to `backup-<sha>.sql.age`, and the workflow uploads it with `actions/upload-artifact` and `retention-days: 7`. Plaintext never touches disk outside the runner's temp, and the dump is never printed. A placeholder recipient file plus a README saying the owner replaces it (H-28). The job fails if the recipient file is still the placeholder.
- AC-5: secrets `SUPABASE_ACCESS_TOKEN` and `PROD_DB_URL` are referenced only in the release job's guard, backup and release steps. `check-deploy-workflow.mjs` is updated:
  - It allows those two secrets only inside `jobs.release`.
  - It allows `supabase db push` and `functions deploy` only by way of the release script, never inline.
  - The prod ref still never appears literally.
  - New planted-fault tests: a secret used in the production job is red; the release job without `needs` ordering is red; `cancel-in-progress: true` is red.
- AC-6: the existing release script still works when a human runs it (its tests stay green). If it needs a non-interactive mode for CI, add it with tests.
- AC-7: docs. `infra/README` (or the release section of the existing docs) describes the automatic release, the guard header, how to restore from a backup (`age -d -i key | psql`), and that Terraform stays manual. Add a note in docs/security about the encrypted backups held by GitHub for 7 days.

## Paths you may change
- `.github/**`, `infra/**`, `docs/security/**`

## Contract impact
None to the API or the data model. Process change named by D-0201.

## Build / accept log
