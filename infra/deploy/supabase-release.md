# First prod Supabase release (T-0402b, H-19, D-0186)

Agents can't write to prod, so a human runs this. The script is
`infra/scripts/supabase-prod-release.sh`. Prod ref: `csgjsdwuxqtuqpuazzpz`.

## Before you start

1. `PROD_DB_URL` is the session-pooler connection string with the DB password: Dashboard ->
   Connect -> Session pooler. If you don't know the password, reset the DB password in the
   dashboard. That is safe here, because nothing else uses it yet (Terraform ignores it, T-0400).
2. In your own shell (never commit these):
   ```
   set -a; . ./.env.local; set +a        # provides SUPABASE_ACCESS_TOKEN
   export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres'
   ```

## Step 1: plan (read-only)

```
bash infra/scripts/supabase-prod-release.sh
```

Expected: remote migration history empty, 4 migrations would apply plus the seed, no functions
deployed, and the line `would apply 4 migrations + seed (always); would deploy: workouts balance sessions
account`. Paste the masked output into the T-0402b log. If prod already has objects in `public`
or a history that doesn't match, stop and hand the output to the orchestrator (needs-triage).
Never run `db reset`, `--force` or `repair` on prod.

## Step 2: apply

```
CONFIRM_PROD_RELEASE=csgjsdwuxqtuqpuazzpz bash infra/scripts/supabase-prod-release.sh apply
```

It pushes the migrations, applies `supabase/seed.sql` with psql on every run (the CLI skips a changed seed), deploys `workouts`, `balance`, `sessions`, `account` (each
`verify_jwt` comes from `supabase/config.toml`, all false), then re-runs the plan, which must show
nothing pending. If it fails halfway, rerun the same command: `db push` skips applied migrations,
the seed is idempotent and `functions deploy` is repeatable. Don't roll back by hand.

## H-14 check

After the deploy:

```
npx -y supabase@2.118.0 secrets list --project-ref csgjsdwuxqtuqpuazzpz
```

It is read-only and must list `SUPABASE_SERVICE_ROLE_KEY` by name. If it is missing, follow
H-14's instruction. The `account` function stays undeployable until then.

Then tell the orchestrator, who verifies AC-6/AC-7 read-only.
