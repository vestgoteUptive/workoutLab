---
id: D-0032
title: Repo hygiene rule 7 — stale-wording checks fold T-0005's manual regexes into CI
status: revisit
date: 2026-09-28
by: devops
area: process
---
## Context
T-0005 (D-0015 spec touch-ups) defined four regex checks as its own ACs (AC2, AC4, AC6) and
said "Until then the product-owner runs the same checks with Grep" — pointing at T-0004 to
build the CI version. The board's T-0004 follow-up line asks for exactly that. D-0023 (T-0004's
own decision) doesn't mention wording checks, only screen IDs, decision ids and placeholder
tests, so this amends it with a fourth rule rather than opening a fifth decision for one script.

## Decision
D-0023 gets a fourth check, rule 7:
- **Stale wording.** `.github/scripts/check-stale-wording.mjs` scans `docs/PRD.md`,
  `docs/specs/**/*.md` and `Design-docs/docs/product/**/*.md` (not `docs/tickets/**`, because a
  ticket's "Why" section may quote the old wording it replaced, as history — T-0005 itself does
  this) for four patterns superseded by D-0015 and D-0018:
  1. `` newest `completed_at` `` (T-0005 AC2; D-0015 replaced it: `completed_at` never changes).
  2. `soft delete` (T-0005 AC2; D-0015 uses `deleted_at` tombstones).
  3. the raw templates `{min−1}`, `{max−1}`, `{min+1}`, `{max+1}` (T-0005 AC4; D-0018's clamp is
     `max(1, min−1)` / `min(7, max+1)`, never rendered raw in the UI).
  4. `≥ 6 hard sets in the last 48 h` without "weighted" (T-0005 AC6; engine rule 6 counts
     weighted hard sets).
  Each match is a finding, rule `stale-wording-<name>`. `check-all.mjs` runs it alongside the
  other three checks.

## Consequences
- The product-owner (or any lane) writing product docs gets a CI failure instead of a manual
  Grep pass if any of these four phrases resurface.
- The list is fixed at these four patterns. A new stale-wording risk from a future spec fix
  needs its own follow-up naming the exact phrase and file scope, not a broadened regex.

## Revisit when
- A future decision supersedes D-0015 or D-0018 again, changing what "stale" means.
- The scope needs to include `docs/tickets/**`, with an explicit way to tell a "replaced"
  quote (history) from a live instruction.
