---
id: T-0972
title: Store the one-side flag in the database and carry it to the web library cache
lane: data
screens: [UF-04.2, UF-09.3]
decisions: [D-0260, D-0262, D-0263]
deps: [T-0971, T-0951]
status: todo
---
## Why
The flag from T-0971 must reach the app. D-0263 §1 §2 puts it on the web-only `ExerciseDetail` (never the engine's `LibraryExercise`), with a shared mapper and no IndexedDB bump: `refreshLibrary` replaces the cached rows, so the field backfills on the next refresh and a row without it reads as both sides. Lands after T-0951 because both add a migration and touch `docs/data-model.md` and `database.gen.ts`.

## Scope
- In:
  - One new migration: `exercises.unilateral text null check (unilateral in ('arm','leg','side'))`.
  - pgTAP test: the check rejects `'both'`, accepts `'arm'`, `'leg'`, `'side'` and null.
  - `docs/data-model.md` row for the column.
  - `database.gen.ts` regenerated, including the vendored `database.gen.d.ts`.
  - `packages/shared`: `Exercise` type gets `unilateral: 'arm' | 'leg' | 'side' | null`; mapper `toUnilateral(row)` (null to null, unknown or missing to null).
  - Web `ExerciseDetail` (`apps/web/src/lib/offline/db.ts`, written from `select("*")`) carries `unilateral` through the mapper.
- Out: engine `LibraryExercise`, the vendored engine copy, IndexedDB version bump, openapi, any screen text.

## Acceptance criteria
- AC1 Given the migration applied, When `exercises.unilateral` is set to `'both'`, Then the insert or update fails the check; When set to `'arm'`, `'leg'`, `'side'` or null, Then it succeeds.
- AC2 Given the seed from T-0971, When the migration and seed run together, Then dumbbell-row has `'arm'`, side-plank `'side'`, single-leg-calf-raise `'leg'` and barbell-row null.
- AC3 Given a database row with `unilateral: 'leg'`, When mapped to `Exercise` and back to a database row, Then `unilateral` is `'leg'`; Given null, Then it stays null; Given an unknown value `'both'` or a missing field, Then `toUnilateral` returns null.
- AC4 Given a library fetch online, When `refreshLibrary` runs, Then the cached `ExerciseDetail` for dumbbell-row has `unilateral: 'arm'`; Given a cached row written before this change (no field), Then it reads as null (both sides, no label) with no IndexedDB version change and no error; Given the network is off, Then the cached rows are served unchanged.
- AC5 Given `packages/engine` and `supabase/functions/_shared/vendor/**`, When searched, Then neither contains `unilateral` (engine stays unaware; D-0262).
- AC6 Given `docs/data-model.md` and `database.gen.ts`, Then both list the column and the generated types match the migration (schema drift check passes).

Checklist (D-0197 §7): AC4 covers online, offline and old-cache. The migration fixture includes every terminal exercise row state in use (rows with null and non-null values); `exercises` has no tombstone or rejected state, so none applies.

## Paths you may change
Lane `data`: `docs/data-model.md`, `supabase/migrations/**`, `packages/shared/**`. Extras for this ticket only: `supabase/tests/**` (pgTAP file), `apps/web/src/lib/offline/db.ts` and the `ExerciseDetail` write mapping in `apps/web/src/lib/offline/**` with its test.

## Contract impact
`docs/data-model.md` changes (new column) with `database.gen.ts`: needs D-0260 §3 and D-0263 §3. `api/openapi.yaml` unchanged.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0972` and cite screen IDs.

Per-package commands: one command per script.

## Build / accept log
