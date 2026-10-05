# TR-0046 T-0400: supabase_settings import is not zero-change

Raised by: devops, run A of T-0400. Status: open.

## Finding
With provider supabase/supabase 1.11.0, importing `supabase_settings` (ID csgjsdwuxqtuqpuazzpz) and declaring only `auth` with 4 keys yields `Plan: 2 to import, 1 to change, 0 to destroy.` The provider loads the full remote api/database/storage/auth settings into state; config omitting them plans removal (`-> null`, per-key `-`). Applying risks resetting live prod settings, so the ticket's rule applies: no ignore_changes workaround, stop.

## Options for triage / product-owner
1. `ignore_changes = [api, database, storage, network, pooler, auth-keys...]` or `[auth]` is rejected by the ticket as broad; decide if a narrow variant (ignore api/database/storage/network/pooler only; declare the full current auth JSON from discovery) is acceptable.
2. Declare the full live auth JSON (all keys, minus secrets) in config; needs a secrets-free way and bloats config.
3. Skip `supabase_settings` in Terraform; manage only `supabase_project` and keep auth manual (amends D-0011/D-0184).
4. Check whether a newer provider version supports partial/merge settings.

Evidence: full plan text is in docs/tickets/T-0400-terraform-import-prod-supabase.md (Build log). Nothing was applied.
