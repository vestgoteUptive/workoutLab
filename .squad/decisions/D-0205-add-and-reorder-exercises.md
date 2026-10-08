---
id: D-0205
title: "Add and reorder exercises: new UF-08.5 Add exercise sheet over UF-08.2 (search, favorites first, this visit's pinnedIds, \"Start with this\" sets mainLiftId), a UI-only Reorder mode on UF-08.2 whose order survives re-suggests, and a UF-09.9 \"Do this later\" that moves the current not-started exercise after the next one through a sessions.plan write; no engine, API or data-model change"
status: revisit
date: 2026-10-07
by: product-owner (idea, owner request)
area: product
builds-on: D-0002, D-0024, D-0037 §7, D-0071 §5, D-0109, D-0111 §7, D-0120 §1 §7, D-0191, D-0199, D-0202, D-0203
amends: D-0109 §2 (the UF-08.2 inputs record gains this visit's added ids and the user's order), D-0191 §4 (Remove of an added item also drops it from the added list)
---
## Context
The owner (2026-10-07), verbatim:
1. "When planning to start the next workout. I would like to search and add exercise. I have my
   favorites. for example if legs are included. I would like to add Back squat with barbell
   manually because thats an exercise I prefer to start with. If I can add some exercises manually
   the rest are adjusted."
2. "I also would like to reorder exercises in a workout, maybe because of natural order or busy
   machine."

