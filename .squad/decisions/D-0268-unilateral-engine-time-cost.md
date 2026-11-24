---
id: D-0268
title: "One side at a time: the engine prices a flagged set at two sides of work (rule 7.1), reading an optional `unilateral` on the engine's LibraryExercise; the owner lifts the D-0262 parking (T-0978a data, T-0978b engine)"
status: decided
date: 2026-11-23
by: product-owner (owner request)
area: engine
supersedes: D-0262
amends: D-0263
builds-on: D-0260, D-0261, D-0264, D-0024, D-0092
---
## Context
D-0262 shipped the per-side label first and accepted that the plan under-estimates a flagged set by about 45 s (a 3-set row by 2 min 15 s), parking the fix as T-0978 (`idea`, status `revisit`). The owner has now asked for it to be built (2026-11-23). D-0263 §1 said the flag is NOT on the engine's `LibraryExercise`; that has to change for the engine to price it. The label work (T-0971 to T-0977) is done, so nothing waits on the label.

Checked first: `docs/data-model.md` already has `exercises.unilateral` (T-0972); `api/openapi.yaml` `LibraryExercise` has `additionalProperties: false` and no `unilateral`; `packages/shared` `toLibraryExercise` does not copy the flag; the web library cache (`libraryCache`) and the Edge Function build their library through that mapper. Every engine time cost already goes through one function, `setCostS` in `packages/engine/src/cost.ts`.

## Decision
1. **D-0262 is superseded.** Its §1 (no engine change) and §2 (accept the under-estimate) end here; its §3 (the parked ticket) is carried out as T-0978a and T-0978b.
2. **Rule 7.1 (time model).** Work for a set of a flagged exercise is two sides: a non-timed set works **90 s** (2 × 45); a timed set works **twice its planned duration**. Rest (120 s compound, 60 s isolation) and the 60 s transition are unchanged: one rest covers both sides. A back-off set is a set and costs the same. The item's `durationS` stays the planned duration of **one** side (it is what UF-09 shows as "40 s per side"), and `reps` stay per side. Because everything reads `setCostS`, rule 7.2 selection, 7.4, rule 12 `timeCostS` and `fitsBudget`, rule 13, `applySwap`, `insertItem`, rule 8 and `timeLeftS` agree with no further change. Worked numbers: a compound flagged row × 3 costs 3 × (90 + 120) + 60 = 690 s (unflagged 555 s); a timed 45 s isolation flagged row × 2 costs 2 × (90 + 60) + 60 = 360 s (unflagged 270 s).
3. **The flag on the engine type.** The engine's `LibraryExercise` gains `unilateral?: "arm" | "leg" | "side" | null`. Absent, `null` or any other value means both sides: the result is deep-equal to today's (every existing fixture, worked example and simulated history is unchanged). This amends D-0263 §1 for the engine only; the web `ExerciseDetail` keeps carrying the flag for the labels.
4. **Contract (T-0978a, data lane).** `api/openapi.yaml` `LibraryExercise` gains the optional property `unilateral` (enum `arm`, `leg`, `side`, or null), not in `required`: additive, like D-0264. `packages/shared/src/api.gen.ts` is regenerated. `toLibraryExercise` sets the key **only for a flagged row**, so an unflagged row's object (and every cached or vendored copy of it) is byte-identical to today's. `docs/data-model.md`'s `unilateral` note changes from "the engine never reads it (D-0262)" to "read by the engine's time model only (D-0268)". The vendored shared copy is regenerated.
5. **Counting is untouched.** The flag never reaches hard-set counting, balance, records, e1RM, pre-fill or history (D-0260 §2). The guard that said the engine has no reference to `unilateral` becomes an allow-list: only `packages/engine/src/types.ts` and `packages/engine/src/cost.ts` may mention it.
6. **IndexedDB.** No version bump (D-0263 §2 stands). Library rows cached before T-0978a have no flag, so on that device a flagged row is priced as both sides until the next `refreshLibrary` (every online app start replaces the rows wholesale). The server's `POST /workouts/suggest` builds its library from the database, so it prices flagged rows from the first deploy. A plan built offline from an old cache can therefore differ from the server's for the same input; this window is accepted.
7. **Order.** T-0978a (data) first, then T-0978b (engine, re-vendor, the three guards and the e2e pins that flip). T-0978b is not parallel with T-0692: both edit `packages/engine/**`, `docs/engine-rules.md` and the vendor copy.

## Consequences
- Plans with a flagged row hold fewer sets or fewer other items for the same budget; they now fit the time the user chose (principle 2).
- Three pins flip on purpose: `packages/shared/test/unilateral-boundary.test.ts`, the "no `unilateral` key" assertion in `packages/shared/test/mappers.test.ts`, and the "engine cost pin" and "search finds no 'unilateral'" tests in `tests/e2e/uf-09-one-side.spec.ts`.
- `docs/specs/unilateral-exercises.md` (Time, AC13, open question 2, out of scope) is amended in place with a pointer here.

## Revisit when
Users report that a flagged exercise still runs long or short (for example, a real rest between sides). Then 7.1 gets a rest term for a flagged set, not a new rule.
