---
id: D-0022
title: Exercise library file format, vocabulary and validation home (data/exercises)
status: decided
date: 2026-09-27
by: product-owner (T-0103 groom)
area: data
---
## Context
T-0103 builds the exercise library under `data/exercises/**` (content lane). Nothing pinned down
the file layout, field names, equipment vocabulary, equipment profiles, or how
`pnpm -w test` runs the validation. `pnpm-workspace.yaml` only includes `apps/*` and
`packages/*`, so a test under `data/exercises` would never run in CI. `docs/data-model.md`
(draft) already names some exercise fields (`instructions[]`, `mistakes[]`, `equipment[]`,
`level`, `type`, `source`, `license`, `image_url`). The content-curator role uses different
names (`steps[]`). D-0005 requires `source` and `license` on every row, attribution on UF-04.2,
and no third-party images in v1.

## Decision
1. **Workspace package.** `data/exercises` is the workspace package `@workoutlab/exercises`
   (private, ESM, Vitest). `pnpm-workspace.yaml` gains exactly one line, `- "data/*"`. T-0103
   may make that one-line change even though infra owns the file. The `pnpm-lock.yaml` update
   comes only from `pnpm install`.
2. **Layout.**
   - `data/exercises/library/<id>.json`: one exercise per file.
   - `data/exercises/schema.json`: JSON Schema draft 2020-12, `additionalProperties: false`.
   - `data/exercises/src/index.ts`: `loadLibrary()` (Node only, for tests and the T-0203 seed).
   - `data/exercises/src/profiles.ts`: the equipment vocabulary and profiles below, as constants.
   - `data/exercises/test/**`: tests and invalid fixtures.
   - `data/exercises/ATTRIBUTION.md`: the CC BY-SA notice.
3. **Field names follow `docs/data-model.md` wherever it names a field**, so the T-0203 seed
   is a 1:1 mapping: `id`, `name`, `type`, `level`, `equipment`, `instructions`, `mistakes`,
   `source`, `license`. Content-only fields: `areas` (a map from area to weight, which becomes
   `exercise_areas`), `cue`, `variants`, `timed`, `attribution`, `source_url`. There is **no
   `image_url` in v1**. D-0005 says the illustrations are our own and come later, so the schema
   rejects the field.
4. **Enums.** `type`: `compound | isolation`. `level`: `beginner | intermediate | advanced`.
   Area weights: `1` (primary) or `0.5` (secondary), and only for the 9 areas in `CLAUDE.md`.
5. **Equipment vocabulary.** `none`, `dumbbell`, `bench`, `barbell`, `rack`, `cable`,
   `machine`, `pull-up-bar`, `kettlebell`, `band`. `none` appears only on its own.
6. **Equipment profiles.** These are the three options behind UF-01.3:
   - `bodyweight` = {none}
   - `dumbbells` = {none, dumbbell, bench}
   - `full-gym` = every item in the vocabulary

   An exercise is available in a profile when its `equipment` is a subset of the profile's items.
7. **Licence values.**
   - `source: "wger"`: `license: "CC-BY-SA-4.0"`, a `source_url` starting with
     `https://wger.de/`, and an `attribution` that names wger.
   - `source: "workoutlab"` (our own text): `license: "LicenseRef-workoutLab"`, with no
     `source_url`.

   Keeping both values means that replacing the wger text before launch (the H-07 outcome)
   changes only data. The schema doesn't change.

## Consequences
- The web app and the engine never read these files directly. T-0203 seeds the DB from
  `loadLibrary()`, and T-0300 caches the library from the API (NFR-OFF-1).
- T-0100 (data) should give the `exercises` table columns for `cue`, `timed`, `attribution` and
  `source_url`, an `exercise_variants` relation (gap B3), and the same `level`/`type`/equipment
  vocabulary. This is proposed as a follow-up. This decision doesn't change the contract.
- T-0101/T-0201 (engine) filter by equipment through the profile → items mapping in point 6.
- UF-01.3 (T-0301) offers the three profiles and stores the resulting items in `profiles.equipment[]`.

## Revisit when
- H-07 decides on the CC-BY-SA text (D-0005). If we replace it, flip the rows to `source: "workoutlab"`.
- UF-01.3 user tests show that people need finer equipment choices than three profiles (for example "dumbbells + pull-up bar").
- T-0100 picks different column names. In that case, rename the JSON fields to match in the same ticket.

## Amended
Amended 2026-09-29 by D-0061 (human review). Read it together with this file.
