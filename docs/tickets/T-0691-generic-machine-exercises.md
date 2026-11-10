---
id: T-0691
title: "Library: 13 generic machine exercises (incline press, chest fly, rear delt fly, lateral raise, row, lat pulldown, bicep curl, ab crunch, back extension, torso rotation, seated leg curl, hip abduction, glute kickback); original text, no brand names"
lane: content
screens: [UF-04.1, UF-04.2, UF-04.3, UF-05.1, UF-08.3]
decisions: [D-0234, D-0022, D-0029, D-0033, D-0061, D-0192]
deps: []
status: done
---
## Why
The human (2026-11-10): their gym has Cybex machines, and the library lacks most of the stations. D-0234 covers brand machines with **generic** `machine` rows in our own words, with no brand names and no brand field. Users still can't create exercises (D-0234 §1). Today a full-gym user at a machine gym gets cable or free-weight suggestions for stations they could use directly, and can't log those machines.

## Scope
- In: the 13 rows below, the `variants` updates on 22 existing rows (both directions, D-0022), a brand-name test and a test for the new rows, the size-bound and row-count edits named in D-0234 §4, and the regenerated seed.
- Out: user-created, edited or imported exercises (D-0234 §1); brand alias, model field or search by brand (D-0234 §2); illustrations or images (D-0029); hip adduction (D-0234 §3); renaming `leg-curl-machine`; any engine, schema, API or token change.

### The 13 new rows
All rows: `kind "exercise"`, `equipment ["machine"]`, `bodyweight false`, `timed false`, `increment_kg 5`, `source "workoutlab"`, `license "LicenseRef-workoutLab"`, no `source_url`, no `attribution`. Id style follows the library: upper body and core use a `machine-` prefix, lower body a `-machine` suffix.

| id | name | type | level | areas | variants |
|---|---|---|---|---|---|
| `incline-machine-press` | Incline machine press | compound | beginner | chest 1, shoulders 0.5, arms 0.5 | machine-chest-press, incline-dumbbell-press |
| `machine-chest-fly` | Machine chest fly | isolation | beginner | chest 1 | cable-fly, dumbbell-fly |
| `machine-rear-delt-fly` | Machine rear delt fly | isolation | beginner | shoulders 1 | rear-delt-fly-dumbbell |
| `machine-lateral-raise` | Machine lateral raise | isolation | beginner | shoulders 1 | lateral-raise-dumbbell, cable-lateral-raise |
| `machine-row` | Machine row | compound | beginner | back 1, arms 0.5 | seated-cable-row, dumbbell-row, machine-lat-pulldown |
| `machine-lat-pulldown` | Machine lat pulldown | compound | beginner | back 1, arms 0.5 | lat-pulldown, machine-row |
| `machine-bicep-curl` | Machine bicep curl | isolation | beginner | arms 1 | dumbbell-bicep-curl, barbell-bicep-curl |
| `machine-ab-crunch` | Machine ab crunch | isolation | beginner | core 1 | hanging-leg-raise, machine-torso-rotation |
| `machine-back-extension` | Machine back extension | isolation | beginner | back 1, glutes 0.5 | superman, bird-dog |
| `machine-torso-rotation` | Machine torso rotation | isolation | beginner | core 1 | cable-woodchop, weighted-russian-twist, machine-ab-crunch |
| `seated-leg-curl-machine` | Seated leg curl (machine) | isolation | beginner | hamstrings 1 | leg-curl-machine, sliding-leg-curl |
| `hip-abduction-machine` | Hip abduction (machine) | isolation | beginner | glutes 1 | fire-hydrant, glute-kickback-machine |
| `glute-kickback-machine` | Glute kickback (machine) | isolation | beginner | glutes 1, hamstrings 0.5 | cable-kickback, banded-glute-kickback, hip-abduction-machine |

