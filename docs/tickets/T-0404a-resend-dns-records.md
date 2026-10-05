---
id: T-0404a
title: "Resend sending-domain DNS for workout.vestgote.com via Terraform in the existing cloudflare root: SPF + return-path MX on send., DKIM on resend._domainkey., DMARC p=none on _dmarc.; scope check widened to exactly those names; plan-then-stop, human-run apply (D-0012, D-0184, D-0186 §3)"
lane: infra
screens: []
decisions: [D-0010, D-0012, D-0184, D-0186]
deps: [T-0401, T-0501]
status: todo (needs H-20)
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §3: T-0404 split into a/b).
Build flow: wl-build-infra. About ½ day across run A (plan, stop), the human's apply, and run B
(read-only verify). Needs H-20 first: only a human can add the domain in Resend, because the
H-09 key has sending access only. -->

## Why
D-0012 sends magic-link email through Resend from `workout.vestgote.com`. Supabase's built-in
mailer allows 2 mails an hour and isn't meant for production. Before Resend will send for that
domain, the domain has to prove it owns it, with DNS records: SPF and a return-path MX on a
`send.` subdomain, a DKIM public key, and (recommended) DMARC. Without them, mail is rejected or
lands in spam.

Gate 4 allows email-auth records under `*.workout.vestgote.com` (D-0012). The zone
`vestgote.com` is shared. So these records go through the same Terraform root as T-0401's
CNAMEs, under the same plan-then-stop gate (D-0184). The zone baseline is now a committed script
(T-0501), so the before and after are comparable this time.

## Scope
- **In:**
  - **Inputs (from H-20).** The human adds `workout.vestgote.com` as a domain in Resend, region
    **eu-west-1** (EU data, NFR-PRIV), and pastes the records Resend shows into the H-20 note or
    the ticket log. They are public DNS values: the DKIM public key, `send` MX
    `feedback-smtp.eu-west-1.amazonses.com` priority 10, and `send` TXT `v=spf1
    include:amazonses.com ~all`. The builder uses the pasted values verbatim.
  - **Config,** in `infra/terraform/cloudflare/`:
    - a new file `email.tf` with four top-level `cloudflare_dns_record` resources (no module):
      `cloudflare_dns_record.resend_spf`, `.resend_mx`, `.resend_dkim` and `.dmarc`. All have
      `proxied = false` and `ttl = 1`;
    - names, exactly: `send.workout.vestgote.com` (TXT SPF and MX),
      `resend._domainkey.workout.vestgote.com` (TXT DKIM) and `_dmarc.workout.vestgote.com`
      (TXT `v=DMARC1; p=none;`).
    - The existing six resources are untouched.
  - **Scope check:** `.github/scripts/check-infra-scope-cloudflare.mjs` and its test:
    - The static mode allows `cloudflare_dns_record` resources outside the module, **only** with
      the three names above, types `TXT`/`MX` only, and `proxied = false`.
    - The plan mode allows exactly those four new addresses as `create`, plus `no-op` on the six
      existing ones.
    - Everything else stays as T-0401 made it: no record on `workout.vestgote.com` or
      `app.workout.vestgote.com` other than the two CNAMEs, and no other hostname.
  - New fixtures: `cf-email-create.json` (exit 0), `cf-email-wrong-name.json` (a TXT on
    `vestgote.com`, exit 1) and `cf-email-proxied.json` (exit 1).
  - `infra/terraform/cloudflare/README.md`: the email records, and the run A/B commands with the
    T-0501 baseline script.
- **Out:**
  - The Supabase SMTP settings and templates (T-0404b).
  - Any change to the apex `vestgote.com`, its MX/SPF/DMARC, or any other record (gate 4).
  - A DMARC policy stricter than `p=none`, and a DMARC report mailbox (`rua`). The mailbox would
    need a human (gate 1). Follow-up after a month of clean sending.
  - Any Resend API write by an agent.

### Edge cases that are in scope
- **Resend shows a different record layout** than the one above (another subdomain, or a CNAME
  for DKIM). Mirror what Resend shows, if every name is under `.workout.vestgote.com`, and widen
  the scope check to exactly those names. Record the difference. A name outside the subtree:
  return `needs-triage` (gate 4).
- **A record already exists on one of the names** (hand-made). Discovery (GET) finds it. If its
  content equals Resend's, import it with an `import {}` block, so it's a no-op. Otherwise stop
  and return `needs-triage`.
- **Verification is slow.** DNS propagation can take minutes to hours. The human clicks
  "Verify" in Resend, and run B rechecks status every 10 minutes for up to 2 hours. Then hand
  back `blocked` with the status.
