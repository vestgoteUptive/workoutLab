---
id: T-0103
title: Exercise library v1 — ~80 exercises with schema, area weights, equipment, level, cues and licence
lane: content
screens: [UF-01.3, UF-04.1, UF-04.2, UF-04.3, UF-05.1, UF-08.3, UF-09.3, UF-09.6, UF-09.7]
decisions: [D-0005, D-0022, D-0002, D-0017]
deps: [T-0002]
status: ready   # split proposed: T-0103a → T-0103b, see "Split" (orchestrator adds the board rows)
---
## Why
The engine selects exercises by area deficit, equipment and level (engine rules 1 and 7). The
library screens (UF-04) explain each exercise and its variants. Focus mode shows one cue per step
(UF-09.3/.6/.7). The swap screens (UF-05.1, UF-08.3) rank alternatives. None of this exists
yet (gap B5). Without it, T-0203 has nothing to seed and every Phase 3 flow is blocked. The
content text comes from wger under CC-BY-SA 4.0, rewritten to one action per step and tracked
per file (D-0005). D-0022 fixes the file format, the vocabulary and where the tests live.

## Scope
- In:
  - The workspace package `@workoutlab/exercises` in `data/exercises` (D-0022 §1–2):
    `package.json` with `typecheck`/`lint`/`test` scripts, `tsconfig.json`,
    `eslint.config.mjs`, `schema.json`, `src/index.ts` (`loadLibrary()`),
    `src/profiles.ts` (equipment vocabulary and profiles), and `test/**`.
  - 72–96 exercise files in `data/exercises/library/<id>.json`. Each has `id`, `name`,
    `type`, `level`, `equipment[]`, `areas`, `instructions[]`, `cue`, `mistakes[]`,
    `variants[]`, `timed`, `source`, `license`, `attribution` and, for wger rows, `source_url`.
  - Text based on wger.de, rewritten in plain, short English: one action per instruction and one
    cue for focus mode.
  - `data/exercises/ATTRIBUTION.md`: the CC BY-SA 4.0 notice, a statement that the text was
    changed, and the list of wger-sourced ids.
  - Vitest suites that validate every file against the schema, cross-file integrity (ids,
    variants, attribution), coverage per equipment profile, and the offline size budget.
  - Invalid fixtures under `test/fixtures/invalid/`, which prove the schema actually rejects
    bad data.
- Edge cases in scope:
  - **Zero history / new beginner.** Every profile has a beginner exercise for every area, so
    the first plan on UF-01.4 is never empty (AC12).
  - **Bodyweight only** (travel, home). All 9 areas are fillable with no equipment (AC11).
  - **Offline.** The whole library fits the NFR-OFF-1 cache budget (AC15).
  - **Time running out / 15-minute budgets.** Every profile has a compound option for each
    large area (AC13), so the engine can cover several areas per set when time is short.
  - **Returning after 10 days off.** Nothing extra is needed from content. Every area has at
    least 3 primary options in every profile (AC11), so a whole-body catch-up session always
    has candidates. Engine behaviour stays in T-0201/T-0202.
- Out:
  - Illustrations and `image_url`. The designer makes our own later (D-0005), and the v1
    schema rejects the field.
  - Warm-up moves for UF-09.2 (they need the warm-up rule in T-0101 first; follow-up).
  - The DB seed and migration (T-0203, T-0100).
  - UF-04 UI and attribution rendering (T-0306).
  - Engine selection logic (T-0201).
  - Translations (English only in v1, NFR).
  - Any contract change.

## Acceptance criteria
Each criterion becomes at least one automated test in `data/exercises/test/`. "Library" means
every `data/exercises/library/*.json`. "Primary for area X" means `areas[X] === 1`. "Available
in profile P" means `equipment ⊆ items(P)`, per D-0022 §6: bodyweight = {none},
dumbbells = {none, dumbbell, bench}, full-gym = the whole vocabulary.

**Schema and per-file integrity**
- AC1 (schema is valid and strict) Given the library, when each file is validated against
  `schema.json` with Ajv 2020 (`strict: true`, `allErrors: true`), then every file has 0
  errors. And given each fixture in `test/fixtures/invalid/`, when it is validated, then it fails
  at the expected path. There must be at least these six fixtures:
  - area key `biceps` → `/areas`
  - area weight `0.75` → `/areas/chest`
  - extra property `image_url` → additionalProperties
  - missing `license` → required
  - 6 instructions → `/instructions` maxItems
  - a 61-character cue → `/cue` maxLength
- AC2 (ids) Given the library, when ids are collected, then:
  - every `id` matches `^[a-z0-9]+(-[a-z0-9]+)*$`
  - every `id` equals its filename without `.json`
  - no two files share an `id`
  - no two `name` values are equal ignoring case
- AC3 (area weights; engine rule 1) Given the library, when `areas` is read, then:
  - every key is one of chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves
  - every value is `1` or `0.5`
  - every exercise has at least one area at `1`
  - every `isolation` exercise has exactly one area at `1`
  - every `compound` exercise has at least 2 area keys

  And given `barbell-back-squat.json`, then `areas` deep-equals
  `{ "quads": 1, "glutes": 1, "hamstrings": 0.5, "core": 0.5 }`, which is the example in
  engine rule 1.
- AC4 (text fits one-task screens; UF-09.3, UF-09.6, UF-04.2) Given the library, then:
  - `name` is 3–40 characters
  - `instructions` has 1–5 items, each 1–120 characters and one sentence (no match for
    `/[.!?]\s+\S/`)
  - `cue` is 3–60 characters with no newline
  - `mistakes` has 1–3 items of at most 120 characters each
  - no text field has leading or trailing whitespace
