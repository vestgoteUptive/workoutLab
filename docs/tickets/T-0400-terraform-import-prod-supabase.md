---
id: T-0400
title: "Terraform: set up infra/terraform, import the prod Supabase project csgjsdwuxqtuqpuazzpz with a zero-change plan, and codify its auth settings (D-0011); plan-then-stop before any apply"
lane: infra
screens: []
decisions: [D-0006, D-0010, D-0011, D-0012, D-0184]
deps: [T-0203a]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 2cfb2ad (D-0184), amended same day: the human
decided there is no staging environment, only local (dev) and prod (D-0184 §5). This ticket only
ever covered prod, so the amendment just removes stale mentions of a staging split. Build flow:
wl-build-infra. About ½ day, split across two runs: run A (plan) and run B (apply), with a human
review between them. -->

## Why
The prod Supabase project `csgjsdwuxqtuqpuazzpz` ("workoutLab", org "vestgoteUptive's Org",
Free plan) was made by hand, and its auth settings were set by hand (D-0011, H-08). Nothing
records them, so a dashboard edit can drift unseen, and T-0402/T-0404/T-0405 have nothing to
build on. D-0006 puts accounts-level resources in Terraform, and D-0011 says this project is
**imported, never created**.

This is the first time the squad points Terraform at a real prod project. A config that doesn't
match reality makes the next `apply` "fix" live prod settings, and there is no `git revert` for
that. So the whole ticket is built around one check: right after the import, the plan proposes
**no change** to prod. D-0184 adds a hard gate as well. The builder plans and stops, a human
reads the plan, and only then is it applied.

## Scope
- **In:**
  - **Scaffolding** under `infra/terraform/`:
    - `modules/supabase_project/`: one `supabase_project` and one `supabase_settings` (auth
      block only). Inputs: `organization_id`, `name`, `region`, `database_password`,
      `auth_site_url`, `auth_redirect_urls` (list), `google_enabled`, `google_client_id`.
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
  - **Read-only discovery first (run A, before writing any resource).** Read the live prod
    settings through the Supabase Management API (`GET /v1/projects/csgjsdwuxqtuqpuazzpz` and
    `GET /v1/projects/csgjsdwuxqtuqpuazzpz/config/auth`), and write the config from what comes
    back:
    - project: `name`, `region`, `organization_id`;
    - auth: `site_url`, `uri_allow_list`, `external_google_enabled`, and whether
      `external_google_client_id` equals `$GOOGLE_OAUTH_CLIENT_ID` (a yes/no only).
    - The auth response holds secrets. Pipe every response through a filter (`jq` or
      `node -e`) that keeps only the fields above **before** anything reaches the terminal or a
      file. Never print a raw response.
  - **Import, never create.** Use Terraform `import {}` blocks (Terraform ≥ 1.5) for
    `supabase_project` and `supabase_settings`, both with ID `csgjsdwuxqtuqpuazzpz`, so the
    import shows up in the plan the human reviews. Don't run `terraform import` from the CLI: it
    writes state outside the reviewed plan.
  - **Prod settings Terraform manages** (D-0011, as discovery reads them):
    - `site_url = "http://localhost:3000"` (it changes at H-06, not here);
    - `uri_allow_list = "http://localhost:3000/**,http://localhost:5173/**,https://app.workout.vestgote.com/**"`;
    - `external_google_enabled = true`;
    - `external_google_client_id` from `var.google_oauth_client_id` (env
      `GOOGLE_OAUTH_CLIENT_ID`).
    - **Out of Terraform:** the Google client secret (`external_google_secret`). It stays as
      H-08 set it, and the config doesn't name it (D-0184 §4).
    - Every other auth key is left out, so Terraform neither reads it into the config nor
      changes it.
  - **Prod guards:** `lifecycle { prevent_destroy = true }` on the prod `supabase_project`, and
    `ignore_changes = [database_password]`. Terraform never knew the prod DB password, and it
    must never send one. If the pinned provider requires `database_password`, feed it from
    `var.prod_database_password_placeholder`, whose default is the non-secret string
    `"not-managed-by-terraform"`. `ignore_changes` keeps that string from ever being sent.
  - **The plan scope check** `.github/scripts/check-infra-plan-supabase.mjs`:
    - It reads `terraform show -json <plan>` on stdin, plus a `--root supabase-prod` argument.
    - It exits 1 and names the address when the plan:
      - holds any resource address outside the root's allowlist
        (`module.prod.supabase_project.this`, `module.prod.supabase_settings.this`);
      - has any action other than `no-op`, or an import with `no-op`, on the prod root;
      - has any `delete`, at all;
      - holds any resource type other than `supabase_project` / `supabase_settings`.
    - Its node:test file is `.github/scripts/check-infra-plan-supabase.test.mjs`, with fixtures
      under `.github/scripts/fixtures/infra-plan/`.