- **The plan goes stale** between runs. Redo run A (D-0184).

## Acceptance criteria
Node:test titles start with `T-0404a AC-n`.

- **AC-1 [static] Static scope.**
  - **Given** the real config, **then** `check-infra-scope-cloudflare` static mode passes.
  - **And** each DNS record outside the module has a name from the three-name set, type `TXT`
    or `MX`, and `proxied = false`.
  - Planted faults, recorded:
    - a copy with a TXT on `workout.vestgote.com` goes red;
    - a copy with `name = "vestgote.com"` goes red;
    - a copy with `proxied = true` on the MX goes red.
- **AC-2 [static] Plan scope.**
  - **Given** `cf-email-create.json`, **then** exit 0.
  - **Given** the two bad fixtures, **then** exit 1, naming the address.
  - The T-0401 fixtures (`cf-*.json`) still give their old results.
- **AC-3 [live, run A] The plan touches only the four new records.**
  - Discovery (GET) of the three names is recorded: none exist, or as found.
  - **And** `zone-baseline.mjs` output A is recorded.
  - **And** `terraform plan -out=../plans/cloudflare.tfplan` reads `Plan: 4 to add, 0 to change,
    0 to destroy.` (or `4 = add + import` per the edge case), and the plan check exits 0.
  - **And** `grep -cF "$CLOUDFLARE_API_TOKEN"` in `terraform show -json` gives `0`.
  - The full `terraform show` text goes in the log. The builder **stops**.
- **AC-4 [live, after the human's apply, read-only]**
  - **Given** the human ran `terraform apply ../plans/cloudflare.tfplan` (`4 added, 0 changed,
    0 destroyed`), **then** `terraform plan -detailed-exitcode` exits 0.
  - **And** `zone-baseline.mjs --expect <output A>` exits 0. Nothing outside the subtree moved.
  - **And** `dig +short TXT send.workout.vestgote.com`, `MX send.workout.vestgote.com`, `TXT
    resend._domainkey.workout.vestgote.com` and `TXT _dmarc.workout.vestgote.com` return the
    configured values. Use `@1.1.1.1` to skip local caches.
- **AC-5 [live, human]** The Resend dashboard shows `workout.vestgote.com` as **Verified**. The
  human reports it, and the orchestrator records it.
- **AC-6 [live] No cost.** The Cloudflare Free plan is unchanged, and the Resend free tier is
  unchanged. `docs/infra-costs.md` needs no change. State that.

## Paths you may change
- `infra/terraform/cloudflare/email.tf` (new), `infra/terraform/cloudflare/README.md`.
- `.github/scripts/check-infra-scope-cloudflare.mjs`,
  `.github/scripts/check-infra-scope-cloudflare.test.mjs`,
  `.github/scripts/fixtures/infra-plan/cf-email-*.json` (new).
- **Listed extras:**
  - `docs/tickets/T-0404a-resend-dns-records.md`, for the build and accept logs.

## Contract impact
None. No cost (D-0012: the Resend free tier, and DNS records are free).

## Definition of done
- **Hard gate: plan, then stop (D-0184, D-0186 §2).**
  - **Run A:** discovery, the baseline, the config, `init`/`fmt -check -recursive`/`validate`,
    and `plan -out`. The `show` text and the AC-3 results go in the log. The builder commits and
    hands back `blocked` with "plan ready for human review".
  - The human runs `terraform apply ../plans/cloudflare.tfplan` in their own terminal.
  - **Run B:** read-only AC-4 to AC-6.
  - The builder never runs `apply`, `import` or `state`, and never sends a write call.
- **Terraform state:** it lives where the human applied (state.md trap). The human applies from
  the main checkout's `infra/terraform/cloudflare/`, where T-0401's state is. Never from a fresh
  worktree without copying that `terraform.tfstate` in first. If the state is missing, the plan
  would propose re-creating T-0401's six resources, and AC-3's `4 to add` catches that.
- Static ACs pass, with the planted faults recorded.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass. Nothing under `apps/` or `packages/` changes
  (D-0178).
- Commits start `T-0404a`.

## Notes
- **H-20 (raise now):** "Add `workout.vestgote.com` as a sending domain in Resend (region
  eu-west-1 / Ireland), and paste the DNS records Resend shows into this item (public values,
  not secrets). Blocks T-0404a."
- **Parallel:** T-0404a is the only ticket in the batch that edits the cloudflare root and its
  scope check.
- **Unblocks:** T-0404b.

## Build / accept log
