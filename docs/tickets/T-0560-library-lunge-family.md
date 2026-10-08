---
id: T-0560
title: "Library: the lunge family (forward, walking, dumbbell, barbell, lateral lunge, plus Bulgarian split squat if missing), original text; owner request"
lane: content
screens: [UF-04.1, UF-04.2]
decisions: [D-0192, D-0033, D-0005]
deps: []
status: ready
---

## Why
The owner (2026-10-08): "Missing exercise lunges". The library has only `reverse-lunge` (T-0522, live since 2026-10-08). Common lunge variants are missing, so the engine can't suggest or swap between them.

## Acceptance criteria
- AC-1: new rows in `data/exercises/library/`. Original workoutLab text (D-0192: no ExerciseDB content; wger-adapted only with a `source_url` that was actually opened). Every D-0033 engine field is set: area weights (quads 1.0; glutes, hamstrings 0.5 as fits), equipment from our vocabulary, level, type compound, increment, variants, steps, cues, mistakes.
  - `forward-lunge` (none)
  - `walking-lunge` (none; a dumbbell variant link)
  - `dumbbell-lunge` (dumbbell)
  - `barbell-lunge` (barbell, rack)
  - `lateral-lunge` (none)
  - `bulgarian-split-squat` (bench, optional dumbbell): only if no equivalent row exists; check `split-squat`
- AC-2: variant links are symmetric with `reverse-lunge`, `split-squat` and each other, so the library variant test passes.
- AC-3: `supabase/seed.sql` is regenerated (`node supabase/scripts/gen-seed.mjs`), and `--check` passes. The release applies it automatically (T-0554).
- AC-4: the library validators and tests pass. A planted fault (one row removed) fails the count/coverage test.

## Paths you may change
- `data/exercises/**`, `supabase/seed.sql`

## Contract impact
None.

## Build / accept log
- Orchestrator verification (2026-10-08; the curator had no shell): data/exercises tests 242/242. Planted fault (lateral-lunge removed): 4 failed, restored. gen-seed regenerated, --check ok. Full gate, format, check-all green.
- Orchestrator verification of the deadlift rows (2026-10-08): data/exercises tests green, seed regenerated and --check ok, format and check-all green.
