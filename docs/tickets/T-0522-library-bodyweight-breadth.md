---
id: T-0522
title: "Library breadth (GitHub #32, compliant route): nine new bodyweight-only exercises, one per area, original workoutLab text with full engine fields; no ExerciseDB content (D-0192)"
lane: content
screens: [UF-04.1, UF-04.2, UF-05.1, UF-08.2]
decisions: [D-0192, D-0005, D-0033, D-0089]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #32 (D-0192 §3). Build flow:
wl-build-content. About ½ day. T-0523 regenerates supabase/seed.sql after it. The rows reach
prod only through the human-run release script (H-19 pattern), raised when T-0523 merges. -->

## Why
GitHub #32 asks to "improve workout items" with ExerciseDB. D-0192 rules out scraping, run-time
calls and ExerciseDB content until written terms allow it (H-26). It points the improvement at our
own library instead. The thinnest spot is the no-equipment profile: main fa4171e has 3
bodyweight-only (`equipment: ["none"]`) exercises with weight 1.0 for each of shoulders, arms,
core, glutes, quads, hamstrings and calves, and 4 for chest and back. With so few, Remove, Swap,
Shuffle and Skip today (D-0191) quickly run out of alternatives or repeat.

## Scope
- In: nine new `kind: "exercise"` rows in `data/exercises/library/`, one per area, each
  `equipment: ["none"]` with that area at weight 1.0. Each row has original text (`source:
  "workoutlab"`, `license: "LicenseRef-workoutLab"`, no `source_url`, D-0033 §8), or wger-adapted
  text only when a real wger page was opened and checked. Each row has all engine fields: `type`,
  `level`, `areas` (1.0 / 0.5 only), `timed` (+ `default_duration_s` if timed), `bodyweight: true`,
  `variants` (ids that exist, symmetric where the variants test requires it), `cue`,
  `instructions` (one action per step), and `mistakes`. Update `ATTRIBUTION.md` only if a wger row
  is added.
- Out: any ExerciseDB text, structure, ids, GIFs or images (D-0192 §1-§2, D-0005 no third-party
  images), seed regeneration (T-0523), and engine fixtures (the engine's F-library is unchanged).

## Acceptance criteria
- AC1 Given the library, When counted, Then it has 87 rows (78 + 9), within AC10's 72–96.
- AC2 For each of the nine areas, Then the count of `equipment: ["none"]` exercises with that area
  at weight 1.0 is one more than on main fa4171e (chest 5, back 5, the other seven 4). This is a
  new test in `data/exercises/test/coverage.test.ts` with these exact numbers.
- AC3 Every new row passes the existing schema, enums, ids, text, variants, timed, license,
  attribution and no-images tests, unchanged. If a test has to change, that needs triage.
- AC4 No new row has `source` other than `workoutlab` or `wger`. A `wger` row has a `source_url`
  matching `https://wger.de/en/exercise/<id>/view/<slug>` and is listed in `ATTRIBUTION.md`.
  A new test greps the library for "exercisedb" (any case) and finds none.
- AC5 At least two of the nine are `level: "beginner"` and at least one is `timed: true` with a
  `default_duration_s` (it widens the core/calves timed options).
- AC6 The content-curator records in the log, for each new row, a one-line rationale: area, why it
  isn't a near-duplicate of an existing row, and its variants.

## Paths you may change
`data/exercises/**`.

## Contract impact
none (data rows only; `docs/data-model.md` unchanged).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0522`.

## Build / accept log
- Build (content-curator): 9 original workoutlab rows added; 18 existing rows got one new variant id each
  for symmetry. NOT RUN: the session had no shell, so no tests, gate or commit ran. See handback.
- AC1 -> coverage.test.ts "AC1 87 rows" (and size.test.ts 72-96). AC2 -> coverage.test.ts per-area counts.
  AC3 -> existing tests unchanged. AC4 -> license.test.ts exercisedb grep; all rows source workoutlab.
  AC5 -> coverage.test.ts (beginner: prone-y-raise, plank-shoulder-tap, incline-tricep-extension,
  donkey-kick, reverse-lunge, ankle-hops; timed: hollow-body-hold 20s, ankle-hops 30s).
- AC6 rationale (area; why not a duplicate; variants):
  - archer-push-up: chest; one-arm-biased wide push-up, advanced; push-up, wide-push-up.
  - prone-y-raise: back; overhead Y lift of the upper back, not the alternating kicks of prone-swimmers
    or full-body superman; prone-swimmers, superman.
  - plank-shoulder-tap: shoulders; anti-rotation tap from a plank, not a pressing move like the pikes;
    pike-push-up, incline-pike-push-up.
  - incline-tricep-extension: arms; elbow-only extension on a wall or counter, isolating triceps unlike
    the diamond push-ups; diamond-push-up, kneeling-diamond-push-up.
  - hollow-body-hold: core; timed supine hold, not prone like plank or limb-moving like dead-bug;
    plank, dead-bug.
  - donkey-kick: glutes; backward leg press from all fours, unlike the sideways fire-hydrant;
    fire-hydrant, glute-bridge.
  - reverse-lunge: quads; stepping lunge, unlike the static split-squat; split-squat, bodyweight-squat.
  - sliding-leg-curl: hamstrings; bridge with heel slide (knee flexion), unlike the hinge-based
    walkout and deadlift; hamstring-walkout, single-leg-deadlift.
  - ankle-hops: calves; timed reactive hops, unlike the slow raises; calf-raise, single-leg-calf-raise.
- Orchestrator verification (2026-10-06; the builder had no shell): data/exercises tests 236/236. Planted fault (ankle-hops.json removed): 5 tests fail, restored. Full gate 19/19, format:check, check-all green.
