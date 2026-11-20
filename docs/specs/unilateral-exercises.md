# One side at a time (unilateral exercises) — spec

- **Idea:** the owner, 2026-11-20: "For exercises done one arm at a time, should you log reps per arm or the total for the whole set?" The orchestrator answered: reps per arm (10 per arm, not 20), weight is one dumbbell, one set covering both sides is one hard set. The owner asked to file it as an idea.
- **Screens:** UF-09.3 Current set and UF-09.4 Confirm set (a label only), UF-03.3 Summary and UF-03.1 Active (set table) and UF-06.2 Exercise history (set rows), UF-04.2 Exercise detail (one line). User flows v2 (D-0002).
- **Decisions:** D-0260 (field, counting rules, data), D-0261 (labels, copy and the audit rule), D-0262 (no engine change in v1, time under-estimate accepted). Builds on D-0033 (library engine fields), D-0026 and D-0250 (progression, RIR), D-0254 (e1RM), D-0024 (time model, rule 7.1).
- **Principles:** 1 (one task on screen): the label is part of the existing reps line, not a new element, step or screen; nothing is added to UF-09.9. 2 (time budget): known under-estimate, see "Time". 3 (deterministic engine): no rule changes in v1. 5: nothing in onboarding.

## What it is
Some exercises are done on one side at a time: a dumbbell row, a split squat, a single-leg calf raise. For these, the user does all reps on one side, then switches. The app needs one rule and one label so a log of "10" is never read as 20:

- **Reps are per side** (10 per arm, not 20).
- **Weight is the load in one hand or on one side** (one dumbbell), as it already is for two-dumbbell exercises.
- **One set covers both sides** and counts as **one hard set** for the body area, exactly as today. Nothing in coverage, targets or balance changes.
- The screens say which: "per arm", "per leg" or "per side" next to the reps.

## Library field (D-0260)
`data/exercises/schema.json` gains an optional field `unilateral`, one of `"arm"`, `"leg"`, `"side"`. Absent means both sides work together (every row today). It is a display and content flag in v1; the engine does not read it (D-0262). The same value is the word shown: "per arm", "per leg", "per side".

It travels the same road as `increment_kg` (D-0033): the library JSON, `data/exercises/src` types and loader, `supabase/scripts/gen-seed.mjs` (column in the seed; `--check` stays byte-identical), a migration adding `exercises.unilateral text null check (unilateral in ('arm','leg','side'))`, `docs/data-model.md`, `packages/shared` (`database.gen.ts`, mapper, `Exercise` type: `unilateral: 'arm' | 'leg' | 'side' | null`), and the web library cache. `session_sets`, `workouts` and every API shape are unchanged (no openapi change).

## Content audit (D-0261)
Rule for a row to carry `unilateral`: **one set means all reps on one side, then the other side.** Rows that alternate side every rep are not flagged: their reps are the steps the user counts, and the step text says "count every step".

Grep of the 108 rows (step texts, cues, variants) gives this proposed split. The content curator confirms each row when editing and may change a value with a note in the ticket log.

| Group | Rows | Value |
|---|---|---|
| Flag, text already says finish and switch | single-leg-deadlift, single-leg-calf-raise, split-squat, bulgarian-split-squat (`leg`); dumbbell-row (`arm`); donkey-kick, fire-hydrant (`leg`) | as shown |
| Flag, add "then switch" to the steps (text is silent or per rep) | barbell-lunge, dumbbell-lunge, forward-lunge, lateral-lunge, banded-glute-kickback, glute-kickback-machine, cable-kickback (`leg`); cable-woodchop, machine-torso-rotation (`side`) | as shown |
| Flag, timed (seconds are per side) | side-plank (`side`) | `side` |
| Alternates every rep, not flagged | reverse-lunge, walking-lunge, bird-dog, dead-bug, plank-shoulder-tap, plank-up-down, prone-swimmers, archer-push-up, weighted-russian-twist | none; steps say "count every step" or "count every pair" |
| Two hands on one weight, not unilateral | overhead-tricep-extension-dumbbell, goblet-squat-dumbbell, kettlebell-swing | none |

That is 17 flagged rows. Everything with "a dumbbell in each hand" (bench press, curl, lunge weights, raises) is not unilateral: both sides work in the same rep.

## Behaviour
### Focus mode (UF-09.3, UF-09.4)
- UF-09.3: the reps text reads "10 reps per arm" with the weight as today ("12 kg"). A timed unilateral row reads "40 s per side". Same line, same size, no extra row (principle 1).
- UF-09.4: the reps field label reads "Reps per arm" (or leg, side); a timed row "Seconds per side". Pre-filled values, steppers, RIR and the 5 s auto-save are unchanged. The value saved is the per-side count.
- Not flagged exercises show exactly what they show today.

### History and summary
- UF-03.1 and UF-03.3 and UF-06.2 session rows: "3 × 10 per arm · 12 kg". The existing text for other rows is unchanged. UF-06.2 stat cards ("Best set") use the same suffix.
- Est. 1RM (D-0254) uses reps and weight as logged: per-dumbbell weight and per-side reps are consistent from session to session, so the trend is right. The card's number stays "about N kg" for one hand's load.

### Exercise how-to (UF-04.2)
One extra line under the steps, only for flagged rows: "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms." (arm, leg or side as the row says.) For a timed row: "Hold one side, then switch. Log seconds for one side."

