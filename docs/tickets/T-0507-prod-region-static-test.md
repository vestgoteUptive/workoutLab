---
id: T-0507
title: "Static test: the prod Supabase region in infra/terraform/supabase-prod/main.tf is an eu-* region (and today eu-west-1, D-0190 §1); folds in T-0506's test half (NFR-PRIV-1, privacy review P1-a/P1-b)"
lane: infra
screens: []
decisions: [D-0190, D-0017, D-0185]
deps: [T-0406]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §1). Build flow:
wl-build-infra. About ⅛ day. T-0506 (decision + NFR wording) was done in the groom itself:
D-0190 §1 and docs/specs/non-functional.md NFR-PRIV-1. -->

## Why
NFR-PRIV-1 (data in an EU region) was first checked by "Terraform plan asserts the region", but
nothing in the repo asserts it (`docs/security/privacy.md` P1-b). The prod project is pinned at
`infra/terraform/supabase-prod/main.tf:31` (`region = "eu-west-1"`). The module's
`prevent_destroy` stops a replace, but an edit to that line would only show up as a plan that
fails to apply. D-0190 §1 now records `eu-west-1` as the prod region, and
`docs/specs/non-functional.md` names this test as the check.

## Scope
- **In:** a new `node --test` file, `.github/scripts/prod-region.test.mjs`, that reads `main.tf`
  as text and finds the `module "prod" { … }` block and its `region = "<value>"` line.
- **Out:**
  - Running Terraform.
  - Any live call (the region was verified read-only in T-0400).
  - Changing `main.tf`.

## Acceptance criteria
Every test title starts with `T-0507 AC-n`.

- **AC-1 (EU region)** **Given** `infra/terraform/supabase-prod/main.tf`. **Then**:
  - exactly one `region = "…"` assignment exists inside `module "prod"`;
  - its value matches `/^eu-[a-z]+-\d+$/`.
- **AC-2 (the recorded value)** The value equals `"eu-west-1"`, the region D-0190 §1 records.
  The assertion message tells a future editor to supersede D-0190 §1 before changing it.
- **AC-3 (the spec names this check)** `docs/specs/non-functional.md`'s NFR-PRIV-1 row contains
  `T-0507` and `eu-west-1`.
- **AC-4 (planted faults)** On a backup copy of `main.tf`, restored with `cp`:
  - `region = "us-east-1"` → AC-1 fails;
  - a second `region =` line in the module → AC-1 fails;
  - removing the line → AC-1 fails with a message naming the file.

  Record all three.

Every AC is green on main as soon as the test exists, because the code already complies. The
proof is AC-4's planted faults.

## Paths you may change
- `.github/scripts/prod-region.test.mjs` (new) (the lane: `infra`).
- **Listed extras:**
  - `docs/tickets/T-0507-prod-region-static-test.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the planted faults recorded.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green through `scripts/locked.sh small`.
- Commits start `T-0507`.

## Notes
- **Parallel:** one new file. Runs alongside any other ticket.
- T-0506 closes as done by this groom (D-0190 §1).

## Build / accept log
