---
id: T-0400
title: "Terraform: set up infra/terraform and import the prod Supabase project csgjsdwuxqtuqpuazzpz (supabase_project only, D-0185) with a zero-change plan; plan-then-stop before any apply"
lane: infra
screens: []
decisions: [D-0006, D-0010, D-0011, D-0012, D-0184, D-0185]
deps: [T-0203a]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 2cfb2ad (D-0184), amended same day: the human
decided there is no staging environment, only local (dev) and prod (D-0184 §5). This ticket only
ever covered prod, so the amendment just removes stale mentions of a staging split. Build flow:
wl-build-infra. About ½ day, split across two runs: run A (plan) and run B (apply), with a human
review between them. -->
<!-- Re-scoped 2026-10-05 by triage (TR-0046, D-0185). Run A showed that importing
supabase_settings can't be zero-change: the resource reads every live settings section into state,
as whole JSON strings. Terraform now manages only supabase_project. Prod auth settings stay
hand-managed, and a separate follow-up ticket adds a read-only drift check. Redo run A from step 1.
Before anything else, delete the stale saved plan infra/terraform/plans/supabase-prod.tfplan.
Never apply it. -->

## Why
The prod Supabase project `csgjsdwuxqtuqpuazzpz` ("workoutLab", org "vestgoteUptive's Org",
Free plan) was made by hand, and its auth settings were set by hand (D-0011, H-08). Nothing
records it, and T-0402/T-0404/T-0405 have nothing to build on. D-0006 puts accounts-level
resources in Terraform, and D-0011 says this project is **imported, never created**. The auth
settings stay out of Terraform (D-0185). The provider's `supabase_settings` resource can't be
imported without declaring every live key, and a read-only drift check (a separate ticket)
watches them instead.

This is the first time the squad points Terraform at a real prod project. A config that doesn't
match reality makes the next `apply` "fix" live prod settings, and there is no `git revert` for
that. So the whole ticket is built around one check: right after the import, the plan proposes
**no change** to prod. D-0184 adds a hard gate as well. The builder plans and stops, a human
reads the plan, and only then is it applied.

## Scope
- **In:**
  - **Scaffolding** under `infra/terraform/`:
    - `modules/supabase_project/`: one `supabase_project` and **no** `supabase_settings`
      (D-0185). Inputs: `organization_id`, `name`, `region`, `database_password`. Remove the
      run-A auth inputs and the `supabase_settings` resource.
      Only the `supabase-prod` root calls it — there's no second (staging) environment to
      reuse it for, but keeping it as a parameterized module rather than inlining its two
      resources costs nothing extra and matches the Cloudflare side's own module split (T-0401).
    - `supabase-prod/`: the root module for prod, with its own local state. Provider
      `supabase/supabase` pinned to an exact version, and the exact Terraform version in
      `required_version`. The committed `.terraform.lock.hcl` is part of this ticket.
    - `supabase-prod/README.md`: the exact commands for run A and run B (below), and where each
      value comes from.
    - `.gitignore` gets the Terraform block in **AC-1** (append it at the end of the file, word
      for word; T-0401 appends the same block, so the second merge is clean).
  - **Read-only discovery first (run A, before writing any resource).** Read the live project
    through `GET /v1/projects/csgjsdwuxqtuqpuazzpz`, and write the config from `name`, `region`
    and `organization_id`. Pipe the response through a filter (`jq` or `node -e`) that keeps only
    those fields (plus `status`). Never print a raw response. Auth is never written here. The only
    auth call is a filtered, read-only `GET .../config/auth` that records the AC-6 baseline
    (`site_url`, `uri_allow_list`, `external_google_enabled`, a client-ID-matches yes/no). The
    filter runs before anything is printed.
  - **Import, never create.** Use one Terraform `import {}` block (Terraform ≥ 1.5) for
    `supabase_project`, ID `csgjsdwuxqtuqpuazzpz`, so the import shows up in the plan the human
    reviews. Don't run `terraform import` from the CLI: it writes state outside the reviewed
    plan.
  - **Auth settings are out of Terraform (D-0185).** No `supabase_settings` resource, no import
    of it, and no auth variable (`google_oauth_client_id` etc.). D-0011's auth values stay as H-08
    set them in the dashboard. The Google client secret is never named (D-0184 §4).
  - **Prod guards:** `lifecycle { prevent_destroy = true }` on the prod `supabase_project`, and
    `ignore_changes = [database_password]`. Terraform never knew the prod DB password, and it
    must never send one. If the pinned provider requires `database_password`, feed it from
    `var.prod_database_password_placeholder`, whose default is the non-secret string
    `"not-managed-by-terraform"`. `ignore_changes` keeps that string from ever being sent.
  - **The plan scope check** `.github/scripts/check-infra-plan-supabase.mjs`:
    - It reads `terraform show -json <plan>` on stdin, plus a `--root supabase-prod` argument.
    - It exits 1 and names the address when the plan:
      - holds any resource address outside the root's allowlist
        (`module.prod.supabase_project.this` only);
      - has any action other than `no-op`, or an import with `no-op`, on the prod root;
      - has any `delete`, at all;
      - holds any resource type other than `supabase_project` (a `supabase_settings` in the
        plan fails by name, D-0185).
    - Its node:test file is `.github/scripts/check-infra-plan-supabase.test.mjs`, with fixtures
      under `.github/scripts/fixtures/infra-plan/`.
