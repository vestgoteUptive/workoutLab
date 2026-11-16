---
id: D-0236
title: "Empty-start planning: UF-08.1 gets a secondary \"Start empty\" button that opens UF-08.2 with no items and an inline Suggestions section; the mode is per visit, \"Looks good\" needs at least one item, and \"Fill the rest for me\" switches to the normal suggested plan; no new screen ID"
status: revisit
date: 2026-11-13
by: product-owner (idea, owner request)
area: product
builds-on: D-0002, D-0109, D-0191, D-0199, D-0202, D-0205, D-0235
amends: D-0191 §5 (in empty mode, 0 items disables "Looks good"), D-0205 §4 (in empty mode an Add re-builds the picks only)
---
## Context
The owner (2026-11-13): "I also think we need another way of planning a session. Like a start with empty but with easy to select suggestions."

Today UF-08.1 "Suggest my workout" always hands UF-08.2 the engine's full plan. Building your own means removing items one by one and adding through UF-08.5 search, and every Add re-suggests the rest of the plan around the pick (D-0205 §4). There is no way to start from nothing.

## Decision
1. **Entry: UF-08.1 only.** Under the primary "Suggest my workout", a secondary button "Start empty". It uses the same UF-08.1 inputs (minutes, warm-up toggle, energy, Skip today). Time is still asked first (principle 2). "Suggest my workout" stays the primary and default action, so onboarding and the Quick 20-min path are unchanged (principle 5). There's no "Clear all" on UF-08.2 in v1.
2. **No new screen ID.** Empty mode is a state of UF-08.2. It has the same time-budget bar, the item list (empty at first) and a new **Suggestions** section under the list (D-0238). The setup record gains `mode: "suggested" | "empty"`, set at entry. Like `addedIds`, it lasts for this visit only (D-0205 §8), and Back to UF-08.1 drops it (D-0109 §1).
3. **Picks are pins.** In empty mode every item except the main lift is in `addedIds`. Each Add (suggestion tap, UF-08.5 Add, or a UF-08.3 swap-in per D-0235) re-builds the plan with `fill: false, autoMainLift: false` (D-0237). The engine still builds every item (sets, reps, pre-fill, cost, warm-up), but it adds nothing on its own.
4. **Empty plan copy.** With 0 items, the list shows "Nothing here yet. Pick from the suggestions or add an exercise." This replaces D-0191 §5's "No exercises left" copy in empty mode. **"Looks good" is disabled** until there is at least one item, with the reason "Add at least one exercise." in `aria-describedby`. Suggested mode keeps D-0191 §5 as it is.
5. **A tiny plan is allowed.** One 5-minute item in a 45-minute budget can start. The bar shows the unused time and UF-08.4 shows the real duration and finish time. Nothing nags.
6. **"Fill the rest for me".** A text button under the Suggestions section switches the visit to `mode: "suggested"`. It runs one suggested-mode re-suggest with `pinnedIds = addedIds` and `mainLiftId` = the plan's (D-0205 §4), so the user's picks stay and the engine fills the remaining time. The Suggestions section goes away, and from then on it is the normal UF-08.2. There's no way back to empty mode in this visit except Back to UF-08.1.
7. **Everything else on UF-08.2 behaves as today** on the picked items: Swap (D-0235), Remove (D-0191 §4; the id also leaves the suggestions for this visit), Start with this (D-0205 §5), Reorder (D-0205 §7), time chips, Skip today line, the Removed line and Never suggest (D-0199), the excluded-out notice, and the Favorite tag (D-0202). An added item's reason line is still "Added by you".
8. **Offline.** Everything runs on the device (`suggest` on device, D-0063 §3). Nothing is written before Start (UF-08.4 writes `sessions.plan` as today).

## Consequences
- Spec: `docs/specs/empty-start-plan.md`. User flows v2 UF-08.1 and UF-08.2 are updated when the first web ticket is groomed (after the human answers the spec's open questions).
- Needs the engine inputs in D-0237 and the Suggestions behaviour in D-0238.
- No data-model or design-token change.

## Revisit when
- People want the choice remembered ("always start empty"), or a "Clear all" on UF-08.2.
- People start 1-item workouts by accident.
- People want to go back from "Fill the rest" to empty mode without leaving UF-08.2.
