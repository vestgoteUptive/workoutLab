---
id: D-0200
title: "D-0199 grooming: the T-0505 drift test ties pgTAP 018 OWNED_TABLES to EXPORT_TABLES, so the export change moves into the data ticket (T-0535); T-0535 merges only after H-27 has released its migration to prod from the T-0535 worktree (main is never held); the D-0199 engine work splits in two (T-0533 rankSwaps, T-0534 excludedOutAreas and suggest examples)"
status: revisit
date: 2026-10-07
by: product-owner (groom)
area: product
builds-on: D-0186, D-0190, D-0199
amends: D-0199 §5 (which ticket changes EXPORT_TABLES / ORDER_KEYS) and §11 (the release runs from the ticket's worktree before its merge)
---
## Context
D-0199 §4 puts the pgTAP `018_user_owned_tables` `OWNED_TABLES` change in the data ticket and §5
puts `EXPORT_TABLES` / `ORDER_KEYS` in `apps/web/src/lib/account/export.ts` in the web-shell
ticket. But T-0505's `apps/web/src/lib/account/__tests__/export-tables-drift.test.ts` requires
`EXPORT_TABLES` to equal the 018 list, and 018's own catalog check requires every public table with
a `user_id` FK to `auth.users` to be in that list. So neither half can land alone without a red
test, and weakening either guard is not allowed.

The export reads the table at run time (UF-11.4 "Export my data"), so a merged-and-deployed
`export.ts` change before the prod release would break the export in prod (D-0199 §11: `main`
deploys on green CI). The release script (`infra/scripts/supabase-prod-release.sh`) releases what
is in the checkout it runs from.

## Decision
1. **The data ticket (T-0535) owns the export change.** It changes the migration, 018, and
   `EXPORT_TABLES` / `ORDER_KEYS` (plus the export test for D-0199 AC21's order) together, so both
   guards stay green on one branch. The web-shell cache ticket (T-0536) does not touch `export.ts`.
2. **Release from the ticket worktree, then merge (orchestrator amendment 2026-10-07).** `main` is
   never held: holding it would block every other push and automatic deploy. T-0535 is built, reviewed and
   its draft PR goes green while it stays on its branch. The human runs H-27 **in the T-0535 worktree**
   (`supabase-prod-release.sh` releases the checkout it runs from: main's migrations plus T-0535's,
   the same pattern as H-25 with T-0515). An agent verifies read-only that the table, its trigger and its four policies are on
   prod, and only then is T-0535 merged and pushed. Every later ticket that reads or writes
   `excluded_exercises` at run time (T-0536, T-0538, T-0539, T-0540, T-0541) merges only after H-27 is
   ticked.
3. **Engine split (D-0157 §7, about half a day each).** T-0533: rule 0.1's `rankSwaps` part, the
   rule 12 signature line, the D-0130 guard fixture, T-0212 AC1/AC2, R12-E17…E19 and the vendor
   regen. T-0534 (after T-0533, same files): `excludedOutAreas`, R0-E3…E5, R7-E17…E20, the three
   simulated histories, the fast-check properties and the vendor regen again. Each ticket writes
   only its own part of rule 0.1 into `docs/engine-rules.md`, so no example is documented before
   it has a test.
4. **One sheet, every host.** The swap sheet is UF-05.1 wherever it opens (UF-09.6, UF-09.9, the
   UF-03.1 List view behind Pause) and UF-08.3 when UF-08 hosts it. The checkbox and the stored-list
   filter live in the sheet, so every host gets them. This is not a control on UF-03 or UF-09
   screens themselves (D-0199 §2, principle 1).

## Consequences
- H-27 is raised when T-0535's draft PR is green; T-0535 waits on its branch until H-27 is done. `main` is never held.
- If a branch preview is ever enabled (H-18) for T-0535's draft PR, that preview's export would
  fail against prod until H-27; previews are off today.

## Revisit when
- Prod releases move into CI (then the release becomes a CI step before the deploy job).
- A future user-owned table hits the same coupling: consider a two-step guard (table first, export
  second) recorded once for all.
