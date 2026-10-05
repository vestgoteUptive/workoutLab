---
id: TR-0046
status: resolved
raised_by: devops on T-0400
date: 2026-10-05
---
# TR-0046 T-0400: supabase_settings import is not zero-change

Raised by: devops, run A of T-0400. Status: resolved (D-0185).

## Finding
With provider supabase/supabase 1.11.0, importing `supabase_settings` (ID csgjsdwuxqtuqpuazzpz) and declaring only `auth` with 4 keys yields `Plan: 2 to import, 1 to change, 0 to destroy.` The provider loads the full remote api/database/storage/auth settings into state; config omitting them plans removal (`-> null`, per-key `-`). Applying risks resetting live prod settings, so the ticket's rule applies: no ignore_changes workaround, stop.

## Options for triage / product-owner
1. `ignore_changes = [api, database, storage, network, pooler, auth-keys...]` or `[auth]` is rejected by the ticket as broad; decide if a narrow variant (ignore api/database/storage/network/pooler only; declare the full current auth JSON from discovery) is acceptable.
2. Declare the full live auth JSON (all keys, minus secrets) in config; needs a secrets-free way and bloats config.
3. Skip `supabase_settings` in Terraform; manage only `supabase_project` and keep auth manual (amends D-0011/D-0184).
4. Check whether a newer provider version supports partial/merge settings.

Evidence: full plan text is in docs/tickets/T-0400-terraform-import-prod-supabase.md (Build log). Nothing was applied.

## Resolution
Option 3, plus a read-only drift check. Decision: [D-0185](../decisions/D-0185-terraform-supabase-project-only-no-settings.md), which amends D-0006, D-0011 and D-0184.
- This is structural, not a version bug. Every `supabase_settings` section is one JSON-string attribute, and import reads all of it. `ignore_changes` can only address whole attributes. So the only zero-change configs are "declare every live key in every section" (option 2) or "ignore the whole `auth` attribute" (option 1). Option 2 is fragile: it holds server-owned values that Supabase changes itself, such as `storage.migrationVersion` and new auth keys, so the plan would keep proposing to revert prod. Option 1 manages nothing while looking managed. Option 4 can't be relied on; a better provider release is D-0185's revisit trigger.
- Terraform keeps only `supabase_project`, which imported zero-change. Prod auth stays hand-managed (H-08). A read-only GET-and-diff script against a committed expected file keeps drift visible (follow-up ticket). Later auth changes (H-06 `site_url`, the T-0402 preview pattern) go through a reviewed, keys-only PATCH or the dashboard, never `supabase_settings`.
- The saved plan `infra/terraform/plans/supabase-prod.tfplan` must be deleted, not applied. T-0400 is re-scoped in place, and run A is redone.
