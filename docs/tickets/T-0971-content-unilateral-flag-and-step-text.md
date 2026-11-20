---
id: T-0971
title: Mark the 16 one-side-at-a-time exercises in the library and fix their step text
lane: content
screens: [UF-04.2, UF-09.3]
decisions: [D-0260, D-0261, D-0262, D-0263]
deps: []
status: ready
---
## Why
Users log "10" for a dumbbell row and it must never be read as 20. The library needs an optional `unilateral` field (`arm`, `leg`, `side`) on the rows where one set means all reps on one side, then the other (spec `docs/specs/unilateral-exercises.md`, D-0260 §2, D-0263 §3 §9). This ticket is the content half: schema, loader type, the 16 rows, step-text fixes and the seed. It is a display and content flag only; the engine does not read it (D-0262).

## Scope
- In:
  - `data/exercises/schema.json`: optional `unilateral`, enum `["arm","leg","side"]`; `data/exercises/src` type and loader carry it.
  - The 16 rows of the spec audit table get the value: 13 `leg` (single-leg-deadlift, single-leg-calf-raise, split-squat, bulgarian-split-squat, barbell-lunge, dumbbell-lunge, forward-lunge, lateral-lunge, glute-kickback-machine, donkey-kick, fire-hydrant, banded-glute-kickback, cable-kickback), 1 `arm` (dumbbell-row), 2 `side` (cable-woodchop, side-plank).
  - Step text: dumbbell-row gets a switch step; banded-glute-kickback, cable-kickback, cable-woodchop replace "repeat" with switch text; side-plank says seconds are per side. Steps stay 5 to 120 characters (steps may be merged).
  - machine-torso-rotation, the alternating rows and the two-hands-on-one-weight rows stay unflagged and unchanged.
  - `supabase/scripts/gen-seed.mjs`: `unilateral` column with `sqlOrNull`; regenerate `supabase/seed.sql`; gen-seed test and `seed.test.ts` updated; `--check` stays byte-identical.
  - Valid and invalid `unilateral` fixtures in the schema tests. The 108-row pin is unchanged.
  - The curator may change a value with a note in the ticket log.
- Out: migration, data-model, shared types (T-0972); any web code; engine; plan-row labels.

## Acceptance criteria
- AC1 Given `schema.json`, When a row has `unilateral: "arm"`, `"leg"` or `"side"`, Then it validates; When it has `"both"`, `""` or `3`, Then validation fails; When the field is absent, Then it validates.
- AC2 Given the library, When rows are read, Then exactly the 16 listed rows carry `unilateral` with the listed values (13 leg, 1 arm, 2 side, or the curator's logged changes) and the other 92 rows carry none, machine-torso-rotation included.
- AC3 Given each flagged row, When its steps are read, Then at least one step contains "switch" in any form ("switch feet", "then switch"); Given side-plank, Then a step says seconds are per side; Given every step of every row, Then its length is 5 to 120 characters.
- AC4 Given the library, When counted, Then it has 108 rows (pin unchanged) and the unflagged rows' text is byte-identical to before.
- AC5 Given `gen-seed.mjs`, When it runs, Then `seed.sql` has a `unilateral` column for every row (16 values, 92 nulls); When `--check` runs on the regenerated file, Then it passes.
- AC6 Given a loader read of dumbbell-row and of barbell-row, Then the first returns `unilateral: "arm"` and the second has no value (both sides, the offline and older-cache reading).

Checklist (D-0197 §7): AC1 and AC2 cover both values of flagged and unflagged. No online/offline, empty or auth condition applies to this content change; no migration here.

## Paths you may change
Lane `content`: `data/exercises/**` (schema, src types and loader, rows, fixtures, tests). Extras for this ticket only: `supabase/scripts/gen-seed.mjs`, `supabase/scripts/*.test.*` for gen-seed, `supabase/seed.sql` (regenerated), `supabase/tests/seed.test.ts` if that is where the seed test lives.

## Contract impact
`data/exercises/schema.json` and the seed shape gain an optional field, per D-0260 §2 and D-0263 §3 §9. `docs/data-model.md`, `api/openapi.yaml` unchanged here (data-model is T-0972).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0971` and cite screen IDs.

Per-package commands: one command per script (`pnpm --filter <pkg> typecheck`, then `… lint`, then `… test`).

## Build / accept log
