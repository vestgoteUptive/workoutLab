# Add exercise during a workout — spec

- **Idea:** the owner, 2026-11-13: "New feature. I want to be able to add exercise during a session."
- **Screens:** a new **UF-09.10 Add exercise** (a sheet over focus mode, opened only from UF-09.9 Paused) and one new action on UF-09.9. UF-09.1–.8 are unchanged, apart from what they already read from the plan (progress bar segments, "Next exercise"). User flows v2 (D-0002). The next free step number in UF-09 is .10.
- **Decisions:** D-0243 (product: entry, list, position, caps, copy), D-0244 (engine: `insertItem`, `timeLeftS`), D-0245 (focus state, sync, where the code lives), D-0246 (review rulings; amends all three). Builds on D-0205 (UF-08.5 and "Do {name} later"; D-0243 lifts its "not during a workout" line and amends §1), D-0120 (mid-workout plan writes, Skip, UF-09.9 numbers), D-0111 §7 (restore), D-0142 (seams), D-0170 (leaf entries), D-0199 (exclusions), D-0202 (favorites), D-0231 (no level pointer in UF-09).
- **Status:** accepted 2026-11-13. The owner accepts the open-question defaults below (D-0246 §1). Board section "Add exercise during a workout", rows at `todo`.
- **History:** D-0205 (2026-10-07) put "Adding exercises during a workout" out of scope for v1. That deferred it; it was not decided against.

## Problem
Today a workout is fixed once it starts. The user can swap (UF-05.1), skip, trim (UF-09.8) or move an exercise later, but they can't add one. Two cases come up a lot: they finish early and want one more exercise, or they see a free machine and want to use it. Their only choices now are to end the workout and log nothing for that exercise, or to start a second workout.

## User story
As a lifter mid-workout with time to spare, I want to pause, find an exercise and add it, so that it runs after my current exercise with sensible sets, reps and weight, and my time budget still holds.

## Principles check
1. **One task on screen.** The only entry is on UF-09.9 Paused. UF-09.10 is a sheet over focus mode, the same pattern as the UF-05.1 swap. Nothing new appears on UF-09.1–.8.
2. **Time budget.** The sheet shows the minutes left, and an add that doesn't fit the time left is refused. Nothing goes over the budget through an add, as measured by the rule 7.1 cost model, not the wall clock (D-0246 §11).
3. **Deterministic engine.** The user picks the exercise. The engine (`insertItem`) decides the sets (3 or 2), reps, pre-fill weight, cost and whether it fits. The UI only filters rows by the existing eligibility tests. No LLM is involved.
4. **Adaptive targets.** Untouched. Sets logged on an added item count like any set.
5. **Onboarding under 60 s.** Untouched.

## The flow

### UF-09.9 Paused: "Add exercise" (D-0243 §1)
- The action order is: Resume · Swap · Do {name} later · **Add exercise** · Skip to next exercise · How-to · List view · End. The button is ≥ 44 px, labelled "Add exercise".
- It is shown in every paused phase (`getReady`, `warmup`, `set`, `confirm`, `rest`, `timed`, `next`). It is **hidden** when the pause came from UF-09.8 (`resumePhase: "timeCheck"`).
- It is still shown at 8 items and with no time left. The sheet then explains why nothing can be added, rather than the action silently disappearing.
- Paused renders one `role="status"` line, empty on mount, for the success line. Opening or closing the sheet, and the new plan after an add, never remount Paused (D-0246 §7).

### UF-09.10 Add exercise (D-0243 §2, §3)
- A sheet over focus mode (D-0211 plan sheet, as UF-05.1). Close, Escape and Back close only the sheet and return to UF-09.9 with focus on "Add exercise". Nothing navigates or ends (D-0246 §6). The workout stays paused the whole time, with every timer stopped.
- The sheet is self-contained. It imports its own CSS, and its root carries `wl-uf08` and `data-wl-state="plan"`, so it is styled even when SessionSetup was never loaded (after a reload into UF-09) (D-0246 §16).
- **Lead line:** "{m} min left", where `m = floor(timeLeftS / 60)`. When `timeLeftS < 60` it reads "No time left".
- **Search** is the UF-08.5 field and rule (D-0205 §2): a case-insensitive substring match on the name, over the cached library (kind `exercise`), sorted by name then id. With no match: "No exercises match “{query}”."
- **Empty query:** "Favorites" (D-0202) first, then "Today's areas", grouped by the primary areas of the plan's items in the fixed order. Skipped and done items count. There is **no "Suggested" section** in v1 (open question 4).
- **Row states**, where the first match wins and the row shows a text reason with no Add:
  1. "Skipped in this workout" if the exercise is a skipped item. "In this workout" if it is any other item, **or if it has a set logged in this workout** even though it is no longer an item (it was swapped out after sets were logged; D-0246 §2).
  2. "Excluded", "Not available with your equipment", "Above your level" (no pointer out of focus mode, D-0231).
  3. "{Area} is recovering", computed from `recoveringAreas` over the history **before `started_at`**, at `started_at`. Today's sets never block the area being trained.
