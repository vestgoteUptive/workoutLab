---
id: T-0535
title: "excluded_exercises table: migration (server-set created_at trigger, PK, index, 4 owner policies, anon revoked, exercises FK cascade), data-model.md, database.gen.ts, pgTAP 001/007/018 + new 019, export.ts EXPORT_TABLES/ORDER_KEYS"
lane: data
screens: [UF-11.4, UF-11.5]
decisions: [D-0199, D-0200, D-0020, D-0136, D-0186, D-0190]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item c; export.ts moved here by D-0200 §1). Flow: wl-build-data (agent data-modeler). About ½ day. Touches supabase/**: push the branch and open a draft PR; merge only on green checks. RELEASE ORDER (D-0200 §2, amended): this ticket stays on its branch until the human has run H-27 from this ticket's worktree and the table is verified on prod; then it merges and pushes. main is never held. -->

## Why
D-0199 §4: the "never suggest" list is a new user-owned table, not a `profiles` array (a full-profile upsert from a second device would lose a concurrent add). The T-0505 drift guard ties pgTAP 018's `OWNED_TABLES` to `EXPORT_TABLES`, so the export change lands here too (D-0200 §1).

## Scope
- In:
  - A new migration `supabase/migrations/<timestamp>_excluded_exercises.sql`:
    - `public.excluded_exercises`: `user_id uuid not null default auth.uid()` references `auth.users(id)` on delete cascade; `exercise_id text not null` references `exercises(id)` **on delete cascade**; `created_at timestamptz not null default now()`; primary key `(user_id, exercise_id)`; an index on `exercise_id`.
    - Trigger function `private.excluded_exercises_before_write`, `before insert or update`: on insert `created_at := now()`; on update keeps `OLD.created_at` and `OLD.user_id` (D-0020 server-set columns, NFR-SYNC-3).
    - RLS on, the four owner policies (select/insert/update/delete where `user_id = auth.uid()`, D-0020); no privileges for `anon`.
  - `docs/data-model.md`: the table, the trigger, and the cascade asymmetry note (`session_sets.exercise_id` and `routine_items.exercise_id` have no `on delete` action; `excluded_exercises` cascades because an exclusion is a preference, not history).
  - `packages/shared/src/database.gen.ts` regenerated; the shared database drift test stays green.
  - pgTAP: `001_schema` (`has_table`, columns block), `018_user_owned_tables` (`OWNED_TABLES` gains `excluded_exercises`), `007_account_deletion` (the rows are gone after the auth delete), and a new `019_excluded_exercises.test.sql` (trigger, isolation, idempotence, both cascades). `supabase/tests/functions/integration/account-delete.test.ts` `OWNED_TABLES` gains the table.
  - `apps/web/src/lib/account/export.ts`: `EXPORT_TABLES` gains `excluded_exercises`; `ORDER_KEYS.excluded_exercises = "exercise_id"` (the table has no `id`); `version` stays 1 (additive, D-0199 §5). Its tests in `apps/web/src/lib/account/__tests__/` (export test and fixtures).
  - **e2e mock (this is the first web code that reads the table):** `tests/e2e/fixtures/supabase-mock.ts` answers `GET …/rest/v1/excluded_exercises*` in `mockSupabaseData` (an optional `excludedExercises` fixture, default `[]`) and in `mockSupabaseEmptyReads`, so no spec hits the 501 backstop. `tests/e2e/uf-11-account.spec.ts` T-0469 AC-1 expects the 8 table keys (its title's "7 tables" becomes "8 tables"). Because this touches `tests/e2e/fixtures/**`, run the whole web e2e suite once before handing back.
- Out:
  - `api/openapi.yaml` (unchanged: `SessionInput.excludeIds` already exists).
  - The Dexie cache, reads and writes on the device (T-0536).
  - Any warm-up check in the DB (warm-up ids are refused in the client, like `equipment`).
  - Running the prod release (H-27, human-run, D-0186).

### Edge cases that are in scope
- **Double tap / second device:** inserting an existing row through `upsert … ignoreDuplicates` is not an error (AC4).
- **Deleting a missing row:** not an error (AC4).
- **A library row is removed:** the exclusion cascades away (AC6).
- **Account deletion:** the rows go with the auth user (AC5) and the export lists them before that (AC7).
- **Zero exclusions:** the export has `excluded_exercises: []` (AC7).
- Offline, time running out, returning after 10 days: no DB behaviour; covered on the device by T-0536.

## Acceptance criteria
Run the pgTAP suite on a fresh local `supabase db reset` (Docker); record the counts in `testsRun`.
- **AC1 / D1 (schema)** `001_schema` asserts `has_table('public','excluded_exercises')`, the three columns with types, nullability and defaults as above, the PK `(user_id, exercise_id)`, the index on `exercise_id`, and both FKs with `on delete cascade`. The column block matches `docs/data-model.md`.
- **AC2 / D2 (server-set created_at)** Given A inserts (A, bench-press) with `created_at` '2020-01-01', Then the stored `created_at` is the transaction's `now()`. When A updates the row's `created_at` to '2020-01-01' or its `user_id` to B, Then both keep their old values.
- **AC3 / D3 (isolation)** Given A has excluded bench-press, When B selects, inserts (with `user_id` A), updates or deletes A's rows, Then B sees 0 rows, the insert fails with an RLS error, and update/delete change 0 rows. Given role `anon`, Then select and insert fail with a privilege error.
- **AC4 / D4 (idempotence)** Given A has (A, bench-press), When A inserts it again with `on conflict (user_id, exercise_id) do nothing`, Then there is one row and no error. When A deletes (A, lateral-raise), which doesn't exist, Then 0 rows change and no error.
- **AC5 / D5 (auth cascade)** Given A has two exclusions, When A's `auth.users` row is deleted, Then A has 0 rows in `excluded_exercises` (`007_account_deletion` and the integration `account-delete.test.ts`).
- **AC6 / D6 (exercise cascade)** Given A excluded bench-press, When the bench-press library row is deleted as `postgres` (in a rolled-back test transaction, with no `session_sets`/`routine_items` referencing it), Then A's exclusion is gone.
- **AC7 / D7 (export)** Given A excluded lateral-raise then bench-press, When A exports (UF-11.4), Then `tables.excluded_exercises` lists bench-press before lateral-raise, paged with `PAGE_SIZE` and ordered by `exercise_id`; the file has 8 table keys and `version` 1. Given no exclusions, Then `tables.excluded_exercises` is `[]`.
- **AC8 / D8 (drift guards)** `018_user_owned_tables` and `export-tables-drift.test.ts` pass with the new table in both lists. Planted fault (backup copy, restored with `cp`): drop `excluded_exercises` from `EXPORT_TABLES` → the drift test fails; drop it from 018's list → 018 check 2 fails.
- **AC9 / D9 (generated types)** `database.gen.ts` has the table's Row/Insert/Update types, and the `packages/shared` database drift test passes.
- **AC10 (e2e)** The UF-11.4 export e2e (`uf-11-account.spec.ts`) passes with `Object.keys(body.tables)` equal to the 7 existing keys plus `excluded_exercises`, in `EXPORT_TABLES` order, and `body.tables.excluded_exercises` equal to `[]`. The full web e2e suite is green with the same test count as `main` (no unclaimed `excluded_exercises` request in any spec).

Checklist (D-0197 §7): empty and non-empty export both covered (AC7). The migration only adds a table; no existing row changes, so no terminal-state fixture applies.

## Paths you may change
- `supabase/migrations/**`, `docs/data-model.md`, `packages/shared/**` (lane)
- `supabase/tests/**` (pgTAP 001, 007, 018, new 019, and the account-delete integration test)
- `apps/web/src/lib/account/export.ts`
- `apps/web/src/lib/account/__tests__/**`
- `tests/e2e/fixtures/supabase-mock.ts`
- `tests/e2e/uf-11-account.spec.ts`

## Contract impact
`docs/data-model.md`: new table `excluded_exercises` and the cascade note. Named by D-0199 §4. `api/openapi.yaml` unchanged.

## Release order (D-0199 §11, D-0200 §2)
**Do not merge until H-27 is ticked.** `main` deploys to prod on green CI, and `export.ts` reads this table, so the table must be on prod first. The orchestrator raises H-27 when this ticket's draft PR is green; the human runs the release in this ticket's worktree (D-0200 §2).

## Definition of done
Every AC has a passing test · pgTAP green on a fresh reset · `pnpm -w typecheck lint test` green · full web e2e suite green · draft PR checks green (`checks`, `supabase`, `playwright e2e`) · contract change linked to D-0199 · commits start with `T-0535:` and cite UF-11.4 / UF-11.5.

## Build / accept log
- 2026-10-07 data-modeler (build). Start: clean, HEAD 13d1f38. Migration `20261007120000_excluded_exercises.sql` (table, PK, `exercise_id` index, `private.excluded_exercises_before_write`, 4 owner policies, anon revoked, both FKs cascade); data-model.md section + cascade asymmetry note; `database.gen.ts` hand-written in CLI shape (no `supabase` CLI or Docker on this host); export.ts `EXPORT_TABLES`/`ORDER_KEYS` (version 1); e2e mock route in `mockSupabaseData` (`excludedExercises`, default `[]`) and `mockSupabaseEmptyReads`; 002 gains the table in every isolation block (needed by the T-0402c rls-coverage guard).
  - AC1 → 001 `excluded_exercises` block (16 asserts, plan 245→261). AC2/AC3/AC4/AC6 → 019 D2/D3/D4/D6 (27 asserts) + 002 (+7). AC5 → 007 (+3, plan 14), 019 D5, `account-delete.test.ts` OWNED_TABLES. AC7 → `export.test.ts` "T-0535 AC7" (4 tests) + AC2 shape tests. AC8 → 018 list + `export-tables-drift.test.ts`. AC9 → `packages/shared/test/database.test.ts` "T-0535 AC9" + AC15 table list. AC10 → `uf-11-account.spec.ts` T-0469 AC-1 (8 keys, `excluded_exercises` `[]`).
  - Red/faults (backup + `cp` restore): export.ts without the table → 7 fails (drift + AC2 ×2 + AC7 ×4); 018 without the table → drift test fails. 018 check 2 / pgTAP not run locally.
  - pgTAP: NOT RUN — no `supabase` CLI and no Docker on this host; `supabase db reset` + `supabase test db` left to the draft PR's `supabase` job. account-delete Deno integration likewise CI-only.
  - Gate: `-w typecheck lint test --concurrency=1` 19/19 green (web 3737 tests); `format:check` green; `check-all` exit 0; `test:repo-checks` 310/311 — red: `.github/scripts/rls-coverage.test.mjs` "the web app reaches exactly the 12 expected names" now finds 13 (`excluded_exercises`, already covered by 002). Fix is an infra-lane one-liner (EXPECTED + "13"), not in this ticket's paths. e2e `uf-11-account.spec.ts` 10/10; full web e2e suite not run (left to orchestrator per brief).