- **Out:**
  - A staging environment: there isn't one (D-0184 §5). Only local dev and this one prod
    project exist.
  - Every auth setting, and `supabase_settings` as a whole (D-0185). The read-only auth drift
    check is its own follow-up ticket.
  - Switching `site_url` to `https://app.workout.vestgote.com`, adding the landing host, and
    adding the preview redirect pattern to the allow-list: all at H-06 / **T-0402**, through a
    reviewed keys-only PATCH or the dashboard (D-0185 §4). Never folded into this ticket.
  - Plan upgrade to Pro, spend cap, add-ons, compute size (`instance_size`), branching: none of
    them is declared.
  - Custom SMTP (T-0404). Remote state (D-0006: local until CI applies). CI running
    `terraform` (T-0402).
  - Any change to the Google Cloud OAuth client (D-0011, human-owned).

### Edge cases that are in scope
- **Reality differs from D-0011** (project name, region or org). The config mirrors **reality**,
  so the plan stays zero-change, and the builder lists each difference in the log for the human.
  Never "correct" prod toward the decision inside this ticket.
- **The prod org isn't `$SUPABASE_ORG_ID`.** Stop before writing config, and return
  `needs-triage`. Only the yes/no goes in the log.
- **The `supabase_project` import plans any update** (for example `legacy_api_keys_enabled` or
  another computed attribute). Run A planned it as a pure import, so this shouldn't happen. If it
  does, don't add `ignore_changes` beyond `database_password`. Stop after run A and return
  `needs-triage` with the plan text.
- **A secret reaches the plan** (AC-4 fails). Delete the saved plan file, don't apply, and
  return `needs-triage`.
- **The plan goes stale between run A and run B** (anything changed upstream). `terraform apply
  <saved plan>` refuses a stale plan. The builder re-runs run A and stops again. It never
  replans and applies in one go.
- **Terraform isn't installed.** Install it per the devops role (Homebrew) and record the
  version. No other tool is needed.

## Acceptance criteria
`[static]` checks run in CI through `-w test:repo-checks`. `[live]` checks are commands the
builder runs against the real account; their full output, or its filtered form, goes in the
build log. Each node:test title starts with `T-0400 AC-n`.

