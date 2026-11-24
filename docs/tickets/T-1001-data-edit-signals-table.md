---
id: T-1001
title: Data - table edit_signals (one row per device and key, owner-only RLS, cascades) and profiles.learn_from_edits and learn_reset_at, with data model, generated types, pgTAP and owned-table lists
lane: data
screens: [UF-11.4, UF-08.2]
decisions: [D-0281, D-0277, D-0020, D-0015, D-0218, D-0251]
deps: []
status: done
---
## Why
The learning counts now sync through the account (D-0281, the owner's answer of 2026-11-24). They need a table the user alone can read and write, that goes with the account, plus the opt-out column and a reset epoch on the profile. This is the whole server side of layer 1; export and delete are T-1002. Plain CRUD under RLS, no openapi change (D-0001).

## Scope
- In:
  - One forward migration `YYYYMMDDHHMMSS_edit_signals.sql` with: `public.edit_signals` exactly as the D-0281 §1 table (PK `id`, unique `(user_id, device_id, key)`, the checks, FKs on `user_id` to `auth.users` and on `exercise_id` and `to_exercise_id` to `exercises(id)` all `on delete cascade`, indexes on both exercise columns); trigger `edit_signals_before_write` (insert sets timestamps, update keeps identity columns and `created_at`, a write with an older `last_seen` is a no-op); owner RLS (select, insert, update, delete for `authenticated`), `anon` no privileges; `profiles.learn_from_edits boolean not null default true`; `profiles.learn_reset_at timestamptz null`; the `profiles_before_write` change (neither column changes `plan_changed_at`; `learn_reset_at := now()` when `learn_from_edits` changes or a client writes `learn_reset_at`).
  - `docs/data-model.md`: the table section, two profile rows, the profile trigger text, the migrations line, the status line (contract change, D-0281).
  - `packages/shared/src/database.gen.ts` (the `edit_signals` block and the two profile fields, taken by hand if the generator rewrites unrelated places, as T-0951 did), the shared `Profile` row type and mapper (missing `learn_from_edits` reads as true, `learn_reset_at` as null), `vendor.mjs` output.
  - pgTAP: a new file for the table and the profile columns; the table is added to `001_schema`, `002_rls_owner`, `007_account_deletion` and the `OWNED_TABLES` list of `018_user_owned_tables`; `.github/scripts/rls-coverage.test.mjs` EXPECTED list.
  - The seed: `supabase/seed.sql` holds the library only (no user rows), so it is unchanged; the AC says so.
- Out: export, delete lists in web code and Deno tests (T-1002), any web code (T-1007, T-1008), engine, openapi (unchanged).

## Acceptance criteria
Test titles start `T-1001 ACn`. pgTAP unless stated.
- AC1 (schema) Given the migration applied, When the schema is compared with `docs/data-model.md`, Then columns, types, nullability, defaults, keys, indexes and checks of `edit_signals` and the two profile columns match (the T-0951 AC1 pattern, plus vitest `database.test.ts`).
- AC2 (owner RLS, both values) Given users A and B each with a row, When A selects, inserts, updates and deletes, Then only A's row is visible and changed and B's is untouched; Given the `anon` role, Then each of the four is refused (42501). A cannot insert a row with B's `user_id` (the default is `auth.uid()`; an explicit other id is refused).
- AC3 (checks) Given rows, Then these are accepted: `swap` with `key = 'swap:bench-press:db-bench-press'`, both ids set; `removal` with `key = 'removal:cable-crunch'` and `to_exercise_id` null; `count` 999; `count` 0 with `asked_at` set. These are rejected: a `swap` without `to_exercise_id`; a `removal` with one; a swap with equal ids; a `key` that does not match `kind` and the ids; `kind = 'other'`; `count` -1 and 1000; `count` 0 with `asked_at` null; `last_seen` earlier than `window_start`; an unknown exercise id.
- AC4 (upsert is idempotent, devices are separate) Given an upsert with `onConflict 'user_id,device_id,key'` of the same payload twice, Then one row; Given count 2 then 3 for the same device and key, Then one row holds 3; Given two `device_id` values for the same key, Then two rows.
- AC5 (stale and server-set values) Given a stored `last_seen` T, When an update arrives with `last_seen` before T, Then the row is unchanged; with `last_seen` equal to T or later it is applied (an `asked_at` set with an equal `last_seen` is applied). A client-supplied `created_at`, `updated_at`, `user_id`, `device_id`, `key`, `kind` or exercise id on update is ignored, and `updated_at` is the server `now()`.
- AC6 (cascades) Given an unused library exercise X referenced by one row as `exercise_id` and another as `to_exercise_id`, When X is deleted, Then both rows are deleted; Given the user deleted, Then their rows are deleted (`007_account_deletion` and `018` list).
- AC7 (profile columns, both values) Given existing and new profiles, Then `learn_from_edits` is true and `learn_reset_at` is null. Given an update of `learn_from_edits` alone, Then `plan_changed_at` is unchanged, `updated_at` advances and `learn_reset_at` is set to the server `now()`; Given an update of `goal`, Then `plan_changed_at` advances as before and `learn_reset_at` is unchanged; Given a client write of `learn_reset_at` with any value, Then it is replaced by `now()`; Given a write that changes neither, Then `learn_reset_at` is unchanged. User B cannot read or write A's values; `anon` has no access.
- AC8 (data model and types) Given `docs/data-model.md`, Then the table, the profile rows and the migration are documented and the column-drift check passes (T-0004). Given `database.gen.ts` and its vendored copy, Then they have the table and both fields, `vendor.mjs --check` passes, and the shared mapper defaults a missing flag to true and a missing epoch to null (an old cached profile).
- AC9 (lists) Given `OWNED_TABLES`, `002_rls_owner` and the rls-coverage EXPECTED list, Then each holds `edit_signals` (11 tables in the owned list) and `rls-coverage` passes.
- AC10 (no seed, no openapi) Given `supabase db reset`, Then `edit_signals` is empty and `supabase/seed.sql` is unchanged; `api/openapi.yaml` has no diff.

Checklist (D-0197 §7): own/other user (AC2), valid/invalid rows (AC3), stale/newer write (AC5), flag changed/not changed (AC7), with/without referenced exercise (AC6).

## Paths you may change
- `supabase/migrations/**` (new migration)
- `docs/data-model.md`
- `packages/shared/**`
- `supabase/tests/**` (pgTAP; extra, the backend lane owns this path, named explicitly as T-0951 did)
- `.github/scripts/rls-coverage.test.mjs` (extra: its expected-table list; orchestrator grant)
- `supabase/functions/_shared/vendor/**` (extra: `vendor.mjs` regenerates `database.gen.d.ts`; orchestrator grant)

## Contract impact
`docs/data-model.md` changes: D-0281 names the change. `api/openapi.yaml`: none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1001`.

Per-package commands: write one command per script, for example `pnpm --filter @workoutlab/shared typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
- Build (data, T-1001, D-0281): migration `20261124120000_edit_signals.sql` (table, checks, `edit_signals_before_write` with the stale-`last_seen` no-op, owner RLS, anon revoked, `profiles.learn_from_edits`/`learn_reset_at`, `profiles_before_write` extended); `docs/data-model.md`; `database.gen.ts` by hand (no Docker for `gen:db`), `toLearningPrefs` mapper, vendor copy regenerated. No openapi diff, `seed.sql` unchanged.
  - AC map (pgTAP unless noted): AC1 `001_schema` (columns, types, nullability, defaults, keys, indexes, FKs, check names) plus vitest `database.test.ts` drift; AC2, AC3, AC4, AC5, AC6, AC7 `026_edit_signals`; AC6 user cascade also `007_account_deletion`; AC8 `database.test.ts` and `t1001-learning-prefs.test.ts` (vitest) and `vendor.mjs --check`; AC9 `002_rls_owner`, `018_user_owned_tables` (11 tables), `rls-coverage.test.mjs`; AC10 no seed or openapi change (git diff).
  - pgTAP ran locally: no Docker or supabase CLI here, so a throwaway Postgres 16 with pgTAP and stubbed Supabase roles/auth ran 001, 002, 006, 007, 018, 021, 023, 024, 026 green (026: 69/69, 002: 81, 007: 24). Only 001 337/349 fail and 015 10/11, which fail on unchanged code too (pgTAP's own objects sit in `public` in that stub); 016/017 need the real auth schema. CI runs `supabase db tests`.
  - Planted faults (migration backup, `cp` restore, `cmp` clean): drop select policy (026 3, 4, 22, 23 and 002 61 red); drop `to_exercise_id` cascade (026 aborts on exercise delete, 001 313 red); drop user cascade (026, 007, 018 1, 001 313 red); remove the stale-`last_seen` guard (026 47, 48, 49 red). All restored, none committed.
  - Gate: shared, engine, functions, lint and typecheck green; `format:check` green; vendor `--check` green. Two reds that only T-1002 or the web ticket can clear, both by the ticket's own AC9 lists: (1) web `export-tables-drift.test.ts` (EXPORT_TABLES vs the 018 list, 11 vs 10) is red until T-1002 adds `edit_signals` to `EXPORT_TABLES`; (2) `.github/scripts/rls-coverage.test.mjs` EXPECTED is "names the web app reaches through `.from()`", so adding `edit_signals` there (AC9) makes AC-2 red until web code reads the table (T-1002 export or T-1008). I left EXPECTED unchanged to keep repo-checks green: the table's isolation is already asserted in 002. Add the name in the first ticket whose web code calls `.from("edit_signals")`. `check-all` reports only ticket-not-on-base (expected before the first commit); its four dependent repo-checks fail for the same reason.
