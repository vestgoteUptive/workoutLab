---
id: D-0044
title: exercises.external_load = NOT bodyweight, inverted once, in the seed only; DB → engine is a straight rename
status: decided
date: 2026-09-28
by: triage (TR-0016)
area: data
supersedes: null
---
## Context
TR-0016. The same fact ("this exercise has no external load") has two names with opposite
polarity:
- **Content JSON** (`data/exercises`, D-0033 §3): `bodyweight: boolean`, required. `true` means
  no external load. `increment_kg` is forbidden when `bodyweight` is true and required when it is
  false (D-0033 §4).
- **DB** (`exercises`, D-0035, `docs/data-model.md`): `external_load boolean not null default
  true`. `false` means bodyweight. The name is required by the AC23 / NFR-PRIV-2 guard, which
  rejects any column matching `body_?weight`.
- **Engine / API** (`LibraryExercise`, D-0037 §6, D-0040 §3): `externalLoad: boolean`, the same
  polarity as the DB.

D-0033's Consequences line ("T-0100/T-0102 … add … a `bodyweight` column") came before D-0035's
column choice. D-0033's own "Revisit when T-0100 picks different column names" condition has now
fired. Neither decision says how the inverted boolean is mapped. A seed that copies the flag
across unchanged would silently flip every row, and none of the current tests would catch it.

Both names are already correct in their own contracts, so this decision does not rename either
one. TR-0016 option 2 would rename a field that has shipped and been tested, in 72–96 files, and
would gain nothing. Option 3 leaves the bug likely.

## Decision
1. **The mapping (content JSON → DB).** `exercises.external_load = NOT bodyweight` for every row,
   `kind: "exercise"` and `kind: "warmup"` alike. Every warm-up row therefore has
   `external_load = false`, because D-0033 §6 fixes `bodyweight: true` for warm-ups.
2. **Where the mapping lives.** There is exactly one inversion, and it happens in the seed
   (T-0203, backend lane, `supabase/seed.sql` or whatever script generates it). No other layer
   inverts:
   - **DB → engine** (`packages/shared` `toLibraryExercise`, T-0102b AC18) is a straight rename:
     `externalLoad = row.external_load`. The mapper never reads or names `bodyweight`.
   - **Engine** (`LibraryExercise.externalLoad`, D-0037 §6 / D-0040 §3) reads only `externalLoad`.
     No change is needed.
   - **Content** keeps `bodyweight` in the JSON (D-0033 §3). No change is needed.
3. **The seed writes the value every time.** The seed sets `external_load` on every row it
   inserts or upserts, including rows where the result is `true`. It never relies on the column
   default. With the default (`true`), a dropped field would silently mark bodyweight rows as
   loaded.
4. **`increment_kg` for bodyweight rows.** The JSON has no `increment_kg` on bodyweight rows, but
   the DB column is `not null default 2.5` (D-0035). For those rows the seed omits the value (or
   writes `2.5`) and must not fail. The resulting `incrementKg: 2.5` on an `externalLoad: false`
   exercise means nothing. Load behaviour is decided by `externalLoad`, never by whether
   `incrementKg` is null. This matches D-0040 §4 (weight is 0 when `externalLoad` is false). The
   engine fixtures' `incrementKg: null` for "bw" rows stays valid, because `number` is assignable
   to `number | null`.
5. **Contract note (names the change to `docs/data-model.md`).** The `external_load` row's note
   in the `exercises` table gains the mapping: "Seeded as `NOT bodyweight` from `data/exercises`
   (D-0044)." Nothing else changes. No migration.

## Consequences
- **backend (T-0203):** implement point 1 and point 3 in the seed. Tests to add:
  (a) after `supabase db reset`, for every file in `data/exercises/library`, the seeded
  `external_load` equals `!bodyweight`;
  (b) spot checks: a known bodyweight exercise (for example `push-up` or `plank`) is `false`, and
  a known loaded one (for example `barbell-back-squat`) is `true`;
  (c) every `kind = 'warmup'` row is `false`;
  (d) the count of `external_load = false` rows equals the count of `bodyweight: true` files.
  Bodyweight rows seed without error under point 4.
- **data (T-0102b, currently doing):** AC18 already asserts `externalLoad: true` for
  `backSquatRow`. Add the opposite case: a row with `external_load: false` maps to
  `externalLoad: false`, which guards against a stray inversion in the mapper. Add the
  `docs/data-model.md` note from point 5. If T-0102b has already closed, a small data-lane
  follow-up does both.
- **engine, content:** no change.
- D-0033's Consequences bullet about "a `bodyweight` column" and D-0035's exercises bullet are
  read through this decision. Neither is superseded: each still governs its own contract.

