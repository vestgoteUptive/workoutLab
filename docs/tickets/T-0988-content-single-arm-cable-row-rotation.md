---
id: T-0988
title: "Add the single-arm cable row with rotation to the exercise library (one side at a time, per arm)"
lane: content
screens: [UF-04.1, UF-04.2]
decisions: [D-0260, D-0263, D-0268]
deps: []
status: ready
---
## Why
Owner request 2026-11-24: on the cable row machine, one hand pulls the handle to the ribs while the torso rotates. Common names: single-arm cable row with rotation, rotational cable row. The library only has the two-handed `seated-cable-row`.

## Scope
- In: one new row `data/exercises/library/single-arm-cable-row-rotation.json` in the existing schema, modelled on `seated-cable-row.json` and the one-side rows (`dumbbell-row.json`):
  - name "Single-arm cable row with rotation", kind exercise, type compound, level intermediate, equipment ["cable"], bodyweight false, increment_kg 2.5 (lighter per-arm stack steps), timed false.
  - areas: back 1, core 0.5, arms 0.5 (weights per the library's convention; check `docs/engine-rules.md` and the schema for allowed values).
  - `unilateral: "arm"`.
  - 3-5 steps (seated or half-kneeling, one handle, pull to the ribs while turning the torso toward the working side, return with control and let the shoulder reach forward), a cue ("Pull to the ribs, turn with the elbow"), 2 common mistakes (twisting from the lower back only; shrugging the shoulder), variants including `seated-cable-row` and `dumbbell-row` (and add this row to their variants if the schema expects symmetry), source "workoutlab", licence as the other workoutLab rows.
  - Plain English, short sentences, no medical claims.
- Regenerate whatever is generated from the library (seed, vendored copies, fixtures) with the repo's own scripts, and update count pins (108 → 109) and one-side lists (16 → 17 flagged rows) where tests pin them.
- Out: engine rules, UI.

## Acceptance criteria
- AC1 The row validates against `data/exercises/schema.json` and every existing library test.
- AC2 It appears in the library (UF-04.1 search "rotation" and "cable row") with the "per arm" how-to line on UF-04.2 (D-0261).
- AC3 Coverage: one set counts as one hard set for back (and core/arms by the library's partial-credit rule), not two.
- AC4 Engine cost prices it as one-side work (D-0268, rule 7.1).
- AC5 `node supabase/scripts/gen-seed.mjs --check` and `node supabase/scripts/vendor.mjs --check` pass after regeneration.

## Paths you may change
- `data/exercises/**`
- `supabase/seed.sql`, `supabase/scripts/**` outputs only via the scripts
- `supabase/functions/_shared/vendor/**` via `vendor.mjs` only
- `packages/engine/test/**` (count pins only)
- `packages/shared/test/**` (count pins only)
- `apps/web/src/**/__tests__/**` (count pins and fixture lists only)
- `tests/e2e/**` (count pins only)

## Contract impact
none (content row in the existing schema).

## Definition of done
Every AC has a test · `pnpm -w typecheck lint test` green · commit messages start with `T-0988`.

## Build / accept log