- **AC-1 [static] Nothing secret can be committed.**
  - **Given** `.gitignore`, **then** it ends with this block, word for word:
    ```
    # Terraform (T-0400/T-0401, D-0184): state, plans and var files never committed
    **/.terraform/
    *.tfstate
    *.tfstate.*
    *.tfvars
    *.tfvars.json
    *.tfplan
    infra/terraform/plans/
    crash.log
    ```
  - **And** `git check-ignore` matches each of `infra/terraform/supabase-prod/terraform.tfstate`,
    `infra/terraform/plans/supabase-prod.tfplan` and `infra/terraform/supabase-prod/x.tfvars`.
  - **And** `infra/terraform/supabase-prod/.terraform.lock.hcl` is **not** ignored.
  - **And** `git ls-files infra` lists no `.tfstate`, `.tfplan`, `.tfvars` or `.terraform/`
    path.
  - Test: `check-infra-plan-supabase.test.mjs` runs `git check-ignore` / `git ls-files`.
- **AC-2 [static] Only the allowed resources, no literal secrets.** Parse every `.tf` under
  `infra/terraform/supabase-prod/` and `infra/terraform/modules/supabase_project/`.
  - **Then** the only `resource` type is `supabase_project`, and no `supabase_settings` (resource
    or `import` target) appears anywhere (D-0185).
  - **And** no `instance_size` attribute is set.
  - **And** the prod project has `prevent_destroy = true` and `database_password` in
    `ignore_changes`.
  - **And** no string literal matches `/(sbp_|secret|GOCSPX-)/i`, except variable *names*.
  - **And** `external_google_secret` appears nowhere.
  - Planted faults, recorded: add `instance_size = "micro"` to a copy of the module, and AC-2
    goes red; add a `supabase_settings` resource to a copy, and AC-2 goes red.
- **AC-3 [static] The plan scope check works.**
  - **Given** `fixtures/infra-plan/prod-import-noop.json` (one import of
    `module.prod.supabase_project.this`, action `no-op`), **when** the check runs with
    `--root supabase-prod`, **then** it exits 0.
  - **Given** a fixture with an `update` on `module.prod.supabase_project.this`, **then** it
    exits 1 and names that address and `update`.
  - **Given** a fixture that also imports `module.prod.supabase_settings.this` (even as `no-op`),
    **then** it exits 1 and names that address.
  - The same holds for a fixture with `delete`, one with `create` on the prod root, and one with
    an extra resource address. One test each.
- **AC-4 [live, run A] No secret in the plan.**
  - **Given** the saved plan `infra/terraform/plans/supabase-prod.tfplan`, **when**
    `terraform show -json` on it is searched for the values of `$GOOGLE_OAUTH_CLIENT_SECRET`
    and `$SUPABASE_ACCESS_TOKEN`, **then** both counts are `0`.
  - Use `grep -cF`. Print the counts only, never the values.
- **AC-5 [live, run A] The import is zero-change. This is the check that matters most.**
  - **Given** discovery and the config, **when** `terraform plan
    -out=../plans/supabase-prod.tfplan` runs in `supabase-prod/`, **then**:
    - the summary line reads exactly `Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.`;
    - the scope check (AC-3) on that plan's JSON exits 0.
  - The full `terraform show ../plans/supabase-prod.tfplan` text goes in the build log (it shows
    sensitive values as `(sensitive value)`).
  - **And** the builder **stops** there (Definition of done, gate).
- **AC-6 [live, run B, after approval] The import applied, prod is unchanged.**
  - **When** `terraform apply ../plans/supabase-prod.tfplan` runs (the reviewed file, never a
    fresh plan), **then** it reports `1 imported, 0 added, 0 changed, 0 destroyed`.
  - **And** a following `terraform plan -detailed-exitcode` exits **0** ("No changes").
  - **And** discovery run again returns the same filtered values as in run A (diff empty).
  - **And** a filtered, read-only GET of the auth keys after the apply (`site_url`,
    `uri_allow_list`, `external_google_enabled`, and a client-ID-matches yes/no) equals the run-A
    baseline. This proves the import touched no auth setting.
- **AC-7 [live, run B] No cost.**
  - **Given** `GET /v1/organizations/<prod org>` after apply, **then** the plan is still `free`.
  - **And** `GET /v1/projects/csgjsdwuxqtuqpuazzpz` shows the same status and region as before.
  - **And** `docs/infra-costs.md` needs no change (state that in the log).