Notes on the choices:
- **Areas follow the existing rows.** The machine rows copy the weights of their cable or dumbbell twins: `machine-rear-delt-fly` is shoulders 1 like `rear-delt-fly-dumbbell`, and the row and pulldown are back 1, arms 0.5 like the cable rows. `machine-back-extension` is `isolation` so it can't become a back main lift (rule 7.2 takes compounds only).
- **Machine row and machine lat pulldown are distinct from the cable rows** (D-0234 §3): pre-fill and progression are per id, the equipment differs for the custom list and `equipment_taken`, and the machine row is chest-supported.
- **Left out:** hip adduction (no adductor area, D-0234 §3). Chest press, shoulder press, arm (tricep) extension, leg press, leg extension, lying leg curl and calf raises are not added again, because those rows already exist.

### Existing rows: `variants` only (append the new id; change nothing else)
machine-chest-press += incline-machine-press · incline-dumbbell-press += incline-machine-press · cable-fly += machine-chest-fly · dumbbell-fly += machine-chest-fly · rear-delt-fly-dumbbell += machine-rear-delt-fly · lateral-raise-dumbbell += machine-lateral-raise · cable-lateral-raise += machine-lateral-raise · seated-cable-row += machine-row · dumbbell-row += machine-row · lat-pulldown += machine-lat-pulldown · dumbbell-bicep-curl += machine-bicep-curl · barbell-bicep-curl += machine-bicep-curl · hanging-leg-raise += machine-ab-crunch · superman += machine-back-extension · bird-dog += machine-back-extension · cable-woodchop += machine-torso-rotation · weighted-russian-twist += machine-torso-rotation · leg-curl-machine += seated-leg-curl-machine · sliding-leg-curl += seated-leg-curl-machine · fire-hydrant += hip-abduction-machine · cable-kickback += glute-kickback-machine · banded-glute-kickback += glute-kickback-machine (22 rows).

### Text
Write it fresh, in the house style of the existing machine rows: 3–5 one-sentence steps (setup → seat/pad adjustment → movement → controlled return), one short cue, 1–3 common mistakes. Use generic station words ("pad", "handles", "seat", "weight stack"). Don't copy or paraphrase a manufacturer's placard, manual, site or image (D-0234 §2, D-0192).

## Acceptance criteria
- AC1 Given the library after this ticket, When the `data/exercises` schema test runs, Then each of the 13 new files and each of the 22 edited files validates against `data/exercises/schema.json`, and the loader returns 108 rows. (`coverage.test.ts` pin 95 → 108 and `size.test.ts` bound 96 → 120, both citing D-0234 §4. AC15 gzip ≤ 40 960 bytes is unchanged and still passes.)
- AC2 Given each of the 13 new ids, When a new test `data/exercises/test/machines-t0691.test.ts` reads it, Then it has the id, name, type, level, areas, equipment `["machine"]`, `bodyweight false`, `timed false`, `increment_kg 5` and variants from the table above (exact values).
- AC3 Given each new row, When its text is checked, Then `instructions` has 3–5 items, each one sentence of ≤ 120 chars; `cue` is one string of 3–60 chars; `mistakes` has 1–3 items; `source` is `"workoutlab"`, `license` is `"LicenseRef-workoutLab"`, and there's no `source_url` or `attribution`. Own wording is a review check: the reviewer confirms nothing was copied from a manufacturer. Short house phrases already in the library, such as "Lower back down with control.", may be reused.
- AC4 Given every file in `data/exercises/library/` (the seed is generated from these files), When a new test `data/exercises/test/no-brands.test.ts` searches them case-insensitively for `cybex`, `technogym`, `life fitness`, `matrix` and `hammer strength`, Then there are 0 matches. Planted fault: the word "Cybex" added to one new row's cue fails the test (logged, then restored from a `cp` backup).
- AC5 Given the library, When `variants.test.ts` runs, Then every variant resolves, lists are symmetric, and each pair shares a weight-1 area. This covers all 13 new rows and the 22 edited rows. Planted fault: removing `incline-machine-press` from `machine-chest-press.variants` fails "variants are symmetric".
- AC6 Given the full-gym profile, When `isAvailableIn(row.equipment, "full-gym")` is checked for each new row, Then it is true, and each row has at least one area at weight 1 (so it is a rule 7.2 candidate). Given the `bodyweight` and `dumbbells` profiles, Then it is false for all 13. Both cases are in `machines-t0691.test.ts`.
- AC7 Given `machine-row` and `seated-cable-row`, and `machine-lat-pulldown` and `lat-pulldown`, When their equipment is compared, Then they share no item (this pins the D-0234 §3 distinction for `equipment_taken`).
- AC8 Given the existing coverage tests (AC11–AC13 and T-0522 AC2), When they run, Then they pass unchanged. The bodyweight-only counts don't move because no new row is `["none"]`.
- AC9 Given the regenerated `supabase/seed.sql`, When `node supabase/scripts/gen-seed.mjs --check` runs, Then it exits 0, and the seed has 108 exercise rows. In CI, pgTAP and the seed idempotency job pass (the seed applied twice gives the same rows).
- AC10 Given the full gate, When the engine and web suites run against the real library, Then they're green. If an expected value changes because a new row is now a candidate (e.g. a UF-04 library count, a UF-08 or UF-05 swap list), the test is updated to the new exact value, and the log names the row and D-0234 for each change. No assertion is loosened, skipped or deleted. If a change can't be explained by a new row, raise triage.

