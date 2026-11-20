---
id: T-0951
title: Data, a table for each user's own weight step per exercise
lane: data
screens: [UF-04.2]
decisions: [D-0251, D-0259, D-0199, D-0202, D-0017, D-0200, D-0020]
deps: []
status: in-progress
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

## Contract impact
`docs/data-model.md` changes: needs D-0251 (decided; amended by D-0259 §16). `api/openapi.yaml` unchanged.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0951` and cite UF-04.2.

Per-package commands: write one command per script, for example `pnpm --filter @workoutlab/shared typecheck`, then a separate `… lint`, then a separate `… test`.