- **Out:**
  - A staging environment: there isn't one (D-0184 §5). Only local dev and this one prod
    project exist.
  - Switching `site_url` to `https://app.workout.vestgote.com`, adding the landing host, and
    adding the preview redirect pattern to the allow-list: all at H-06 / **T-0402** (D-0184
    §6), as their own small, separately reviewed plan — never folded into this ticket's
    zero-change import.
  - Plan upgrade to Pro, spend cap, add-ons, compute size (`instance_size`), branching,
    `supabase_settings` blocks other than `auth` (`api`, `database`, `network`, `pooler`,
    `storage`): none of them is declared.
  - Custom SMTP (T-0404). Remote state (D-0006: local until CI applies). CI running
    `terraform` (T-0402).
  - Any change to the Google Cloud OAuth client (D-0011, human-owned).

### Edge cases that are in scope
- **Reality differs from D-0011** (say the allow-list has a 4th entry someone added by hand). The
  config mirrors **reality**, so the plan stays zero-change, and the builder lists each
  difference in the log for the human. Never "correct" prod toward the decision inside this
  ticket.
- **The prod org isn't `$SUPABASE_ORG_ID`.** Stop before writing config, and return
  `needs-triage`. Only the yes/no goes in the log.
- **The provider can't import `supabase_settings`, or its import always plans an update** (a
  provider quirk). Don't paper over it with a broad `ignore_changes`. Stop after run A and
  return `needs-triage` with the plan text.
- **The Google secret reaches the plan** (AC-4 fails). Delete the saved plan file, don't apply,
  and return `needs-triage`.
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
  - **Then** the only `resource` types are `supabase_project` and `supabase_settings`.
  - **And** no `instance_size` attribute is set.
  - **And** `supabase_settings` sets only `auth`.
  - **And** the prod project has `prevent_destroy = true` and `database_password` in
    `ignore_changes`.
  - **And** no string literal matches `/(sbp_|secret|GOCSPX-)/i`, except variable *names*.
  - **And** `external_google_secret` appears nowhere.
  - Planted fault, recorded: add `instance_size = "micro"` to a copy of the module, and AC-2
    goes red.
- **AC-3 [static] The plan scope check works.**
  - **Given** `fixtures/infra-plan/prod-import-noop.json` (two imports, every action `no-op`),
    **when** the check runs with `--root supabase-prod`, **then** it exits 0.
  - **Given** a fixture with an `update` on `module.prod.supabase_settings.this`, **then** it
    exits 1 and names that address and `update`.
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
    - the summary line reads exactly `Plan: 2 to import, 0 to add, 0 to change, 0 to destroy.`;
    - the scope check (AC-3) on that plan's JSON exits 0.
  - The full `terraform show ../plans/supabase-prod.tfplan` text goes in the build log (it shows
    sensitive values as `(sensitive value)`).
  - **And** the builder **stops** there (Definition of done, gate).
- **AC-6 [live, run B, after approval] The import applied, prod is unchanged.**
  - **When** `terraform apply ../plans/supabase-prod.tfplan` runs (the reviewed file, never a
    fresh plan), **then** it reports `2 imported, 0 added, 0 changed, 0 destroyed`.
  - **And** a following `terraform plan -detailed-exitcode` exits **0** ("No changes").
  - **And** discovery run again returns the same filtered values as in run A (diff empty).
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
  Map the rest with `TF_VAR_supabase_org_id="$SUPABASE_ORG_ID"` and
  `TF_VAR_google_oauth_client_id="$GOOGLE_OAUTH_CLIENT_ID"`. Never echo them, and never write a
  `.tfvars`.
- **Parallel:** T-0401 (Cloudflare) may build at the same time. The only shared file is
  `.gitignore`, and both tickets append the identical AC-1 block.
- **Unblocks:** T-0402 (deploy pipelines), T-0405 (cost guard).

## Build / accept log
