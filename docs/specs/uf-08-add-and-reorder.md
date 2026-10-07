# Add and reorder exercises — spec

- **Idea:** the owner, 2026-10-07: "When planning to start the next workout. I would like to search and add exercise. I have my favorites. for example if legs are included. I would like to add Back squat with barbell manually because thats an exercise I prefer to start with. If I can add some exercises manually the rest are adjusted." And: "I also would like to reorder exercises in a workout, maybe because of natural order or busy machine."
- **Screens:** new UF-08.5 Add exercise (a sheet over UF-08.2). Changes on UF-08.2 Suggested, UF-08.4 Ready (order only) and UF-09.9 Paused (and UF-09.1/UF-09.6, which show the moved order). User flows v2 (D-0002).
- **Decisions:** D-0205 (this feature). Builds on D-0024 and rule 7.2 (`mainLiftId`, `pinnedIds`), D-0109 (the UF-08.2 inputs record, every re-suggest keeps the main lift), D-0191 (Skip today, Remove without refill), D-0199 (excluded exercises; the visit/stored `excludeIds` union, T-0538), D-0202 (favorites), D-0120 §1 §7 (UF-09.8 plan writes, Skip to next), D-0111 §7 (focus-state restore), D-0203 (visual foundation).
- **Principles:** 1: nothing new on UF-09.1–.8; the only in-workout control is on UF-09.9 Paused. 2: the time budget rules; an add that doesn't fit is refused, never squeezed in. 3: the engine still picks everything except what the user explicitly adds; order is a UI permutation the engine never reads. 4 and 5: untouched.

## What it is
Before a workout the user can **add** exercises they want today (search, favorites first), mark one compound as the one to **start with** (the main lift), and **reorder** the list. The engine re-suggests the rest around what they added. During a workout, a machine that's busy is handled from Pause with **"Do {name} later"**, which moves the current exercise one place later.

