---
id: D-0287
title: "Area edits (rules 12.5 to 12.7): details D-0275 left open (the -1 step follows the ticket, the context carries targets, a candidate's home area is the area, load is the 14-day load, the main lift of an empty plan starts at 3 sets)"
status: revisit
date: 2026-11-24
by: engine-dev (T-0995)
area: engine
builds-on: D-0275, D-0269, D-0268, D-0286
---
## Context
D-0275 §3 to §5 name the edit functions but leave a few details open, and one line of §3 disagrees with T-0995's AC4. Each default below keeps D-0275's shape and is changeable. `suggest` and every other function are unchanged.

## Decision
1. **−1 reads the area's last item only.** If it has more than 2 sets it loses one; else, with two items in the area, it is removed; else (one item at 2 sets) the area is removed. This follows AC4 (3 and 2 sets: −1 removes the second item and keeps the first at 3). D-0275 §3's "the last item that has more than 2 sets" would have cut the first item to 2 instead; AC4 wins.
2. **+1 then −1 is not always a round trip.** It is when +1 raised the area's last item (always for one item; for two items when the last one had room). With sets [2, 3] +1 raises the first item and −1 then cuts the last. The seeded property tests exactly that condition.
3. **The context carries `targets`.** `ctx` is `{history, targets, profile, library, excludeIds?, favoriteIds?, avoidAreas?, autoMainLift?, now, tz}`. Rule 7.2's gap fit and `r` need the targets, which `suggest` takes as its second argument.
4. **A candidate's home area is the area.** For an added item the candidates are the rule 7.2 candidates with weight 1.0 in the area whose first primary area is that area (the item's home, rule 12.4). back-squat (quads 1, glutes 1) is a glutes item, so `addArea(quads)` never picks it; otherwise the plan would show glutes and still offer quads.
5. **Only the top candidate is tried.** `addArea` and the second item of `+1` take the area's top candidate (3 sets, else 2; a second item only 2). They do not walk down the list for a cheaper one, so `time` is reported for the exercise the user would get.
6. **The main lift of an empty plan** (`addArea` into `items: []`, `autoMainLift` not `false`) is rule 7.2 step 1's top compound for the area (D-0269) at 3 sets, else 2, not 4: the stepper then reaches 4. An area with no compound gets a plain item and no main lift.
7. **`areaCandidates.load` is the 14-day history load** (the UI's "Last 14 days: 8 of 20 sets"); the order uses the projected load with the plan's own sets. Reasons are checked in the order recovering, avoided, excluded_out, no_exercise, items_cap, time; `addArea` answers `area_unavailable` for the first four.
8. **Reasons of an edited item stay as they were.** A +1 or −1 changes `sets` and `costS` only; a trimmed or back-off item keeps its reasons and its back-off set.

## Consequences
`docs/engine-rules.md` rules 12.5 to 12.7 say this. The web calls the four functions and never builds an item (principle 3).

## Revisit when
People want a cheaper exercise offered when the top one doesn't fit, or a different step for −1.