- AC5 (enums and equipment) Given the library, then:
  - `type` ∈ {compound, isolation}
  - `level` ∈ {beginner, intermediate, advanced}
  - `timed` is a boolean
  - `equipment` is non-empty, has unique items, and uses only the D-0022 §5 vocabulary
  - a file whose `equipment` contains `none` has `equipment` exactly `["none"]`
- AC6 (variants; UF-04.3, UF-05.1, UF-08.3) Given the library, then:
  - every exercise has at least 1 variant
  - every variant id resolves to a library file
  - no exercise lists itself or lists the same variant twice
  - variants are symmetric: if A lists B, B lists A
  - each variant pair shares at least one primary area

**Licence (D-0005)**
- AC7 (per-file licence) Given a library file:
  - with `source: "wger"`: then `license === "CC-BY-SA-4.0"`, `source_url` matches
    `^https://wger\.de/`, and `attribution` is non-empty and contains `wger`.
  - with `source: "workoutlab"`: then `license === "LicenseRef-workoutLab"` and `source_url`
    is absent.
  - with any other `source`: it fails the schema.

  Fixture: `source: "wger"` with `license: "MIT"` fails.
- AC8 (share-alike notice) Given `data/exercises/ATTRIBUTION.md`, when it is read, then it:
  - contains `CC BY-SA 4.0` and `https://creativecommons.org/licenses/by-sa/4.0/`
  - contains the sentence "Text has been modified from the original." (the CC change notice)
  - lists every id whose file has `source: "wger"` exactly once
  - lists no other id
- AC9 (no third-party images or links) Given the `data/exercises` tree, when it is listed,
  then there are no files ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` or `.svg`. And
  given the library, no string value other than `source_url` matches `^https?://`.

**Coverage (engine rule 7, UF-01.3)**
- AC10 (size of the library) Given the library, when the files are counted, then
  72 ≤ N ≤ 96.
- AC11 (every area is fillable in every profile) Given each profile P ∈ {bodyweight,
  dumbbells, full-gym} and each of the 9 areas A, when the exercises that are available in P
  and primary for A are counted, then the count is ≥ 3. When it fails, the message names the
  cell, e.g. `bodyweight × hamstrings: 2/3`.
- AC12 (zero history, new beginner; UF-01.4 first plan) Given each profile P and each area A,
  then at least 1 exercise with `level: "beginner"` is available in P and primary for A.
- AC13 (compound options for short budgets and main lifts) Given each profile P and each large
  area (chest, back, quads, glutes, per engine rule 4), then at least 1 `compound` exercise
  is available in P and primary for that area.
- AC14 (timed sets; UF-09.7) Given the library, then at least 2 exercises have `timed: true`,
  are primary for `core`, and are available in `bodyweight`. `plank` is one of them.

**Offline, determinism and CI**
- AC15 (offline cache budget; NFR-OFF-1) Given the library, when the file contents are
  concatenated in id order and gzipped (Node `zlib.gzipSync`, default level), then the result
  is ≤ 40 960 bytes.
- AC16 (deterministic loader) Given `loadLibrary()` from `@workoutlab/exercises`, when it is
  called twice, then:
  - both results deep-equal each other
  - both have length N (the AC10 count)
  - both are sorted by `id` ascending (code-point order)
  - each item deep-equals the parsed file with the same id
- AC17 (tests actually run) Given the repo root, when `turbo run test --dry=json` runs, then
  the task list includes `@workoutlab/exercises#test`. The same holds for `typecheck` and
  `lint`. And `pnpm -w typecheck lint test` exits 0.

## Split
This is about 1.5 days of agent work: 80 researched and rewritten files plus the harness. The
proposal is to run it as two tickets on the same branch prefix. The orchestrator adds the
board rows.

- **T-0103a: harness and bodyweight set** (deps T-0002):
  - package, schema, `profiles.ts`, `loadLibrary()`, `ATTRIBUTION.md`, the invalid fixtures
  - about 30–36 exercises that cover the bodyweight profile
  - meets AC1–AC9 and AC14–AC17, and AC11–AC13 for `bodyweight` only
  - the coverage suite takes `REQUIRED_PROFILES = ["bodyweight"]`
- **T-0103b: dumbbell and full-gym set** (deps T-0103a):
  - adds exercises until N is in 72–96
  - sets `REQUIRED_PROFILES` to all three profiles, which adds checks and weakens none
  - meets AC10 and AC11–AC13 for all profiles, and keeps AC1–AC9 and AC14–AC17 green

T-0203 depends on T-0103b.

## Paths you may change
- Content lane: `data/exercises/**`.
- Extras for this ticket only (D-0022 §1):
  - `pnpm-workspace.yaml`: add exactly the line `- "data/*"`
  - `pnpm-lock.yaml`: only as produced by `pnpm install`

The package may add `ajv` and `vitest` as devDependencies. Reuse the versions already in
the repo where they exist (`vitest ^5.0.2`, `typescript ^5.7.2`, `@types/node ^22.10.2`).

## Contract impact
None. `docs/data-model.md` is unchanged. The JSON field names follow it where it names a field
(D-0022 §3). The extra DB columns and the `exercise_variants` relation are proposed to T-0100 as
a follow-up.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0103` (or `T-0103a`/`T-0103b`) and cite screen IDs where relevant, e.g. `T-0103a UF-09.7: timed core holds`.
