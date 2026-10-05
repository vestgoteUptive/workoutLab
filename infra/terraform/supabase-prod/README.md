# supabase-prod

Terraform root for the prod Supabase project `csgjsdwuxqtuqpuazzpz` (T-0400, D-0006, D-0011, D-0185).
It manages **only** `supabase_project` (imported, never created). Auth settings stay hand-managed in the
dashboard; there is no `supabase_settings` resource. State is local and gitignored.

## Where values come from
- `SUPABASE_ACCESS_TOKEN` (env, read by the provider) and `SUPABASE_ORG_ID` from `.env.local`.
- `TF_VAR_supabase_org_id="$SUPABASE_ORG_ID"`. Never write a `.tfvars`.
- `database_password` is a non-secret placeholder; `ignore_changes` keeps it from being sent.

## Run A: plan, then stop
```sh
set -a; . <repo>/.env.local; set +a
export TF_VAR_supabase_org_id="$SUPABASE_ORG_ID"
cd infra/terraform/supabase-prod
terraform init
terraform fmt -check -recursive ..
terraform validate
terraform plan -out=../plans/supabase-prod.tfplan   # must read: Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
terraform show -json ../plans/supabase-prod.tfplan | node ../../../.github/scripts/check-infra-plan-supabase.mjs --root supabase-prod
terraform show ../plans/supabase-prod.tfplan        # a human reads this
```

## Run B: apply the reviewed plan (only after human approval)
```sh
terraform apply ../plans/supabase-prod.tfplan       # the saved file, never a fresh plan
terraform plan -detailed-exitcode                   # must exit 0
```
If the plan is stale, apply refuses; redo run A. Never run `terraform import` from the CLI.
