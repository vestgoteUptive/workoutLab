---
id: D-0186
title: "Groom phase 4 after T-0400/T-0401: T-0402 splits into a/b/c/d (preview pipeline, prod schema release, RLS proof + preview allow-list, H-06 go-live); T-0404 splits into a/b (Resend DNS, SMTP + templates); every prod write is a human-run script verified read-only; drift, zone-baseline and cost checks are local read-only scripts"
status: revisit
date: 2026-10-05
by: product-owner (groom)
area: product
builds-on: D-0006, D-0010, D-0011, D-0012, D-0184, D-0185
amends: D-0006, D-0010
---
## Context
T-0400 (prod `supabase_project` imported, D-0185) and T-0401 (two Pages projects, custom domains,
CNAMEs, certificates active) are applied. The next phase-4 rows are T-0402 (deploy pipelines),
T-0404 (custom SMTP), T-0405 (cost guard), T-0500 (auth drift check) and T-0501 (zone baseline
script). Grooming them against `main` c378ddf turned up five facts the board rows don't say:

- **Previews against prod need prod's schema.** The prod database has never had a migration
  pushed. `supabase/tests/scripts/prod-guard.test.mjs` bans `db push`, `functions deploy` and the
  prod ref under `supabase/` and in `ci.yml`. A preview pointed at prod (D-0184 §5) can't load a
  plan until the schema, the exercise library (`seed.sql`) and the Edge Functions are in prod.
  That is the first production deploy of the Supabase surface: gate 3.
- **`terraform apply`, and in practice any prod-writing command, is blocked for agents** in this
  session's permission mode (state.md trap, T-0400/T-0401 run B). The pattern that worked: the
  builder writes a script, the human runs it with `bash <script>`, and an agent verifies
  read-only.
- **The H-09 Resend key has sending access only.** It can't create a domain or read its DNS
  records, so adding `workout.vestgote.com` to Resend is a human step.
- **GitHub environments with required reviewers aren't available on a free private repo**, so the
  first-prod-deploy gate can't rely on them.
- **T-0401's zone hash wasn't reproducible**, because run A's line format wasn't recorded.

