# Areas first, exercises second — planning spec (UF-08)

- **Idea:** the owner, 2026-11-24: "I spent a lot of time in the suggested workout with exercises, rearranging, adding and swapping. Rethink it entirely." Offered three layers, the owner chose **layer 3 first (this spec), then layer 1** (`docs/specs/learn-from-edits.md`).
- **Screens:** UF-08.1 Time & energy (one label line), UF-08.2 Today's plan (rewritten, was "Suggested"), UF-08.6 Area detail (new), UF-08.3 Swap, UF-08.5 Add exercise (reused behind UF-08.6). **UF-08.4 Ready is retired (D-0280): Start moves onto UF-08.2.** UF-09 and UF-05.1 are unchanged. User flows v2 (D-0002).
- **Decisions:** D-0274 (the model and what it keeps, folds in and retires), D-0275 (engine, additive pure functions), D-0276 (design and the new screen ID), D-0279 (grooming defaults and phasing), **D-0280 (Ready folds into the plan, the owner's answer of 2026-11-24; amends D-0274 §10, D-0276 §1, D-0279)**. Builds on D-0109, D-0191, D-0199, D-0202, D-0205, D-0235, D-0236..D-0242, D-0243..D-0247.
- **Status:** `todo` (proposed 2026-11-24). Tickets T-0992 to T-0999 and T-1009 are in the board section "Areas first planning, then learn from edits". The defaults below are logged and can be changed by the owner; the questions that truly need them are at the end (question 2 was answered by the owner on 2026-11-24: fold Ready in).

## Problem
UF-08.2 shows the engine's plan as a list of exercises, and every row has Swap, Remove, Start with this and Reorder, plus Add exercise, Shuffle and (in empty mode) a Suggestions list. The owner spends the time before a workout editing exercises one by one. Most of that editing is not about exercises at all: it is "less chest today, add some back, I only have 45 minutes". The unit the user thinks in is the body area and the time, and the app already plans in areas (targets, balance, gaps). The screen should speak the same language and keep the exercises one step down, for the person who wants them.

## User stories
1. As a lifter with 45 minutes, I want to see "Today: Chest · Back · Core" and tap Start workout, so that a good-enough workout takes three taps from Today (one from the plan).
2. As a lifter who wants more back work, I want a **+** on Back and a **−** on Chest, so that I change the plan by sets, not by hunting exercises.
3. As a lifter who feels like training shoulders today, I want to add an area from a short list that tells me how far below target each area is.
4. As a lifter who knows what they want, I want to start from no areas ("Start empty") and add the areas I pick.
5. As a lifter who cares about one exercise, I want to open an area and swap, add or remove an exercise there, and I don't want that to reshuffle the other areas.
6. As a lifter at the gym, I don't want to think about order. Main lift first, then alternate areas, and keep machines together.
7. As a lifter whose plan is only "good enough", I want to fix it on the floor with the pause actions that already exist (swap, do later, add exercise).

## Principles check
1. One task on screen during a workout: untouched. All of this is before Start. UF-09 gets no new control.
2. Time budget first: UF-08.1 still asks for the minutes before every workout, and both of its buttons stay. UF-08.2 shows the minutes in the time bar line ("About {m} of {n} min") and keeps the time chips. A "+" that doesn't fit the time is refused in words (never over budget through an add, as D-0205).
3. Deterministic engine: the engine builds every item, picks every exercise, groups sets by area, decides what fits and orders the list (D-0275). The web only decides which engine call a tap makes.
4. Adaptive targets: the area rows show the 14-day `load / target` from `balance()`. Nothing here changes a target; a dropped area does not lower one (targets adapt only through UF-11.1).
5. Onboarding under 60 seconds: untouched (it ends at UF-01.4, before any of this).

## The flow

```
UF-02.1 Today --Start--> UF-08.1 Time & energy --"Suggest my workout"--> UF-08.2 Today's plan --"Start workout"--> UF-09.1
                                      \--"Start empty"--> UF-08.2 with no areas            |
                                                                  UF-08.2 --row--> UF-08.6 Area detail --Swap--> UF-08.3, --Add exercise--> UF-08.5
```

### Tap budget (the owner's target)
From UF-08.2 shown to Start tapped: **0 edits = 1 tap** ("Start workout"). **2 edits = 3 taps.** An edit is one tap on − / + / Remove / "Add {Area}"; opening an area detail is counted as its own taps. From UF-02.1: **3 taps** with no edit (Start workout, Suggest my workout, Start workout; "Quick 20-min" is also 3). Before the Ready step was folded in (D-0280) these were 2, 4 and 4. The "under 20 s" target is checked by the e2e tap budget and by the owner's own use; the app records no timings (NFR-AN-2, D-0017), see Success metrics.

### UF-08.1 Time & energy
Unchanged except that the secondary button keeps its label **"Start empty"** and now opens UF-08.2 with no areas (D-0274 §6). Minutes, warm-up, Energy and Skip today apply as before. "Quick 20-min" on UF-02.1 is unchanged. The live fit line still describes the full suggestion.

### UF-08.2 Today's plan (new first view)
From top to bottom:
1. **Top bar:** Close (×) left and the offline icon right, as today.
2. **Title** (`h1`): "Today: Chest · Back · Core" (the areas of the plan in the engine's priority order, joined with " · "; wraps, never truncated). With no areas: "Today: pick your areas". Directly under it, one line: "Done by HH:MM" (now plus the plan's minutes, `ceil(totalS / 60)`, the finish time UF-08.4 used to show; re-derived after every edit). With no areas: "{n} min to fill". The budget minutes are in the next line and in the time chips (D-0280 §3).
3. **Time bar** and its line "About {m} of {n} min" (today's bar, one segment per area instead of per item; the words say over budget, no colour change, D-0211 §5).
4. **Why chips** from the engine's `sessionReasons`, and the "Skipping today: …" line when areas are skipped, as today.
5. **Area rows**, one per area, in the engine's priority order. A row is:
   - the area name (row title) and, on the same line, the time cost "~14 min";
   - a sets stepper **−  6 sets  +**;
   - a muted line "Last 14 days: 8 of 20 sets" (`load / target`, from `balance()`, so it works offline);
   - a muted "{n} exercises" and a chevron that opens UF-08.6. The row itself (the name and the chevron line) is the button; the stepper is separate.
   Exercise names are **not** shown on the row (the owner: exercises are a detail you open only if you want to).
6. **Add an area:** a section "Add an area" listing the areas not in the plan, ordered by the engine (lowest projected `r` first, ties in the fixed area order). Each row: the area, "Last 14 days: 0 of 20 sets", and **Add**. An area that can't be added says why in words: "Recovering", "Skipping today", "No exercise available" (every exercise for it is excluded or not available with your equipment or level), "No time left". With no areas in the plan the section is open and is the main content; otherwise it is a collapsed disclosure "Add an area".
7. **Fill the rest for me** (text button): adds the engine's next available areas, one at a time, until nothing more fits. Shown only while at least one area can still be added with the time left.
8. **Time chips** 20 / 30 / 45 / 60 / 90, as today (a change rebuilds the plan, see Edits and time).
9. **Focus mode** (D-0280 §3): a native `details` disclosure, **collapsed on every visit**, above Start. Inside, unchanged from UF-08.4: "How focus mode works" (the four steps: one thing on screen; tap Done after each set; rest counts down by itself; everything else is behind pause) and the three device switches (Sound cues, Voice countdown 3-2-1, Keep screen awake; same storage and defaults, D-0110 §6). Opening it is not an edit and not a tap of the budget.
10. **"Start workout"** (primary, the only action fill): writes the session and opens UF-09.1 (what UF-08.4's Start did: one session id per visit and reused on retry, a rejected write says "Couldn't start the workout. Try again.", no network call, one REPLACE navigation, D-0110 §1 to §5, D-0123). It writes the plan in the automatic order, as shown. At 0 areas it is `aria-disabled` with "Add at least one area." in `aria-describedby`, whatever the entry (Start empty, or a default plan where nothing fits). While the write is pending, the plan controls and the Back link are inert.

**Interim (D-0280 §8):** until T-1009 lands, T-0996 and T-0997 keep "Looks good" opening the built UF-08.4, so the area plan can ship first; the spec above is the end state.

**The stepper.**
- **+** adds one set to the area. The engine adds it to the area's first exercise that has room, else adds a second exercise for the area, else refuses ("{Area} already has the most sets it can hold"). Maximum 4 sets for a main lift, 3 for any other exercise, 2 exercises per area (so at most 7 sets for the area that holds the main lift and 6 for any other, D-0275 §3).
- **−** removes one set (D-0287: when the area has a second exercise at its 2-set minimum, **−** removes that second exercise instead, so + then − returns to the same plan). At the area's 2-set minimum, **−** becomes **Remove** (visible text "Remove", accessible name "Remove {Area}") and takes the whole area out for this visit; the area joins this visit's skipped areas (the "Skipping today" mechanism, D-0191), so a later rebuild doesn't bring it back, and it moves to "Add an area" where one tap puts it back.
- Time: **+** is refused when the extra set doesn't fit the minutes left. The button stays focusable with `aria-disabled` and the row says why: "No time for another set. Pick more time or remove a set elsewhere." Never over budget through a **+**.
- One polite status line announces every change: "Back: 7 sets, 5 min left.", "Chest removed. Add it back below."

**Remove, then add back (D-0290).** One tap on "Add {Area}" for an area removed earlier in this visit puts back exactly what was removed: the same exercises, sets and reps, and the same weights pre-filled. It does not suggest something new. Example: on the 45-minute plan Remove Hamstrings (Leg curl x 2), then Add Hamstrings gives Leg curl x 2 again, even when the area's top suggestion would not fit the minutes left. The status line reads "{Area} added back." The area leaves the "Skipping today" line when it is back.
- If the old items no longer fit (time, an exercise now excluded or already in the plan, 8 items, the area now recovering), the Add works as for any area (the top suggestion at 3 sets, else 2) and says "No time left" only when that doesn't fit either.
- If the plan has a main lift now (for example "Start with this" elsewhere), a restored main lift comes back as a normal exercise, at most 3 sets.
- A time chip clears what was removed, so after a time change the Add is a fresh suggestion. Leaving the screen, Start and a reload also clear it. It is never stored.
- "Fill the rest for me" restores a removed area the same way when it reaches it; the order is unchanged (by need, not removed areas first).

**Order.** The list of areas is a priority list. The order the workout runs in is automatic and not shown here (UF-09 runs it; nothing lists it before Start since D-0280): main lift first, then other compound lifts, then isolation work; within each group the areas alternate; machines are grouped (D-0275 §4).

**Edits and time.** Area set changes and added areas apply to this visit only (like every UF-08 choice, D-0109 §1). A time chip rebuilds the plan for the new minutes. It keeps this visit's removed areas, swaps, adds and exclusions, and **drops the +/− set edits and added areas**, with the status line "Plan rebuilt for {n} min. Your set changes were cleared." (D-0274 §8, revisit).

### UF-08.6 Area detail (new, behind a row)
- **What it is:** a step of the setup host (`?step=area&area=chest`), full screen, with a Back link to UF-08.2 and no tab bar (D-0276 §2). Title "Chest", the sets and time of the area and its `load / target` line.
- **Exercises of the area**, in run order, as UF-08.2's item rows are today: name, "Favorite" and "Main lift" tags, sets × reps · weight · minutes, the engine's one-line reason (or "Added by you"), a how-to link, and the actions:
  - **Swap** opens UF-08.3 (unchanged; the swap-in becomes a pin and the swapped-out exercise is excluded for the visit, D-0235).
  - **Not today** (new): "machine busy, or I don't have it today". One tap replaces the exercise with the engine's best alternative for "equipment taken" (rule 12), for this visit only, then shows "{old} · Not today · Undo". No preference is learned from it (learn-from-edits spec).
  - **Remove** drops the exercise and its sets from the area (D-0191 §4, no refill); the Removed line and "Never suggest" (D-0199) work as today, here.
  - **Start with this** on a non-main compound makes it the main lift (D-0205 §5). Kept.
- **Add exercise** (under the list) opens UF-08.5. The sheet's empty-query list shows this area's exercises first (Favorites, then the area's other exercises), then "Today's areas". An Add is **local**: it adds that exercise at 3 sets, else 2, if it fits the minutes left, and nothing else in the plan changes (D-0275 §5). An exercise whose area isn't in the plan adds that area. The refusals are UF-08.5's, unchanged.
- Last exercise removed: the area leaves the plan, the page returns to UF-08.2 with the status line "{Area} removed. Add it back below."
- Offline: identical (the engine runs on the device). Only the stored-list buttons (Never suggest) are disabled offline, as today.

### What happens to what exists (D-0274 §3)
| Existing | Fate | How it appears now |
|---|---|---|
| Swap before starting (UF-08.3), swap pins (D-0235) | **Keep** | Behind UF-08.6; same sheet, same pin rule |
| Add exercise (UF-08.5, D-0205 §4) | **Keep, change one thing** | Behind UF-08.6; an Add is local (no re-suggest of other areas) instead of re-suggesting around a pin |
| Start with this (D-0205 §5) | **Keep** | In UF-08.6 |
| Remove, Removed line, Never suggest (D-0191, D-0199) | **Keep** | In UF-08.6; area removal is the stepper's Remove |
| Skip today chips (UF-08.1, D-0191) | **Keep** | Unchanged; also the home of a removed area |
| Time chips, time bar, why chips | **Keep** | UF-08.2, the bar has one segment per area |
| Favorite tag, Favorites first (D-0202) | **Keep** | The tag shows in UF-08.6 |
| Reorder mode, Move up / Move down (D-0205 §7) | **Retire** | Order is automatic. "Do {name} later" in UF-09.9 stays for the floor |
| Shuffle (rule 13) | **Retire from the screen** | Swap and "Not today" are the exercise-level variety tools. Rule 13 stays in the engine and the server |
| "Start empty" and empty mode (D-0236..D-0242) | **Fold in** | The button stays; it opens UF-08.2 with no areas and the "Add an area" list open. The exercise-level Suggestions section, "Other suggestions", `mode` and the budget words for empty mode are retired; "Fill the rest for me" keeps its name and means areas |
| Add during a workout (UF-09.9, UF-09.10, D-0243..D-0247) | **Keep, untouched** | This is what makes a good-enough plan acceptable |
| UF-08.4 Ready | **Retire (D-0280)** | Start is on UF-08.2. The summary line disappears (its minutes are the bar line, its finish time is "Done by" under the title); the four-step explainer and the three switches sit in the collapsed "Focus mode" disclosure; Start writes the session. The ID stays in the index, marked retired, never reused. The run order is no longer listed before Start (UF-09 runs it) |

## Screen states (UF-08.2)
| State | What shows |
|---|---|
| Normal | Title with the areas, "Done by" line, the rows, Add an area (collapsed), Fill the rest (if anything fits), Focus mode (collapsed), Start workout |
| Zero history (no sets ever) | The engine's default plan (every area is at 0, so it picks by the fixed order and the time fit). Rows read "Last 14 days: 0 of 20 sets". No attention styling, as UF-10 |
| Returning after 10 days off | Same rows; the why chips say which areas are furthest below target. Nothing about the break is added here (pre-fill handles it in UF-09) |
| Time running out (small minutes, e.g. 15 or 20) | Few areas (often one or two). **+** is refused with the time reason. "Add an area" rows read "No time left" when nothing fits. Never an empty screen unless nothing fits at all: then "Nothing fits in {n} min" as today |
| Everything skipped or recovering | No rows. "No areas right now. {n} are recovering or skipped today." with the Add an area list showing the reasons; Start workout disabled |
| Offline | Identical. The offline icon in the top bar; nothing is written before Start. Stored-list buttons in UF-08.6 are disabled with "Connect to change excluded exercises" |
| Start empty | No rows, title "Today: pick your areas", "Add an area" open, Start workout disabled ("Add at least one area."), "Fill the rest for me" shown |
| Over budget (only after a UF-08.3 swap that doesn't fit) | Time line "About {m} of {n} min, {over} min over" in words; **+**, Add area and Fill the rest are refused with "Your workout is {over} min over. Remove or swap an exercise first."; − and Remove still work |
| All areas at their maximum | **+** refused with the cap reason on each row |
| Loading (first result pending) | "Checking what fits…" and the controls disabled, as UF-08.1's fit line |
| Starting (the session write is pending) | "Start workout" `aria-disabled`, the plan controls and Back inert, until the write resolves and UF-09.1 opens |
| Start failed | "Couldn't start the workout. Try again." (`role="alert"`), controls enabled again, a retry reuses the same session id (offline is the same path: the write goes to the device first) |

## Copy (all English, sentence case)
Title "Today: {Areas}" / "Today: pick your areas" · "Done by {HH:MM}" · "{n} min to fill" · "{Area} {k} sets" stepper names "One set less for {Area}" / "One set more for {Area}" / "Remove {Area}" · "~{m} min" · "Last 14 days: {load} of {target} sets" · "{n} exercises" · "Add an area" · "Add {Area}" · "Fill the rest for me" · "Focus mode" · "Start workout" · "Couldn't start the workout. Try again." · "Add at least one area." · reasons "Recovering", "Skipping today", "No exercise available", "No time left" · "No time for another set. Pick more time or remove a set elsewhere." · "{Area} already has the most sets it can hold." · "Plan rebuilt for {n} min. Your set changes were cleared." · UF-08.6: "Not today", "{name} · Not today · Undo", "No other exercise fits. Use Swap." The copy lives in `apps/web/src/lib/i18n/flows/uf-08.ts` (web-shell; the web tickets list it as an extra path).

## Accessibility
Targets at least 44 px (the stepper buttons 48 px). Labels unique per row. Row state in words, never colour alone. One polite status line plus the Removed line's own status. Focus: after **+** or **−** focus stays on the same button; after **Remove** it moves to the row now in that place (or to "Add an area" when none is left); after Add area focus goes to the new row's stepper; Back from UF-08.6 returns focus to the row that was opened. Focus never drops to `body`. Contrast and tokens as the existing UF-08.2 (`--wl-*` only, no new token, D-0276).

## Impact review (read-only, step 2 of the idea flow)

### Designer
- **Screens that change:** `UF-08.2.md` (rewrite of the head; the Removed line, Add and reorder, empty-mode sections are amended or retired), `UF-08.1.md` (one line), `UF-08.5.md` (area-first list, local Add), `UF-08.3-UF-05.1.md` (a note: opened from UF-08.6), new `UF-08.6.md`. `UF-08.4.md` has no file (built from `Ready.tsx`); the screen is retired (D-0280), so `UF-08.2.md` also specifies Start, the "Done by" line and the Focus mode disclosure.
- **Screen IDs:** one new, **UF-08.6 Area detail** (D-0276 §1). UF-08.2 keeps its ID and is renamed "Today's plan". No new flow number.
- **Components:** the area row, the sets stepper (the UF-08.1 minutes stepper's pill buttons, 48 px) and the "Add an area" row reuse `.wl-row`, `.wl-chip`, `.wl-button--*`. No new token and no raw colour (D-0276).

### Data-modeler
- Layer 3 needs **no schema, RLS, export or openapi change.** All visit state (areas, pins, excludes, skipped areas) is on the device and written only as the existing `sessions.plan` at Start (UF-08.2, D-0280). The plan's item order is the automatic order.

### Engine-dev
- **Mapping to `suggest()`:** the area plan is the existing plan grouped by each item's first primary area (the rule 8/10 "home area"). `suggest` is **not changed**, so every R7 example and the server endpoint are untouched. The area edits are new pure functions beside `removeItem` and `insertItem` (rule 12.x): grouping, +/− a set, add or remove an area, a ranked list of addable areas, and a rule 7.6 ordering function (D-0275).
- **Rules that change:** none edited. New: rule 7.6 (ordering), 12.4 (`areaGroups`), 12.5 (`adjustAreaSets`), 12.6 (`addArea`, `removeArea`), 12.7 (`areaCandidates`). Required tests: examples, the five simulated 14-day histories, seeded properties (never over budget through an edit, determinism, ordering is a permutation, idempotent).

## Success metrics
- **Taps:** from UF-08.2 shown to Start tapped, 1 tap with no edit and at most 3 with two edits (e2e, T-0999). From UF-02.1, 3 taps with no edit.
- **Time:** target under 20 s from UF-08.2 to Start with at most 2 edits. Not measured in the app (no timing analytics, NFR-AN-2). The owner checks it by use; a measured version is a revisit.
- **Exercise-level edits per workout:** fewer swaps, removes and adds before Start. Not tracked automatically; the owner's own feel is the check ("did I spend the time rearranging?"). Learn-from-edits adds a device-only count (not sent anywhere).
- **Guardrails:** onboarding stays under 60 s; no change to `suggest` output (golden tests); no workout starts over budget through a **+**.

## Out of scope
- Showing exercise names on the area row (default: hidden; revisit).
- Drag and drop, manual order, per-area exercise count control, a "sets per exercise" control.
- Any engine change to `suggest`, targets, or the time model.
- Learning from area edits (a dropped area never changes a target; see the learn-from-edits spec).
- Equipment-level "busy today" (one toggle per piece of equipment). "Not today" is per exercise in v1.
- In-workout area view. UF-09 is unchanged.

## Open questions and logged defaults
1. Show exercise names on the area row? **Default: no**, count only.
2. Should the Ready step (UF-08.4) go, so Start is one tap from the plan? **Owner answer 2026-11-24: yes, fold it in (D-0280).** The finish time stays under the title, the explainer and the switches sit in a collapsed Focus mode disclosure, and the ID is retired.
3. A time chip clears the +/− edits. **Default: yes, with a status line** (revisit if people change time after editing).
4. "Remove" at the 2-set minimum removes the area (no confirm, undoable from "Add an area"). **Default: yes.**
5. Area order on screen is the engine's priority order, not the fixed order. **Default: priority order.**