## Paths you may change
- `infra/terraform/modules/supabase_project/**`, `infra/terraform/supabase-prod/**` (new;
  lane `infra`).
- `.github/scripts/check-infra-plan-supabase.mjs`, `.github/scripts/check-infra-plan-supabase.test.mjs`,
  `.github/scripts/fixtures/infra-plan/**` (new).
- `.gitignore`: append the AC-1 block only.
- **Listed extras:**
  - `docs/tickets/T-0400-terraform-import-prod-supabase.md`, for the build and accept logs.

## Contract impact
None. No schema, API, engine or token change. No recurring cost (AC-7). `docs/infra-costs.md`
stays as is.

## Definition of done
- **Hard gate: plan, then stop (D-0184).**
  - **Run A.** The builder:
    1. runs discovery;
    2. writes the config;
    3. runs `terraform init`, `terraform fmt -check -recursive` and `terraform validate`;
    4. runs `terraform plan -out=../plans/supabase-prod.tfplan`;
    5. pastes the full `terraform show` text and the AC-4/AC-5 results into the ticket's build
       log;
    6. commits the code, then **stops**.
  - In run A the builder does **not** run `terraform apply`, `terraform import`, `terraform
    state` or any write call to the Management API. It hands back `blocked` with
    `notes: "plan ready for human review"`, so the orchestrator can raise the review as an
    H-item.
  - **Run B** happens only when the orchestrator's input says `apply: true` and names the
    approved plan. It applies **that saved plan file** and nothing else, then runs the AC-6/AC-7
    checks.
  - Planning and applying back-to-back inside one build run is a failed ticket, whatever the
    plan said.
- Tests for every `[static]` AC pass, with the AC-2 planted fault recorded. Every `[live]` AC
  has its command output in the log.
- `node --test .github/scripts/check-infra-plan-supabase.test.mjs` is green while you work.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e are
  not needed (D-0178); say so in the log.
- Contracts are unchanged. Commits start `T-0400`.

## Notes
- **Environment:** load `.env.local` with `set -a; . <repo>/.env.local; set +a` in the same
  command line as `terraform`. The provider reads `SUPABASE_ACCESS_TOKEN` from the environment.
  Map the org with `TF_VAR_supabase_org_id="$SUPABASE_ORG_ID"` (no Google variable any more,
  D-0185). Never echo them, and never write a `.tfvars`.
- **Parallel:** T-0401 (Cloudflare) may build at the same time. The only shared file is
  `.gitignore`, and both tickets append the identical AC-1 block.
- **Unblocks:** T-0402 (deploy pipelines), T-0405 (cost guard).

## Build / accept log

### Run A (2026-10-05, HEAD a7f0017) - STOPPED: needs-triage (settings import plans an update)
- Installed terraform 1.16.5 (HashiCorp zip -> ~/.local/bin; no brew on this host). Provider supabase/supabase 1.11.0 pinned.
- Discovery (read-only GETs, filtered via jq): project name `workoutLab`, region `eu-west-1`, status ACTIVE_HEALTHY, org matches `$SUPABASE_ORG_ID` (true). Auth: site_url `http://localhost:3000`; external_google_enabled true; google client id equals `$GOOGLE_OAUTH_CLIENT_ID` (yes).
- **Difference from D-0011:** live `uri_allow_list` is `http://localhost:3000/**,https://app.workout.vestgote.com/**,http://localhost:5173/**` (same three entries, different order than D-0011/ticket). Config mirrors reality (reality order).
- Written: modules/supabase_project, supabase-prod (main.tf, import blocks, prevent_destroy, ignore_changes database_password), .gitignore AC-1 block. `terraform init`, `fmt -check -recursive`, `validate`: green.
- `terraform plan -out=../plans/supabase-prod.tfplan`: **`Plan: 2 to import, 1 to change, 0 to destroy.`** (AC-5 FAILS; expected 0 to change). `supabase_settings.this` is imported and then updated in place: the provider reads the whole remote settings (api, database, storage, auth keys) into state and, because the config declares only 4 auth keys and no api/etc. blocks, plans to drop them (`-> null` / `-` lines). Not papered over with ignore_changes (per ticket edge case); nothing applied.
- AC-4: grep -cF of client secret in plan JSON = 0; access token = 0.
- Not done (blocked on triage, config will change): check-infra-plan-supabase.mjs + tests + fixtures, AC-1/AC-2 static tests, README. `-w test:repo-checks` etc. not run.
- No apply, no `terraform import`, no `terraform state`, no write call to the Management API. Saved plan kept (gitignored) at infra/terraform/plans/supabase-prod.tfplan; do NOT apply it.

