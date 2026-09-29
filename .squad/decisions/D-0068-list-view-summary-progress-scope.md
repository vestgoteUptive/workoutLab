---
id: D-0068
title: UF-03 List view / Summary and UF-06 Progress v1 scope — device-side summary through engine calls, effort 1–5 chips, no PR/e1RM/streak/volume/chart, 56-day progress window, "previous" column defined
status: revisit
date: 2026-09-29
by: product-owner (T-0305, T-0307 groom)
area: product
---
## Context
The prototypes for UF-03.1–.3, UF-06.1 and UF-06.2 show numbers that no engine rule, contract or decision defines: a "New personal record" card with an estimated 1RM (Brzycki), total volume in kg, a "3-week streak", "Weekly sets per muscle", a 12-week trend chart, and a 3-option effort picker whose copy says "Used to tune next week's weights".

These conflict with settled rules:
- D-0030 and D-0061 fix the effort rating at 1–5.
- D-0026 and D-0061 say the engine uses neither RIR nor effort.
- D-0002 says 14 days everywhere, never weekly.
- Principle 3 says the UI renders engine values and doesn't recompute them.

UF-03.3 must also work with no network (NFR-OFF-2). But the summary is shown *before* the user picks an effort rating and taps Save, so the `POST /sessions/{id}/finish` response can't be what renders it.

## Decision
1. **UF-03.3 is computed on the device, through engine functions only.** Every number comes from an engine call or from the stored session row:
   - **History:** `loadEngineHistory()` (server rows ∪ queue, D-0034 §3), normalised with `normalizeHistory`.
   - **Session sets:** the normalised history rows with `sessionId` = this session.
   - **Hard sets:** the count of session sets for which `isHardSet` is true.
   - **Exercises:** the distinct `exerciseId`s among those hard sets.
   - **Time:** `ended_at − started_at` of the session row, in whole minutes, rounded down. Next to it: "{timeBudgetMin} min budget".
   - **Before → after:** `before` = `balance(history without this session's sets, targets, library, now, tz)` and `after` = `balance(history, …)`, with the same `now`. The rows are the areas whose `after.load ≠ before.load`, in `after.areas` order, each reading "{Area} {before.load} → {after.load} / {target}" with the D-0013 number format.
   - **Next up:** the first ≤ 2 entries of `after.areas` (engine order) with `coverageStep < 4`, by area name. If there are none, it reads "Every area is on target".
   The UI doesn't compute `withinBudget`, a PR or a volume.
2. **Save writes through the offline queue.** "Save workout" calls `upsertSession({id, ended_at, effort_rating})`. `ended_at` is the value T-0304 stored when the workout ended (or now, if none is stored), and `effort_rating` is the chosen value or null. The queue is the durable path that already carries `ended_at` (D-0053 consequence, T-0300c), so the web doesn't call `POST /sessions/{id}/finish` in v1. That endpoint stays in the contract, and a later ticket can call it after the flush if the D-0058 rating tie-breaking matters on the web.
3. **Effort is 1–5 chips** (D-0030): 1 "Very easy", 2 "Easy", 3 "About right", 4 "Hard", 5 "Very hard". None is selected by default, and saving with none selected stores null. There is no "tune next week's weights" copy, because the engine doesn't use effort (D-0026, D-0061).
4. **UF-03.1 "Previous" column.** The previous exercise performance is shown as display data, not as an engine result:
   - It shows the hard sets of the same exercise in the most recent **earlier** session that contains it, by `completedAt`.
   - "Most recent" means the greatest `completedAt` among that session's hard sets, with ties going to the smaller `sessionId`, as in D-0040 §9.
   - Rows are matched by set order (the k-th hard set by `completedAt`) and read "{weight} × {reps}", "{reps}" for bodyweight or "{s} s" for timed sets. The column shows "—" when there's no such set.
   - The kg and reps inputs are pre-filled from the plan item's `prefill` (rule 14, the engine), never from "Previous".
5. **UF-06 v1 scope (a cut, principle 3 protected):**
   - **UF-06.1** has three parts:
     - **Month calendar:** the current local month, with the days of completed sessions marked. Completed means `checkinSessions(loadSessions(), history, library)` gives `hardSetCount ≥ 1`, dated by the local `startedAt`, which is rule 9's definition. It shows "{n} workouts this month", and today is outlined.
     - **Balance card:** the first 4 entries of `balance().areas` in engine order, each with `load / target` and a coverage bar. The whole card is one link to UF-10.1.
     - **Recent exercises:** every exercise with a hard set in the cached history, sorted by its last local date descending, then name. Each shows its best set from its latest session and links to UF-06.2.
   - **UF-06.2** shows the sessions of one exercise within the cached history, newest first. Each row reads "{date} · {weight} × {reps}, {reps}, …". Three stat cards cover the same window: Best set, Heaviest and Sessions. There's a "How to" link to UF-04.2 and the caption "Last 8 weeks".
   - **Best set** = the highest `weightKg`, then the most reps at that weight. For bodyweight it's the most reps, and for timed sets the longest `durationS`.
   - **Cut to Phase 5 (a `wl-idea`):** personal records, estimated 1RM, volume, streaks and the trend chart. If they come back, the "record" logic belongs in `packages/engine` with worked examples, not in the UI.
   - The UF-06 aggregations are pure functions in `features/UF-06/stats.ts` that take `now, tz`. They're unit-tested, and they never read the clock.
6. **The window is the cached 56 local days** (D-0034 §3, D-0045 §7). UF-06 shows no data older than the cache, so the page is identical offline and online.

## Consequences
- T-0305b and T-0307b encode §1–§6 as ACs.
- The engine lane gets a Phase 5 idea: a `records(history, library, tz)` rule, if user tests ask for PRs.
- The prototype's PR card, volume and chart remain illustrative only (D-0002).

## Revisit when
- A user test asks for personal records or strength trends.
- The web needs the D-0058 rating semantics. Then call `/finish` after the flush.
- More than 56 days of history are wanted on UF-06.2. Then page older rows in online only.
