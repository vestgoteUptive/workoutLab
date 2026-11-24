---
id: T-1001
title: Data - profiles.learn_from_edits (default true), data model, generated types, export and delete checks, RLS tests
lane: data
screens: [UF-11.4]
decisions: [D-0278, D-0020, D-0218]
deps: []
status: todo
---
## Why
The opt-out for learning must follow the account, be exported with the profile (NFR-PRIV-4) and go with the account (NFR-PRIV-5). It is the only server change of layer 1 (D-0278).

## Scope
- In: one forward migration `YYYYMMDDHHMMSS_profiles_learn_from_edits.sql` adding `learn_from_edits boolean not null default true`; `docs/data-model.md` (the profiles row and the migrations line); `packages/shared/src/database.gen.ts` and the shared profile type and mapper; a test that the export includes the field; pgTAP tests (backend path, named as extra).
- Out: any new table, openapi, web, engine.

## Acceptance criteria
- AC1 Given a fresh `supabase db reset`, Then existing and new rows have `learn_from_edits` true, the column is `boolean not null`.
- AC2 Given user A updating only `learn_from_edits`, Then `plan_changed_at` is unchanged and `updated_at` advances; Given an update of `goal`, Then `plan_changed_at` advances as before (both values).
- AC3 Given user B, Then B cannot read or write A's column (RLS pgTAP) and `anon` has no access.
- AC4 Given the account export, Then the profile row includes `learn_from_edits`; given account deletion, Then the profile row and the field are gone (the D-0017 delete list test passes unchanged).
- AC5 Given `docs/data-model.md`, Then the column is documented and the migration listed; the column-drift check passes (T-0004).
- AC6 Given `database.gen.ts`, Then it has the field; the shared mapper defaults a missing value to true (an old cached profile).

## Paths you may change
- `supabase/migrations/**` (new migration)
- `supabase/tests/**` (pgTAP; extra, backend path named explicitly)
- `docs/data-model.md`
- `packages/shared/**`

## Contract impact
`docs/data-model.md` — D-0278 names the change. `api/openapi.yaml`: none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1001`.

## Build / accept log
