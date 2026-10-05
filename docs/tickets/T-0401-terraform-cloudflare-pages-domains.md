---
id: T-0401
title: "Terraform: Cloudflare Pages projects (app, landing), Pages custom domains app.workout.vestgote.com and workout.vestgote.com, and their two CNAMEs only (D-0010); plan-then-stop before any apply"
lane: infra
screens: []
decisions: [D-0006, D-0010, D-0012, D-0184]
deps: [T-0309]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 2cfb2ad (D-0184). The zone vestgote.com is a
real, shared zone: the squad may touch exactly two hostnames on it (gate 4). Build flow:
wl-build-infra. About ½ day across run A (plan) and run B (apply + certificate checks), with a
human review between them. -->

## Why
D-0010 serves the landing page (`apps/landing`) on `workout.vestgote.com` and the PWA
(`apps/web`) on `app.workout.vestgote.com`. Each gets its own Cloudflare Pages project, and each
hostname is attached as a **Pages custom domain**. A plain proxied record won't do, because
Universal SSL doesn't cover the second level, and Advanced Certificate Manager would cost money
(gate 2). T-0402 deploys into these projects, so they have to exist first.

The zone `vestgote.com` carries other records that aren't the squad's. One wrong `cloudflare_*`
resource can change the whole zone (SSL mode, rules, the apex). So this ticket proves, before
and after, that nothing outside its two hostnames moved. It also follows D-0184's
plan-then-stop gate.

## Scope
- **In:**
  - **Read-only discovery first (run A).** Use the Cloudflare API with `$CLOUDFLARE_API_TOKEN`,
    and GET requests only:
    - `GET /accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects`: the list of project names and
      their `domains`.
    - `GET /zones/$CLOUDFLARE_ZONE_ID/dns_records?name=workout.vestgote.com` and
      `?name=app.workout.vestgote.com`: any existing records for the two hostnames (type,
      content, proxied, id).
    - **Zone baseline.** `GET /zones/$CLOUDFLARE_ZONE_ID/dns_records` (every page). Save the
      record count and a SHA-256 of the sorted lines `id type name content proxied ttl` for
      every record **except** the two hostnames. Only the count and the hash go in the log;
      other people's record names are not written down.
  - **Import or create, decided by discovery:**
    - **No Pages project serves the hostname:** create it. The app is `workoutlab-web` (the
      name T-0309 already uses for previews), and the landing is `workoutlab-landing`.
    - **A hand-made project already serves the hostname** (its `domains` include it, or its
      name is one of the two above): import it with an `import {}` block, keep its name, and
      write the config to match it, so the import plans zero changes. Never create a second
      project for the same site.
    - **An existing record on either hostname:** import it, only if it is a CNAME to that
      project's `<name>.pages.dev`. Anything else (an A record, a CNAME elsewhere): stop and
      return `needs-triage`. Don't delete or overwrite it.
  - `infra/terraform/modules/cloudflare_site/`, used twice (`module.app`, `module.landing`):
    - `cloudflare_pages_project`: `account_id`, `name`, `production_branch = "main"`. No
      `source` (direct upload: T-0402 deploys with wrangler, and no GitHub app is connected).
      No `build_config`, `deployment_configs`, env vars or Functions settings.
    - `cloudflare_pages_domain`: `account_id`, `project_name`, `name = <hostname>`.
    - `cloudflare_dns_record`: `zone_id`, `name = <hostname>`, `type = "CNAME"`,
      `content = "<project>.pages.dev"`, `proxied = true`, `ttl = 1`.
  - `infra/terraform/cloudflare/`:
    - the root module, with its own local state;
    - provider `cloudflare/cloudflare` pinned to an exact 5.x version (5.x resource names
      above), and `required_version` exact;
    - the committed `.terraform.lock.hcl`;
    - a `README.md` with the run A and run B commands.
    - Both module calls pass the hostname as a string literal.
  - `.gitignore`: append the same Terraform block as T-0400 AC-1, word for word. If T-0400
    has already merged it, leave it as is.
  - **The scope checks**:
    - `.github/scripts/check-infra-scope-cloudflare.mjs` and its `.test.mjs`, with fixtures
      under `.github/scripts/fixtures/infra-plan/`.
    - Static mode parses `infra/terraform/cloudflare/**/*.tf` and
      `modules/cloudflare_site/**/*.tf`.
    - Plan mode reads `terraform show -json` on stdin.
