---
id: T-0951
title: Data, a table for each user's own weight step per exercise
lane: data
screens: [UF-04.2]
decisions: [D-0251, D-0259, D-0199, D-0202, D-0017, D-0200, D-0020]
deps: []
status: done
---
## Why
Users need their own weight step per exercise (1.25 kg for micro plates, 5 kg on leg press), which the library's `increment_kg` cannot give (`docs/specs/rir-progression-and-increments.md`, D-0251). The override lives in a new user-owned table in the family of `excluded_exercises` and `favorite_exercises`. This ticket also checks that the `session_sets_live` view exposes `rir`, so T-0953 can read it.

## Scope
- In:
  - Migration for `exercise_settings` exactly as the spec's data-model table: PK `(user_id, exercise_id)`, `user_id` default `auth.uid()` FK `auth.users` on delete cascade, `exercise_id` FK `exercises(id)` on delete cascade, `increment_kg numeric(4,2) not null` with checks `between 0.25 and 10` and `increment_kg * 4 = round(increment_kg * 4)`, `created_at`/`updated_at` default `now()`, index on `(exercise_id)`.
  - Trigger `exercise_settings_before_write`: insert sets both timestamps to `now()`; update keeps `user_id`, `exercise_id`, `created_at`, sets `updated_at := now()`; client values ignored.
  - RLS: select, insert, update, delete for the owner (`authenticated`); `anon` no privileges.
  - `docs/data-model.md` gains the table (contract change, D-0251).
  - `packages/shared/src/database.gen.ts` regenerated with the table.
  - Account export (`apps/web/src/lib/account/export.ts`) includes the table ordered by `exercise_id`; the D-0017 account-delete list includes it. Both tested.
  - Check `session_sets_live` exposes `rir`. If it does not, fix it in this migration (data lane owns migrations) and say so in the log.
- Out: any UI, store or queue (T-0954, T-0956); engine; Edge Functions and `api/openapi.yaml` (no change, plain CRUD, D-0001); `session_sets.rir` (already exists, smallint 0-5 nullable).

## Acceptance criteria
- AC1 Given the migration applied, When the schema is compared with `docs/data-model.md`, Then columns, types, nullability, defaults, keys, index and checks match.
- AC2 Given user A and user B each with a row, When A selects, updates and deletes, Then only A's row is visible and changed; B's row is untouched (pgTAP).
- AC3 Given the `anon` role, When it selects, inserts, updates or deletes, Then each is refused.
- AC4 Given `increment_kg` values 0, 0.1, 10.25 and 11, When inserted, Then each is rejected by a check; 0.25, 1.25 and 10 are accepted.
- AC5 Given a row, When it is updated with a client-supplied `created_at`, `updated_at` or a different `user_id`, Then `created_at` and `user_id` are unchanged and `updated_at` is the server `now()`.
- AC6 Given a row for exercise X, When exercise X is deleted, Then the row is deleted; Given user deleted, Then the row is deleted.
- AC7 Given an upsert with `onConflict: 'user_id,exercise_id'` for the same exercise twice (1.25, then 2.5), When read, Then one row holds 2.5.
- AC8 Given a user with `exercise_settings` rows for `z-ex` and `a-ex` (inserted in that order), When the account export runs, Then the file lists them ordered by `exercise_id` (`a-ex` first); Given a user with none, Then the key is present and empty.
- AC9 Given a user with rows, When the account is deleted (D-0017), Then no `exercise_settings` row remains.
- AC10 Given a `session_sets` row with `rir` 0 and one with `rir` null, When read through `session_sets_live`, Then `rir` is returned as 0 and null.

Checklist (D-0197 §7): the AC8 sibling covers an empty table; AC10 covers both null and non-null; no migration upgrade fixture here (the table is new), tombstones do not apply because the table has no `deleted_at`.

