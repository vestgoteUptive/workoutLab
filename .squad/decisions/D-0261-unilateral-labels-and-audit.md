---
id: D-0261
title: "One side at a time: a per arm, per leg or per side label next to reps on UF-09.3, UF-09.4, UF-03, UF-06.2 and one line on UF-04.2; row flag rule (all reps on one side, then switch) and the 17 flagged rows"
status: decided
date: 2026-11-20
by: product-owner
area: product
supersedes: null
builds-on: D-0260, D-0208
---
## Context
Flagging a row is only useful if every place that shows reps says "per arm". Principle 1 allows no new element during a workout.

## Decision
1. **Label.** The word sits in the existing reps text: "10 reps per arm", "40 s per side"; UF-09.4 field label "Reps per arm" / "Seconds per side"; set rows "3 × 10 per arm · 12 kg" on UF-03.1, UF-03.3 and UF-06.2. No new row, step or token; nothing on UF-09.9. Plan rows (UF-08.2, UF-02.1) do not get it in v1.
2. **UF-04.2.** One extra line for flagged rows: "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side." (timed: "Hold one side, then switch. Log seconds for one side.")
3. **Flag rule.** A row is flagged when one set means all reps on one side, then the other. Rows that alternate every rep are not flagged. The content curator edits step text so each flagged row tells the user to switch.
4. **Rows (proposed, curator confirms):** `leg`: single-leg-deadlift, single-leg-calf-raise, split-squat, bulgarian-split-squat, donkey-kick, fire-hydrant, barbell-lunge, dumbbell-lunge, forward-lunge, lateral-lunge, banded-glute-kickback, glute-kickback-machine, cable-kickback; `arm`: dumbbell-row; `side`: side-plank (timed), cable-woodchop, machine-torso-rotation. 17 rows of 108.

## Consequences
Copy lives in the existing i18n files of UF-03, UF-04, UF-06 and UF-09.

## Revisit when
A row's step text changes how it is performed.
