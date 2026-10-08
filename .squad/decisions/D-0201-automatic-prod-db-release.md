---
id: D-0201
title: "Prod Supabase releases (migrations, seed, Edge Functions) run automatically in CI on every green push to main, before the Pages deploy, with no approval click; a destructive-migration guard and an encrypted pre-release backup replace the human gate"
status: decided
date: 2026-10-07
by: human (owner chose option 1, fully automatic) / orchestrator
supersedes: D-0186 §2 (prod Supabase release is human-run), D-0200 §2 (release from the ticket worktree before merge)
amends: D-0184 (plan-then-stop for prod writes no longer applies to the Supabase release; it still applies to Terraform)
---
## Context
Every prod Supabase release was run by hand (H-19, H-23, H-27) with `infra/scripts/supabase-prod-release.sh`. Web and landing deploy automatically on green CI (T-0907, `PROD_DEPLOY_ENABLED`). That split forced a release-order dance: a ticket that adds a table can't merge until a human has released its migration (D-0200 §2). The owner asked for releases to happen on merge to main and chose the fully automatic option, with no approval click.

## Decision
1. **When it runs.** In `.github/workflows/deploy.yml`, a `release` job runs on the same trigger as `production` (CI `completed` with `success`, event `push`, same repository, branch `main`). The `production` job `needs: release`, so the database and the functions are always released before the app that uses them. A failed release means no web deploy.
2. **What it runs.** The existing `infra/scripts/supabase-prod-release.sh`: plan, then `apply`, with `CONFIRM_PROD_RELEASE` set from the project ref. The CLI version stays pinned in the script. It is idempotent: with no pending migration it applies nothing. The seed is upsert-only, and the functions are redeployed.
3. **Destructive-migration guard.** Before `apply`, every *pending* migration is scanned. The job fails, releasing nothing and deploying nothing, if any contains `DROP` (table, column, function, policy, type, schema), `TRUNCATE`, `ALTER … TYPE`, `ALTER … DROP`, `DELETE FROM` or `RENAME`, unless the file carries the header line `-- release: destructive-approved D-NNNN`, naming a decided decision. The guard is a tested script, not inline YAML.
4. **Backup first.** Before `apply`, a `pg_dump` of the `public` schema (plus `auth` if the pooler role is allowed to dump it) is encrypted with `age` to the public recipient key committed at `infra/backup/age-recipient.txt`. It is uploaded as a workflow artifact with 7-day retention. Only ciphertext reaches GitHub, and the owner holds the private key. The Free plan has no point-in-time recovery, so this is the only rollback path. If the dump or the encryption fails, the release fails.
5. **Secrets.** `SUPABASE_ACCESS_TOKEN` and `PROD_DB_URL` become GitHub Actions secrets, used only in the `release` job's release step. The project ref comes from `vars.SUPABASE_PROD_REF`, so the workflow file still contains no ref. The static checker (`check-deploy-workflow.mjs`) is updated to allow exactly this, and still to ban it anywhere else. `concurrency: prod-release`, with `cancel-in-progress: false`.
6. **Masking.** All output goes through the script's existing masking. No secret is ever echoed.
7. **Terraform is unchanged.** It stays human-run, plan-then-stop (D-0184, D-0185).

## Consequences
- D-0200 §2 is superseded. T-0535 and later schema tickets just merge, and the release runs before the deploy.
- H-27 becomes moot once T-0543 is live and H-28 is done: merging T-0535 releases its migration.
- Risk accepted by the owner: any commit merged to main can change the prod database without a human seeing it first. Mitigations: the guard (§3), the backup (§4), CI green including pgTAP on a fresh reset, and code review on every schema ticket.
- Privacy: GitHub stores only age-encrypted dumps for 7 days. Record it in the processor notes (docs/security), not as a new processor of plaintext.

## Revisit when
- More than one person can merge to main, or the project leaves the Free plan (then use Supabase PITR and drop the dump).
