# Empty-start planning — spec

- **Idea:** the owner, 2026-11-13: "I also think we need another way of planning a session. Like a start with empty but with easy to select suggestions."
- **Screens:** UF-08.1 Time & energy (new secondary button), UF-08.2 Suggested (new empty mode and its Suggestions section), UF-08.5 Add exercise (one copy line in empty mode). UF-08.3, UF-08.4 and UF-09 are unchanged. User flows v2 (D-0002). No new screen ID.
- **Decisions:** D-0236 (entry and mode), D-0237 (engine inputs `autoMainLift` and `fill`), D-0238 (how the suggestions are made and shown), D-0239 (review rulings: the open questions are closed, `mainPickId`, Start with this, the fallback trigger, copy, focus, layout and process). Builds on D-0109 (setup record), D-0191 (Skip today, Remove without refill), D-0199 (exclusions), D-0202 (favorites), D-0205 (Add, pins, Start with this, Reorder, per-visit state), D-0211 §5 (words, not colour), D-0235 (swap-ins become pins).
- **Status:** accepted 2026-11-13 (the human: "implement all", with the defaults below). Board section "Empty-start planning". The tickets are filed as `todo`. T-0937 and T-0938 can be deferred.

## Problem
UF-08 always starts from the engine's full plan. A user who already knows what they want today has to remove items one at a time. They then search UF-08.5 for each pick, and every Add re-suggests the rest of the plan around it (D-0205 §4), so the engine keeps putting things back. There's no way to say "I'll choose, just show me good options".

## User story
As a lifter with 45 minutes, I want to start from an empty workout and tap the exercises I want from a short list the app thinks I need, so that I build today's plan in a few taps without fighting the auto-fill, and never go over my time.

## Principles check
1. One task on screen during a workout: untouched. All of this happens before Start, and nothing in UF-09 changes.
2. Time budget first: UF-08.1 still asks for the minutes before either button. The suggestions fit the minutes left, a pick that doesn't fit is refused, and the plan never goes over the budget (except an explicit UF-08.3 swap with `fitsBudget: false`, as today).
3. Deterministic engine: the engine builds every item, ranks every suggestion and decides what fits. The UI only chooses which engine call to make and filters out what's already picked. Neither the UI nor an LLM picks anything.
4. Adaptive targets: untouched (the suggestions follow the same gaps).
5. Onboarding under 60 s: untouched. "Suggest my workout" stays the primary action.

## The flow

### UF-08.1 Time & energy
- A secondary button **"Start empty"** under "Suggest my workout" (D-0236 §1). The minutes, warm-up toggle, Energy and Skip today apply in the same way. The live fit line is unchanged (it describes the full suggestion).
- Tapping it opens UF-08.2 in empty mode. The setup record gets `mode: "empty"`, `addedIds: []` and `mainPickId: null` (D-0239 §1).
- The whole UF-08.1 screen gets a screen spec, `Design-docs/docs/design/screens/UF-08.1.md` (T-0939).

