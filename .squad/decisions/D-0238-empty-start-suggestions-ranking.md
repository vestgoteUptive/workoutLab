---
id: D-0238
title: "Empty-start Suggestions: the list is the engine's own fill-on plan around the user's picks (items not yet picked, in engine order), with one deterministic fallback call when the auto main lift would crowd out a pick; tap = Add, every shown suggestion fits by construction, Shuffle changes suggestions only"
status: revisit
date: 2026-11-13
by: product-owner (idea, owner request)
area: product
builds-on: D-0025, D-0191, D-0199, D-0202, D-0205, D-0235, D-0236, D-0237
---
## Context
The owner wants "easy to select suggestions" in an empty start (D-0236). The suggestions have to be the engine's choice (principle 3), fitted to the time (principle 2), and aimed at the areas that need work. The engine already ranks exactly this when it builds a full plan. Rule 7.2 handles the lowest-`r` area first, favorites first inside an area, recovery and Skip today, exclusions, the caps and the time fit. So the list should reuse that plan rather than add a new ranking rule.

## Decision
1. **Source.** The suggestions are the items of one `suggest` call with `fill: true`, `pinnedIds = addedIds` (the picks), `mainLiftId` = the plan's main lift (or null), the visit's `shuffle`, and every other input as for the plan. Items already in the plan are dropped and the rest are shown in engine order. This is "what the engine would add next, around what you picked".
2. **Main lift.** `autoMainLift` is `true` while the plan has no main lift. If that call's result is missing any pick (the auto main lift took the time a pick needed), the UI makes **one** second call with `autoMainLift: false` and uses that result instead. This rule is deterministic. A suggestion that the engine marks `isMain` gets a "Main lift" tag, and adding it sets `mainLiftId` (not a pin).
3. **Every shown suggestion fits.** Adding a suggested item never pushes out a pick and never goes over the budget. With the plan built as main → picks, the item gets at least the time it had in the suggestions call (the spec has the reasoning). As a safety net, the UI keeps D-0205's check: an Add whose id is missing from the new plan, **or that drops an existing pick**, is refused. The plan stays unchanged and the status line reads "{name} doesn't fit in {n} min." The safety net also covers UF-08.5 in empty mode.
4. **Row.** Each row shows the name, sets × reps · minutes as they appear in the suggestions call, and the engine's one-line reason (the same `rows.ts` copy as UF-08.2). It also shows the "Favorite" and "Main lift" tags, and one button "Add" (accessible name "Add {name}", at least 44 px). The sets on a pick may come out higher than shown, because a pin tries 3 sets. That is fine.
5. **After a tap.** The plan is re-built (D-0236 §3) and the suggestions are recomputed. Focus moves to the Add button of the row now in the tapped row's place, or to "Add exercise" if no suggestions are left. A `role="status"` line says "{name} added."
6. **When the list is empty.** If no time is left for anything: "Your {n} min are full." If every area is skipped, recovering or excluded-out, the existing notices apply and the list reads "No suggestions right now. Search to add an exercise."
7. **Shuffle.** In empty mode the Shuffle button is labelled "Other suggestions". It bumps the visit's `shuffle` and changes only the suggestions (rule 13 never touches pins or an explicit main lift). It is hidden when the list is empty.
8. **Removed and excluded.** Remove of a pick adds the id to the visit's `excludeIds` (D-0191 §4), so the item doesn't come back as a suggestion during this visit. Adding it again through UF-08.5 brings it back (D-0205 §3). Stored exclusions never appear (D-0199).
9. **No cap on list length** beyond the engine's: at most 8 items minus the picks, and at most 2 per primary area (rule 7.2).

## Consequences
- web UF-08: the Suggestions section and its tests. The engine part is D-0237.

## Revisit when
- People want more choice than the engine's fill gives, for example two or three ranked candidates per area. That would need a new pure engine function that exposes rule 7.2's per-area candidate ranking.
- The second call (§2) is ever slow on a low-end phone.
