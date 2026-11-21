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

### Build log (content-lane builder, branch `t/T-0971-unilateral-content`)
- Schema: `unilateral` enum `["arm","leg","side"]`, optional. `Unilateral` type and optional `Exercise.unilateral` in `data/exercises/src/index.ts` (the loader is a plain JSON parse, so it carries the field). Fixtures: valid `unilateral-{arm,leg,side}.json`, invalid `unilateral-{both,empty,number}.json`.
- Rows: the 16 of D-0263 §9 flagged (13 leg, 1 arm, 2 side); no value changed by the curator. machine-torso-rotation unflagged. Only those 16 library files differ from the base (`git diff --name-only`); in the other 92 rows nothing changed.
- Step text (the library field is `instructions`): dumbbell-row got "Finish all reps, then switch arms."; banded-glute-kickback and cable-kickback now end "Return with control, and after all reps switch legs."; cable-woodchop "... switch sides."; side-plank got a 4th step "The seconds are per side: hold the time on one side, then the other." The text test (`text.test.ts`) requires one sentence per step, so the switch text is a single sentence. All steps 5 to 120 characters, at most 5 per row.
- Seed (deviation, needs a decision): `gen-seed.mjs` has the `unilateral` column with `sqlOrNull`, but it emits it only when a file in `supabase/migrations` mentions `unilateral` (`unilateralColumnInMigrations()`), because `exercises.unilateral` does not exist until the T-0972 migration and a seed naming it would fail on every database. So `supabase/seed.sql` was regenerated for the step-text changes only and has no `unilateral` column yet. `--check` passes. The gen-seed tests prove the column-on output (16 values, 92 nulls, 13/1/2) and the column-off output. Hand-off to T-0972: once its migration lands, `--check` fails until `node supabase/scripts/gen-seed.mjs` is rerun and `seed.sql` committed; that run produces the AC5 seed. There is no `seed.test.ts` in the repo; `supabase/tests/scripts/gen-seed.test.mjs` is the seed test.
- Tests: `data/exercises/test/unilateral-t0971.test.ts` (AC1, AC2, AC3, AC4 count, AC6) and 4 new cases in `supabase/tests/scripts/gen-seed.test.mjs` (AC5). With the source changes stashed and the tests kept, 16 library tests fail and the gen-seed test file fails to load; with them back, 364 library tests and 12 gen-seed tests pass.
- Gates: `format:check`, `gen-seed --check` and `vendor --check` pass; typecheck and lint pass in all packages. `check:repo` and the tests that call it (design-tokens, landing, `test:repo-checks` AC21 cases) fail with `lane-path-not-owned` for 29 files this ticket does not touch (T-0951, T-0952, T-0955, T-0962, D-0264 and others). Cause: the lane check takes the merge base nearest HEAD of `origin/main`, which is older than `main-hzlbfc`, so earlier tickets' files count as this diff. No file of this ticket is listed.
- Unmet: AC5 in `seed.sql` (column absent until T-0972, see above).