How the exercise-level inputs compose on UF-08.2 (D-0202's table, extended):

| Input | Set where | Lifetime | Effect |
|---|---|---|---|
| `mainLiftId` | the current plan's main (D-0109), or "Start with this" (this spec) | this visit | is the main lift if it's an eligible compound that fits |
| `pinnedIds` | UF-08.5 Add (this spec) | this visit (`addedIds`) | placed after the main lift whatever the gaps say, if it fits |
| `favoriteIds` | UF-04.2, UF-11.6 (D-0202) | stored | ranked first inside an area the gaps chose |
| `excludeIds` | stored list (D-0199) ∪ this visit's Removes (D-0191) | stored / this visit | never picked; beats all of the above |

## UF-08.2 changes
- **"Add exercise"** button under the item list, above Shuffle. Opens UF-08.5. Hidden in Reorder mode.
- **Added items:** the one-line reason is "Added by you" (instead of the engine-reason line); the D-0202 "Favorite" tag still shows. Every other row detail (sets × reps · weight · minutes, Swap, Remove) is as today.
- **"Start with this"** on a compound item that isn't the main lift (label "Start with {name}"). Not on isolation items or the main lift.
- **"Doesn't fit" line:** when an id in `addedIds` is missing from the current plan after a re-suggest (e.g. a shorter time chip), one line under the list: "Doesn't fit in {n} min: {names}." (names in add order). The ids stay in `addedIds`, so a longer time brings them back.
- **"Reorder"** button in the list header. Reorder mode:
  - Each item row shows name, sets × reps and "Move up" / "Move down" (labels "Move {name} up" / "Move {name} down", ≥ 44 px targets). The first item has no Move up, the last no Move down. The warm-up row stays first and has no controls.
  - Swap, Remove, Start with this, Add exercise, Shuffle, the time chips and "Looks good" are hidden. "Done" leaves the mode, with focus on "Reorder".
  - After a move, focus stays on the same button of the moved row in its new place (or the other button when the one used disappears at the top/bottom), and one `role="status"` line says "{name} moved to {k} of {N}."
  - No drag in v1.
- **Status line** (`role="status"`, present on mount, empty until used): "{name} added.", "{name} is the main lift now.", the move line above.

## UF-08.5 Add exercise (new)
A sheet over UF-08.2, the UF-08.3 pattern: no URL change; Close, Escape and the browser Back close it and return focus to "Add exercise". Never reachable from UF-02, UF-03, UF-09 or UF-11.

- **Header:** "Add exercise", Close. One line: "The rest of your workout adjusts to fit {n} min."
- **Search field** "Search exercises", focused on open: a case-insensitive substring of the name over every library row of kind `exercise`, sorted by name then id. Warm-up moves never appear.
- **Empty query:**
  1. "Favorites": the stored favorites (D-0202), by name then id. Omitted when there are none.
  2. "Today's areas": the exercises with weight 1.0 in any primary area of a current item, grouped under the area label in the fixed area order, by name then id inside an area. An exercise is listed under each such area, except one already shown under Favorites.
  3. With no items (all removed): Favorites only, then "Search to find an exercise."
- **Query with no match:** "No exercises match “{query}”."
- **Each row:** the name, its primary areas, the "Favorite" tag when it is one, and actions:
  - **Add** (label "Add {name}"), for any exercise.
  - **Start with this** (label "Start with {name}"), for a compound only: adds it and makes it the main lift.
- **Rows that can't be added** show one text line and `aria-disabled` actions with the line as `aria-describedby`. First match wins:
  1. In this workout: "In this workout". No Add. A non-main compound keeps "Start with this" (the D-0205 §5 row action, reachable from here too).
  2. In the stored excluded list: "Excluded. Include it again in Plan › Excluded exercises." (UF-08.5 never writes the list.)
  3. `isEligible(e, {...profile, level: "advanced"}, [])` false: "Not available with your equipment".
  4. `isEligible(e, profile, [])` false: "Above your level".
  5. A primary area in UF-08.1's Skip today: "Skipping {Area} today".
  6. A primary area in `recoveringAreas(history, library, now)`: "{Area} is recovering".
  An exercise removed on this visit is not disabled; adding it takes it out of the visit's removed ids.

## What Add and Start with this do
The UF-08 setup record (D-0109 §1, D-0191 §1) gains `addedIds: string[]` (add order) and `order: string[] | null`.

- **Add {id}:** one `suggest` call with `mainLiftId` = the current plan's, `pinnedIds = [...addedIds, id]`, `excludeIds` = sorted(dedupe(stored ∪ visit removes)) without `id`, and every other input from the record. If `id` is an item of the result, the result becomes the plan, `id` is appended to `addedIds` and leaves the visit removes, the sheet closes, focus goes to the new row and the status says "{name} added." Otherwise the plan, `addedIds` and the removes are unchanged, the sheet stays open and its status line says why:
  - 8 items among main + added: "This workout has 8 exercises, the most it can hold."
  - two items with that primary area among main + added: "This workout already has two {Area} exercises."
  - otherwise (time): "{name} doesn't fit in {n} min. Start with it instead, or pick more time." for a compound, "{name} doesn't fit in {n} min. Pick more time." for an isolation.
- **Start with this {id}:** the same call with `mainLiftId = id` (and `id` in `pinnedIds` when it came from the sheet as a new add). Success when the result's `plan.mainLiftId` is `id`; then the status says "{name} is the main lift now." Same refusal rule and copy otherwise ("{name} doesn't fit in {n} min. Pick more time."). The previous main lift loses main status; if it isn't in `addedIds` it goes back to the pool and may or may not return.
- **Shuffle and time chips** pass `pinnedIds = addedIds` (instead of today's `[]`). Shuffle never changes added items (rule 13 skips pinned slots).
- **Remove of an added item:** the D-0191 Remove (`removeItem`, no refill; the Removed line and its "Never suggest" apply, D-0199), and the id leaves `addedIds` and `order`.
- **Order merge** after every new plan: `order` null → engine order (main lift, added items in add order, then the greedy fill). Otherwise the surviving items keep the user's relative order, a new main lift goes first, and other new items follow in engine order. A UF-08.3 swap replaces the id in place.
- **Start (UF-08.4):** `sessions.plan.items` is written in display order. `plan.mainLiftId` and every item's `isMain` are the engine's.
- **Leaving UF-08** (Back to UF-08.1, or leaving the route) discards `addedIds` and `order` with the rest of the record (D-0109). Nothing is stored before Start.

Engine examples the ACs rely on (F-tz, F-profile, L1, F-history empty, the R7-E4 inputs: 30 min, warm-up on, `available` 1620). The test author checks each against `suggest` before encoding it; a disagreement goes to triage with the derivation.
- **X1 (add, not main)** `mainLiftId` bench-press, `pinnedIds` [back-squat]: bench-press × 4 (main, 720 s), back-squat × 3 (555 s), straight-arm-pulldown × 2 (270 s); 1545 s, `unusedS` 75. (Back is the next zero-`r` area; every back compound × 2 costs 390 s > 345 s left.)
- **X2 (start with)** `mainLiftId` back-squat, `pinnedIds` [back-squat]: back-squat × 4 (main, 720 s), bench-press × 3 (555 s), straight-arm-pulldown × 2 (270 s); 1545 s, `unusedS` 75.
- **X3 (over budget)** At 15 min (`available` 720), X1's inputs: bench-press × 4 only; back-squat is skipped (rule 7.2 step 2). X2's inputs: back-squat × 4 only.
- **X4 (shorter time drops the add)** X1's inputs at 20 min: bench-press × 4, straight-arm-pulldown × 2 (R7-E5); back-squat × 2 (390 s) doesn't fit the 300 s left.

## UF-09.9 "Do {name} later"
- **Where:** one action on UF-09.9 Paused, between Swap and Skip to next exercise, label "Do {name} later". Nothing on UF-09.1–.8.
- **Current item:** the item at `itemIndex`, or item 0 when `resumePhase` is `getReady` or `warmup`.
- **Shown only when** the current item has no logged set (from focus mode or the List view), is not in `skippedItems`, and a later item is neither complete nor skipped. **Hidden** when `resumePhase` is `timeCheck`, and when the current item is partly done; a partly done exercise is never moved, so no logged set ever changes item.
- **Effect:** the current item moves to just after the next item that is neither complete nor skipped. One write: the stored session row with `plan.items` in the new order (the D-0120 Trim path: device first, queued, synced, last write wins), then one machine event that ends the pause and remaps every `LoggedSet.itemIndex` and `skippedItems` entry by the same permutation. `plan.mainLiftId`, `isMain`, sets and costs are unchanged.
- **Then:** from `getReady` or `warmup` the same phase resumes (UF-09.1 names the new first item); otherwise UF-09.6 Next exercise for the new current item, with its 60 s set-up countdown and a `role="status"` line "{name} moved to later." No UF-09.8 check runs.
- **Repeat:** the action on the new current item pushes that one on. There is no "Move to end" in v1.
- **Time check:** rule 8's `remainingS` sums the costs of the not-started items; a permutation of not-started items leaves it, and so `behindS`, unchanged. Trim's tie-break ("the later item first") reads the stored order.
- **Offline:** works the same; the row syncs with the queue. A failed device write leaves the order and the pause unchanged and shows "Couldn't move {name}. Try again." on UF-09.9.
- **Reload:** the plan write lands first. On restore, a stored `LoggedSet` whose `exerciseId` differs from `plan.items[itemIndex].exerciseId` is realigned to the item with that `exerciseId` (one per plan), and `skippedItems` the same way; anything still inconsistent follows D-0111 §7.
- **List view (UF-03.1)** and the summary (UF-03.3) show the stored order. No reorder control there in v1.

## Edge cases
- **Offline (UF-08):** search, Add, Start with this, Reorder and Remove all run on the device (`suggest`, `removeItem` are pure; the library, favorites and excluded lists are cached). Nothing on UF-08.5 needs the network.
- **Zero history:** recovering is empty; X1/X2 hold.
- **Returning after 10 days off:** nothing recovers; adds work as X1/X2; pre-fills follow rule 14 (re-entry).
- **Time running out:** an add that doesn't fit is refused with copy; a shorter time chip drops an added item and shows the "Doesn't fit" line; in a workout, "Do this later" never changes `behindS`.
- **All items removed, then Add:** the add re-suggests a full plan around it (the engine picks a main lift unless the add is "Start with this").
- **Favorite that is excluded:** can't happen (D-0202 mutual exclusion); the excluded state wins if caches disagree.
- **Duplicate add:** the "In this workout" state prevents it.

## Acceptance criteria (each one is at least one automated test)
Fixtures: L1 library and F-profile as in `docs/engine-rules.md`, names in sentence case ("Back squat", "Bench press"), the R7-E4 plan on UF-08.2 unless stated. "Offline" means `navigator.onLine` is false.

- **AC1 (open, empty query)** Given favorites [lateral-raise, back-squat] and the R7-E4 plan (chest, back, quads items), When the user taps "Add exercise", Then UF-08.5 opens with focus in "Search exercises", the first section is "Favorites" with Back squat then Lateral raise, then "Today's areas" with Chest, Back and Quads groups in that order; Quads lists Leg extension ("In this workout") and not Back squat. With no favorites, Then there is no "Favorites" heading and Quads lists Back squat and Leg extension.
- **AC2 (search)** Given UF-08.5 open, When the user types "SQU", Then the results are every kind-`exercise` row whose name contains "squ" case-insensitively, by name then id, and no warm-up move. When the user types "zzz", Then "No exercises match “zzz”."
- **AC3 (disabled reasons)** Given bench-press in the plan, pull-up (intermediate) in the library, Skip today [calves], 6 hard leg-curl sets at `now − 24 h` (hamstrings recovering) and stored exclusions [dead-bug], Then: Bench press shows "In this workout" and no Add; Dead bug "Excluded. Include it again in Plan › Excluded exercises."; Pull up "Above your level"; Calf raise "Skipping Calves today"; Leg curl "Hamstrings is recovering"; each disabled button is `aria-disabled` and described by its line. With equipment [] Back squat shows "Not available with your equipment".
- **AC4 (add, the rest adjusts)** When the user taps "Add Back squat" at 30 min, Then UF-08.2 shows X1 (bench-press × 4 main, back-squat × 3, straight-arm-pulldown × 2; bar 1545 of 1620 s), Back squat's reason is "Added by you", focus is on its row, the status says "Back squat added.", and exactly one `suggest` call was made with `pinnedIds` [back-squat] and `mainLiftId` bench-press.
- **AC5 (start with this)** When the user taps "Start with Back squat" in UF-08.5 at 30 min, Then UF-08.2 shows X2 with Back squat first and marked as the main lift, Bench press × 3 is not the main lift, and the status says "Back squat is the main lift now." Given the R7-E4 plan, Then Bench press (the main lift) and Leg extension (isolation) have no "Start with this", and Inverted row has "Start with Inverted row"; in UF-08.5, Leg extension has Add but no "Start with this".
- **AC6 (doesn't fit)** Given 15 min, When the user taps "Add Back squat", Then the plan is still bench-press × 4, `addedIds` is empty, the sheet stays open and says "Back squat doesn't fit in 15 min. Start with it instead, or pick more time." When the user then taps "Start with Back squat", Then the plan is back-squat × 4 (main) only. Given 15 min and "Add Leg extension" not fitting, Then the copy is "Leg extension doesn't fit in 15 min. Pick more time." Σ item costs never exceed `available` in any case.
- **AC7 (caps)** Given main bench-press and added [db-bench-press] at 90 min, When the user adds push-up, Then the plan is unchanged and the sheet says "This workout already has two Chest exercises."
- **AC8 (time chip keeps or drops adds)** Given X1, When the user taps 20, Then the plan is X4 and the line "Doesn't fit in 20 min: Back squat." shows. When the user taps 30, Then the plan is X1 again and the line is gone. When the user taps Shuffle on X1, Then back-squat × 3 stays at position 2.
- **AC9 (remove an added item)** Given X1, When the user removes Back squat, Then `removeItem` was called and no `suggest` call, the plan is bench-press × 4 and straight-arm-pulldown × 2, the Removed line lists Back squat with "Never suggest", and a following time chip doesn't bring it back. When the user adds Back squat again from UF-08.5, Then it is in the plan and gone from the Removed line.
- **AC10 (re-add a removed item)** Given leg-extension removed on this visit, Then UF-08.5 shows Leg extension with Add enabled, and adding it passes `excludeIds` without leg-extension.
- **AC11 (reorder)** Given the R7-E4 plan, When the user taps Reorder and "Move Leg extension up" twice, Then the rows read Leg extension, Bench press, Inverted row, the warm-up row is still first, focus is on "Move Leg extension down" (Move up is gone at the top), and the status says "Leg extension moved to 1 of 3." Swap, Remove, Add exercise, Shuffle, the time chips and "Looks good" are not in the DOM until "Done". Bench press is still marked as the main lift.
- **AC12 (order survives a re-suggest)** Given AC11's order, When the user taps 45, Then the surviving items among leg-extension, bench-press and inverted-row keep that relative order, every new item follows them in the engine's order, and the bar's segments follow the display order. When the user then taps "Start with Inverted row", Then Inverted row is first.
- **AC13 (order reaches the workout)** Given AC11's order, When the user taps Looks good and Start, Then the stored `sessions.plan.items` are leg-extension, bench-press, inverted-row, `plan.mainLiftId` is bench-press, and UF-09.1 names Leg extension.
- **AC14 (per visit)** Given X1 with a user order, When the user goes Back to UF-08.1 and taps "Suggest my workout", Then the plan is R7-E4 in engine order and nothing was written to the server.
- **AC15 (offline UF-08)** Given offline, When the user adds Back squat and reorders, Then AC4's and AC11's results hold with no network request.
- **AC16 (Do this later)** Given a workout of bench-press × 4 (main), inverted-row × 3, leg-extension × 2 with bench-press done and the machine on UF-09.6 for Inverted row, When the user pauses and taps "Do Inverted row later", Then the stored plan items are bench-press, leg-extension, inverted-row, the screen is UF-09.6 for Leg extension with the 60 s countdown, the status says "Inverted row moved to later.", every bench-press `LoggedSet` still has `itemIndex` 0, and no UF-09.8 was shown even when `behindS ≥ 60` before the tap.
- **AC17 (Do this later, before the first set)** Given the same plan paused from UF-09.2 Warm-up, When the user taps "Do Bench press later", Then the items are inverted-row, bench-press, leg-extension, the warm-up resumes where it was, and UF-09.1/UF-09.6 then name Inverted row; bench-press keeps `isMain`.
- **AC18 (not shown)** Given one bench-press set logged and the user paused on UF-09.3 set 2, Then there is no "Do Bench press later". Given the current item is the last not-complete, not-skipped item, Then it isn't shown. Given UF-09.9 opened from UF-09.8, Then it isn't shown.
- **AC19 (time check unchanged)** Given the R8 fixture (`elapsedS 1500`, `nextItemIndex 1`), When barbell-row is moved after leg-curl, Then `timeCheck` gives `behindS 105` as before.
- **AC20 (skipped items remap)** Given item 1 skipped (D-0120 §7) and the current item 2 of 4, When the user taps "Do {item 2} later", Then it moves after item 3, and `skippedItems` still points at the skipped exercise.
- **AC21 (offline and reload)** Given offline, When the user taps "Do Inverted row later" (AC16), Then the stored row's plan has the new order and is queued; When the page reloads, Then focus mode resumes on Leg extension with every logged set kept; When the connection returns, Then the server row has the new order.

Design acceptance (the design ticket, before any UI ticket): screen specs for UF-08.5, the UF-08.2 "Add exercise" button, the "Added by you" reason, the "Start with this" row action, Reorder mode, the "Doesn't fit" line, and the UF-09.9 "Do {name} later" action, on the D-0203 classes; no new token, no hex; ≥ 44 px targets; unique labels ("Add {name}", "Start with {name}", "Move {name} up/down", "Do {name} later").

## Open questions (each with the default that ships)
1. **Should Back to UF-08.1 keep the adds and the order?** Default: no, the whole record is dropped (D-0109); changing Skip today means re-adding.
2. **Should a UF-08.3 swap survive an Add?** Default: no change; an Add (a re-suggest) drops a swap as Shuffle and the chips already do (D-0109). Revisit by making swap-ins visit pins.
3. **Should search also match area names ("legs", "quads")?** Default: name only, as UF-11.5/UF-11.6. The empty-query "Today's areas" groups cover the "if legs are included" case.
4. **Include an excluded exercise from UF-08.5?** Default: no; the row says where to do it. Keeps UF-08.5 free of writes and offline-complete.
5. **Drag to reorder on UF-08.2?** Default: no; Move up/down only (keyboard and screen-reader friendly, no gesture conflicts with scroll).
6. **"Move to end" as well as "after the next one" in UF-09.9?** Default: one action; repeat taps move it further.
7. **Reorder in UF-03.1 List view?** Default: no in v1.
8. **Can an isolation be "Start with this"?** Default: no (the engine's main lift is a compound); move it first with Reorder instead.
9. **Should "Start with this" on an engine-picked row also pin it?** Default: no; it is the main lift, which every re-suggest keeps (D-0109).

## Out of scope (v1)
- Persisting added exercises or order beyond one UF-08 visit (routines, UF-07, are the place).
- Adding exercises during a workout.
- Changing sets or reps of an added exercise before the workout.
- An engine change of any kind.
