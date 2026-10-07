# infra

## Automatic prod Supabase release (T-0543, D-0201)

`.github/workflows/deploy.yml` job `release` runs on every green push to `main` (same guards as
`production`, behind `PROD_DEPLOY_ENABLED`), and `production` needs it: no release, no web deploy.
Steps, in order; any failure stops the job:

1. **Guard** (`infra/scripts/migration-guard.mjs`): runs the release script's `plan`, then scans
   every *pending* migration. `DROP`, `TRUNCATE`, `ALTER ... TYPE`, `DELETE FROM` and `RENAME`
   (comments ignored) block the release unless the file has the header line
   `-- release: destructive-approved D-NNNN` and `.squad/decisions/D-NNNN-*.md` has `status: decided`.
2. **Backup** (`infra/scripts/prod-backup.sh`): `pg_dump` of `public` (and `auth` if the role may),
   piped through `age` to `infra/backup/age-recipient.txt`; uploaded as an artifact for 7 days.
   Fails while the recipient file is the placeholder (H-28).
3. **Plan**, then **apply** (`supabase-prod-release.sh`, `CONFIRM_PROD_RELEASE` from `vars.SUPABASE_PROD_REF`).

Settings: the secrets `SUPABASE_ACCESS_TOKEN` and `PROD_DB_URL` (session pooler string) live in the
GitHub **Environment `production`** (deployment branches: `main` only; no required reviewers, so it
stays fully automatic), not in repository secrets; the `release` job declares
`environment: production`. The variable `SUPABASE_PROD_REF` is a repository variable. Tools are installed in the job: `postgresql-client-17` (matches prod) and
`age` 1.2.1 (sha256-pinned in `deploy.yml`). `check-deploy-workflow.mjs` keeps the two secrets in
the release job only.

Safety rules built into the job: it releases only when `head_sha` is the current tip of `main`;
the workflow never cancels a `workflow_run` run mid-apply; actions are pinned by SHA; the guard
refuses unrecognised migration file names and also checks `supabase/seed.sql` (no DROP, TRUNCATE
or DELETE FROM); `DETAIL:`, `Failing row` and `Key (..)=(..)` lines are redacted from logs because
the repo is public. A failed release can leave prod on the new schema with older functions, so
migrations must stay expand/contract (backward compatible).

### Restore from a backup

Download the `prod-backup-<sha>` artifact (7 days), then, with your private key:

```
age -d -i workoutlab-backup.key backup-<sha>.sql.age | psql "$TARGET_DB_URL"
```

Restore into a scratch database first and check it. The auth dump (`-auth.sql.age`) exists only if
the pooler role was allowed to dump `auth`.

### Terraform stays manual

Terraform is human-run, plan then stop (D-0184, D-0185). Only the Supabase release is automatic.
