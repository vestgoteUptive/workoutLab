---
id: D-0237
title: "Engine: SessionInput gains two optional booleans, autoMainLift (rule 7.2 step 1 fallback) and fill (rule 7.2 step 3 greedy), both default true and deep-equal to today when absent; an empty-start plan is suggest with both false"
status: revisit
date: 2026-11-13
by: product-owner (idea, owner request)
area: engine
builds-on: D-0024, D-0037 §7, D-0191 §2, D-0202 §3, D-0205, D-0236
---
## Context
Empty-start planning (D-0236) needs a plan that holds **only** what the user picked, with each item built by the engine (sets, reps, pre-fill, cost, warm-up, reasons). Principle 3 rules out building items in the UI.

`suggest` can't do this today:
- Rule 7.2 step 1 always picks a main lift when `mainLiftId` is null or ineligible.
- Step 3 (greedy) always fills the remaining time.

Getting there with the existing functions doesn't work. Calling `suggest` with `pinnedIds` and then `removeItem` on every unpicked item gives a different plan. The auto main lift uses up time before step 2, so a pick may be cut to 2 sets or skipped even though it fits on its own. The warm-up is also left built from the removed items' areas. So a small engine change is needed. It is the smallest one possible: two switches on steps that already exist, and no new ranking.

## Decision
1. `SessionInput` gains two optional inputs:
   - `autoMainLift?: boolean`, default `true`. When `false`, step 1 uses `mainLiftId` only if it is eligible and fits (4, 3, then 2 sets), as today. Otherwise there is **no fallback**: no main lift is chosen and `mainLiftId` stays null.
   - `fill?: boolean`, default `true`. When `false`, step 3 (greedy) is skipped.
   Absent and `true` give a result deep-equal to today's for every input.
2. Everything else is unchanged with either switch off. Step 2 still places `pinnedIds` (3 sets, then 2, skipped if the item doesn't fit or isn't admissible, so the caps and recovery and avoided areas still apply). Exclusion still beats a pin. Shuffle (rule 13) still only touches non-pinned accessory slots. Energy (7.4), the warm-up (7.3), reasons (rule 10), pre-fill (rule 14) and the totals all work as before. With both `false` and no pins, `items` is `[]`, `mainLiftId` is null and `itemsTotalS` is 0. The warm-up is then built from general moves (rule 7.3 with an empty area list).
3. **Contract changes named here:**
   - `docs/engine-rules.md` §0 session input list and rule 7.2: the two inputs and examples. Examples cover zero history, returning after 10 days off, pins and caps, an explicit main lift with `autoMainLift: false`, and deep-equal when absent. Engine lane.
   - `api/openapi.yaml` SessionInput: two optional booleans, not in `required`, and `packages/shared` api.gen.ts regenerated. Data lane.
   - The `/workouts/suggest` validator accepts both and passes them through. Backend lane.
   The web app calls `suggest` on the device (D-0063 §3), so the openapi and validator tickets don't block the feature (the same arrangement as D-0191 §3).
4. `rankSwaps`, `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin`, `prefill` and `excludedOutAreas` are unchanged.

## Consequences
- Tickets (proposed in the spec): engine, data (openapi) and backend (validator).
- The simulated 14-day history tests must include the two switches (definition of done for engine changes).

## Revisit when
- A third switch is needed. At that point, replace the booleans with one `build` mode.