- **Each addable row** has one button, "Add". Its accessible name is "Add {name}", or "Add {name}, {area}" when the exercise shows under more than one area section (as on UF-08.5; D-0246 §3). There is no "Start with this".
- **Add** calls `ctx.insertItem(id)`:
  - It refuses an id that is a plan item or has a set logged in this workout, with no write and no event (D-0246 §2).
  - `timeLeftS` (D-0244 §2) is computed from the live state.
  - Then `insertItem(workout, id, {atIndex: min(itemIndex + 1, items.length), leftS})` is called (D-0244 §1, D-0246 §12).
  - On success: the plan write, then `ITEM_INSERTED` (D-0245 §1).
- **Success:** the sheet closes and the screen stays on UF-09.9 with focus on "Add exercise". Paused's `role="status"` line says "{name} added after {current name}." (the only success line, D-0246 §4). The user may add another one, or Resume.
- **Refused:** the sheet stays open, the plan is unchanged and nothing is written. The sheet's `role="status"` line says one of the following (a failed write uses `role="alert"`):
  - `time`, m ≥ 1: "{name} doesn't fit in the {m} min left."
  - `time`, m = 0: "{name} doesn't fit. No time left."
  - `items_cap`: "This workout has 8 exercises, the most it can hold."
  - Write failed: "Couldn't add {name}. Try again."
- **Offline:** everything works offline. The library, favorites, exclusions, profile and history come from the device cache. The engine runs on the device. The plan write is queued.

### Where the new item goes (D-0243 §4)
- It goes just after the current exercise, at `itemIndex + 1`. In `getReady` or `warmup` that means after item 0. On the last item it is appended. On a pause from UF-09.6, the current exercise is the one about to start, so the add lands after it (D-0246 §5).
- To do it **now** rather than next: if the current exercise is not started (UF-09.6, or the warm-up), "Do {name} later" on it puts the added one first.
- The caller clamps `atIndex` to the plan length. An empty plan can't reach focus mode, but the clamp guards it anyway (D-0246 §12).
- After the current exercise finishes, the normal between-exercises path runs: UF-09.8 if behind (rule 8 now counts the added item), then UF-09.6 for the added item.

### How sets, reps and rest are set (D-0244 §1)
- The engine's `insertItem` builds the item the way `applySwap` does:
  - accessory slot (`isMain: false`, reps by goal);
  - rule 14 pre-fill over the history at now, with no carry;
  - planned duration for a timed exercise;
  - no back-off;
  - cost from rule 7.1 (rest 120 s for a compound, 60 s for an isolation).
- **Sets:** 3, then 2 if 3 doesn't fit. With Low energy, only 2.
- **Reasons:** `area_deficit` (from session-start deficits), `days_since`, `energy_low_trim` when it applies, and `prefill`. There is no swap reason and no new reason code. `sessionReasons` is unchanged.
- **Check order** (D-0246 §8):
  1. Structural `RangeError`: unknown id or warm-up move, id already an item, `atIndex` out of range, `leftS` not an integer, `now` without an offset.
  2. `items_cap` at 8 items.
  3. `time`.

### Time budget effect
- The fit test is against **`timeLeftS`**: the budget, minus the elapsed time (paused excluded), minus the unspent warm-up when it is in the budget, minus what is left of every item that isn't skipped. That is a whole item when it isn't started, or its remaining sets when it is. Being behind leaves a negative value, which refuses every add.
- Between exercises, `timeLeftS` equals rule 8's `−behindS` only when no item at or after the next one has sets logged ahead (List view) and none of them is skipped (D-0246 §11).
- **Model limits** (D-0246 §11):
  - Paused during a rest, `timeLeftS` overstates the time left by up to 120 s, because the running rest isn't subtracted.
  - Paused mid-set, it understates the time left.