## Paths you may change
- `supabase/migrations/**` (new migration)
- `supabase/tests/**` (pgTAP tests; extra, the backend lane owns this path, named explicitly for this ticket)
- `docs/data-model.md`
- `packages/shared/src/database.gen.ts` (and its tests under `packages/shared/**`)
- `apps/web/src/lib/account/export.ts` and `apps/web/src/lib/account/__tests__/**` (extra: the export and delete list; web-shell paths, named explicitly)
- Account-delete list file wherever D-0017's list lives (find with grep; name it in the log)
- `.github/scripts/rls-coverage.test.mjs` (extra: its expected-table list; orchestrator grant)
- `supabase/functions/_shared/vendor/**` (extra: `vendor.mjs` regenerates `database.gen.d.ts`; orchestrator grant)
- `supabase/functions/**/*.test.ts` (extra: the account-delete test lists owned tables; orchestrator grant)

## Contract impact
`docs/data-model.md` changes: needs D-0251 (decided; amended by D-0259 §16). `api/openapi.yaml` unchanged.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0951` and cite UF-04.2.

Per-package commands: write one command per script, for example `pnpm --filter @workoutlab/shared typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
- Base: worktree `t/T-0951-exercise-settings` from `main-hzlbfc` (HEAD ed7e8053), clean at start.
- Built: migration `20261112120000_exercise_settings.sql` (table, two checks, index, `private.exercise_settings_before_write`, owner RLS, anon revoked); `docs/data-model.md` section and status line; `database.gen.ts` (table block added by hand in the repo's older generator format: the `supabase@latest` CLI also rewrites 9 unrelated places, so only the generated `exercise_settings` block was taken); export (`EXPORT_TABLES`, `ORDER_KEYS`, last key); D-0017 delete list = the `OWNED_TABLES` drift list in pgTAP 018 (the delete itself is the auth cascade) plus the account-delete Deno integration test list.
- `session_sets_live`: no fix needed. It is `select *` over `session_sets`, which has had `rir` since the first migration. AC10 proves it.
- AC map: AC1 `001_schema` (21 asserts from the doc table) + vitest `database.test.ts`; AC2 `023` (B and A sides); AC3 `023` (anon select/insert/update/delete 42501); AC4 `023` (0, 0.1, 10.25, 11, 1.1 rejected; 0.25, 1.25, 10 accepted); AC5 `023`; AC6 `024` (exercise and user delete) and `001` (FK cascade); AC7 `024`; AC8 `export.test.ts` (a-ex before z-ex, empty gives `[]`, read error fails all); AC9 `007_account_deletion` + `account-delete.test.ts` (Deno, needs the functions stack; not run here); AC10 `024`.
- Test-data note: 1.5 is a valid step (6 quarters), so the "not a multiple" case uses 1.1.
- Red on unfixed code: without the migration, `supabase test db` failed 001 (19), 007, 018 (1), 023 (4) and `024`; with `export.ts` reverted, vitest `src/lib/account` failed 7 tests (drift, shape, three new AC8 tests, count). Both restored from backup copies; now green.
- Existing tests updated for the new 10th table (counts 9 to 10, "last key"), not weakened.
- Also touched, outside the ticket's path list: `.github/scripts/rls-coverage.test.mjs` (EXPECTED table list, a drift guard) and `supabase/functions/_shared/vendor/shared/database.gen.d.ts` (output of `vendor.mjs`; `--check` demands it). Grants for both need adding on main.
- `check:repo` reports `ticket-not-on-base` here only because the stale `origin/main` is picked as the diff base; the ticket is on local `main`.
- Also touched: `supabase/tests/database/002_rls_owner.test.sql` (+7 asserts; `rls-coverage` requires every table the web reaches to appear in 002's two-user checks). Gate: turbo typecheck lint test --force green (19/19), format:check, gen-seed, vendor checks, test:repo-checks and pgTAP (24 files, 867 tests) pass. `check:repo` only fails with the stale-base `ticket-not-on-base` above.
