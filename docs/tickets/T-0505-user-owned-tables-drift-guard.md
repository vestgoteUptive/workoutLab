---
id: T-0505
title: "Drift guard: a pgTAP catalog test proves every public table with a user_id (FK to auth.users) cascades on delete and matches one literal owned-table list, and a vitest ties EXPORT_TABLES to that same list (UF-11.4; privacy review P4-a, NFR-PRIV-4/5)"
lane: backend
screens: [UF-11.4]
decisions: [D-0135, D-0136, D-0020, D-0190]
deps: [T-0406]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e. Build flow: wl-build-backend.
About ¼ day. pgTAP half in the backend lane; one vitest file granted from web-shell (listed
extra). -->

## Why
The privacy review (`docs/security/privacy.md` P4-a) found that nothing ties the account export
or deletion to the schema:
- `EXPORT_TABLES` in `apps/web/src/lib/account/export.ts` lists the 7 user-owned tables by hand.
- The test's comparison list `EXPORT_TABLE_NAMES` (`lib/account/__tests__/fixtures.ts:207`) is
  also hand-written.

An 8th user-owned table could therefore ship without being exported (NFR-PRIV-4), or without
`ON DELETE CASCADE`, which would leave rows behind when an account is deleted (NFR-PRIV-5). The
in-app UF-11.4 promise "export or delete everything" would then be false.

All 7 owned tables in `supabase/migrations/` declare
`user_id uuid … references auth.users (id) on delete cascade` today. The guard pins that, so a
new table has to join the list on purpose.

## Scope
- **In:**
  - **`supabase/tests/database/018_user_owned_tables.test.sql`** (new pgTAP):
    - A literal list between two marker comments, `-- OWNED_TABLES:BEGIN` and
      `-- OWNED_TABLES:END`, one table name per line inside a `values (…)` list: `area_targets`,
      `plan_checkins`, `profiles`, `routine_items`, `routines`, `session_sets`, `sessions`.
    - Three checks, each listing its offenders as text and expecting `''` (the
      `015_rls_every_table.test.sql` style):
      - (a) every foreign key from a `public` table to `auth.users` has `confdeltype = 'c'`
        (cascade);
      - (b) the set of `public` tables with such a foreign key equals the literal list;
      - (c) every `public` table with a column named `user_id` has such a foreign key on that
        column. That catches a new owned table whose FK was forgotten.
  - **`apps/web/src/lib/account/__tests__/export-tables-drift.test.ts`** (new vitest, node
    environment): read the `.sql` file from the repo, extract the names between the markers,
    and assert that the sorted `EXPORT_TABLES` equals that list.
- **Out:**
  - Changing `EXPORT_TABLES`, `ORDER_KEYS` or any migration.
  - Replacing the hand-written `EXPORT_TABLE_NAMES` fixture. It can stay; the new test is the
    schema link.
  - Generating types.

## Acceptance criteria
Every test title starts with `T-0505 AC-n`.

- **AC-1 (pgTAP green on main's schema)** `supabase test db` (local stack, `npx -y supabase@latest
  start -x vector,logflare`) passes 018's checks (a), (b) and (c), with `plan(3)`.
- **AC-2 (pgTAP catches a missing cascade)**
  - **Given** a planted migration on a backup copy, run locally only: a new
    `supabase/migrations/29990101000000_t0505_fault.sql` with
    `create table public.t0505_fault (id int primary key, user_id uuid references auth.users(id));`
    (no cascade).
  - **When** `supabase db reset` then `supabase test db`.
  - **Then** (a) fails naming `t0505_fault`, and (b) fails naming `t0505_fault`.
  - Delete the planted file and reset again. Record both runs.
- **AC-3 (pgTAP catches a user_id without an FK)** The same procedure, with
  `create table public.t0505_nofk (id int primary key, user_id uuid);`. Check (c) must fail,
  naming `t0505_nofk`. Remove it, reset, and record.
- **AC-4 (export list tied to the schema list)** The vitest passes on main's code.
  - Planted fault: on a backup copy of `export.ts`, remove `"plan_checkins"` from
    `EXPORT_TABLES`. The test must fail and name `plan_checkins`. Restore with `cp`.
  - Planted fault: add `-- x` inside the markers' `values` block, on a backup copy of the `.sql`
    file. The parser must ignore comment lines, so the test stays green. That proves the parser
    isn't brittle. Restore with `cp`.
- **AC-5 (markers required)** If the markers are missing from the `.sql` file, the vitest fails
  with a message naming the file, rather than passing on an empty list. Prove it with a planted
  fault on a backup copy.

## Paths you may change
- `supabase/tests/database/018_user_owned_tables.test.sql` (new) (the lane: `backend`).
- **Listed extras:**
  - `apps/web/src/lib/account/__tests__/export-tables-drift.test.ts` (new; lane `web-shell`
    path, test only, granted to this ticket).
  - `docs/tickets/T-0505-user-owned-tables-drift-guard.md`, for the build and accept logs.

## Contract impact
None. No migration. The planted migrations are local only and never committed.

## Definition of done
- Tests for every AC pass, with each planted fault recorded.
- `supabase test db` is green on a fresh `db reset`.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Commits start `T-0505` and cite UF-11.4.

## Notes
- **Parallel:** no file shared with any other post-go-live ticket. If another ticket adds a
  pgTAP file in the meantime, take the next free number.
- `.github/scripts/rls-coverage.test.mjs` reads `EXPORT_TABLES` as an `as const` array (D-0190 §6).
  Keep that shape.

## Build / accept log