- `itemsTotalS`, `totalS` and `unusedS` are recomputed. `itemsTotalS` may exceed `available`, because skipped items keep their cost, and `unusedS` clamps at 0. `available`, `budgetMin`, the planned finish (D-0120 §2) and UF-09.9's "Left {n} min" do not change.
- Rule 8 at later check points includes the added item in `remainingS`. If the user then falls behind, UF-09.8 Trim may cut sets from the added item, or the whole item, like any accessory. Trim is the user's choice.

### Effects on logged-set indices (D-0245 §1, §3)
- Inserting at `k` shifts every `LoggedSet.itemIndex ≥ k` and every `skippedItems` entry `≥ k` up by one. These are normally only sets logged ahead from List view. The machine's `itemIndex` is unchanged.
- The plan is written first. A reload in between realigns the indices by exercise id, so no logged set is lost or moved to another exercise. That relies on an exercise with logged sets never being added back after a swap; row state 1 and `ctx.insertItem` block it (D-0246 §2).
- `session_sets` rows hold `exercise_id`, not an index, so nothing server-side changes.

### History and coverage
- Only logged sets count: in the 14-day loads, Balance (UF-10), records, check-ins and the next suggestion. An added item that is never done counts for nothing. The UF-03.3 summary and UF-03.1 List view show it as planned.

### Caps (D-0243 §5)
- The only cap is 8 items in the plan, done and skipped included (`SessionPlan.items maxItems 8`). There is no 2-per-area cap for a user add, and the exercise must not already be in the plan.

### Sync (D-0245)
- `upsertSession({...row, plan})` writes device first and is queued. `sessions` is last-write-wins (NFR-SYNC-3).
- Focus state is device-local (D-0111 §7). A single device runs a session in v1. A second device that wrote the plan would drop the added item; that is accepted until D-0245's revisit (D-0246 §15).
- Finishing while the plan write is still queued: the stored summary includes the added item (D-0246 §17).

## Edge cases
- **Add during rest (UF-09.5):** the pause stops the rest countdown, and Resume continues it where it was. The new item comes after the current exercise's remaining sets.
- **Add during the warm-up or Get ready:** it goes in after item 0. The warm-up is not regenerated, and Resume continues the warm-up.
- **Add on the last set of the last exercise:** the item is appended. After that set, the workout goes to UF-09.6 for the added item instead of UF-03.3. **After the workout has finished** (UF-03.3), there is no add (out of scope).
- **Add the same exercise twice:** refused by the row state "In this workout". An exercise appears once per plan.
- **Add an exercise already skipped:** the row reads "Skipped in this workout" and has no Add. Un-skipping is out of scope.
- **Add an exercise already done** (wanting more sets): the row reads "In this workout". Extra sets are out of scope (open question 6).
- **Add back an exercise swapped out after sets were logged:** the row reads "In this workout" and has no Add (D-0246 §2).
- **Back or Escape with the sheet open:** closes only the sheet (D-0246 §6).
- **Zero history:** the pre-fill is `first_time` (null weight, low reps; 0 kg bodyweight), and the "Favorites" section is omitted.
- **Returning after 10 days off:** the pre-fill is `hold_after_break` (rule 14), and `days_since` is honest.
- **Time running out:** 3 sets → 2 sets → refused, with the minutes in words.
- **Offline, and a reload mid-add:** see Sync and indices. A failed device write changes nothing.
- **Behind schedule:** the action is hidden on a pause from UF-09.8. From any other pause, `timeLeftS` is usually ≤ 0 and every Add is refused with "No time left". Paused in a rest, it can read up to 120 s high (see Time budget effect).
- **8 items:** refused with the cap line.

## Behaviours (acceptance-criteria ready)
Fixture **P**: F-tz, F-profile, F-goal, L1 library. `budgetMin 45`, warm-up in the budget (done unless stated), energy normal. Plan items: bench-press × 4 (main, 720 s), inverted-row × 3 (555 s), leg-extension × 2 (270 s). `itemsTotalS` 1545, `available` 2520. History is empty unless stated.

