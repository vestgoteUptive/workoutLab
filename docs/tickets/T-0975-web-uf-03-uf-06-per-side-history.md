---
id: T-0975
title: Show "per arm" in workout summary, set tables and exercise history
lane: web-feature:UF-06
screens: [UF-03.1, UF-03.3, UF-06.2]
decisions: [D-0260, D-0263]
deps: [T-0972, T-0973, T-0974]
status: todo
---
## Why
A logged "10" must read as per arm afterwards too. Summary, the active set table and exercise history append the suffix to their existing formats through the shared `formatReps` from T-0974 (D-0263 §6 §8). Coverage, balance, targets and Est. 1RM do not change (D-0260).

## Scope
- In:
  - UF-03 `SummaryContent.prText`, `en.uf03.prReps/prWeighted`, ListView `repsLabel` and the UF-03.1 set table call `formatReps`.
  - UF-06 `stats.ts`, set rows and the Best set card call `formatReps`.
  - Flag read from cached `ExerciseDetail` via `toUnilateral`; null reads as both sides.
- Out: engine, Est. 1RM maths, plan rows, rewriting old logs (sets logged before the flag are not edited), UF-09.

## Acceptance criteria
- AC1 Given 3 sets of dumbbell-row logged 10, 10, 9 at 12 kg, When UF-03.1, UF-03.3 and UF-06.2 are shown, Then the set rows read "12 × 10 per arm", "12 × 10 per arm", "12 × 9 per arm".
- AC2 Given the same sets, When the UF-03 ListView renders set 2, Then `repsLabel` reads "Set 2 reps per arm"; When UF-06.2 Best set renders, Then it reads "12 kg × 10 per arm".
- AC3 Given a flagged bodyweight row with 10 reps, Then the row reads "10 per arm"; Given barbell-row with the same sets, Then every string is exactly as before.
- AC4 Given where a grouped summary row already exists, When it renders dumbbell-row, Then it reads "3 × 10 per arm · 12 kg"; Given no grouped row exists, Then none is added.
- AC5 Given the same 3 sets, When coverage is computed, Then back rises by 3 hard sets, not 6, and balance and targets equal those of a bilateral row with the same sets.
- AC6 Given the same sets, When Est. 1RM on UF-06.2 is computed, Then it equals the Epley value from reps and weight as logged, with no side factor.
- AC7 Given the network off and the library cached, Then the labels render; Given a cached row without `unilateral`, Then no suffix; Given an old set logged as 20 reps for a newly flagged row, Then it displays "20 per arm" unedited (accepted for v1).
- AC8 Given a history screen with zero sets for a flagged row, Then the empty state is unchanged.
- AC9 Given the screens' strings, When searched, Then none keeps its own copy of the per-side words (all via `formatReps`/`perSide`).

Checklist (D-0197 §7): AC7 covers offline and old-cache; AC8 covers empty history.

## Paths you may change
- `apps/web/src/features/UF-02/**` and `apps/web/src/lib/i18n/flows/uf-02.ts` (extra: Today duplicates the PR line formats; use the shared per-side helper; orchestrator grant after T-0973 review)
Lane `web-feature:UF-06`: `apps/web/src/features/uf-06/**`. Extras: `apps/web/src/features/uf-03/**` (SummaryContent, ListView, set table, i18n `en.uf03`) with their tests.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0975` and cite screen IDs.

Per-package commands: one command per script.

## Build / accept log