Binary checks (D-0197 §7): AC6 covers both "available" and "not available" profiles. Offline makes no difference: the library ships in the offline cache like the other rows, within the AC15 budget.

## Paths you may change
- `data/exercises/library/**`: the 13 new files, plus the `variants` field only on the 22 existing rows listed above.
- `data/exercises/test/**`: new `machines-t0691.test.ts` and `no-brands.test.ts`, and the two D-0234 §4 edits in `coverage.test.ts` and `size.test.ts`.
- `supabase/seed.sql`: **regenerated by tooling** (`node supabase/scripts/gen-seed.mjs`, run by QA or the orchestrator), never edited by hand.
- Web or engine test expectations only under AC10, each change justified in the log (the orchestrator routes them to the owning lane if needed).
- This ticket's `## Build / accept log`.

## Contract impact
None (D-0234). The equipment vocabulary already has `"machine"`. No change to the data model, OpenAPI, engine rules or tokens.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `gen-seed.mjs --check` green · contracts unchanged · commit messages start with `T-0691` and cite UF-04.

Per-package commands: write one command per script, `pnpm --filter @workoutlab/exercises typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
- 2026-11-10 content-curator (no shell; files written, QA runs tests and commits). UF-04.
  - Created (13, `data/exercises/library/`): incline-machine-press, machine-chest-fly, machine-rear-delt-fly, machine-lateral-raise, machine-row, machine-lat-pulldown, machine-bicep-curl, machine-ab-crunch, machine-back-extension, machine-torso-rotation, seated-leg-curl-machine, hip-abduction-machine, glute-kickback-machine (`.json`). Values as in the table; original text, 4 steps, 1 cue, 2 mistakes each; no brand names.
  - Changed, `variants` only (22, `data/exercises/library/`): machine-chest-press, incline-dumbbell-press, cable-fly, dumbbell-fly, rear-delt-fly-dumbbell, lateral-raise-dumbbell, cable-lateral-raise, seated-cable-row, dumbbell-row, lat-pulldown, dumbbell-bicep-curl, barbell-bicep-curl, hanging-leg-raise, superman, bird-dog, cable-woodchop, weighted-russian-twist, leg-curl-machine, sliding-leg-curl, fire-hydrant, cable-kickback, banded-glute-kickback (`.json`). The new id is appended at the end of each list.
  - Test edits (D-0234 §4): `data/exercises/test/size.test.ts`: added a citation comment above the `it`, title `72 <= N <= 96` → `72 <= N <= 120`, `toBeLessThanOrEqual(96)` → `(120)`. `data/exercises/test/coverage.test.ts`: added a citation comment, title `the library has 95 rows` → `T-0522 AC1 / T-0560 / T-0691 the library has 108 rows`, `toHaveLength(95)` → `(108)`.
  - Read-only checks: 108 library files; every new variant id is listed back by its target (grep); no matches for cybex|technogym|life fitness|matrix|hammer strength (case-insensitive); steps are one sentence each and ≤ 120 chars, cues ≤ 60 chars.
  - Not done here: `machines-t0691.test.ts` (AC2, AC6, AC7), `no-brands.test.ts` (AC4), the planted faults (AC4, AC5), `supabase/seed.sql` regeneration (AC9), and any test runs or gate. These are left for QA or the orchestrator.
- 2026-11-10 qa-tester. UF-04. Start: clean, HEAD 93bdf263. Added `data/exercises/test/machines-t0691.test.ts` and `no-brands.test.ts` (088c05a1); the 22 edited rows differ from `main` in `variants` only (diff checked).
  - AC1 → schema.test.ts + coverage.test.ts (108) + size.test.ts (≤ 120) + offline-size AC15 · AC2 → machines-t0691 "exact id, name, …" ×13 · AC3 → machines-t0691 text + provenance ×13 · AC4 → no-brands.test.ts · AC5 → variants.test.ts · AC6 → machines-t0691 full-gym / not bodyweight, dumbbells ×13 · AC7 → machines-t0691 AC7 ×2 · AC8 → coverage.test.ts unchanged, green · AC9 → gen-seed --check 0, 108 inserts, pgTAP 22 files / 791 pass, seed applied twice: 108 exercises / 196 areas / 286 variants, md5 stable · AC10 → full forced gate green, no expectation changed.
  - Faults (cp backup, restored): "Cybex" in incline-machine-press cue → no-brands red · incline-machine-press dropped from machine-chest-press.variants → "variants are symmetric" red · machine-row equipment ["machine","cable"] → AC2 + AC7 red · machine-bicep-curl mistakes [] → AC3 red · own: "LIFE Fitness" in an old row (machine-chest-press) → no-brands red · own: machine-row arms 0.5→1 → AC2 red · own: source_url on hip-abduction-machine → AC3 provenance red.
  - Gate: `turbo run typecheck lint test --force --concurrency=1` 19/19 (engine 816, web 4929, exercises 331); run 1 hit an unrelated ENOENT in engine's `node_modules/.vite/vitest-tmp` (no assertion failed), engine alone and the rerun were green. format:check, check:repo, test:repo-checks (395/395), gen-seed --check, vendor --check: all 0. E2e: no spec pins library counts and all PostgREST is mocked, so none run.
- 2026-11-10 product-owner accept: **done**. UF-04. AC1 schema/coverage 108/size ≤ 120/AC15 gzip 12.6 KB ✓ · AC2 machines-t0691 ×13 ✓ · AC3 text/provenance ×13 ✓, review confirms own wording, no manufacturer text (wording nits fixed by orchestrator, seed regenerated, library 331/331) ✓ · AC4 no-brands + planted "Cybex" red ✓ · AC5 variants.test + planted symmetry fault red ✓ · AC6 full-gym true, bodyweight/dumbbells false ×13 ✓ · AC7 ×2 ✓ · AC8 coverage tests unchanged, green ✓ · AC9 gen-seed --check 0, 108 rows, pgTAP 791/791, seed twice stable (CI re-confirms on push) ✓ · AC10 forced gate 19/19, no expectation changed ✓. Principles hold: no engine/schema/API/token change, no user-created exercises (D-0234 §1), no brand field. Follow-ups: engine vitest-tmp ENOENT flake (infra); zero-history full-gym main lift can be a bodyweight row (pre-existing, engine).
