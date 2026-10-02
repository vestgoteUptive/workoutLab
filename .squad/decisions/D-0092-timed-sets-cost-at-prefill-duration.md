---
id: D-0092
title: Rule 7.1 costs a timed set at the duration the user will see (the rule 14 pre-fill), everywhere the engine costs time
status: revisit
date: 2026-10-01
by: product-owner (T-0219 groom)
area: engine
amends: D-0062 §6 (last two sentences) and D-0062 Consequences (web line)
---
## Context
Rule 7.1 says a timed set's work is "the target duration". T-0201 read that as the library's
`defaultDurationS`, and T-0205 kept that reading (D-0062 §6: "The item's `durationS` and `costS`
still use `defaultDurationS`"). But since T-0205, the duration the user actually sees on UF-09.5 is
the rule 14 pre-fill `prefill.durationS`, which grows by 5 s per session up to 120 s.

So the plan is costed at one duration and shown at another. A plank at `defaultDurationS` 45 s,
logged at 115 s last time, is planned at 3 × (45 + 60) + 60 = 375 s, but the user is shown
120 s and spends 3 × (120 + 60) + 60 = 600 s. That is 225 s over on one item. In a 20-minute
plan with the warm-up off, the plan says 1095 s and the user spends 1320 s, 10 % over a
budget the engine promised to keep (principle 2, R7-E8). D-0062's own revisit trigger names
this case.

## Decision
1. **Planned duration.** For a timed exercise, the work of one set is its **planned duration**:
   the `durationS` that rule 14 `prefill` returns for that exercise over the same history,
   `now` and `tz` that the costing call has. With no usable history this is `defaultDurationS`,
   so every zero-history result stays the same. A non-timed set's work stays 45 s.
   - Rule 14's timed branch never reads the slot or `previous` (D-0057 §6), so the planned
     duration depends only on `(exercise, history, now, tz)`. It is the same value at
     selection time and at item-building time.
   - If an exercise is timed and its `defaultDurationS` is null (bad content), the work falls
     back to 45 s, as it does today.
2. **One time model everywhere.** Every place the engine costs time uses the planned duration:
   - rule 7.2 selection (main, pinned, greedy);
   - rule 7.4 (the time Low frees, and the back-off check, which stays non-timed);
   - rule 13's fit check;
   - rule 12's `timeCostS` and `fitsBudget`;
   - `applySwap` (D-0093);
   - each item's `costS`.

   Rule 8 reads `costS`, so it follows automatically.
3. **`item.durationS = prefill.durationS`** for a timed item. Both are the planned duration, so
   the plan, the pre-fill and the cost are one number. This replaces D-0062 §6's "The item's
   `durationS` and `costS` still use `defaultDurationS`". T-0304 may read either field.
4. **Backward-compatible cost helpers.** `setCostS(exercise)` and `itemCostS(exercise, sets)`
   without a duration argument keep costing at `defaultDurationS`. R7-E1 and UF-04.3's
   per-set cost (T-0306a, a library view with no history) are unchanged. The engine adds an
   optional work-duration argument, or a separate helper, plus one exported pure function that
   returns the planned duration (`null` for a non-timed exercise). The names are the builder's.
5. **Contract change (engine lane):** `docs/engine-rules.md` rule 7.1 gets the planned-duration
   sentence, a new worked example **R7-E13**, and a Traceability row for T-0219. Rule 12, 13 and
   14 text is unchanged: rule 7.1 states that it is the one time model.
6. **Test guards that compare the whole rules file against `main` are re-scoped.**
   `rule-14-suggest.test.ts` (T-0205 AC25) and `t0204-traceability.test.ts` (T-0204 AC25) each
   assert that `docs/engine-rules.md` equals `main` apart from their own edit. Those guards
   protected T-0204's and T-0205's own diffs. Once merged, they fail every later ticket that
   edits the rules under a named decision. The first engine ticket that edits the rules file
   re-scopes them to the sections their tickets guarded:
   - T-0205's guard covers rule 14, from `## 14.` up to `## Required tests`.
   - T-0204's guard covers rule 12 up to and including the `- **R12-E5` line, plus rule 13.

   Each still compares against `main` (and still skips on a shallow clone). This narrows the
   scope to what those tickets owned, and nothing they guarded becomes unguarded.

## Consequences
- engine (T-0219): implements §1–§6 with the simulated 14-day history tests. It changes
  `src/cost.ts`, `src/session.ts`, `src/swaps.ts` and `src/index.ts` (and `src/prefill.ts` if
  the planned-duration helper lives there).
- web (T-0304, UF-09.5): the timed pre-fill is `prefill.durationS`, which now equals
  `item.durationS`. No web change is needed for correctness.
- backend: the vendored engine copy is regenerated with the repo script at merge (D-0053 §1).
- D-0062 stays `revisit` for its other points. Its trigger "Rule 7.1 should cost timed items at
  the progressed `prefill.durationS`" is discharged by this decision.

## Revisit when
- Users edit the pre-filled duration on UF-09.5 often enough that the logged duration, not the
  pre-fill, should drive the cost.
- Rest for timed sets turns out to differ from the compound/isolation rest model.