Full `terraform show` text (secrets none; auth values non-sensitive):
```

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  ~ update in-place

Terraform will perform the following actions:

  # module.prod.supabase_project.this will be imported
    resource "supabase_project" "this" {
        id                      = "csgjsdwuxqtuqpuazzpz"
        legacy_api_keys_enabled = true
        name                    = "workoutLab"
        organization_id         = "vrqyhqpxhpqahsxlmxuj"
        region                  = "eu-west-1"
    }

  # module.prod.supabase_settings.this will be updated in-place
  # (imported from "csgjsdwuxqtuqpuazzpz")
  ~ resource "supabase_settings" "this" {
      - api             = jsonencode(
            {
              - db_extra_search_path = "public, extensions"
              - db_schema            = "public,graphql_public"
              - max_rows             = 1000
            }
        ) -> null
      ~ auth            = jsonencode(
          ~ {
              - api_max_request_duration                                    = 10
              - custom_oauth_enabled                                        = false
              - db_max_pool_size                                            = 10
              - db_max_pool_size_unit                                       = "connections"
              - disable_signup                                              = false
              - external_anonymous_users_enabled                            = false
              - external_apple_email_optional                               = false
              - external_apple_enabled                                      = false
              - external_azure_email_optional                               = false
              - external_azure_enabled                                      = false
              - external_bitbucket_email_optional                           = false
              - external_bitbucket_enabled                                  = false
              - external_discord_email_optional                             = false
              - external_discord_enabled                                    = false
              - external_email_enabled                                      = true
              - external_facebook_email_optional                            = false
              - external_facebook_enabled                                   = false
              - external_figma_email_optional                               = false
              - external_figma_enabled                                      = false
              - external_github_email_optional                              = false
              - external_github_enabled                                     = false
              - external_gitlab_email_optional                              = false
              - external_gitlab_enabled                                     = false
                external_google_client_id                                   = "818782942159-c13injgfdh5et7gn58ogi0629nc2lr91.apps.googleusercontent.com"
              - external_google_email_optional                              = false
                external_google_enabled                                     = true
              - external_google_skip_nonce_check                            = false
              - external_kakao_email_optional                               = false
              - external_kakao_enabled                                      = false
              - external_keycloak_email_optional                            = false
              - external_keycloak_enabled                                   = false
              - external_linkedin_oidc_email_optional                       = false
              - external_linkedin_oidc_enabled                              = false
              - external_notion_email_optional                              = false
              - external_notion_enabled                                     = false
              - external_phone_enabled                                      = false
              - external_slack_email_optional                               = false
              - external_slack_enabled                                      = false
              - external_slack_oidc_email_optional                          = false
              - external_slack_oidc_enabled                                 = false
              - external_spotify_email_optional                             = false
              - external_spotify_enabled                                    = false
              - external_twitch_email_optional                              = false
              - external_twitch_enabled                                     = false
              - external_twitter_email_optional                             = false
              - external_twitter_enabled                                    = false
              - external_web3_ethereum_enabled                              = false
              - external_web3_solana_enabled                                = false
              - external_workos_enabled                                     = false
              - external_x_email_optional                                   = false
              - external_x_enabled                                          = false
              - external_zoom_email_optional                                = false
              - external_zoom_enabled                                       = false
              - hook_after_user_created_enabled                             = false
              - hook_before_user_created_enabled                            = false
              - hook_custom_access_token_enabled                            = false
              - hook_mfa_verification_attempt_enabled                       = false
              - hook_password_verification_attempt_enabled                  = false
              - hook_send_email_enabled                                     = false
              - hook_send_sms_enabled                                       = false
              - jwt_exp                                                     = 3600
              - mailer_allow_unverified_email_sign_ins                      = false
              - mailer_autoconfirm                                          = false
              - mailer_notifications_email_changed_enabled                  = false
              - mailer_notifications_identity_linked_enabled                = false
              - mailer_notifications_identity_unlinked_enabled              = false
              - mailer_notifications_mfa_factor_enrolled_enabled            = false
              - mailer_notifications_mfa_factor_unenrolled_enabled          = false
              - mailer_notifications_password_changed_enabled               = false
              - mailer_notifications_phone_changed_enabled                  = false
              - mailer_otp_exp                                              = 3600
              - mailer_otp_length                                           = 8
              - mailer_secure_email_change_enabled                          = true
              - mailer_subjects_confirmation                                = "Confirm your email address"
              - mailer_subjects_email_change                                = "Confirm your new email address"
              - mailer_subjects_email_changed_notification                  = "Your email address was changed"
              - mailer_subjects_identity_linked_notification                = "A new sign-in method was linked to your account"
              - mailer_subjects_identity_unlinked_notification              = "A sign-in method was removed from your account"
              - mailer_subjects_invite                                      = "You've been invited"
              - mailer_subjects_magic_link                                  = "Your sign-in link"
              - mailer_subjects_mfa_factor_enrolled_notification            = "A new verification method was added to your account"
              - mailer_subjects_mfa_factor_unenrolled_notification          = "A verification method was removed from your account"
              - mailer_subjects_password_changed_notification               = "Your password was changed"
              - mailer_subjects_phone_changed_notification                  = "Your phone number was changed"
              - mailer_subjects_reauthentication                            = "{{ .Token }} is your verification code"
              - mailer_subjects_recovery                                    = "Reset your password"
              - mailer_templates_confirmation_content                       = <<-EOT
                    <h2>Confirm your email address</h2>
                    
                    <p>Follow the link below to confirm this email address and finish signing up.</p>
                    <p><a href="{{ .ConfirmationURL }}">Confirm email address</a></p>
                EOT
              - mailer_templates_email_change_content                       = <<-EOT
                    <h2>Confirm your new email address</h2>
                    
                    <p>Follow the link below to confirm {{ .NewEmail }} as your new email address.</p>
                    <p><a href="{{ .ConfirmationURL }}">Confirm new email address</a></p>
                    
                    <p>If you didn't request this change, you can safely ignore this email.</p>
                EOT
              - mailer_templates_email_changed_notification_content         = <<-EOT
                    <h2>Your email address was changed</h2>
                    
                    <p>The email address for your account was changed from {{ .OldEmail }} to {{ .Email }}.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_identity_linked_notification_content       = <<-EOT
                    <h2>A new sign-in method was linked</h2>
                    
                    <p>Your {{ .Provider }} account was linked as a new sign-in method for {{ .Email }}.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_identity_unlinked_notification_content     = <<-EOT
                    <h2>A sign-in method was removed</h2>
                    
                    <p>Your {{ .Provider }} account was removed as a sign-in method for {{ .Email }}.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_invite_content                             = <<-EOT
                    <h2>You've been invited</h2>
                    
                    <p>You've been invited to create an account. Follow the link below to accept.</p>
                    <p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
                EOT
              - mailer_templates_magic_link_content                         = <<-EOT
                    <h2>Your sign-in link</h2>
                    
                    <p>Follow the link below to sign in. This link expires shortly and can only be used once.</p>
                    <p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
                EOT
              - mailer_templates_mfa_factor_enrolled_notification_content   = <<-EOT
                    <h2>A new verification method was added</h2>
                    
                    <p>Sign-in verification method {{ .FactorType }} was added to your account.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_mfa_factor_unenrolled_notification_content = <<-EOT
                    <h2>A verification method was removed</h2>
                    
                    <p>Sign-in verification method {{ .FactorType }} was removed from your account.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_password_changed_notification_content      = <<-EOT
                    <h2>Your password was changed</h2>
                    
                    <p>The password for your account was recently changed.</p>
                    
                    <p>If you didn't make this change, reset your password and contact support immediately.</p>
                EOT
              - mailer_templates_phone_changed_notification_content         = <<-EOT
                    <h2>Your phone number was changed</h2>
                    
                    <p>The phone number for your account was changed from {{ .OldPhone }} to {{ .Phone }}.</p>
                    
                    <p>If you didn't make this change, contact support immediately.</p>
                EOT
              - mailer_templates_reauthentication_content                   = <<-EOT
                    <h2>Your verification code</h2>
                    
                    <p>Use the code below to verify your identity. It expires shortly.</p>
                    
                    <p>{{ .Token }}</p>
                EOT
              - mailer_templates_recovery_content                           = <<-EOT
                    <h2>Reset your password</h2>
                    
                    <p>We received a request to reset your password. Follow the link below to choose a new one.</p>
                    <p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
                    
                    <p>If you didn't request this, you can safely ignore this email.</p>
                EOT
              - mfa_max_enrolled_factors                                    = 10
              - mfa_phone_enroll_enabled                                    = false
              - mfa_phone_max_frequency                                     = 5
              - mfa_phone_otp_length                                        = 6
              - mfa_phone_template                                          = "Your code is {{ .Code }}"
              - mfa_phone_verify_enabled                                    = false
              - mfa_totp_enroll_enabled                                     = true
              - mfa_totp_verify_enabled                                     = true
              - mfa_web_authn_enroll_enabled                                = false
              - mfa_web_authn_verify_enabled                                = false
              - oauth_server_allow_dynamic_registration                     = false
              - oauth_server_enabled                                        = false
              - passkey_enabled                                             = false
              - password_hibp_enabled                                       = false
              - password_min_length                                         = 6
              - rate_limit_anonymous_users                                  = 30
              - rate_limit_email_sent                                       = 2
              - rate_limit_otp                                              = 30
              - rate_limit_sms_sent                                         = 30
              - rate_limit_token_refresh                                    = 150
              - rate_limit_verify                                           = 30
              - rate_limit_web3                                             = 30
              - refresh_token_rotation_enabled                              = true
              - saml_enabled                                                = false
              - security_captcha_enabled                                    = false
              - security_captcha_provider                                   = "hcaptcha"
              - security_manual_linking_enabled                             = false
              - security_refresh_token_reuse_interval                       = 10
              - security_sb_forwarded_for_enabled                           = false
              - security_update_password_require_reauthentication           = false
              - sessions_inactivity_timeout                                 = 0
              - sessions_single_per_user                                    = false
              - sessions_timebox                                            = 0
                site_url                                                    = "http://localhost:3000"
              - sms_autoconfirm                                             = false
              - sms_max_frequency                                           = 5
              - sms_otp_exp                                                 = 60
              - sms_otp_length                                              = 6
              - sms_provider                                                = "twilio"
              - sms_template                                                = "Your code is {{ .Code }}"
              - smtp_max_frequency                                          = 60
                uri_allow_list                                              = "http://localhost:3000/**,https://app.workout.vestgote.com/**,http://localhost:5173/**"
            }
        )
      - database        = jsonencode({})
        id              = "csgjsdwuxqtuqpuazzpz"
      - network         = jsonencode(
            {
              - restrictions = [
                  - "0.0.0.0/0",
                  - "::/0",
                ]
            }
        ) -> null
        project_ref     = "csgjsdwuxqtuqpuazzpz"
      - ssl_enforcement = false -> null
      - storage         = jsonencode(
            {
              - capabilities     = {
                  - iceberg_catalog = true
                  - list_v2         = true
                }
              - databasePoolMode = ""
              - external         = {
                  - upstreamTarget = "canary"
                }
              - features         = {
                  - icebergCatalog      = {
                      - enabled       = true
                      - maxCatalogs   = 2
                      - maxNamespaces = 10
                      - maxTables     = 10
                    }
                  - imageTransformation = {
                      - enabled = true
                    }
                  - s3Protocol          = {
                      - enabled = true
                    }
                  - vectorBuckets       = {
                      - enabled    = true
                      - maxBuckets = 10
                      - maxIndexes = 5
                    }
                }
              - fileSizeLimit    = 52428800
              - migrationVersion = "drop-bucketid-objname-index"
            }
        ) -> null
    }

Plan: 2 to import, 0 to add, 1 to change, 0 to destroy.
```

