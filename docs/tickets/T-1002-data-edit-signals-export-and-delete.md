---
id: T-1002
title: Data - edit_signals in the account export (11th table, ordered by id), in the delete lists, and the e2e expected table count 10 to 11
lane: data
screens: [UF-11.4]
decisions: [D-0281, D-0136, D-0017, D-0251]
deps: [T-1001]
status: todo
---
## Why
The counts are the user's data (NFR-PRIV-4) and go with the account (NFR-PRIV-5). T-0951 did the same for `exercise_settings`; this ticket repeats that for `edit_signals` (D-0281 §5), after the table exists.

## Scope
- In:
  - `apps/web/src/lib/account/export.ts`: `edit_signals` appended to `EXPORT_TABLES`, `ORDER_KEYS.edit_signals = "id"` (a unique column, so paging by 1000 is stable); the export format stays version 1.
  - The export tests and fixtures under `apps/web/src/lib/account/__tests__/` (counts 10 to 11, "last key", the drift test against the owned-table list), `tests/e2e/uf-11-account.spec.ts` (expects 11 tables, the key list, `edit_signals` `[]`) and `tests/e2e/fixtures/supabase-mock.ts` (the new table).
  - The account-delete Deno integration test's owned-table list (`supabase/tests/functions/integration/account-delete.test.ts`).
- Out: the table and pgTAP lists (T-1001), the device wipe of the ledger (T-1007, T-1008), any UI.

## Acceptance criteria
Test titles start `T-1002 ACn`.
- AC1 (tables, both values) Given a user with `edit_signals` rows, Then the export file's `tables` keys are the 11 tables with `edit_signals` last; Given a user with none, Then the key is present and `[]`.
- AC2 (order and paging) Given 1,001 rows (a page boundary), Then every row appears once, ordered by `id`; given rows inserted as `z` then `a` ids, Then `a` is first.
- AC3 (all or nothing) Given a read error on `edit_signals`, Then the whole export rejects with `export_failed` and no file is offered.
- AC4 (profile fields) Given the export, Then the profile row includes `learn_from_edits` and `learn_reset_at`.
- AC5 (drift) Given `EXPORT_TABLES` and the DB owned-table list differing by one table, Then the drift test fails; with both at 11 it passes.
- AC6 (delete) Given a user with rows, When the account is deleted, Then no `edit_signals` row remains (the Deno integration test list holds the table; it needs the functions stack and is named in the log if not run).
- AC7 (e2e, both values) Given the Account page, When "Export my data" is used, Then the file has 11 tables, 2 sessions and 3 sets as before; given the user has no signals, `edit_signals` is `[]`.

Checklist (D-0197 §7): rows/none (AC1), one page/two pages (AC2), read ok/error (AC3).

## Paths you may change
- `apps/web/src/lib/account/export.ts` and `apps/web/src/lib/account/__tests__/**` (extra: web-shell paths, named explicitly as T-0951 did)
- `tests/e2e/uf-11-account.spec.ts`, `tests/e2e/fixtures/supabase-mock.ts` (extra: qa paths, orchestrator grant)
- `supabase/tests/functions/integration/account-delete.test.ts` (extra: the delete list)
- `packages/shared/**`

## Contract impact
none (the schema is T-1001; the export file gains one key).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1002` and cite UF-11.4.

## Build / accept log
