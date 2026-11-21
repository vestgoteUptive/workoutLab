---
id: T-0974
title: Show "per arm" next to the reps on the set screen and build the shared reps formatter
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4]
decisions: [D-0260, D-0261, D-0263]
deps: [T-0972, T-0973, T-0953, T-0954]
status: todo
---
## Why
During a set the user must see whether "10" means per arm, without a new element (principle 1). This ticket adds the suffix to the existing reps line and stepper, and creates the one shared `formatReps(reps, unilateral, timed)` and `perSide(word)` module that UF-03 and UF-06 reuse (D-0263 §4 §5 §8). It lands after T-0953 and T-0954 which touch the same files.

## Scope
- In:
  - New shared web i18n module (path chosen by the builder under `apps/web/src`, outside any single flow folder; see Paths) with `formatReps` and `perSide`.
  - `current-set.tsx`: hero line per design spec T-0973; `confirm-set.tsx`: stepper aria-label and visible caption.
  - Reads the flag from the cached `ExerciseDetail` via `toUnilateral`; null reads as both sides.
- Out: engine, saved values (per-side count stored as entered, no multiplication), UF-09.9, plan rows, UF-03 and UF-06 screens.

## Acceptance criteria
- AC1 Given dumbbell-row at 12 kg, 10 reps in UF-09.3, When shown, Then the weight line reads "12 kg" over "× 10 per arm" in one `<p>` with aria-label "12 kg, 10 reps per arm"; Given a flagged bodyweight row, Then "10 reps per arm"; Given barbell-row, Then the line is exactly as before.
- AC2 Given side-plank planned 40 s, When shown, Then the line reads "40 s per side" with aria-label "40 seconds per side".
- AC3 Given single-leg-calf-raise in UF-09.4, When shown, Then the stepper group aria-label is "Reps per leg" and the visible caption is "per leg"; buttons are still "More reps" and "Less reps"; Given side-plank, Then "Seconds per side" and caption "seconds per side".
- AC4 Given the stepper at 12 and weight 12.5, When the set is saved (tap or 5 s auto-save), Then the stored set is `reps: 12` and weight 12.5 with no multiplication; the queued offline set has the same plain values.
- AC5 Given the library cached and the network off, When a flagged row is shown, Then the label appears and the set queues and uploads later; Given a cached row with no `unilateral` field, Then no label shows.
- AC6 Given `formatReps(10, 'arm', false)`, `formatReps(10, null, false)`, `formatReps(40, 'side', true)` and an unknown word, Then the outputs are "10 per arm", "10", "40 s per side" and the bilateral form; UF-09 files hold no copy of the strings.
- AC7 Given UF-09.3 and UF-09.4 with a flagged row, When axe runs, Then it passes; targets stay at least 44 px; at 320 px the suffix wraps and is not truncated; no extra row, step or element is added (one reps line).
- AC8 Given RIR 0 logged on a flagged row, When the next pre-fill is computed, Then the weight holds exactly as for a bilateral row (unit-level check of D-0250 unchanged).

Checklist (D-0197 §7): AC5 covers online/offline and flagged/unflagged; AC1 covers zero-history first set (label from the first set) as the pre-fill is unchanged. No migration.

## Paths you may change
Lane `web-feature:UF-09`: `apps/web/src/features/uf-09/**` (current-set, confirm-set and tests). Extra: the new shared i18n module and its test under `apps/web/src/lib/i18n/**` (or the path the builder chooses under `apps/web/src/lib/**`, noted in the log). Orchestrator grant: `.squad/decisions/D-0267-per-side-focus-follows-design-spec.md`.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0974` and cite screen IDs.

Per-package commands: one command per script.

## Build / accept log

- Build (frontend-dev, gate: web typecheck, lint, test (5190 after the css scope fix, UF-09 + i18n 1318 green), format:check green, e2e uf-09 42 passed; check-all flags only paths other tickets own, none of mine): shared `apps/web/src/lib/i18n/per-side.ts` (`formatReps`, `perSide`, `perSideCaption`, `repsGroupLabel`, `asWord`); UF-09 reads the flag from the cached `ExerciseDetail` via `useCachedFields` (use-cue.ts, one read for cue and flag). Follows the round-2 design spec where the ticket differs (D-0267). AC to test (`t0974.per-side.test.tsx`, `per-side.test.ts`): AC1 hero/bodyweight/unflagged/zero-history; AC2 timed hold; AC3 group and caption; AC4 Done and edit store plain 10/12 and 12/12.5, auto-save no edit; AC5 offline row queues, absent or unknown flag no label; AC6 formatter and no strings in UF-09 files; AC7 same child elements, css wrap and muted colour (axe is the e2e run); AC8 prefill after RIR 0 holds. Planted faults, all caught: no suffix (AC1 x3), reps doubled (AC3/AC4 x4), group label unflagged (AC3), timed suffix dropped (AC2), flag read as null (6), aria-hidden dropped (AC1).
- QA (qa-tester, HEAD 3af91f63, clean, up to date with main): added `t0974.per-side-axe.test.tsx` (AC7 DOM axe, color-contrast and region off, 3 tests: UF-09.3 weighted, bodyweight, UF-09.4 stepper, all flagged). Faults on app code, each caught on the 3 ticket test files, restored with cp and cmp: reps doubled on save (AC4), perSide defaults to arm when unflagged (4 fail), hidden reading span dropped (AC1 and axe), stepper caption dropped (AC3 and axe), timed suffix dropped (AC2), bodyweight suffix dropped (AC1). web test 395 files 5223 passed; e2e uf-09 42 passed; format:check green. Gap: no e2e spec seeds a flagged exercise (ticket paths exclude tests/e2e).
