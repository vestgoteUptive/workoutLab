---
id: D-0219
title: "Engine rule 15 records(history, library): a session's best set (heaviest weight then most reps; longest hold for timed) is a record when it strictly beats every hard set of the same exercise in an earlier other session; the first session is never a record; pure, display-only, never read by suggest"
status: accepted
date: 2026-10-09
by: product-owner (spec, proposed for the engine lane; T-0635 makes the change)
area: engine
amends: D-0068
builds-on: D-0015, D-0024, D-0034, D-0040, D-0068, D-0217
---
## Context
D-0217 promotes "Latest PR" on UF-02.1. D-0068 §5 cut records from v1 and said that if they return, the record logic belongs in `packages/engine` with worked examples, not in the UI. UF-06 already has a "Best set" order (D-0068 §5: the highest `weightKg`, then the most reps at that weight; bodyweight the most reps; timed the longest `durationS`), implemented in `features/UF-06/stats.ts`. A PR should use the same order, so the two never disagree.

The owner question is whether a PR is that order or an estimated 1RM (H-36). The default is that order: it's what the canvas shows ("100 kg × 8"), it needs no formula, and it matches UF-06.

## Decision
1. **New rule 15 in `docs/engine-rules.md`**, and a pure export `records(history: readonly HistorySet[], library: readonly LibraryExercise[]): RecordSet[]` from `packages/engine`:
   - **Sets:** `normalizeHistory(history)`, then only sets for which `isHardSet` is true, of exercises found in `library` with `kind = "exercise"`. Warm-ups, tombstones and unknown exercises are ignored on both sides of a comparison.
   - **Key:** a timed exercise (`timed = true`) compares `durationS ?? 0`. Every other exercise compares (`weightKg ?? 0`, `reps ?? 0`) lexicographically, weight first.
   - **Session best:** per (`exerciseId`, `sessionId`), the set with the highest key; ties go to the earlier `completedAt`, then the smaller `clientId`.
   - **Record:** a session best `b` is a record when the set `E` of hard sets of the same exercise with `sessionId ≠ b.sessionId` and `completedAt < b.completedAt` is non-empty, and `key(b) > key(e)` for every `e` in `E`.
   - **Output** `RecordSet { exerciseId, sessionId, clientId, completedAt, weightKg, reps, durationS, previous: { weightKg, reps, durationS } }`, where `previous` is the highest-keyed set of `E` (same tie rule). Sorted by `completedAt`, then `clientId`.
   - No clock, no time zone, no randomness; the existing purity lint applies.
2. **Display only.** `suggest`, `balance`, `timeCheck`, `rankSwaps` and rule 14 never call `records`. It changes no existing output, so no existing engine test or snapshot changes.
3. **Baseline is the input.** The engine doesn't know about the 56-day cache; the web passes `loadEngineHistory()`. Today's 14-day display filter (D-0217, spec §3.2) is a UI date filter on the output, using the engine's `localDate`/`addDays`.
4. **Worked examples** (fixtures from engine-rules "Fixtures"; T-0635 writes them into rule 15 with these IDs):
   - R15-E1: back-squat S1 09-01 100 × 8, 100 × 8; S2 09-04 102.5 × 6 → one record (S2, previous 100 × 8).
   - R15-E2: as E1 but S2 100 × 9 → record (same weight, more reps).
   - R15-E3: as E1 but S2 100 × 8 → no record (equal is not a record).
   - R15-E4: only S1 with 80 × 8, 90 × 8, 100 × 8 → no record (first session).
   - R15-E5: S2's 102.5 × 6 is tombstoned, S2 also has 100 × 9 → the record is 100 × 9.
   - R15-E6: a warm-up 120 × 1 in S1 is ignored; S2 102.5 × 6 is still a record.
   - R15-E7: plank (timed) 60 s then 75 s in a later session → record.
   - R15-E8: push-up (bodyweight, weight 0) 20 reps then 25 reps → record.
   - R15-E9: S2 adds 10 kg to a bodyweight lift: 10 × 5 beats 0 × 12 → record (weight first).
   - R15-E10: two sessions, the later one lower; then a 10-day gap and a session above the first → one record, the last session.
   - R15-E11: shuffled input order and a duplicate replayed row give the same output (determinism, D-0015 dedupe).
   - R15-E12: the simulated 14-day history fixture (the DoD's engine requirement) gives a fixed, asserted list.

## Consequences
- T-0635 (engine) writes rule 15, the export and the tests; T-0636 (UF-02) renders the latest record.
- UF-06's `bestSet` keeps its own implementation for now; moving it onto the engine key is a follow-up, not required.
- A summary PR on UF-03.3 (T-0604 styles a band the summary never fills) can use `records` later.

## Revisit when
- The owner picks an estimated 1RM or a rep-range record instead (H-36).
- A record baseline older than the device cache is wanted (H-37): the input grows, the rule doesn't change.

Approved by the owner as a contract change, 2026-10-09.

## Owner amendment (H-36, 2026-10-09). This overrides the ranking key above.
The record key for weighted and bodyweight sets is the **estimated 1RM, Epley**: `e1rm = weightKg × (1 + reps / 30)`. A bodyweight set (weight 0) ranks by reps. Timed exercises keep `durationS`. A set is a record when its key strictly beats every earlier session's best key for that exercise. Ties are not records. Reps above 12 still count, but the e1RM is only an estimate, so the Today line shows the actual set (for example "80 kg × 10"), never the e1RM number. Everything else in this decision stands. The window is the H-37 default (56-day history, shown for 14 days).
