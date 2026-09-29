---
id: D-0065
title: UF-02 Today and UF-08 Session setup defaults (T-0302, T-0303) — 45-min preview, stepper and finish time, fit line, remove and shuffle re-suggest, swap through an engine helper, Ready settings, session start
status: revisit
date: 2026-09-29
by: product-owner (T-0302/T-0303 groom)
area: product
---
## Context
UF-02.1 shows "Today's workout" before the user has said how much time they have. UF-08 has several actions that change the plan (time change, remove, shuffle, swap), and principle 3 forbids the UI from re-deciding anything. The prototype also shows content the engine doesn't produce: split names ("Lower A"), "Hi, [NAME]", "Week 3 of …", "This week 3/4", "Latest PR", the "Always use this in <routine>" option, and a "Skip it today" swap option. D-0056 §Consequences says "applying a user swap to a stored plan is UI work". Rule 7.2's rep range for the new slot, and rule 14 `carry` through `previous`, are engine logic, though, so the UI would have to copy them.

## Decision
1. **Today preview (UF-02.1, UF-02.2).** The preview is `suggest(…, {budgetMin: 45, warmupInBudget: true, energy: "normal", shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}, now, tz)` on the device (D-0063 §3). It's labelled "Suggested for 45 min". Start always goes to UF-08.1, which asks for the time (principle 2). The preview never starts a session. There is no split name, greeting, week counter, weekly count or PR card in v1 (no stored name, NFR-PRIV-2; UF-06 owns progress).
2. **UF-08.1 defaults.** 45 min, warm-up in budget on, energy `normal`. The stepper moves ±5 and is clamped to 15–120. The chips are 20/30/45/60/90. "Done by HH:MM" = `formatTime(now + budgetMin × 60 s)` in the device locale and tz. **Finish time** (the open question in user flows v2, owner T-0303): "Set a finish time" opens a time input, and `budgetMin = floor((finish − now) / 60 s)`. A finish time at or before `now` means tomorrow and is rejected as "Pick a time later today". A result outside 15–120 is clamped, and the clamped value is shown. The time is converted once, when it is picked (user flows v2: "converts to minutes at start").
3. **Live fit line.** "Fits: {n} exercises, {m} sets" + " + warm-up", where n = `plan.items.length` and m = Σ `sets` + the back-off sets. It is re-run through `suggest` on every change. If n = 0, it reads "Nothing fits in {budget} min". An empty plan is still valid and can start (board note from T-0201).
4. **UF-08.2 actions** all go back through the engine:
   - **Time chips (30/45/60 around the current value) or a stepper change** re-run `suggest` with `mainLiftId` = the current main lift (rule 7.2, R7-E5), keeping `excludeIds` and `shuffle`.
   - **Remove** adds the exerciseId to `excludeIds` and re-runs `suggest`. The engine may fill the freed time (rule 7.2). The warm-up has no remove action. Removing the main lift sets `mainLiftId: null`.
   - **Shuffle** increments `shuffle` by 1 and never resets it (D-0056 Consequences). The excluded ids stay out (D-0059 §2).
   - **Over budget:** the bar turns `warn` only when `itemsTotalS > availableS(budgetMin, warmupInBudget)`, which can only happen after a swap to a `fitsBudget: false` candidate.
5. **Swap (UF-08.3) goes through an engine helper.** A new pure engine function (**T-0224**, engine lane, rule 12 addendum) `applySwap(workout, currentExerciseId, candidateId, reason, history, profile, library, now, tz): Workout` replaces the slot in place. It keeps the position and the set count, uses the new exercise's rule 7.2 rep slot, runs `prefill` with `previous = {currentExerciseId, current prefill.weightKg}`, adds `swap {reason}`, and recomputes `costS`, `itemsTotalS`, `totalS` and `unusedS`. T-0303c renders its output and depends on it. Until that exists, UF-08.2 has no swap action (the button is absent, not disabled). "Always use this in <routine>" and "Skip it today" are out (routines are T-0308, and Remove covers skipping).
6. **UF-08.4 Ready settings.** Sound cues, voice countdown 3-2-1 and keep screen awake all default to on. They are stored per device through `features/UF-08/focus-prefs.ts` (`localStorage["wl-focus-prefs"]`, D-0063 §5). The summary shows the engine's values: m = `ceil(totalS / 60)` min, items, Σ sets, and "done by" = `now + m` minutes. `totalS` always includes the warm-up, because the warm-up still happens even when the budget doesn't count it.
7. **Session start.** Start creates `sessions` through `upsertSession({id: crypto.randomUUID(), started_at: now, ended_at: null, time_budget_min: budgetMin, energy, warmup_in_budget, plan: workout.plan})` and navigates to `/session/<id>` **only after** the IndexedDB write resolves (NFR-OFF-2). A second tap while it is pending does nothing (exactly one session per Start). Each Start makes a new session id, so two devices give two sessions (NFR-SYNC-4).

## Consequences
- engine T-0224: `applySwap` with worked examples (it needs a decision naming the rule 12 text change, engine lane). It is also the natural helper for UF-05.1 (T-0306b).
- T-0303 is split into T-0303a (UF-08.1), T-0303b (UF-08.2), T-0303c (UF-08.3, waits for `applySwap`) and T-0303d (UF-08.4 + start). T-0302 is split into T-0302a (UF-02.1) and T-0302b (UF-02.2).
- UF-11.1 on UF-02.1: T-0308c mounts `CheckinCard` (exported from `features/UF-11/index.tsx`, D-0067 §4) by editing only `features/UF-02/Today.tsx`, in the slot T-0302a leaves between the attention line and the suggestion card.

## Revisit when
- Users want the Today preview at their usual length (then remember the last budget per device).
- The first 20 real sessions show that Remove refilling freed time confuses people (then add an engine "drop without refill" option).
- T-0224 (`applySwap`) lands (then turn on T-0303c).