## Decision
1. **T-0402 splits into four tickets**, each about half a day or less (D-0157 §7). Order:
   - **T-0402a** builds a preview pipeline and a disabled prod job. A new
     `.github/workflows/deploy.yml` builds `apps/web` and `apps/landing` and uploads them with
     wrangler (pinned exact version, direct upload) to `workoutlab-web` / `workoutlab-landing`:
     - **Previews:** on `push` to any branch except `main`, only when the repo variable
       `PREVIEWS_ENABLED == 'true'`. Always an explicit `--branch <ref>`, never `main`.
     - **Production:** `main` only, triggered by `workflow_run` of CI with conclusion
       `success`, and only when `PROD_DEPLOY_ENABLED == 'true'`. That variable stays unset until
       H-06 (T-0402d).
     - `ci.yml`'s placeholder `deploy` job is removed.
     - Build-time values come from repo variables (`VITE_SUPABASE_URL`,
       `VITE_SUPABASE_ANON_KEY`, which are public by design). The only secret is a CI-only
       Cloudflare token scoped to *Account: Cloudflare Pages: Edit* and nothing else (H-18).
   - **T-0402b** is the first prod Supabase release, as a human-run script (gate 3 for the
     Supabase surface only, new H-19). `infra/scripts/supabase-prod-release.sh` has a read-only
     `status` mode (migration list, local vs remote) and an `apply` mode (`db push
     --include-seed`, then `functions deploy` for the four functions). The human runs it. The
     agent verifies read-only. H-14 (service-role key, D-0135) is checked in the same human run.
     Prod releases stay human-run scripts until a later decision moves them into CI, and the
     prod-guard test stands.
   - **T-0402c** is the RLS proof, then the preview allow-list (D-0184 §6, D-0185 §4). The proof
     has three parts, and all three must pass before the allow-list PATCH:
     - (i) a pgTAP catalog test: every `public` table has RLS on, and every user-owned table's
       policies are owner-scoped for all four commands;
     - (ii) a node test: every table and Edge Function that `apps/web/src` reaches is covered by
       the pgTAP two-user isolation fixture;
     - (iii) a policy fingerprint (SHA-256 over the RLS flags, `pg_policies` and table grants for
       anon/authenticated) that is byte-equal on local and on prod. Prod is read by a human-run,
       read-only script. Anonymous REST probes on prod (an agent may run these, they are GETs
       with the public key) return `[]` for every owned table.
     - Then a human-run, keys-only PATCH adds `https://*.workoutlab-web.pages.dev/**`, and the
       T-0500 expected file changes in the same ticket.
     - A fingerprint mismatch is a stop: return `needs-triage`. Reinstating staging (D-0184
       revisit) is the fallback.
   - **T-0402d** is go-live, `todo (needs H-06)`:
     - set `PROD_DEPLOY_ENABLED`;
     - switch `site_url` to `https://app.workout.vestgote.com` with the keys-only PATCH and the
       expected-file update;
     - Free → Pro with the spend cap verified on (gate 2, D-0012);
     - first prod deploys of web and landing (landing also needs H-10).
   - The landing host is **not** added to the allow-list, because it has no auth flow (amends
     D-0010's "both hosts").
2. **Every write to a real account is a human-run script.** It lives under `infra/scripts/`. With
   no flag it prints only the filtered before/after (plan-then-stop spirit, D-0184 §1). It writes
   only with an explicit `--apply`. It reads secrets from the environment and never prints them.
   An agent verifies afterwards with read-only calls. An AC that needs a write is phrased as
   "the human ran X; the read-only check Y shows Z". Terraform roots keep D-0184's saved-plan
   gate, with `terraform apply <saved plan>` run by the human.
3. **T-0404 splits into two tickets.**
   - **T-0404a** adds the Resend DNS records through Terraform in the existing
     `infra/terraform/cloudflare` root (plan-then-stop, human apply). It needs H-20: the human
     adds `workout.vestgote.com` in Resend (region eu-west-1) and pastes the shown records, which
     are public DNS values. Only these names are allowed: `send.workout.vestgote.com` (MX + SPF
     TXT), `resend._domainkey.workout.vestgote.com` (DKIM TXT) and
     `_dmarc.workout.vestgote.com` (TXT `v=DMARC1; p=none;`). All are unproxied, and the
     T-0401 scope check widens to exactly these names. Nothing changes on `workout.vestgote.com`
     itself or on `app.`.
   - **T-0404b** sets SMTP and branded templates through the D-0185 §4 keys-only PATCH
     (human-run, since it carries `RESEND_API_KEY`):
     - sender `no-reply@workout.vestgote.com`, name `workoutLab`;
     - both the magic-link and the confirm-signup templates. With `shouldCreateUser: true`, new
       users get the confirmation mail. Each template has `{{ .ConfirmationURL }}` and the
       6-digit `{{ .Token }}` (UF-01.5 verifies a code);
     - `mailer_otp_length` stays 6;
     - the expected file gains the non-secret SMTP keys, plus a yes/no for "smtp_pass set".
4. **Read-only checks run locally, not in CI.** The auth drift check (T-0500), the zone baseline
   (T-0501) and the cost check (T-0405) need account-wide tokens (`SUPABASE_ACCESS_TOKEN`, the
   H-03 Cloudflare token). Those don't go into GitHub. The orchestrator runs them before and after
   every prod change, and monthly (T-0405). Their unit tests run in CI through
   `test:repo-checks`. The scripts live in `infra/scripts/` and their tests in
   `.github/scripts/*.test.mjs`, because that glob is what `test:repo-checks` runs.
5. **Zone baseline format (T-0501).**
   - Records: every record in the zone except `workout.vestgote.com` and any name ending
     `.workout.vestgote.com` (the squad's own subtree under gate 4, which its own Terraform plan
     checks already cover).
   - One line per record: `id`, `type`, `name`, `content`, `proxied`, `ttl`, `priority` (empty
     when absent) and `modified_on`, tab-separated.
   - Lines are sorted by UTF-16 code unit order (JavaScript's default sort), each ends in `\n`,
     and the SHA-256 is lowercase hex.
   - The script prints only `count=<n> sha256=<hex>`.
   - T-0401's two incomparable hashes are retired. T-0501's first live value is the new
     reference.
6. **Cost guard (T-0405).**
   - The Free plan has no overage and no configurable usage alerts. So "alerts at 80 %" is a
     read-only `infra/scripts/cost-check.mjs`. It reads the usage it can reach through read-only
     APIs, exits 2 when any metric is at or above 80 % of its quota, and lists what it can't
     read as "check by hand".
   - `docs/infra-costs.md` gains a monthly actuals table. Its stale staging row goes (D-0184 §5).
   - Verifying the spend cap moves to T-0402d, because the cap only exists on Pro.
7. **Amends D-0006.**
   - Environments are `local` and `prod` only (D-0184 §5).
   - D-0006's "CI deploys on main after H-06" is the T-0402a prod job behind
     `PROD_DEPLOY_ENABLED`.
   - Prod database and function releases are human-run scripts for now (§1).

## Consequences
- **Board:** T-0402 becomes T-0402a/b/c/d, and T-0404 becomes T-0404a/b. T-0403's deps name the
  split tickets.
- **Ready now:** T-0402a, T-0402b, T-0500, T-0501, T-0405. They are all in lane `infra`, with
  disjoint paths. The one shared file is `.github/workflows/ci.yml`, and only T-0402a touches it.
- **Waiting:**
  - T-0402c waits on T-0402a, T-0402b and T-0500.
  - T-0404a waits on T-0501 and H-20.
  - T-0404b waits on T-0404a and T-0500.
  - T-0402d waits on H-06.
- **New H-items for the orchestrator to raise:**
  - H-18: CI token and repo variables, before T-0402a's live AC.
  - H-19: approve and run the first prod Supabase release, raised at T-0402b's run-A handback.
  - H-20: add the domain in Resend and paste its records, before T-0404a.
- **Follow-ups not groomed here:** Lighthouse CI on UF-02.1 against a preview URL, and the
  landing `test:browser` CI job. Both were earlier "→ T-0402" notes, and T-0402a leaves them
  out to stay within half a day.

## Revisit when
- RLS can't be proven equal on prod (T-0402c stops). Reinstate staging per D-0184.
- Remote Terraform state lands, or CI is trusted with a Supabase access token. Then move prod
  releases and the read-only checks into CI.
- GitHub environment protection becomes available on this repo. Then use it as a second lock on
  the prod job.
- Resend's free tier or record layout changes.