### Triage (2026-10-05) - TR-0046 resolved by D-0185
- Re-scoped: `supabase_project` only, and `supabase_settings` is out of Terraform. This is structural: every settings section is a single JSON attribute that import fills in full. ACs are updated above (AC-2, AC-3, AC-5 `1 to import`, AC-6).
- Next run A: delete the stale `infra/terraform/plans/supabase-prod.tfplan` first, drop the settings resource, its import and the auth/google variables, then redo steps 1-6.

### Run A, second attempt (2026-10-05, HEAD 4f2a150, D-0185 scope) - plan ready for human review
- Removed `supabase_settings`, its import block, and all auth variables (module + root). Deleted the stale saved plan first. Config is now `supabase_project` only (prevent_destroy, ignore_changes database_password). Description text of the placeholder variable reworded so AC-2's no-"secret"-literal check stays strict.
- Added check-infra-plan-supabase.mjs, test, six fixtures under fixtures/infra-plan/, supabase-prod/README.md.
- `terraform init`, `fmt -check -recursive`, `validate`: green. Env from .env.local, TF_VAR_supabase_org_id only.
- **AC-5: `Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.`** Scope check on the plan JSON exits 0 (single resource, action no-op, importing set).
- **AC-4:** grep -cF client secret = 0, access token = 0 in `terraform show -json`. database_password is `null` and marked sensitive; the only "not-managed-by-terraform" hits are the variable's own default.
- AC-1/AC-2/AC-3 tests: `node --test .github/scripts/check-infra-plan-supabase.test.mjs` 11/11 pass. Planted faults (on temp copies, tests red as expected): instance_size added to module copy -> AC-2 red; supabase_settings resource added -> AC-2 red.
- Nothing under apps/ or packages/ changed, so the -w typecheck/lint/test gate and e2e are not needed (D-0178).
- No apply, no `terraform import`, no `terraform state`, no write call to the Management API (only terraform's read-only refresh/import-read during plan). Plan saved (gitignored) at infra/terraform/plans/supabase-prod.tfplan; run B applies that file only.

Full `terraform show` text:
```

Terraform will perform the following actions:

  # module.prod.supabase_project.this will be imported
    resource "supabase_project" "this" {
        id                      = "csgjsdwuxqtuqpuazzpz"
        legacy_api_keys_enabled = true
        name                    = "workoutLab"
        organization_id         = "vrqyhqpxhpqahsxlmxuj"
        region                  = "eu-west-1"
    }

Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
```

### Run B (2026-10-05, human-approved H-17) - done
- Applied by the human from their own terminal (the session's permission mode blocks `terraform apply` for agents); the orchestrator verified afterwards.
- **AC-6:** `terraform apply ../plans/supabase-prod.tfplan` -> `Apply complete! Resources: 1 imported, 0 added, 0 changed, 0 destroyed.` Following `terraform plan -detailed-exitcode` -> exit 0 (no changes).
- **AC-6 (auth untouched):** filtered read-only GETs after apply equal run A exactly: project `workoutLab`, `eu-west-1`, `ACTIVE_HEALTHY`, org match true; `site_url` `http://localhost:3000`, Google enabled, client ID matches, allow-list `http://localhost:3000/**,https://app.workout.vestgote.com/**,http://localhost:5173/**` (live order, unchanged).
- **AC-7:** org plan `free`. No cost added; `docs/infra-costs.md` needs no change.
- Status: done.