### UF-08.2 in empty mode
From top to bottom (D-0239 §8):
1. **Time-budget bar** as today. At the start, only the warm-up (when it is in the budget) is used. The line reads "{used} of {n} min · {left} min left". `used` counts the warm-up when it is in the budget, as today's bar does (`totalS`, rounded up). `left` is `unusedS`, rounded down. With the warm-up outside the budget, today's " + warm-up" suffix follows "{n} min" (D-0239 §7). In empty mode this line is **not** `aria-live` (D-0239 §9).
2. **Why chips** from the plan's `sessionReasons` (none while the plan is empty). The "Skipping today" line and the excluded-out notice work as today.
3. **Your workout** (the item list). It is empty at first: "Nothing here yet. Pick from the suggestions or add an exercise." Every pick is a normal UF-08.2 row with Swap, Remove, Start with this (compounds), the "Added by you" reason and the Favorite tag.
4. **Suggestions** (new, D-0238), with the sub-line "For the areas that need work most. Fits your {left} min." In markup it is a `<section aria-labelledby>` with an `h2` and a `<ul>` of `<li>` rows. It doesn't use `.wl-option`, and there is no new token.
   - Rows follow the UF-08.5 row anatomy: name · sets × reps · minutes, then the engine's one-line reason, the "Favorite" tag, the "Main lift" tag when the engine marks it main (tags are `wl-chip wl-uf08__tag`), and **Add** (accessible name "Add {name}", at least 44 px).
   - **"Other suggestions"** (empty mode's Shuffle): bumps `shuffle` and changes the suggestions only.
   - **"Fill the rest for me"** switches to suggested mode with the picks kept (D-0236 §6).
5. **"Add exercise"** opens UF-08.5 (D-0205), as today. It sits under Suggestions, so the main path comes first.
6. **Reorder** and **"Looks good"** as today, except that "Looks good" at 0 items is `aria-disabled`. It stays focusable, with `aria-describedby` → "Add at least one exercise."

**One live region (D-0239 §9).** The UF-08.2 `role="status"` line carries every empty-mode message: "{name} added. {left} min left.", the refusals, and the time-chip "Doesn't fit" line. The existing `role="alert"` for a failed exclusion write is unchanged.

**Focus (D-0239 §10).**
- **After a suggestion Add:** focus moves to the Add button of the row now in the tapped row's place. If the tapped row was last, it moves to the new last row's Add. If no rows are left, it moves to "Add exercise".
- **After "Other suggestions":** focus stays on it. If it disappears, focus moves to "Add exercise".
- **After "Fill the rest for me":** focus moves to "Add exercise".
- **After a refusal:** focus stays on the tapped button.
- **UF-08.5 Add:** keeps D-0205 §4 (focus to the new row).
- Focus never drops to `body`.

### How the plan and the suggestions are computed (no new ranking rule)
| Call | `autoMainLift` | `fill` | `pinnedIds` | `mainLiftId` | `shuffle` | Used for |
|---|---|---|---|---|---|---|
| Plan | false | false | `addedIds` | `mainPickId` | 0 | the item list (what will be started) |
| Suggestions | true while `mainPickId` is null, otherwise false | true | `addedIds` | `mainPickId` | the visit's `shuffle` | the Suggestions list = items not in the plan, in engine order |
| Suggestions fallback | false | true | `addedIds` | null | the visit's `shuffle` | only when an id **in the current plan** (a pick or the main lift) is missing from the first call's result (D-0239 §3) |

Both calls also pass `budgetMin`, `warmupInBudget`, `energy`, `avoidAreas`, `favoriteIds` and `excludeIds` (stored ∪ this visit's removes) as today. When the plan is already over budget, no suggestions call is made (see Time budget).

**`mainPickId` (D-0239 §1).** This is the main lift the user chose on this visit. It is set by "Start with this", by adding a "Main lift" suggestion, or by a UF-08.3 swap of the main lift. It is cleared by Remove of that item. Re-suggests read it from the setup record, never back from the plan. So a time chip that drops the main lift doesn't lose it: picking more time brings it back, the same as a pin. Suggested mode uses `mainPickId ?? plan.mainLiftId`.

**Is an engine change needed? Yes, a small one (D-0237).** Today `suggest` always picks a main lift when none is given (rule 7.2 step 1) and always fills the rest of the time (step 3). So "only what the user picked" can't be expressed. Emulating it with `removeItem` gives the wrong plan: the auto main lift uses time before the pins are placed, so a pick may be cut to 2 sets or dropped even though it fits, and the warm-up is left built from removed items. Building the items in the UI would break principle 3. The change is two optional booleans on steps that already exist. When they are absent, every result is deep-equal to today's. No new ranking, reason code or function is added. The suggestions themselves reuse rule 7.2 unchanged: lowest-`r` area first, favorites first inside an area, recovery and Skip today, exclusions, the caps and the time fit.

**Why every shown suggestion fits (D-0238 §3).** The plan is always main → picks. In the suggestions call the main lift (if any) and the picks come first too, and a suggested accessory comes after all of them. So when the accessory is added as the last pin, it has at least as much time and cap room as it had in the suggestions call. A suggested main lift is placed first in both calls with the same time available, so its set count and every pick after it are the same. The fallback call exists for the one case where this would break: an auto main lift that crowds out a pick. As a safety net, any Add that would drop the new item, an existing pick or the main lift is refused, and the plan stays unchanged. This can only happen through UF-08.5 or "Start with this". The copy is in "Refusals" below.

**Refusals (D-0239 §12–§13).** A refusal shows where the tap was. A UF-08.5 Add or "Start with {name}" refuses on the sheet. A suggestion Add or a row's "Start with this" refuses in the UF-08.2 status line, and focus stays on the button. This is an explicit exception to UF-08.2's "Refusals show on the sheet". The first match wins:
1. **The plan is already over budget** (after a `fitsBudget: false` swap): "Your workout is {over} min over. Remove or swap an exercise first."
2. **The new item itself is missing** from the result: D-0205 §4's copy ("{name} doesn't fit in {n} min." plus its suffix, or the cap copy).
3. **The new item fits but pushes out a pick or the main lift:** "{name} would push out {pick}. Pick more time or remove an exercise." (`{pick}` is the first pushed-out item in plan order.)

### Time budget
- The running total is the bar plus "{used} of {n} min · {left} min left". It counts the warm-up when the toggle is on (rule 7.1 `available`).
- **When the time is full,** the Suggestions list is empty and reads "Your {n} min are full." UF-08.5 still opens, and an Add that doesn't fit is refused with D-0205's copy.
- **Over budget** only happens through a UF-08.3 swap the user confirms with `fitsBudget: false` (rule 12.1, today's behaviour). The bar doesn't change colour (D-0211 §5). The line reads "{used} of {n} min · {over} min over", and the bar keeps its existing `data-over` treatment with no new colour. No suggestions call is made. The Suggestions list reads "Your workout is {over} min over {n} min. Remove or swap an exercise.", and "Other suggestions" is hidden.
- **Time chips on UF-08.2** re-run both calls. A pick, or the main lift, that no longer fits is dropped by the engine and listed as "Doesn't fit in {n} min: {names}." (D-0205). It stays in `addedIds` (or `mainPickId`), so picking more time brings it back.
- **Energy.** At high energy, `fill: false` leaves spare time, so the main lift may get its back-off set (rule 7.4). A pick's minutes may then differ from its suggestion row. This is accepted (D-0238 §4, D-0239 §5).

### Caps
These are rule 7.2's caps, applied by the engine to picks and suggestions alike: at most 8 items and at most 2 per primary area. Once the 8th item is in, the Suggestions list is empty. A UF-08.5 Add over a cap gets D-0205's cap copy.

### Interaction with the existing UF-08.2 controls
| Control | In empty mode |
|---|---|
| Add exercise (UF-08.5) | Adds a pin and re-runs the plan call (`fill: false`). The header line reads "{left} of {n} min left." instead of "The rest of your workout adjusts to fit {n} min." The empty-query sections are as in D-0205 §2 |
| Suggestion Add | Same as UF-08.5 Add. A "Main lift" suggestion sets `mainPickId` instead of pinning. A refusal shows in the UF-08.2 status line |
| Swap (UF-08.3) | D-0235, with D-0239 §1: the swap-in becomes a pin (or `mainPickId` for the main lift), and the swapped-out id is excluded for the visit, so it doesn't come back as a suggestion |
| Remove | D-0191 §4 `removeItem`. The id joins the visit's `excludeIds` and leaves `addedIds` (or clears `mainPickId`), so it isn't suggested again during this visit. The Removed line and "Never suggest" work as today |
| Start with this | D-0205 §5 with `fill: false`, amended by D-0239 §2. The previous main lift moves to the **front** of `addedIds` (it stays as a pin instead of being dropped), X leaves `addedIds`, and `mainPickId = X`. The safety net applies (refused if any pick, including the old main lift, would drop) |
| Reorder | D-0205 §7, UI only. New picks are appended, and a new main lift goes first |
| Shuffle → "Other suggestions" | Changes the suggestions only, never the picks. Sits inside the Suggestions section and is hidden when the list is empty |
| Time chips | Both calls re-run (see above) |
| Fill the rest for me | One-way switch to suggested mode for this visit (`pinnedIds = addedIds`, `mainLiftId = mainPickId`) |

### Start with an empty or tiny plan
- 0 items: "Looks good" is disabled ("Add at least one exercise.").
- 1 item or more: allowed, whatever the unused time. UF-08.4 shows the real duration and finish time. The warm-up follows the picks' areas (rule 7.3), or general moves if no pick has a warm-up match.
- UF-09 runs the plan as it does today. The UF-09.8 time check uses the item costs, so a tiny plan never triggers it.

### Offline
`suggest` runs on the device (D-0063 §3) over the cached history and library. Empty mode, the suggestions, Add, Remove, Swap and Start all work offline. Nothing is written before Start.

## Behaviours (acceptance-criteria ready)
Fixtures are the engine's (F-profile, L1, zero history unless stated). Energy is `normal` and the warm-up is on unless stated (D-0239 §5). Minutes are the rule 7.1 costs.

- **B1 Entry.** Given UF-08.1 at 30 min, When the user taps "Start empty", Then UF-08.2 shows 0 items, the bar reads "3 of 30 min · 27 min left" (the 180 s warm-up is used, 1620 s available, D-0239 §7), and "Looks good" is `aria-disabled` with "Add at least one exercise."
- **B2 First suggestions at zero history.** Given B1, Then the Suggestions list is the R7-E4 plan in order: bench-press × 4 tagged "Main lift", inverted-row × 3, leg-extension × 2.
- **B3 Pick the main lift.** Given B2, When the user taps "Add bench-press", Then the plan is bench-press × 4 (main, 720 s, `mainPickId` = bench-press), the bar reads "15 of 30 min · 15 min left" (180 s warm-up + 720 s used, 900 s left), the suggestions are inverted-row × 3 and leg-extension × 2, focus is on "Add inverted-row", and the status reads "Bench press added. 15 min left."
- **B4 Pick an accessory first.** Given B2, When the user taps "Add leg-extension", Then the plan is leg-extension only (no main lift, `fill: false`), and every suggestion row, when tapped next, is added without dropping leg-extension.
- **B5 Fits by construction (property).** For every budget 15..120 step 5, warm-up on/off, energy low/normal/high, over the zero, balanced, all-chest-no-legs and returning-after-10-days simulated histories, and for every sequence of up to 8 suggestion taps (always the first row, and always the last row), Then no tap is refused, no earlier pick disappears, Σ item costs ≤ `available`, there are ≤ 8 items and no area is primary for more than 2.
- **B6 Time full.** Given picks that leave less time than any suggestion needs, Then the list reads "Your {n} min are full." and "Other suggestions" is hidden.
- **B7 Time chip down.** Given picks bench-press and inverted-row at 30 min, When the user taps 20, Then the plan keeps bench-press × 4 and drops inverted-row, the line reads "Doesn't fit in 20 min: Inverted row.", and tapping 30 again brings it back.
- **B8 Other suggestions.** Given B3, When the user taps "Other suggestions", Then bench-press stays in the plan and the suggestions follow rule 13 with n = 1 (barbell-row × 3 in place of inverted-row, R13-E1).
- **B9 Remove.** Given a pick inverted-row, When it is removed, Then it is not in the plan or the suggestions, and the Removed line offers "Never suggest".
- **B10 Swap.** Given a pick inverted-row, When it is swapped for barbell-row on UF-08.3, Then barbell-row is a pick, and inverted-row is in neither the plan nor the suggestions after "Other suggestions" or a time chip.
- **B11 Safety net.** Given picks that fill the time, When "Start with this" on a row's pick would make another pick (or the old main lift) not fit, Then nothing changes, the UF-08.2 status line reads "{name} would push out {pick}. Pick more time or remove an exercise.", and focus stays on that "Start with this".
- **B12 Fill the rest.** Given B4, When the user taps "Fill the rest for me", Then the plan equals suggested mode with `pinnedIds` [leg-extension] (D-0205 §4), the Suggestions section is gone, and Shuffle is labelled "Shuffle" again.
- **B13 Skip today.** Given Skip today [quads, glutes, hamstrings, calves] at 30 min, Then the first suggestions are R6-E3's items (bench-press, inverted-row, lateral-raise).
- **B14 All skipped.** Given every area skipped, Then the list reads "No suggestions right now. Search to add an exercise."
- **B15 Returning after 10 days off.** Given the returning-after-10-days history at 30 min, Then the first suggestions equal R7-E30's full plan (bench-press, inverted-row, calf-raise).
- **B16 Offline.** Given the device offline with a cached history and library, Then B1–B4 behave the same, and Start writes `sessions.plan` to the queue.
- **B17 Start tiny.** Given one pick leg-extension × 3 at 45 min, When the user taps "Looks good", Then UF-08.4 shows 1 exercise and its real duration, and Start runs UF-09 with that one item.
- **B18 Engine deep-equal.** For every existing engine example, `autoMainLift` and `fill` absent or `true` give a deep-equal result. `autoMainLift: false` with an eligible `mainLiftId` (and `fill` absent) also gives the same result as today. With both `false` and no pins, `items` is `[]`, `mainLiftId` is null and `itemsTotalS` is 0. A switch that isn't a boolean throws `RangeError`.
- **B19 Per visit.** Given picks in empty mode, When the user goes Back to UF-08.1 and taps "Suggest my workout", Then UF-08.2 is in suggested mode with no picks and `mainPickId` null.
- **B20 Start with this keeps the old main lift (D-0239 §2).** Given B3 plus a pick barbell-row at 45 min, When the user taps "Start with this" on barbell-row, Then barbell-row is the main lift and first, bench-press is still in the plan as a pin (front of `addedIds`), and the status reads "Barbell row is the main lift now." If bench-press would not fit, the tap is refused as in B11.
- **B21 Time chip keeps the main lift (D-0239 §1).** Given B3, When the user taps a time chip too small for bench-press at 2 sets, Then bench-press is named in "Doesn't fit in {n} min: …" and the plan has no main lift, and When the user taps 30 again, Then bench-press is back as the main lift.
- **B22 Over budget after a swap (D-0239 §13).** Given picks and a UF-08.3 swap confirmed with `fitsBudget: false`, Then the line reads "{used} of {n} min · {over} min over" with no colour change, the Suggestions list reads "Your workout is {over} min over {n} min. Remove or swap an exercise.", and a UF-08.5 Add is refused on the sheet with "Your workout is {over} min over. Remove or swap an exercise first."
- **B23 Focus and live region (D-0239 §9–§10).** After a suggestion Add on the last row, focus is on the new last row's Add. After the last suggestion is taken, focus is on "Add exercise". The budget line has no `aria-live` in empty mode, and a single `role="status"` region announces each change. Focus is never on `body`.

## Out of scope (v1)
Remembering the mode; "Clear all" on UF-08.2; more than one candidate per area in Suggestions; drag; any change to UF-09; templates or routines (UF-07 stays the place for saved plans).

## Open questions (all resolved 2026-11-13, D-0239)
The human accepted every default ("implement all"), with one change to question 7.
1. **Where does the entry live, and what's it called?** Resolved: UF-08.1 only, a secondary button "Start empty". No "Clear all" on UF-08.2. (D-0236 §1)
2. **Should the choice be remembered** ("always start empty")? Resolved: no, it's per visit. Add a setting later if the owner uses empty mode most of the time. (D-0236 revisit)
3. **Should the engine's main lift be offered with a "Main lift" tag?** Resolved: yes, while it fits. (D-0238 §2)
4. **Can a 0-item workout start?** Resolved: no in empty mode ("Looks good" is `aria-disabled`). Suggested mode keeps D-0191 §5. (D-0236 §4)
5. **Ship "Fill the rest for me" in v1?** Resolved: yes. (D-0236 §6)
6. **Is the engine's fill enough choice?** Resolved: yes for v1. Per-area ranked lists would need a new engine function. (D-0238 revisit)
7. **openapi and validator now or later?** Resolved: T-0937 and T-0938 are filed but can be deferred. They are not dependencies of any web, engine or QA ticket. Until they land, `/workouts/suggest` returns 400 for the two keys, and the app never calls it (D-0063 §3). (D-0237 §3, D-0239)

## Tickets (filed 2026-11-13; IDs as reserved)
| ID | Title | Lane | Deps |
|---|---|---|---|
| T-0936 | Engine: `SessionInput.autoMainLift` / `fill` (D-0237, D-0239 §4). Only `=== false` is off, a non-boolean throws `RangeError`, and the switches are never copied into `Workout`. Rule text: §0; 7.2 step 1 (no fallback when `autoMainLift` is false) and step 3 (skipped when `fill` is false); 7.3 empty-items warm-up; rule 13 note. Examples R7-E31 onward with traceability rows: empty, picks only, explicit main with `autoMainLift: false`, auto main equal to a pin, caps on pins. Deep-equal when absent (B18). Simulated 14-day histories (D-0239 §14) and the B5 property. **Paths also include `supabase/functions/_shared/vendor/**`**: re-run `node supabase/scripts/vendor.mjs` and commit, or the root `vendor.mjs --check` goes red | engine | — |
| T-0937 | openapi SessionInput: optional `autoMainLift`, `fill` (absent = true) plus an example; regenerate `packages/shared` api.gen.ts plus its test. **Deferrable** | data | T-0936 |
| T-0938 | `/workouts/suggest` validator: add both keys to `SESSION_INPUT_KEYS`, add the optional-boolean checks and pass them through, with a unit test. **Deferrable** | backend | T-0937 |
| T-0939 | Screen specs: a new `UF-08.1.md` for the whole screen, including "Start empty". UF-08.2.md gets an "Empty mode" section (D-0239 §6–§13): running-total line with words, not colour; empty copy; the empty-mode branch of Empty states; Suggestions above "Add exercise"; rows; "Other suggestions"; "Fill the rest for me"; `aria-disabled` "Looks good"; one live region; focus rules; the refusal-location exception and the three refusal copies. UF-08.5.md gets the empty-mode lead line "{left} of {n} min left.". Replace the retired DM Sans and Big Shoulders in UF-08.2.md and UF-08.5.md. No new token | design | — |
| T-0940 | UF-08.1/UF-08.2: "Start empty" entry, `mode` and `mainPickId` in the setup record (`mainPickId` in suggested mode too, D-0239 §1), plan call with `fill: false`, empty copy, "Looks good" `aria-disabled` at 0, Add/Remove/Swap/Start with this (old main lift demoted to a pin)/time chips in empty mode, safety net with the three refusal copies, budget line not live in empty mode (B1, B7, B9–B11, B17, B19–B22). Paths also include `apps/web/src/lib/i18n/flows/uf-08.ts` | web-feature:UF-08 | T-0935, T-0936, T-0939 |
| T-0941 | UF-08.2 Suggestions section: the two-call rule with the tightened fallback trigger, skipped when over budget, tap to Add, focus and status, "Other suggestions", empty-list copy, "Fill the rest for me", UF-08.5 header line (B2–B4, B6, B8, B12–B15, B23). Paths also include `apps/web/src/lib/i18n/flows/uf-08.ts` | web-feature:UF-08 | T-0939, T-0940 |
| T-0942 | e2e: empty-start flow, zero history and returning after 10 days off, offline, time chip drop and restore, axe and 44 px (B1–B4, B7, B16, B17, B21) | qa | T-0939, T-0941 |

T-0940 and T-0941 both touch `features/UF-08`, so they run after T-0935 and one after the other. T-0937 and T-0938 can land at any time after T-0936, and nothing waits for them. The product-owner updates user flows v2 (UF-08.1, UF-08.2) and the PRD row when T-0940 is groomed to `ready`.
