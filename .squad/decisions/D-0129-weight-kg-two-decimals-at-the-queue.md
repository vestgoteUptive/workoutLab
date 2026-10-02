---
id: D-0129
title: "Set weights are rounded to 2 decimals (half away from zero) where lib/offline writes the queue entry; the engine's rule 14 is unchanged"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0233)
area: web
builds-on: D-0128 (Consequences, last bullet), D-0026, D-0045 §6
---
## Context
`sets.weight_kg` is `numeric(6,2)` (`docs/data-model.md`). Postgres rounds a 3-decimal value on
insert (82.125 is stored as 82.13), and it gives no error. `lib/offline` `recordSet`/`editSet` store
the weight exactly as they get it. So a queued entry of 82.125 and its server row of 82.13 can differ
until the next history refresh. D-0128 left the question of where to round open.

There were two places to round:
1. **The engine's rule 14 pre-fill.** It rounds with `round3` today. Changing that is an
   `docs/engine-rules.md` contract change. It would also only cover pre-fills. A stepper result, a
   carried weight, a future UF-07 manual log or an old queued entry would still reach the queue
   unrounded.
2. **The queue write.** `recordSet`, `editSet` and `deleteSet` build every entry through one
   function (`toQueuedSet` in `lib/offline/queue.ts`). That is the last step before IndexedDB and
   the server, so it covers every source.

With contract-valid inputs, rule 14 never makes a third decimal anyway. History weights are
`numeric(6,2)`, `increment_kg` is `numeric(4,2)`, and every rule 14 output is `W`, `W + inc` or a
whole multiple of `inc`, so it lands on the 0.01 grid. `round3` there is a float guard. A 3-decimal
pre-fill needs out-of-contract input, such as a test fixture or a stored entry from before this
decision.

## Decision
1. **Where.** Every set entry that `lib/offline` writes (`recordSet`, `editSet` and `deleteSet`,
   through `toQueuedSet`) stores `weightKg` rounded to 2 decimals. The entry the function returns is
   the stored one, so callers (UF-09 `LoggedSet`) see the rounded value too.
2. **How.** Round half away from zero on the decimal value, the way Postgres `numeric` rounds:
   82.125 → 82.13, 82.124 → 82.12, 1.005 → 1.01, 2.675 → 2.68. Binary float error must not flip a
   half: `1.005 * 100` is 100.49999…, so `Math.round(x * 100) / 100` is wrong. Use a decimal-safe
   method, such as `Number(Math.round(Number(x + "e2")) + "e-2")` or an equivalent. `null` stays
   `null`. Integers and values with 1 or 2 decimals are unchanged.
3. **What stays the same.**
   - The engine's rule 14 and `docs/engine-rules.md` are unchanged (no contract change).
   - `formatKg`/`formatDecimal` are unchanged.
   - `reps`, `durationS` and `rir` are integers and aren't touched.
   - `toSetRow` in `flush.ts` sends the stored value as it is. Entries are already rounded when
     they are stored. A pre-D-0129 queued entry gets rounded by Postgres on insert, as today, and
     the history refresh then replaces it.
4. **D-0128 §4 still holds.** It is now a guard for out-of-contract inputs. After this decision, a
   set recorded from an 82.125 pre-fill is stored as 82.13. UF-09.4 opens it as "82.13", and an
   unedited Save makes no `editSet` call. T-0409 AC5's expected logged weight goes from 82.125 to
   82.13 (its `editSet` count stays 0), and the T-0233 builder makes that change.

## Consequences
- The IndexedDB entry, the returned entry, the UF-09 logged set and the server row all agree on
  weight. The engine sees the same value before and after a sync, so rule 14 `W` doesn't change
  across a sync.
- A weight the user sees as "82.13" is the weight that gets saved. Nothing is stored that the user
  couldn't see.
- An out-of-contract increment (3 decimals) can produce a pre-fill that is off the increment grid
  by up to 0.005 kg once rounded. No library or custom exercise can have one (`numeric(4,2)`).

## Revisit when
- `sets.weight_kg` changes precision, or any weight is stored in units other than kg.
- The engine gets an input that can legitimately carry 3 decimals (for example a lb → kg
  conversion). Then decide whether the engine should emit values on the 0.01 grid.
