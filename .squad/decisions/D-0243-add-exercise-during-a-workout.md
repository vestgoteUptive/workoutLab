---
id: D-0243
title: "Add exercise during a workout: a new sheet UF-09.10 opened from UF-09.9 Paused (never from UF-09.1–.8), reusing the UF-08.5 search, favorites and \"Today's areas\" lists; the new item goes right after the current exercise; only the 8-item cap applies; refused when it doesn't fit the time left; no Suggested section in v1"
status: revisit
date: 2026-11-13
by: product-owner (idea, owner request)
area: product
builds-on: D-0002, D-0071 §4, D-0111 §7, D-0120 §6 §7, D-0142 §7, D-0199, D-0202, D-0205 §2 §3 §9, D-0211, D-0231
amends: D-0205 §1 (UF-08.5's add list is now reachable from UF-09, as UF-09.10) and lifts D-0205's "Adding exercises during a workout" out-of-scope line
---
## Context
The owner (2026-11-13), verbatim: "New feature. I want to be able to add exercise during a session."

D-0205 (2026-10-07) built "Add exercise" for planning only (UF-08.5) and listed "Adding exercises during a workout" as out of scope for v1. It was deferred, not ruled out. D-0205 §1 says UF-08.5 is never reachable from UF-09.

Principle 1 allows no list or extra control on UF-09.1–.8. Everything else lives behind Pause (UF-09.9), which already holds Swap (UF-05.1, through a seam), Do {name} later, Skip, How-to, List view and End. User flows v2 says a new screen takes the next step number: UF-09.10.

## Decision
1. **Entry.** UF-09.9 Paused gets one action, **"Add exercise"**, between "Do {name} later" and "Skip to next exercise". Nothing is added on UF-09.1–.8. The action is hidden when the pause came from UF-09.8 (`resumePhase` `timeCheck`): that screen has its own options, and being behind leaves no time to add anything.
2. **UF-09.10 Add exercise** is a sheet over focus mode (the D-0211 plan sheet, as UF-05.1). It has the UF-08.5 search field, an empty-query list (Favorites first, then "Today's areas" for the areas of the plan's items) and its no-match line, with D-0205 §2's ordering rules. There is **no "Start with this"** (an added item is never the main lift) and **no "Suggested" section** in v1. The lead line reads "{m} min left" (the engine's `timeLeftS`, D-0244), or "No time left" when it is under 60 s.
3. **Row states** (one line of text, first match wins; `aria-disabled` with the reason in `aria-describedby`):
   1. Skipped in this workout → "Skipped in this workout". Any other plan item → "In this workout". An exercise appears once per plan (D-0205 §9 depends on it).
   2. Excluded (D-0199) → "Excluded". Equipment → "Not available with your equipment". Level → "Above your level". There is no pointer out of focus mode (D-0231: nothing in UF-09).
   3. A primary area recovering **at the session's start** → "{Area} is recovering". The UI calls `recoveringAreas` over the history before `started_at`, at `now = started_at`. Sets logged in this workout never block an add for the area being trained.
   Skip today (UF-08.1 `avoidAreas`) is not checked: the session row doesn't store it, and the add is the user's explicit choice.
4. **Position: just after the current exercise** (index `itemIndex + 1`). In `getReady` or `warmup` that is after item 0. When the current item is the last one, the new item is appended. A user who wants it now uses "Do {name} later" on the current item if it isn't started yet.
5. **Caps.** Only the plan's 8-item cap applies (`SessionPlan.items` `maxItems: 8`). It counts done and skipped items: "This workout has 8 exercises, the most it can hold." The rule 7.2 cap of two exercises per area is a selection rule and does not apply to an explicit mid-workout add.
6. **Time.** The add is refused when even 2 sets don't fit the time left (D-0244): "{name} doesn't fit in the {m} min left.", or "{name} doesn't fit. No time left." when m is 0. Nothing ever goes over the budget through an add (principle 2). An added item can later be trimmed by UF-09.8 Trim like any accessory. Trim is a choice the user taps, so this is accepted.
7. **After a successful add**, the sheet closes and the screen stays on **UF-09.9 Paused** with focus on "Add exercise". A `role="status"` line says "{name} added after {current}." (or "{name} added." when nothing comes before it). The user may add another one, or Resume.
8. **Nothing persists beyond the session.** There is no "Added by you" marker stored, because that would need a new reason code, which is an openapi change. Routines (UF-07) remain the place for forced exercises.
9. **Design prerequisite.** Screen specs for UF-09.10 and the UF-09.9 action, on the D-0203 classes with no new token, before any UI ticket.

## Consequences
- Spec: `docs/specs/add-exercise-in-session.md`. User flows v2 now list UF-09.10 marked "proposed, not built", so that the screen-ID check accepts the ID. On acceptance, T-0946 drops "proposed", updates the UF-09.9 action list and adds the PRD row.
- Engine work is in D-0244. Focus state and sync are in D-0245.
- Board section "Add exercise during a workout", with rows at `idea`.

## Revisit when
The owner accepts or changes the spec's open-question defaults, or the first user test of the add shows that users want it to go first, or want a Suggested list.