- **B1 (add during rest, zero history)** Given P, paused from UF-09.5 after bench-press set 2 of 4 with `elapsedS` 600, When the user opens Add exercise, Then the lead line is "15 min left" (`timeLeftS` 2700 − 600 − 330 − 555 − 270 = 945). When they add lateral-raise, Then the stored items are bench-press, lateral-raise × 3 (10–15, pre-fill null × 10 `first_time`, 375 s), inverted-row, leg-extension. `itemsTotalS` is 1920 and `unusedS` 600. `mainLiftId` is still bench-press. Both bench-press `LoggedSet`s keep `itemIndex` 0. The screen is UF-09.9 with "Lateral raise added after Bench press.", and Resume returns to the rest countdown where it stopped.
- **B2 (falls back to 2 sets)** Given B1 with `budgetMin 35` (`timeLeftS` 345), When the user adds lateral-raise, Then it is lateral-raise × 2 (270 s).
- **B3 (refused, minutes)** Given B1 with `budgetMin 32` (`timeLeftS` 165), Then the lead line is "2 min left", and Add lateral-raise shows "Lateral raise doesn't fit in the 2 min left." with no plan write.
- **B4 (refused, no time)** Given B1 with `budgetMin 30` (`timeLeftS` 45), Then the lead line is "No time left", and Add shows "Lateral raise doesn't fit. No time left."
- **B5 (compound)** Given B1, When the user adds back-squat, Then back-squat × 3, 8–12, `isMain` false, 555 s, at index 1.
- **B6 (low energy)** Given B1 with energy low, When the user adds lateral-raise, Then lateral-raise × 2 with `energy_low_trim`.
- **B7 (warm-up)** Given P paused from UF-09.2 with `elapsedS` 60 and 120 s of warm-up left, Then the lead line is "16 min left" (975 s). Add lateral-raise puts it at index 1, Resume continues the warm-up, and UF-09.1/UF-09.6 still name Bench press first.
- **B8 (last exercise)** Given P with bench-press and inverted-row done, paused on UF-09.3 leg-extension set 2 of 2, `elapsedS` 1500 (`timeLeftS` 1095), When the user adds biceps-curl, Then it is appended at index 3 as × 3. After the leg-extension set, the next screen is UF-09.6 Biceps curl, not UF-03.3.
- **B9 (indices shift)** Given P paused on bench-press set 3 with one leg-extension set logged from List view (`itemIndex` 2), When lateral-raise is added, Then that set's `itemIndex` is 3, the bench-press sets keep 0, and the machine's `itemIndex` is 0. Machine unit test: `skippedItems` [2] with an insert at 1 becomes [3].
- **B10 (same and skipped)** Given P, Then the Inverted row row says "In this workout" and has no Add. Given inverted-row skipped, Then it says "Skipped in this workout".
- **B11 (8 items)** Given a plan of 8 items, When the user taps Add on any row, Then "This workout has 8 exercises, the most it can hold." and no write.
- **B12 (recovery at start, not now)** Given 4 bench-press hard sets at `started_at − 24 h` and 2 more logged in this workout, Then db-bench-press can be added (chest is not recovering at `started_at`). Given 6 back-squat sets at `started_at − 24 h`, Then Leg extension says "Quads is recovering".
- **B13 (returning after 10 days off)** Given lateral-raise last logged 2026-09-17 at 10 × 12, 12, 12, When it is added on 2026-09-27, Then its pre-fill is 10 × 10 `hold_after_break` and it has `days_since {shoulders, 10}`.
- **B14 (offline and reload)** Given offline, When B1's add happens, Then the stored row has the new plan and is queued. A reload resumes paused with the four items and both bench-press sets. When the connection returns, the server row has the new plan.
- **B15 (write fails)** Given the device write rejects, Then the plan and the indices are unchanged, the sheet stays open, and "Couldn't add Lateral raise. Try again." shows.
- **B16 (one task on screen)** Given any of UF-09.1–.8, Then there is no Add control. Given UF-09.9 opened from UF-09.8, Then there is no "Add exercise". Given the sheet open, When the user presses Back or Escape, Then only the sheet closes, focus is on "Add exercise", and the workout is still paused.
- **B17 (time check counts it)** Given B1 after the add, When bench-press ends with `elapsedS` 1300, Then rule 8's `remainingS` is 375 + 555 + 270 = 1200 and `behindS` is −200, so there is no UF-09.8.
- **B18 (counts as history)** Given 3 lateral-raise sets logged on the added item, Then shoulders' 14-day load rises by 3 on UF-10.1.
- **B19 (a11y)**
  - Targets are ≥ 44 px, including when the sheet renders without SessionSetup in the tree.
  - The names "Add {name}" / "Add {name}, {area}" are unique.
  - A disabled row is `aria-disabled` with its reason in `aria-describedby`.
  - There is one `role="status"` line per surface. Paused's is present and empty on mount.
  - After a successful add, focus is on "Add exercise" and Paused did not remount.
  - The sheet passes axe.
