# infra/terraform/cloudflare (T-0401)

Two Pages projects (`workoutlab-web`, `workoutlab-landing`), their Pages custom domains and the
two CNAMEs. Nothing else on the `vestgote.com` zone. Local state (gitignored).

Discovery on 2026-10-05 found no existing Pages project and no record on either hostname, so
everything is created (no `import {}` blocks needed).

## Run A (plan only)
```sh
set -a; . <repo>/.env.local; set +a
export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID" TF_VAR_cloudflare_zone_id="$CLOUDFLARE_ZONE_ID"
cd infra/terraform/cloudflare
terraform init && terraform fmt -check -recursive .. && terraform validate
terraform plan -out=../plans/cloudflare.tfplan
terraform show ../plans/cloudflare.tfplan
terraform show -json ../plans/cloudflare.tfplan | node ../../../.github/scripts/check-infra-scope-cloudflare.mjs --plan
```

## Run B (only after human approval of the saved plan)
```sh
terraform apply ../plans/cloudflare.tfplan
terraform plan -detailed-exitcode   # expect exit 0
```
Then re-take the zone baseline (count + SHA-256 of sorted `id type name content proxied ttl`
lines, excluding the two hostnames) and compare with the run A value in the ticket log.
