---
id: D-0185
title: "Terraform manages only the prod supabase_project, not supabase_settings: the provider's settings resource can't be imported zero-change without declaring every live key. Prod auth settings stay hand-managed, with a read-only drift check instead (TR-0046)"
status: revisit
date: 2026-10-05
by: triage (TR-0046)
area: infra
builds-on: D-0006, D-0011, D-0184
amends: D-0006, D-0011, D-0184
---
## Context
T-0400 run A (provider `supabase/supabase` 1.11.0, Terraform 1.16.5) imported
`supabase_project` cleanly, but `supabase_settings` planned `1 to change`. The full plan is in the
T-0400 build log. The import reads every section of the live settings into state: `api`,
`database`, `network`, `storage`, `ssl_enforcement` and about 120 `auth` keys, including mailer
subjects and templates, MFA, rate limits, `jwt_exp` and every OAuth provider flag. The config
declared 4 auth keys, so the plan proposes to drop all the others (`-> null`, per-key `-`).

Why this is structural, not something to fix with a version bump or a different config shape:
- Each section is **one attribute holding one JSON string** (the binary's schema text says "Auth
  settings as serialised JSON", which maps to the Management API's `updateV1AuthConfig`). Terraform
  diffs the whole string. `ignore_changes` can only address the whole attribute, never a key inside
  it.
- So there are only two zero-change configs. (a) Declare the full live JSON of every section. (b)
  Put `ignore_changes` on whole attributes. Option (b) applied to `auth` ignores the 4 keys we
  wanted to manage, so it manages nothing while looking as if it does. That is the "paper over it"
  the ticket forbids.
- Option (a) puts ~120 auth keys, the HTML of every email template, and server-owned values
  (`storage.migrationVersion`, `external.upstreamTarget = "canary"`, feature limits) into config.
  Supabase changes those values itself during platform migrations and when it adds new auth keys,
  so every such change shows up as a plan that would revert prod. That brings back the drift
  problem D-0006 and D-0011 set out to remove, now pointing the other way. It's also a bad first
  apply against real prod.
- Whether the remote PATCH merges or replaces doesn't matter here. Even with merge semantics,
  state would never converge with the config, and AC-5 (zero change) couldn't be proven. We can't
  verify provider internals from here (no source, no web access in this run). A newer provider
  release is a revisit trigger, not a dependency.

## Decision
1. **Terraform's Supabase scope is the `supabase_project` resource only** (name, region, org,
   `prevent_destroy`, `ignore_changes = [database_password]`). No `supabase_settings` resource
   in any root, and no import of it. This amends D-0006 ("project, auth settings, redirect URLs"
   becomes "project") and D-0184 §1–3 (the allowlist is `module.prod.supabase_project.this` only).
2. **Prod auth settings stay hand-managed** in the Supabase dashboard, as H-08 set them. This
   amends D-0011's consequence "T-0400 must codify these auth settings in Terraform". D-0011's
   values (site URL, the three allow-list entries, Google enabled with the `.env.local` client ID)
   are still the intended state.
3. **Drift stays visible through a read-only check, not Terraform.** A follow-up ticket (lane
   `infra`) adds a script that does `GET /v1/projects/<ref>/config/auth`, filters it to the
   D-0011 keys (`site_url`, `uri_allow_list`, `external_google_enabled`, and a yes/no for
   whether the client ID matches `$GOOGLE_OAUTH_CLIENT_ID`) before anything is printed, and diffs
   the result against a committed, secret-free expected file. It exits 1 on any difference and
   never writes. Order-insensitive allow-list comparison (live order differs from D-0011, which
   isn't drift).
4. **Changes to prod auth settings** (H-06's `site_url` switch, T-0402's preview allow-list
   pattern, D-0184 §6) are made either by the human in the dashboard, or by a reviewed script that
   sends a Management API PATCH containing **only** the changed keys. Either way, the same
   plan-then-stop spirit applies: the exact before/after of the filtered keys goes in the ticket
   log for human review first, and the change and the expected-file update land in one ticket.
   They never go through `supabase_settings`.
5. **Nothing from T-0400 run A is applied.** Delete the saved
   `infra/terraform/plans/supabase-prod.tfplan`, which is stale and unsafe. Run A is redone under
   the corrected ticket.

## Consequences
- T-0400 is re-scoped: one resource, one import, `Plan: 1 to import, 0 to add, 0 to change, 0 to
  destroy.`, and the scope check allowlist and AC-2 type list shrink to `supabase_project`.
- New follow-up ticket for the read-only auth drift check (§3). Not blocking T-0400.
- T-0402 grooming must use §4 for the `site_url` and allow-list changes, not Terraform.
- D-0184 §6's wording ("a small, explicitly-reviewed `terraform plan`") is read as "a small,
  explicitly reviewed before/after of the filtered auth keys" under §4.
- **Revisit when:** a supabase provider release supports per-key or partial auth settings, or
  can import without reading unmanaged sections. Then reconsider codifying the D-0011 keys in
  Terraform, behind a fresh zero-change import.