- **B20 (swap, then add back)** Given a workout where bench-press has 2 logged sets and is no longer a plan item (swapped for db-bench-press after those sets), Then the Bench press row says "In this workout" and has no Add, and `ctx.insertItem("bench-press")` writes nothing.
- **B21 (finish while queued)** Given offline after B1's add, When the workout is finished, Then the stored UF-03.3 summary lists lateral-raise as planned.

Engine examples for `insertItem` and `timeLeftS` (R12-E20+ and R8-E4+) are B1–B6, B8 and B13 restated at the engine level. The engine ticket also adds:
- the check-order, 9th-item and duplicate-id tests;
- five simulated histories;
- seeded property tests (≥ 200 cases, with the existing `mulberry32` helper; no fast-check).

D-0246 §8–§13 has the full list.

## Open questions: resolved 2026-11-13 (D-0246 §1)
Each default below ships as written. The owner accepted all ten.
1. **Where does the new item go: next, at the end, or the user's choice?** Default: next, after the current exercise. "Do {name} later" covers "do it now" when the current exercise isn't started.
2. **Allow "Add anyway" past the budget?** Default: no. Refused with the minutes left (principle 2). Revisit if users end workouts early in order to add exercises.
3. **Apply the 2-per-area cap?** Default: no. Only the 8-item cap applies, because the add is an explicit choice.
4. **A "Suggested" section ranked by the engine (lowest-coverage area first)?** Default: no in v1. Favorites and "Today's areas" only. This would be a follow-up using the D-0238 ranking.
5. **Re-add a skipped exercise (un-skip)?** Default: no. The row says "Skipped in this workout".
6. **Add extra sets to an exercise already done?** Default: no. That is a different feature ("one more set").
7. **Stay paused or resume after an add?** Default: stay on UF-09.9, so several adds are possible and nothing restarts by surprise.
8. **Check UF-08.1 "Skip today" areas?** Default: no, because the session row doesn't store them. It is the user's explicit choice.
9. **Mark an added item ("Added by you") in the summary?** Default: no in v1. It would need a new reason code, which is an openapi change.
10. **Add after the workout has finished (UF-03.3) or from history?** Default: no.

## Out of scope (v1)
- Any add control on UF-09.1–.8, a Suggested list, "Add anyway", un-skip, extra sets, making an added item the main lift, editing sets or reps of the added item before it starts, adding after finishing, and any change to openapi, the data model or the design tokens.

## Tickets (rows at `todo`; D-0246)
| ID | Title | Lane | Deps |
|---|---|---|---|
| T-0944 | Screen specs: UF-09.10 Add exercise sheet (lead line, row states incl. logged-set "In this workout", refusals, status, focus, Back/Escape) and the UF-09.9 "Add exercise" action and its status line; fix the stale UF-08.5.md (line 3, fonts, rows); no new token (D-0246 §18) | design | — |
| T-0945 | Engine: `insertItem` (rule 12.3) and `timeLeftS` (rule 8, consistency condition, model limits); check order; examples R12-E20+, R8-E4+; simulated histories and mulberry32 property tests; re-vendor (D-0244, D-0246 §8–§14) | engine | T-0936 (branch after it merges) |
| T-0946 | User flows v2: drop "proposed" from the UF-09.10 row (registered with this spec so the screen-ID check passes), add the UF-09.9 action and the Add line; a PRD row | product | — |
| T-0947 | UF-09 focus machine: `ITEM_INSERTED` remap, restore realign, and `ctx.insertItem` (logged-set guard, clamped `atIndex`, engine call, plan write, then event; failure path) (D-0245 §1–§3, D-0246 §2 §12) | web-feature:UF-09 | T-0945 |
| T-0948 | UF-08: `AddExerciseInWorkout` exported from `index.tsx` (lazy-loaded, no leaf entry), add-list `lead` prop, row reasons, recovery at start, refusal copy; self-contained CSS and `.wl-uf08` root (D-0246 §16) | web-feature:UF-08 | T-0944, T-0940, T-0941, T-0943 |
| T-0949 | UF-09.9 "Add exercise" seam action (lazy, retried), hidden from UF-09.8, stays paused; status line on mount, focus, no remount, Back/Escape closes only the sheet (D-0246 §6 §7) | web-feature:UF-09 | T-0947, T-0948 |
| T-0950 | e2e add during a workout: zero history, 10 days off, time running out, offline and reload, finish while queued, swap then add back, axe/44 px | qa | T-0949 |
