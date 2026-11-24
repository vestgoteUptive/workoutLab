---
id: D-0274
title: "UF-08 plans by body area: UF-08.2 becomes \"Today: Chest · Back · Core, 45 min\" with − / + sets per area, exercises sit behind each area, start-empty folds in, Reorder and Shuffle retire, the Ready step stays"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow, owner request)
area: product
amends: D-0109, D-0191, D-0205, D-0236, D-0239, D-0242
supersedes: D-0238
builds-on: D-0002, D-0063, D-0065, D-0199, D-0202, D-0235, D-0237, D-0243, D-0246
---
## Context
The owner (2026-11-24): "I spent a lot of time in the suggested workout with exercises, rearranging, adding and swapping. Rethink it entirely." Of three layers offered the owner chose layer 3 first (areas first, exercises second; spec `docs/specs/areas-first-planning.md`), then layer 1 (D-0277, D-0278).

Conflict check (done in the idea flow's check mode):
- **User flows v2 UF-08.2** describes an exercise list with Swap, Remove, Start with this, Add, Shuffle and Reorder. It is rewritten by T-0992 and T-0993; until they land the old text is what is built.
- **D-0205 §7 (Reorder)** and the rule "order is UI only" conflict with automatic ordering: retired (§4). **D-0205 §4** ("Add re-suggests the rest of the plan around the pin") conflicts with "an exercise Add must not reshuffle other areas": amended (§5).
- **D-0236..D-0242 (empty mode):** the "Start empty" entry and the "time asked first" rule stay and are reused. The exercise-level Suggestions section (D-0238), "Other suggestions", `mode` and the empty-mode budget words are retired. D-0238 is superseded. D-0237's engine switches (`autoMainLift`, `fill`) stay in the engine untouched, because the empty plan at entry is still `suggest` with both off (R7-E31).
- **D-0191 §4 (Remove without refill)** and **§2 (avoidAreas)** are reused. **§5 ("No exercises left. Pick a time to rebuild.")** is replaced inside UF-08.6 by the area wording.
- **D-0235 (swap pins)** is kept as is. **D-0199/D-0202** (excluded, favorites) are kept; both lists stay the only durable preferences.
- **D-0243..D-0247 (add during a workout)** and UF-09.9 "Do later" are untouched and are the answer to "good enough plan, fix on the floor".
- **D-0002:** a new screen ID needs a decision: D-0276. **D-0107 §1:** a cold `?step=area` lands on UF-08.1 like any unknown step.
- Principles: time asked first (kept), deterministic engine (D-0275), targets not silently changed (a dropped area changes no target), onboarding untouched. NFR-AN-2: no timing analytics, so the 20 s target is checked by an e2e tap budget.
- Contracts: `docs/engine-rules.md` gains new rules and edits none (D-0275). `docs/data-model.md` is untouched by layer 3. `api/openapi.yaml` and tokens are untouched.

## Decision
1. **UF-08.2 is "Today's plan", by area.** Title `Today: {Areas}` (priority order, " · " separated), the minutes and finish time under it, the time bar (one segment per area), why chips, one row per area with `− {k} sets +`, the time cost and "Last 14 days: {load} of {target} sets", an "Add an area" list, "Fill the rest for me", the time chips and "Looks good". Exercise names are not on the row.
2. **The default plan is the current engine plan grouped by area.** `suggest` is not changed (D-0275). Zero history, 10 days off, 15 minutes and 90 minutes therefore behave as today.
3. **What happens to the recent work:**
   - **Keep:** UF-08.3 swap and D-0235 pins; UF-08.5 Add (behind UF-08.6, local, §5); Start with this; Remove, the Removed line and Never suggest; Skip today; time chips and bar; why chips; Favorite tag; UF-08.4 Ready; add-during-a-workout (D-0243..D-0247).
   - **Fold in:** "Start empty" (§6).
   - **Retire:** Reorder and Move up / Move down (§4), Shuffle on UF-08.2 (§7), empty-mode Suggestions, "Other suggestions", `mode: "empty"` state and its budget line (§6).
4. **Order is automatic** (engine rule 7.6, D-0275): main lift first, then other compounds, then isolation work; areas alternate; machines grouped. There is no manual order in setup. UF-09.9 "Do {name} later" remains.
5. **Add exercise is local.** UF-08.5 Add inserts the exercise (3 sets, else 2) if it fits the minutes left and changes nothing else; an exercise whose area isn't in the plan adds the area. It no longer re-suggests the other areas around a pin (amends D-0205 §4, D-0239 §1). It still goes into the visit's pins so a time rebuild keeps it.
6. **"Start empty" opens UF-08.2 with no areas.** Label and place on UF-08.1 are unchanged. "Add an area" is open, "Looks good" is disabled until one area is added ("Add at least one area."), "Fill the rest for me" adds areas. Not remembered (D-0236 §1).
7. **Shuffle** leaves UF-08.2 (exercise-level variety is Swap and "Not today"). Rule 13 and the endpoint keep it.
8. **Edits are per visit.** The +/− set edits and added areas are dropped by a time chip ("Plan rebuilt for {n} min. Your set changes were cleared."); removed areas (they join the visit's skipped areas), swaps, adds and exclusions are kept.
9. **Refuse, never overrun.** A **+**, an Add area and an exercise Add that don't fit the minutes left are refused in words. The one allowed overrun is a UF-08.3 swap with `fitsBudget: false` (D-0239 §13), after which the screen says so and refuses further adds.
10. **Ready stays.** UF-08.2 → "Looks good" → UF-08.4 → Start. Tap budget: 2 taps from UF-08.2 with no edit, 4 with two edits. Folding Ready into UF-08.2 is an owner question (spec).
11. **Defaults:** area maximum and minimum are in D-0275 §3; the row shows a count, not names; priority order on screen.

## Consequences
- Tickets T-0992..T-0999 (D-0279). Spec: `docs/specs/areas-first-planning.md`.
- `docs/specs/empty-start-plan.md` stays as history; its status line gains "folded into D-0274" when T-0998 retires the code.
- Many UF-08 tests change deliberately (Reorder, Shuffle, empty-mode Suggestions); each change gets a one-line reason in the ticket log, none is weakened.

## Revisit when
- People miss manual order or Shuffle.
- Four taps from Today to Start, or two from the plan, still feels slow (then fold Ready in).
- People change the time after editing sets and the clear is annoying.
