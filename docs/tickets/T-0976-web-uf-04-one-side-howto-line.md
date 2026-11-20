---
id: T-0976
title: Add the "do all reps on one arm, then switch" line to the exercise how-to
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0260, D-0261, D-0263]
deps: [T-0972, T-0973, T-0954]
status: todo
---
## Why
The how-to is where the user learns the rule: reps for one side, one set covers both, log RIR for the weaker side (D-0263 §7). One static line under the steps, only for flagged rows. Lands after T-0954 which edits the same screen.

## Scope
- In: one static body-text `<p>` under the steps on UF-04.2 for flagged rows, text per the T-0973 spec; arm, leg or side as the row says; timed variant without the RIR sentence.
- Out: any change for bilateral rows, UF-09, engine, new tokens.

## Acceptance criteria
- AC1 Given dumbbell-row on UF-04.2, When shown, Then the extra line reads "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side."
- AC2 Given single-leg-calf-raise, Then the same line says "leg"; Given cable-woodchop, Then "side".
- AC3 Given side-plank (timed), Then the line reads "Hold one side, then switch. Log seconds for one side." with no RIR sentence.
- AC4 Given barbell-row, Then there is no extra line and the screen is unchanged.
- AC5 Given the network off with the library cached, Then the line shows for a flagged row; Given a cached row without `unilateral`, Then no line shows.
- AC6 Given UF-04.2 with a flagged row, When axe runs, Then it passes; text uses body-text colour from existing tokens.

Checklist (D-0197 §7): AC5 covers offline and old-cache; AC1 and AC4 cover flagged and not flagged.

## Paths you may change
Lane `web-feature:UF-04`: `apps/web/src/features/uf-04/**` (exercise detail screen, strings, tests). Extra: strings go through the shared module from T-0974 only if it fits; otherwise keep the line in UF-04 strings and say so in the log.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0976` and cite screen IDs.

Per-package commands: one command per script.

## Build / accept log