- **Out:**
  - Any other DNS record, the apex, `www`, and any zone-level setting: SSL/TLS mode, Always
    Use HTTPS, HSTS, rulesets, page rules, certificate packs, Total TLS, Workers, routes,
    Access, R2 (gate 4, D-0010).
  - Resend's DKIM/SPF records (T-0404).
  - Deploying any build into either project. The first prod deploy is gate 3 / H-06, and
    T-0402 owns deploys.
  - Pages env vars and preview settings (T-0402).
  - Remote state.

### Edge cases that are in scope
- **The Pages API refuses a custom domain on a project with no deployment.** Stop after run B's
  error, and return `needs-triage` with the error. Don't deploy a placeholder: that would be a
  prod deploy (gate 3).
- **The certificate stays `pending` after the apply.** Poll `GET .../pages/projects/<name>/domains/<host>`
  every 60 s for up to 30 minutes. If it isn't `active` by then, return `blocked` with the
  status and the validation data in the log. Don't change anything to "help" it.
- **HTTPS works but the page is a Cloudflare error or a 404, because nothing is deployed.**
  That's expected before T-0402. AC-5 checks the certificate and the TLS handshake, not the
  page.
- **The token lacks a permission** (a 403). Return `blocked` naming H-03, and list the
  permission that's missing. Never ask for a wider token than H-03's two scopes.
- **The plan goes stale between runs.** Re-run run A and stop again (D-0184).

## Acceptance criteria
`[static]` runs in CI through `-w test:repo-checks`. `[live]` output goes in the build log. Each
node:test title starts with `T-0401 AC-n`.

- **AC-1 [static] Only three resource types, only two hostnames.** Run on the real
  `infra/terraform/cloudflare` and `modules/cloudflare_site`.
  - **Then** every `resource` type is one of `cloudflare_pages_project`,
    `cloudflare_pages_domain` or `cloudflare_dns_record`.
  - **And** every `hostname` literal passed to the module is exactly `workout.vestgote.com` or
    `app.workout.vestgote.com`.
  - **And** no `data` or `resource` block names a type starting `cloudflare_zone`,
    `cloudflare_ruleset`, `cloudflare_page_rule`, `cloudflare_certificate_pack`,
    `cloudflare_total_tls` or `cloudflare_workers`.
  - **And** no literal looks like a token.
  - Planted faults, recorded:
    - a copy with `hostname = "vestgote.com"` goes red;
    - a copy with a `cloudflare_zone_setting` resource goes red.
- **AC-2 [static] The plan scope check.**
  - **Given** `fixtures/infra-plan/cf-create.json`, **then** it exits 0. The fixture has six
    `create`s at `module.app.*` / `module.landing.*` with the three allowed types and the two
    hostnames.
  - **Given** a fixture with any `delete`, **then** it exits 1 and names the address.
  - **Given** a fixture with an `update` on an imported resource, **then** it exits 1.
  - **Given** a fixture with a DNS record whose `name` is another hostname, **then** it
    exits 1.
  - **Given** a fixture with an address outside the six, **then** it exits 1.
- **AC-3 [live, run A] The plan touches only the six resources.**
  - **Given** discovery, **when** `terraform plan -out=../plans/cloudflare.tfplan` runs in
    `cloudflare/`, **then** the plan check exits 0 on its JSON.
  - **And** the summary has `0 to change, 0 to destroy`, and `add + import = 6`.
  - The full `terraform show` text, the discovery findings (project names found, existing
    records on the two hostnames) and the zone baseline count and hash go in the log.
  - **And** a `grep -cF` for `$CLOUDFLARE_API_TOKEN` in `terraform show -json` is `0`.
  - The builder **stops** (Definition of done, gate).