### Progression and RIR
Double progression (D-0026) works on per-side reps and per-dumbbell weight unchanged. RIR (D-0250) is one number per set: the user enters the RIR of the **weaker side** (the one that struggled more). The engine reads the lowest RIR as today. The how-to line carries "Log RIR for your weaker side." The RIR chips keep their existing words.

### Time
Rule 7.1 prices a non-timed set at 45 s work plus rest. A unilateral set really takes about 90 s work (two sides) plus one rest. D-0262: **no engine change in v1.** The plan under-estimates each flagged set by about 45 s: a 3-set flagged row runs about 2 min 15 s over its planned cost. Why this default: it ships without an engine change, without re-vendoring `supabase/functions/_shared/vendor/**`, and without rewriting the worked examples that pin item costs (R7-E4 and others); the label is the part that prevents wrong logs. The cost is accepted and parked as T-0978 (idea): rule 7.1 doubles work for a flagged row (timed: 2 × planned duration), once the library carries the flag; a data check on real overruns can decide when.

## Edge cases
- **Zero history:** pre-fill is the first-time pre-fill as today; label shown from the first set.
- **Returning after 10 days off:** hold rules (D-0026) are unchanged; the label does not change.
- **Offline:** the flag comes from the cached library (same cache as `increment_kg`); queued sets are plain reps and weight; nothing needs a connection.
- **Old logs of a newly flagged row:** sets logged before this ships are not edited. A user may have logged 20 for a dumbbell row; the next session pre-fills from it. Accepted for v1 (open question 3).
- **Time running out:** a flagged row is dropped or kept by the same time fit; the under-estimate above is the only difference.
- **Swap between flagged and not flagged** (dumbbell-row to barbell-row): carry-over of the last weight and reps follows today's rule; the label follows the new exercise.
- **Timed row:** seconds are per side; one set is both sides.
- **Unknown or null flag** (older cache): treated as both sides, no label.
- **Accessibility:** the label is plain text in the same node as the reps (screen readers read "10 reps per arm"); contrast is that of the secondary text token (`--wl-*`, no new token).

## Acceptance criteria (each one is at least one automated test)
1. Given `schema.json`, a library row with `unilateral: "arm"`, `"leg"` or `"side"` validates; `"both"`, an empty string or a number fails; an absent field validates.
2. Given the library, exactly the rows in the audit table with a value carry it (17 rows, values as listed, or the curator's logged changes); every other row has none; every flagged row has a step that tells the user to switch sides, and every flagged timed row (side-plank) says seconds are per side.
3. Given `gen-seed.mjs`, the seed carries the column for every row, `--check` passes, and the migration check constraint rejects `'both'`.
4. Given a mapper round trip (database row, `Exercise`, database row), `unilateral` is kept; null maps to null.
5. Given dumbbell-row in UF-09.3, the reps line reads "10 reps per arm" and the weight reads "12 kg"; given barbell-row, the line is unchanged ("10 reps").
6. Given side-plank in UF-09.3, the line reads "40 s per side".
7. Given single-leg-calf-raise in UF-09.4, the reps label reads "Reps per leg"; saving 12 stores `reps: 12` and the weight as entered, with no multiplication anywhere.
8. Given 3 sets of dumbbell-row logged (10, 10, 9 at 12 kg), the history row reads "3 × 10 per arm · 12 kg" on UF-03.3, UF-03.1 and UF-06.2.
9. Given the same 3 sets, back coverage rises by 3 hard sets (not 6), and balance and targets match a bilateral row with the same sets.
10. Given the same sets, Est. 1RM on UF-06.2 equals the value computed from reps and weight as logged (Epley, no side factor).
11. Given dumbbell-row on UF-04.2, the extra line reads "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side."; a bilateral row has no extra line.
12. Given RIR logged 0 on a flagged row, rule 14 holds the weight exactly as for a bilateral row (D-0250 unchanged).
13. Given 3 sets of a flagged row planned in a 30-minute budget, the engine cost equals a bilateral row's (the D-0262 pin), and the engine package has no reference to `unilateral`.
14. Offline: with the library cached and no network, the label shows and a set queues and uploads later with plain reps and weight.
15. Onboarding to a first plan is unchanged under 60 s; UF-09 shows no new element (one reps line, no extra row or step); axe passes on UF-09.3, UF-09.4 and UF-04.2 with a flagged row; targets are at least 44 px as today.

## Open questions (each with the default that ships)
1. **One flag per row or an exact word?** Default: the word (`arm`, `leg`, `side`) in one optional field.
2. **Does the engine price a unilateral set at double work time?** Default: no in v1 (D-0262); T-0978 stays `idea`.
3. **Old logs of newly flagged rows (maybe logged as totals)?** Default: leave them; no migration, no rewrite.
4. **Alternating rows (bird-dog, dead-bug, reverse lunge)?** Default: not flagged, reps are the counted steps.
5. **Show the label on plan rows (UF-08.2, UF-02.1 plan card) as "3 × 8–12 per arm"?** Default: no in v1; only the screens above.
6. **Weaker-side RIR note: text only or a per-side RIR?** Default: text only, one RIR per set.
7. **Calf raise and lunge say `leg`, side-plank and woodchop say `side`.** Default as the audit table; the curator may change one with a log note.
8. **Do the Cobalt copy strings go through the existing i18n files?** Default: yes, one `perSide` plural-free string per word in each of the UF-03, UF-04, UF-06 and UF-09 files; no new token.

## Out of scope (v1)
Per-side reps or weights (left and right logged separately), a left-right imbalance chart, doubling the work time in the engine, unilateral-aware warm-ups, labels on plan rows, rewriting past logs.