What exists (main 4fb94e6):
- `suggest` already takes `sessionInput.mainLiftId` (rule 7.2 step 1: used if it is in the pool,
  is a **compound**, has no recovering or avoided primary area, and fits at 4, 3 or 2 sets) and
  `pinnedIds` (step 2: each in order at 3 sets, then 2, **skipped silently** if it isn't
  admissible or doesn't fit). Selection order is main → pinned → greedy, and `items` come out in
  that order (`session.ts` 665–678). Shuffle (rule 13) never touches pinned slots or the main lift.
  Exclusion beats a pin (R7-E19).
- UF-08.2 (`SessionSetup.tsx`) re-suggests on Shuffle and the time chips with
  `mainLiftId` = the current plan's and `pinnedIds: []`. Remove is `removeItem` (no refill) and
  appends the id to the visit's `excludeIds` (D-0191 §4). A UF-08.3 swap is dropped by the next
  re-suggest (D-0109, T-0303c).
- The engine exports `isEligible`, `recoveringAreas` and `avoidedAreas`, so the UI can state the
  engine's reason an exercise can't be added without a new engine function.
- Item order matters downstream only as order: the main lift is the `isMain` flag, not position 0
  (`applySwap`, `timeCheck` and UF-09 read the flag). UF-09.1 shows `plan.items[0]`.
- In a workout the plan lives in `sessions.plan` (`SessionPlan` v1, an ordered `items` array). It
  is already rewritten mid-workout by the UF-05.1 swap (`replaceItem`) and UF-09.8 Trim / Skip
  next (D-0120 §1), on the device first and synced like any session row (offline works).
  UF-09's focus state refers to items by index (`LoggedSet.itemIndex`, `skippedItems`).

## Decision
1. **Entry: a sheet with its own screen ID, UF-08.5 Add exercise.** UF-08.2 gets an "Add exercise"
   button under the item list (above Shuffle). It opens UF-08.5 as a sheet over UF-08.2, the same
   pattern as UF-08.3 (no URL change, Back/Escape/Close returns to UF-08.2 with focus on "Add
   exercise"). UF-08.5 is never reachable from UF-02, UF-03, UF-09 or UF-11.
2. **Search.** One field, "Search exercises", focused on open. It matches a case-insensitive
   substring of the name over library rows of kind `exercise` (warm-up moves never), sorted by
   name then id, the same rule as UF-11.5/UF-11.6.
   - **Empty query:** "Favorites" (the user's stored favorites, D-0202, by name) first, then
     "Today's areas": the exercises with weight 1.0 in a primary area of a current item, grouped by
     area in the fixed order, by name inside an area (an exercise appears under each such area,
     as on UF-11.6). An exercise listed under Favorites is not repeated below. No favorites: the
     section is omitted. No items (all removed): Favorites only, then "Search to find an exercise."
   - **No match:** "No exercises match “{query}”."
3. **Row states** (one line of text, never colour alone; buttons `aria-disabled` with the reason in
   `aria-describedby`). First match wins:
   1. In this workout → "In this workout". No Add. A non-main compound keeps "Start with this".
   2. Excluded (stored list, D-0199) → "Excluded. Include it again in Plan › Excluded exercises."
      UF-08.5 never writes the excluded list.
   3. Equipment → "Not available with your equipment"; level → "Above your level" (the D-0202
      `isEligible` tests).
   4. A primary area skipped on UF-08.1 → "Skipping {Area} today" (change it through Back).
   5. A primary area recovering (`recoveringAreas`) → "{Area} is recovering".
   An exercise removed on this visit (D-0191) is **not** disabled: adding it takes it out of the
   visit's removed ids.
4. **Add = this visit's `pinnedIds`.** The setup record gains `addedIds: string[]` (add order).
   Add calls `suggest` once with `pinnedIds = addedIds + [id]`, `mainLiftId` = the current plan's,
   and `excludeIds` = stored ∪ visit removes (T-0538's union) minus `id`. The rest of the plan is
   re-suggested around it (the owner's "the rest are adjusted"); removes stay out.
   - **Doesn't fit:** if the id is not in the result (time, the 2-per-area cap or the 8-item cap
     among main + added), the plan and `addedIds` stay unchanged and the sheet shows a status line:
     "{name} doesn't fit in {n} min." plus, for a compound, " Start with it instead, or pick more
     time." and otherwise " Pick more time." For the caps: "This workout already has two {Area}
     exercises." / "This workout has 8 exercises, the most it can hold." The time budget always
     rules (principle 2); nothing ever goes over it.
   - **On success** the sheet closes, focus goes to the new row on UF-08.2, and a `role="status"`
     line says "{name} added."
   - An added item's one-line reason is "Added by you" (UI copy from `addedIds`; the engine's
     reasons are unchanged). The D-0202 "Favorite" tag still shows.
5. **"Start with this" = `mainLiftId` and position 1.** Offered for a **compound** only (rule 7.2
   step 1 ignores an isolation `mainLiftId`): on a UF-08.5 result ("Start with {name}", which also
   adds it) and on a non-main compound row of UF-08.2. It calls `suggest` with
   `mainLiftId = id` (and `pinnedIds` including it when it came from the sheet). One main lift at a
   time: the previous main lift loses main status and, if it isn't an added item, returns to the
   pool. Same doesn't-fit rule as §4 (it is tried at 4, 3, then 2 sets). The new main lift is
   placed first (§7). An isolation can still be moved first with Reorder; it just isn't a main lift.
6. **Remove of an added item** is the D-0191 Remove: `removeItem`, no refill, the id joins the
   visit's removed ids (so the "Removed" line and its "Never suggest" apply, D-0199). It also leaves
   `addedIds`. If it was the main lift, `mainLiftId` becomes null (D-0191 §4); the next re-suggest
   picks one.
7. **Reorder on UF-08.2 is UI only.** A "Reorder" button switches the list to Reorder mode: each
   item row shows its name and sets × reps with "Move up" and "Move down" buttons (labels "Move
   {name} up/down", ≥ 44 px; the first row has no Move up, the last no Move down); Swap, Remove,
   Shuffle, the time chips, Add exercise and "Looks good" are hidden; "Done" leaves the mode. After
   a move, focus stays on the moved row's button in its new place and a `role="status"` line says
   "{name} moved to {k} of {N}." The warm-up row stays first and can't move. No drag in v1.
   - The record gains `order: string[] | null` (exercise ids; null = engine order). The engine
     never sees it: the UI permutes `plan.items` (totals unchanged, warm-up not regenerated, as in
     `applySwap`).
   - **Re-suggest merge** (Shuffle, a time chip, Add, Start with this): with `order` null, engine
     order. Otherwise the items that survive keep the user's relative order; a **new main lift**
     goes first; other new items are appended in engine order. Remove drops the id from `order`;
     a UF-08.3 swap replaces it in place.
   - The main lift keeps `isMain` wherever it sits. "Start with this" moves the new main lift to
     position 1 even in a user order.
   - Start (UF-08.4) writes `sessions.plan` with the items in display order. UF-08.4 and UF-09 walk
     that order.
8. **Per visit only.** `addedIds`, `order` and the removed ids live in the UF-08 setup record and
   go when the user leaves UF-08 (Back to UF-08.1 drops the record, D-0109). Nothing is written to
   the profile or server before Start. Routines (UF-07) stay the place for persistent forced items.
9. **During a workout: "Do this later" on UF-09.9 Paused.** Principle 1 rules out a list in focus
   mode, so there is no reorder UI on UF-09.1–.8. UF-09.9 gets one action, "Do {name} later",
   between Swap and Skip to next exercise:
   - **Current item** = the item the machine is on (`itemIndex`), or item 0 in `getReady`/`warmup`.
   - **Shown only when** the current item has no logged set (any set, List view included), is not
     skipped, and at least one later item is neither complete nor skipped. Hidden when
     `resumePhase` is `timeCheck` (UF-09.8 has its own options) and when the item is partially done
     (End/Skip are the ways out; a partial exercise is never moved, so no logged set ever moves).
   - **Effect:** the item moves to just after the next item that is neither complete nor skipped.
     Tapping again on the new current item pushes that one on (repeat = further). One write: the
     stored session row's `plan.items` in the new order (the D-0120 Trim path, device first,
     queued for sync, so it works offline; last write wins, NFR-SYNC-3), then a machine event that
     remaps every `LoggedSet.itemIndex` and `skippedItems` entry by the same permutation.
   - **Then:** the pause ends. From `getReady`/`warmup` it resumes that phase (UF-09.1 now names the
     new first item); otherwise it goes to UF-09.6 Next exercise for the new current item with its
     60 s set-up countdown. No UF-09.8 time check runs: nothing finished and paused time doesn't
     count. A `role="status"` line on UF-09.6 says "{name} moved to later."
   - **Time check:** rule 8's `remainingS` is the sum of the not-started items' costs, which a
     permutation of not-started items doesn't change, so `behindS` is unchanged. Trim's tie-break
     ("the later item first") reads the stored order, so a moved item may be trimmed first on a
     tie; that is deterministic and accepted.
   - **Reload:** the plan write lands before the focus state; a stored focus state whose
     `LoggedSet.exerciseId` doesn't match `plan.items[itemIndex].exerciseId` is realigned by
     exercise id (an exercise appears once per plan), otherwise D-0111 §7 applies. Reloading right
     after "Do this later" resumes at the new current item with every logged set kept. The sets
     themselves are `session_sets` rows and never move.
   - UF-03.1 List view shows the stored order; it gets no reorder control in v1. UF-05.1 Swap stays
     the answer for "this machine is taken for good".
10. **No contract change.** Engine: none (`pinnedIds`, `mainLiftId`, `removeItem`, `isEligible`,
    `recoveringAreas` and `avoidedAreas` already exist; rules 7.2, 8 and 13 as written).
    `api/openapi.yaml`: none. `docs/data-model.md`: none (`sessions.plan.items` is already an
    ordered array that is rewritten mid-workout; the focus state is device-local). Design tokens:
    none.
11. **Design prerequisite.** Before any UI ticket: screen specs for UF-08.5, the UF-08.2 "Add
    exercise" button, "Added by you" reason, "Start with this" row action and Reorder mode, and the
    UF-09.9 "Do {name} later" action, on the D-0203 visual foundation, with no new token.

## Consequences
- Spec: `docs/specs/uf-08-add-and-reorder.md`. User flows v2 gain UF-08.5 and the UF-08.2 and
  UF-09.9 changes; the PRD gains a row.
- Tickets (proposed, not filed): design specs; UF-08.5 search and Add; "Start with this"; Reorder
  mode and merge; the favorites section of UF-08.5 (after the D-0202 device cache); UF-09 "Do this
  later" machine/persistence and its UF-09.9 UI. All UF-08 work runs after T-0538 in the same
  folder, serially.
- `.squad/decisions/INDEX.md` must be regenerated (`node .squad/tools/archive.mjs index`).

## Revisit when
- The owner wants added items or order to persist beyond the visit, or to survive Back to UF-08.1.
- A UF-08.3 swap being dropped by an Add re-suggest confuses people (then the visit's swap-ins
  become pins).
- The owner wants drag-to-reorder, a "Move to end" choice, or reorder in UF-03.1.
- People expect "legs" or an area name to match in the search.
