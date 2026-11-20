---
id: D-0263
title: "One side at a time: review rulings (flag on web ExerciseDetail not the engine, IndexedDB backfill without a version bump, hero-line formats, one formatReps helper, 16 flagged rows, audit step fixes, ticket sequencing)"
status: decided
date: 2026-11-20
by: product-owner
area: product
supersedes: null
amends: D-0260, D-0261, D-0262
builds-on: D-0260, D-0261, D-0262
---
## Context
Designer and data/engine/content impact reviews of `docs/specs/unilateral-exercises.md` raised gaps. The owner asked to build it and accepts the open-question defaults, including no engine time change in v1 (D-0262 stays `revisit`). The spec is amended in place.

## Decision
1. **Where the flag lives.** `unilateral` is NOT added to the engine's `LibraryExercise` (AC13: the engine package never references it; no re-vendor; no clash with T-0952/T-0961). It is carried on the web-only `ExerciseDetail` (`apps/web/src/lib/offline/db.ts`, written from `select("*")`) through a shared mapper `toUnilateral(row): 'arm' | 'leg' | 'side' | null` in `packages/shared` (unknown or missing becomes null). The shared `Exercise` type and `database.gen.ts` carry the column.
2. **IndexedDB.** No version bump. Library rows are replaced wholesale by `refreshLibrary`, so cached rows without the field are backfilled on the next refresh; until then a missing field reads as null (both sides, no label). This also avoids a second bump next to T-0953/T-0954.
3. **Contract changes (data ticket and content ticket together):** `data/exercises/schema.json` enum `["arm","leg","side"]` optional; `data/exercises/src/index.ts` optional field; `supabase/scripts/gen-seed.mjs` `EXERCISE_COLUMNS` plus value (`sqlOrNull`), regenerated `seed.sql`, gen-seed test and `seed.test.ts`; one new migration `exercises.unilateral text null` with the check (pgTAP rejects `'both'`); `docs/data-model.md` row; `database.gen.ts` regenerated, including the vendored `database.gen.d.ts`. `api/openapi.yaml`: no change. Valid and invalid `unilateral` fixtures are added. The row pin of 108 is unchanged.
4. **UF-09.3 hero line.** Weighted sets today render "12 kg" over "× 10". New: the weight line stays "12 kg"; the reps line becomes "× 10 per arm" (same `<p>`, same node, suffix in the same type, colour `--wl-ink-muted`; contrast rechecked on lift and rest states). Bodyweight or no-weight sets read "10 reps per arm". Timed: "40 s per side". The `<p>` aria-label reads "12 kg, 10 reps per arm" (timed: "40 seconds per side"). At 320 px the suffix wraps and is never truncated.
5. **UF-09.4 stepper.** The group aria-label becomes "Reps per arm" (timed: "Seconds per side"); button names stay "More reps" and "Less reps". A visible caption under the number ("per arm", "per leg", "per side"; timed "seconds per side") in the label type size; the number stays alone in the target. Pre-fill, RIR and the 5 s auto-save are unchanged.
6. **History and summary formats.** Existing formats win; the suffix is appended: UF-03 and UF-06 weighted rows "12 × 10 per arm" (existing "97.5 × 8" style); bodyweight "10 per arm"; UF-03 ListView `repsLabel` "Set 2 reps per arm"; UF-06.2 Best set card "12 kg × 10 per arm". The "3 × 10 per arm · 12 kg" form applies only where a grouped summary row already exists; otherwise per-set rows use the formats above. AC8 is read that way.
7. **UF-04.2.** Under the steps, a static body-text `<p>`. Non-timed: the existing text including "Log RIR for your weaker side." Timed: "Hold one side, then switch. Log seconds for one side." with no RIR sentence.
8. **One helper.** A single `formatReps(reps, unilateral, timed)` plus the `perSide(word)` strings live in one shared web i18n module (path chosen by the builder, under `apps/web/src`). UF-03 (`SummaryContent.prText`, `en.uf03.prReps/prWeighted`, ListView), UF-09 (`confirm-set.tsx`, `current-set.tsx`) and UF-06 (`stats.ts`) all call it; no flow keeps its own copy of the strings. This replaces open question 8's per-flow strings.
9. **Audit fixes (16 rows, not 17).** `machine-torso-rotation` is NOT flagged: it is one side per set ("switch the start side for the next set"), so a set is one side and the label would mislead. Flagged: `leg` (13) single-leg-deadlift, single-leg-calf-raise, split-squat, bulgarian-split-squat, donkey-kick, fire-hydrant, barbell-lunge, dumbbell-lunge, forward-lunge, lateral-lunge, banded-glute-kickback, glute-kickback-machine, cable-kickback; `arm` (1) dumbbell-row; `side` (2) side-plank (timed), cable-woodchop. Text work: dumbbell-row gets a switch step; banded-glute-kickback, cable-kickback and cable-woodchop get switch text in place of "repeat"; the lunge rows, glute-kickback-machine and single-leg-calf-raise ("switch feet") already say it and only move groups in the spec. Steps stay within 5 and 120 characters (the curator may merge steps). AC2 accepts "switch" in any form ("switch feet", "then switch"). The "count every step" claim for alternating rows was false (rows say "Alternate legs on each rep"); it is dropped, and those rows need no text change.
10. **Tickets.** T-0973 creates or amends the screen specs (no UF-09.3, UF-09.4, UF-03 or UF-06 spec files exist; UF-04.2 is amended). T-0978's dependency on T-0972 is replaced by T-0952 and T-0971 (it re-vendors after the RIR engine work and needs the flag in the library). Sequencing: the data ticket T-0972 lands after T-0951 (both add migrations and touch `docs/data-model.md` and `database.gen.ts`); the web tickets land after T-0953 and T-0954. T-0974 creates the shared helper; T-0975 follows it.
11. **Open questions** 1 to 8 are closed with their defaults (question 8 as item 8 above). Owner approval to build is given; rows move from `idea` to `todo`, except T-0978 which stays `idea`.

## Consequences
Smaller contract surface than first written (no engine type, no IndexedDB version). 16 flagged rows. D-0262 unchanged and still `revisit`.

## Revisit when
A flagged row's step text changes how it is done, or the engine starts to read the flag (T-0978).
