---
id: D-0033
title: Exercise library gains kind, bodyweight, increment_kg, default_duration_s; equipment spelling reconciled
status: revisit
date: 2026-09-28
by: content-curator (T-0103a)
area: data
supersedes: null
---
## Context
The board (T-0101 follow-up, folded into T-0103a/b) asks the exercise library for four things
D-0022 doesn't have yet: a `kind` (`exercise | warmup`) so the engine's warm-up generator
(D-0024 rule 7) has ≥ 2 general (area-less) moves to round-robin over, `increment_kg` and
`default_duration_s` for progression and timed holds, a `bodyweight` flag, and an equipment
vocabulary `[barbell, rack, bench, dumbbell, cable, machine, pullup-bar]`. D-0022 §5 already has
an equipment vocabulary (`none, dumbbell, bench, barbell, rack, cable, machine, pull-up-bar,
kettlebell, band`) with a different spelling for the pull-up bar and no `kind`/`bodyweight`/
`increment_kg`/`default_duration_s` fields. This decision reconciles the two and names the one
place this ticket's tests read the letter of a T-0103 AC differently than a literal "every file
in the library" would.

## Decision
1. **Equipment spelling.** Adopt `pullup-bar` (matches the board follow-up and D-0029/engine
   naming) in place of D-0022's `pull-up-bar`. The vocabulary stays a superset:
   `none, dumbbell, bench, barbell, rack, cable, machine, pullup-bar, kettlebell, band`.
   `kettlebell`/`band` are not in the board's list because that list names only the full-gym
   items relevant to the engine snippet, not the whole vocabulary; keeping them is not a
   contradiction. `profiles.ts` and `schema.json` use the new spelling; there is no T-0103a
   content using the old one, so no migration is needed.
2. **`kind`** (`"exercise" | "warmup"`, required). Warm-up rows are library rows too (same file
   shape, same folder), so the schema, loader and every id/name/licence/no-images check
   (AC1, AC2, AC7, AC8, AC9) apply to them unchanged.
3. **`bodyweight`** (boolean, required): true when the row has no external load. Bodyweight
   rows never carry `increment_kg` (progression is by reps, not load); non-bodyweight rows
   (T-0103b) must carry it. T-0103a is bodyweight-only, so every row here has
   `bodyweight: true` and no row has `increment_kg`.
4. **`increment_kg`** (positive number, kg): required exactly when `bodyweight === false`,
   forbidden otherwise.
5. **`default_duration_s`** (positive integer, seconds): required exactly when `timed === true`,
   forbidden otherwise. This covers both D-0024's warm-up length (≈ 40 s per move) and the
   timed core holds already required by AC14 (plank etc.).
6. **`kind: "warmup"` rows** are the engine's warm-up moves (D-0024 rule 7):
   `equipment` is fixed to `["none"]`, `bodyweight` is fixed `true`, `timed` is fixed `true`.
   `areas` may be `{}` — a "general" move, D-0024's round-robin fallback — or a non-empty map
   for an area-targeted warm-up. `variants` may be empty: the swap screens (UF-05.1, UF-08.3)
   don't offer warm-up alternatives in v1. `type`/`level` stay required for schema uniformity
   (set to `isolation`/`beginner` by convention); the engine does not read them for warm-ups.
   This ticket ships exactly 2 warm-up rows, both general, meeting D-0024's "≥ 2 general moves".
7. **Test-suite scoping, recorded as the one difference from a literal reading of the T-0103
   ticket text:** AC3 (area-weight rules: every exercise has ≥ 1 area at 1, isolation has
   exactly 1, compound has ≥ 2 keys) and AC6 (every exercise has ≥ 1 variant, symmetric,
   sharing a primary area) are read as scoped to `kind: "exercise"` rows. `kind: "warmup"` rows
   are exempt from both, by point 6 above. Every other AC (1, 2, 4, 5, 7, 8, 9, 11–17) applies to
   the whole library, warm-ups included.

## Consequences
- `schema.json` gains `kind`, `bodyweight`, `increment_kg`, `default_duration_s` and the
  `pullup-bar` spelling; conditional (`if`/`then`) rules encode points 3–6.
- `src/profiles.ts` exports the equipment vocabulary and the three profiles per D-0022 §6,
  unchanged in shape.
- T-0103b's dumbbell/full-gym rows carry `bodyweight: false` and `increment_kg`.
- T-0100/T-0102 (data, follow-up already on the board) add `exercises.kind`, `increment_kg`,
  `default_duration_s` and a `bodyweight` column, and a `kind = 'warmup'` filter for T-0203's
  seed of warm-up-only rows. This decision doesn't change `docs/data-model.md` itself.
- T-0201 (engine, rule 7) reads `kind = 'warmup'` rows for the warm-up generator and `areas: {}`
  as "general".

## Revisit when
T-0201 finds it needs more than "general vs. area-targeted" for warm-up selection, or T-0100
picks different column names for the four new fields.
