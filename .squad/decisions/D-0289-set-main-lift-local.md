---
id: D-0289
title: "Start with this is local: rule 12.8 setMainLift (the old main lift stays as an accessory capped at 3 sets, sets 4/3/2, a refusal set of four, ordering included)"
status: revisit
date: 2026-11-24
by: engine-dev (T-1021)
area: engine
builds-on: D-0205, D-0274, D-0275, D-0287, D-0288
---
## Context
D-0288 §2 kept "Start with this" on one `suggest` call, which can change other areas and drop the user's - / + edits. T-1021 adds a pure engine function so the web can stop calling `suggest` there. The ticket left these details open; each default is changeable.

## Decision
1. **Signature:** `setMainLift(workout, exerciseId, ctx: AreaEditContext) → Workout | {refused}`, the same context as rule 12.5. `suggest` is unchanged.
2. **The old main lift stays** (D-0239 demoted it to a pin; here it is simply kept) as an accessory: accessory reps, pre-fill re-derived, no back-off, and `min(sets, 3)` sets because rule 12.5 caps an accessory at 3 and the web's shape checks assume it. This is the one allowed change to another item, a deviation from AC1's "sets unchanged" for a 4-set old main only; it also frees time.
3. **Sets 4, else 3, else 2** (rule 7.2 step 1 numbers), not 3 as `addArea` of an empty plan (D-0287 §6): the user asked for a main lift. High energy adds the back-off when it fits; Low never trims a main lift.
4. **An existing item is rebuilt** as the main lift (its own sets, swap reason and carried pre-fill are replaced); a new one goes last, then `orderItems` puts the main lift first.
5. **Refusals:** `not_compound`, `not_admissible` (eligibility, recovering or avoided area, 2-per-area cap for a new item), `items_cap` (new item at 8), `time`. A plan is never accepted over `available`. Already main: the result is only the ordering.

## Consequences
Contract: `docs/engine-rules.md` rule 12.8. Web follow-up: UF-08.6 "Start with this" calls `setMainLift` instead of `suggest` (supersedes D-0288 §2 once switched).

## Revisit when
Users expect the old main lift to keep 4 sets, or a refusal should offer a smaller main-lift count.
