# infra/terraform/cloudflare (T-0401, T-0404a)

Two Pages projects (`workoutlab-web`, `workoutlab-landing`), their Pages custom domains and the
two CNAMEs, plus the four Resend email records below. Nothing else on the `vestgote.com` zone.
Local state (gitignored).

Discovery on 2026-10-05 found no existing Pages project and no record on either hostname, so
everything is created (no `import {}` blocks needed).

## Email records (T-0404a, D-0187)
`email.tf` holds the Resend sending-domain records (region eu-west-1), all DNS only:

| Address | Name | Type | Content |
|---|---|---|---|
| `cloudflare_dns_record.resend_send` | `send.workout.vestgote.com` | CNAME | `send.forge.rmta.net` |
| `cloudflare_dns_record.resend_rsend` | `rsend.workout.vestgote.com` | CNAME | `rsend-euw1.forge.rmta.net` |
| `cloudflare_dns_record.resend_dkim` | `resend._domainkey.workout.vestgote.com` | TXT | DKIM public key |
| `cloudflare_dns_record.dmarc` | `_dmarc.workout.vestgote.com` | TXT | `v=DMARC1; p=none;` |

The first three already existed (Resend auto-configure), so they come in through `import {}`
blocks, with the live TTL 3600 and quoted TXT, so the import is a no-op. DMARC is never on the apex
`_dmarc.vestgote.com`. The scope check allows exactly these four. Expected run A plan:
`Plan: 3 to import, 1 to add, 0 to change, 0 to destroy.` with the six T-0401 resources unchanged.
Plan and apply from the checkout that holds T-0401's `terraform.tfstate`.

## Run A (plan only)
```sh
set -a; . <repo>/.env.local; set +a
export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID" TF_VAR_cloudflare_zone_id="$CLOUDFLARE_ZONE_ID"
cd infra/terraform/cloudflare
node ../../scripts/zone-baseline.mjs   # run A baseline: count=<n> sha256=<hex>; record it in the ticket log
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
Then re-take the zone baseline and compare it with run A (exit 0 = unchanged):
```sh
node ../../scripts/zone-baseline.mjs --expect count=<n> sha256=<hex>
```
The script (T-0501) is read-only and excludes `workout.vestgote.com` and `*.workout.vestgote.com`.
