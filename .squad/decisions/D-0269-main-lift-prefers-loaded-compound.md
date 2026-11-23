---
id: D-0269
title: "Engine rule 7.2 step 1: the main lift is the first loaded compound (externalLoad true) in rank order, and a bodyweight compound only when the area has no loaded one; no content retype (T-0692)"
status: revisit
date: 2026-11-23
by: product-owner (groom T-0692)
area: engine
amends: D-0040
builds-on: D-0024, D-0202, D-0237, D-0239
---
## Context
T-0691's review found that a zero-history full-gym user can get a bodyweight row as the main lift. Checked against `data/exercises/library` (108 rows) and `docs/engine-rules.md` rule 7.2:
- Step 1 takes the lowest-`r` area's top compound candidate. Candidates rank by favorite, then "not in the last session", then gap fit, then id ascending. At zero history all chest compounds tie on gap fit, so **id ascending** decides: `archer-push-up` (advanced, bodyweight) sorts before `barbell-bench-press`, and `band-chest-press` (beginner, `band`) before `incline-machine-press`. For a beginner without the `band` item the pick is `incline-machine-press`, which is loaded; the cases that go wrong are advanced users (archer-push-up) and users who ticked band.
- Back is worse whenever back is the area chosen (chest avoided or recovering, or a chest-heavy history): `bird-dog` is typed `compound`, is bodyweight, and its area weights (back 1, core .5, glutes .5, sum 2.0) beat every loaded back compound (back 1, arms .5, sum 1.5) on gap fit, so it wins on gap fit, not on id. `reverse-plank-hold` (intermediate) has the same shape.
- A main lift is the item with 4 sets, the strictest rep range and the rule 14 progression. Bodyweight has no weight to progress (rule 14: `W` is 0, `increase` at high reps), no back-off weight (rule 7.4) and no e1RM (rule 16).

Two fixes were possible: (a) rule 7.2 prefers loaded compounds for the main lift, or (b) retype content (bird-dog to isolation, and so on).

## Decision
1. **Rule, not content.** Rule 7.2 step 1, in each area it tries, orders the compound candidates by: favorite first (rule 0.2, key (0), unchanged), then `externalLoad: true` before `externalLoad: false`, then the existing rank. It takes the first one that fits at 4, 3, then 2 sets. An area with no loaded compound candidate keeps today's behaviour, so a bodyweight main lift is still possible when nothing loaded exists (no equipment, arms, core).
2. **What does not change.** Area choice (lowest `r`), an eligible `mainLiftId` from the user (the user's pick always wins), `autoMainLift: false` (no fallback), pinned items, step 3 greedy ranking and all accessory choices, `rankSwaps` and `applySwap` (the user picks the swap), rule 13 (never shuffles the main lift) and `insertItem`. A bodyweight **favorite** compound is still the main lift when the gaps choose its area: a favorite is the user's preference, the loaded rule is only a default.
3. **No content retype.** Retyping `bird-dog` or `band-chest-press` would move rest times (120 s to 60 s) and ranking for every user, and would not fix `archer-push-up`, `pull-up` or `hip-thrust-bodyweight`, which are genuine compounds. A later content audit may still retype a row on its own merits (a stability move typed as a compound).
4. **Consequence for worked examples.** D-0040 §11 and T-0202 pinned "the all-chest history's main lift is inverted-row" (`inverted-row` is a bodyweight compound in L1). That pin moves: R7-E29 now has a loaded back compound (barbell-row is the first by rank) as its main lift. T-0692 lists every example and test it moves.
5. **Cost.** Compound sets cost the same whether loaded or bodyweight, so item totals do not move; only the exercise at the main slot and its pre-fill (`first_time`, weight null for a loaded lift, 0 for bodyweight) change.

## Consequences
A first workout for a full-gym user starts with a barbell, dumbbell, cable or machine lift where one exists, which is what "main lift" and the rule 14 progression assume. The preference is a heuristic, so status is `revisit`.

## Revisit when
A user with a bodyweight goal asks for a bodyweight main lift (then a profile or UF-08 option, not a rule change), or the library gains a loaded compound that is a poor first lift (then retype or level it).