- **AC-4 [live, run B, after approval] Applied as reviewed.**
  - **When** `terraform apply ../plans/cloudflare.tfplan` runs, **then** it reports `0
    changed, 0 destroyed`.
  - **And** a following `terraform plan -detailed-exitcode` exits **0**.
  - **And** the zone baseline taken again has the **same count and hash** as in run A. No
    other record on `vestgote.com` changed.
- **AC-5 [live, run B] Certificates are active, and HTTPS works.** For each of
  `workout.vestgote.com` and `app.workout.vestgote.com`:
  - **Given** `GET /accounts/.../pages/projects/<name>/domains/<host>`, **then** `status` is
    `active` and `certificate_authority` is set (within the polling window above).
  - **And** `openssl s_client -connect <host>:443 -servername <host> -verify_return_error
    </dev/null` prints `Verify return code: 0 (ok)`, with the host in the certificate's SAN.
  - **And** `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}' https://<host>/`
    gives `ssl_verify_result` `0`. The HTTP code is recorded, not asserted (nothing is deployed
    yet).
- **AC-6 [live, run B] No cost.** The two projects show on the Free plan in the account (two
  of the free plan's allowance). Nothing added a paid product. `docs/infra-costs.md` needs no
  change (state that in the log).

## Paths you may change
- `infra/terraform/modules/cloudflare_site/**`, `infra/terraform/cloudflare/**` (new; lane
  `infra`).
- `.github/scripts/check-infra-scope-cloudflare.mjs`,
  `.github/scripts/check-infra-scope-cloudflare.test.mjs`,
  `.github/scripts/fixtures/infra-plan/cf-*.json` (new).
- `.gitignore`: append the T-0400 AC-1 block only.
- **Listed extras:**
  - `docs/tickets/T-0401-terraform-cloudflare-pages-domains.md`, for the build and accept logs.

## Contract impact
None. No recurring cost: Cloudflare Free, two Pages projects, free per-domain certificates
(D-0010, D-0012).

## Definition of done
- **Hard gate: plan, then stop (D-0184).**
  - **Run A.** The builder:
    1. runs discovery (GET only) and the zone baseline;
    2. writes the config;
    3. runs `terraform init`, `fmt -check -recursive` and `validate`;
    4. runs `terraform plan -out=../plans/cloudflare.tfplan`;
    5. pastes the full `terraform show` text, the AC-3 results and the baseline into the
       ticket's build log;
    6. commits, then **stops**.
  - In run A the builder does **not** run `terraform apply`, `terraform import`, `terraform
    state`, or any POST/PATCH/PUT/DELETE against the Cloudflare API. It hands back `blocked`
    with `notes: "plan ready for human review"`.
  - **Run B** only when the orchestrator's input says `apply: true` and names the approved
    plan. It applies **that saved plan file**, then runs the AC-4 to AC-6 checks.
  - Planning and applying in one build run is a failed ticket.
- Static ACs pass, with the AC-1 planted faults recorded. Every live AC has its output in the
  log.
- `node --test .github/scripts/check-infra-scope-cloudflare.test.mjs` is green while you work.
- `-w test:repo-checks`, `-w format:check` and `check-all` are green.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e are
  not needed (D-0178).
- Contracts are unchanged. Commits start `T-0401`.

## Notes
- **Environment:** in the same command line, run `set -a; . <repo>/.env.local; set +a`. The
  provider reads `CLOUDFLARE_API_TOKEN` itself. Map the rest with
  `TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"` and
  `TF_VAR_cloudflare_zone_id="$CLOUDFLARE_ZONE_ID"`. Never echo them, and never write a
  `.tfvars`.
- **Parallel with T-0400:** the only shared file is `.gitignore`, with the identical block.
- **Unblocks:** T-0402 (deploys), T-0404 (Resend records under `workout.vestgote.com`).

## Build / accept log
