---
id: T-0631
title: "profiles.bar_kg + profiles.plates_kg (D-0218): migration, data-model.md, database.gen.ts, toBarbell mapper, pgTAP 001/006 + new 021, export test, e2e mock profile row"
lane: data
screens: [UF-09.3, UF-11.4]
decisions: [D-0218, D-0217, D-0020, D-0021, D-0201]
deps: []
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1, D-0218). Flow: wl-build-data (agent data-modeler). About ⅓ day (two columns, two checks, no trigger change). Touches supabase/**: push the branch and open a draft PR; merge only on green checks. Release is automatic on merge (D-0201). Spec: docs/specs/cobalt-mock-behaviour.md §3.1. -->

## Why
Plate loading on UF-09.3 ("Each side 25 + 15 kg", D-0217) needs the user's bar weight and plate sizes. `profiles` has neither (D-0066 §13). D-0218 adds them as synced profile columns so they survive sign-out, follow the user across devices and are exported.

## Scope
- **In:**
  - A migration adding `profiles.bar_kg numeric(5,2) not null default 20` with check `profiles_bar_kg_range` (`between 0 and 50`), and `profiles.plates_kg numeric(5,2)[] not null default '{25,20,15,10,5,2.5,1.25}'` with check `profiles_plates_kg_valid` (one-dimensional, lower bound 1, `cardinality <= 12`, every element `> 0` and `<= 50`, no duplicates). Non-destructive; no destructive-approved header.
  - `docs/data-model.md`: both rows in the `profiles` table, the two checks in its Checks line, the migration in the Status line, D-0218 in the heading.
  - `packages/shared/src/database.gen.ts` regenerated; `toBarbell(row)` in `packages/shared` returning `{ barKg: number; platesKg: number[] }` (numbers, sizes largest first). Vendor regen for `supabase/functions/_shared/vendor/shared/**` if the vendor check needs it.
  - pgTAP: `001_schema` column list and types; `006_profiles_and_targets` defaults and checks; a new `021_profiles_bar_plates.test.sql` for the edge values.
  - `tests/e2e/fixtures/supabase-mock.ts`: the mocked profile row gains `bar_kg: 20` and `plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25]`.
- **Out:**
  - Any web read or write (T-0632, T-0633), the UF-09.3 line (T-0634).
  - `EngineProfile`/`toEngineProfile` (unchanged, D-0218 §4). `api/openapi.yaml` (unchanged).

## Acceptance criteria
- **AC1 (defaults, pgTAP).** Given a profile inserted without the columns, When it is read, Then `bar_kg = 20` and `plates_kg = '{25,20,15,10,5,2.5,1.25}'`. Given an existing profile row from before the migration (the fixture inserts it first, then applies the column add in the test transaction or uses the reset DB's seeded row), Then it reads the same defaults.
- **AC2 (bar range).** `bar_kg` 0, 15, 20 and 50 are accepted; −0.01, 50.01 and null are rejected (`23514` for the checks, `23502` for null). Each value is a case.
- **AC3 (plates checks).** `'{}'` and `'{20,10,0.5}'` are accepted. Rejected with `23514`: `'{0}'`, `'{-5}'`, `'{51}'`, `'{20,20}'` (duplicate), 13 distinct sizes, `'{{20},{10}}'` (two-dimensional) and `'[0:1]={20,10}'` (lower bound 0). Null is rejected with `23502`.
- **AC4 (write rules).** Given a profile with `plan_changed_at` T, When the owner updates only `bar_kg` and `plates_kg`, Then the update succeeds and `plan_changed_at` is still T. Another user's update of the row affects 0 rows (RLS). An upsert that omits both columns keeps their stored values.
- **AC5 (schema drift).** `001_schema`'s `profiles` column list matches `docs/data-model.md` (the existing AC1 column-block check stays green).
- **AC6 (mapper, vitest).** `toBarbell` on a row with `bar_kg "15.00"` (string, as PostgREST may send numerics) and `plates_kg ["1.25","25","10"]` returns `{ barKg: 15, platesKg: [25, 10, 1.25] }`; on `plates_kg []` returns `platesKg: []`.
- **AC7 (export).** The UF-11.4 export test (`apps/web/src/lib/account/__tests__/`) asserts the exported profile object contains `bar_kg` and `plates_kg` with the row's values. No export-code change is expected; if one is needed, it is listed in the log.
- **AC8 (account deletion).** The existing `007_account_deletion` test still removes the profile row (no new table, no new FK).

Checklist (D-0197 §7):
- Default and explicit values, accepted and rejected values, own and other user, and pre-existing and new rows are all covered.
- No terminal row states apply (no tombstone or status column on `profiles`); the pre-existing-row case is AC1.

## Paths you may change
- `supabase/migrations/**`, `docs/data-model.md`, `packages/shared/**` (lane)
- `supabase/tests/**` (pgTAP 001, 006, new 021)
- `supabase/functions/_shared/vendor/shared/**` (vendor regen)
- `apps/web/src/lib/account/__tests__/**` (AC7 test only)
- `tests/e2e/fixtures/supabase-mock.ts` (the profile row)
- `docs/tickets/T-0631-profiles-bar-and-plates.md` (log only)

## Contract impact
`docs/data-model.md`: two new `profiles` columns and two checks. Named by D-0218.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green (forced: contract change) · pgTAP green on the draft PR · full web e2e suite green (fixtures touched) · commit messages start with `T-0631` and cite UF-09.3 and UF-11.4.

## Build / accept log
