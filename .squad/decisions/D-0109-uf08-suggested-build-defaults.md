---
id: D-0109
title: UF-08.2 build defaults (T-0303b) — the setup inputs record, every re-suggest keeps the main lift, the time chips are UF-08.1's five, row and bar copy, focus after Remove, and T-0303b only imports lib/i18n/workout.ts
status: revisit
date: 2026-10-02
by: product-owner (groom T-0303b/T-0303d/T-0304a)
area: product
builds-on: D-0065 §4, D-0071 §1, D-0106 §4, D-0107 §1 §2 §3 §5
supersedes: D-0065 §4 in part (the "30/45/60 around the current value" chip wording, and "or a stepper change" for UF-08.2, which has no stepper)
---
## Context
D-0065 §4 says every UF-08.2 action goes back through `suggest`, and the parent T-0303 AC-B1–B6 give most of the copy. A builder still has to guess at seven things, and each guess changes what a test asserts:
1. Which `suggest` inputs UF-08.2 holds, and what happens to them on Back to UF-08.1.
2. Whether Shuffle and an accessory Remove pass the current main lift, or only the time chips do (D-0065 §4 names only the time chips).
3. Which time chips UF-08.2 shows. D-0065 §4 says "30/45/60 around the current value", the parent AC-B4 says "30/45/60", and its own example (R7-E5) goes from 30 to 20, which neither chip set offers.
4. The row copy for weight, bodyweight, a back-off with a null weight, and the warm-up row.
5. When the bar shows a warm-up segment and an unused segment, and the over-budget text with the warm-up off.
6. Where keyboard focus goes after Remove takes the focused row away.
7. Whether T-0303b uses its D-0071 §1 permission to add keys to `lib/i18n/workout.ts`. If it does, T-0302c's export-key pin breaks, and T-0302b must keep waiting on T-0303b.

## Decision
1. **The setup inputs record.** The `SessionSetup` host holds one record, `{budgetMin, warmupInBudget, energy, shuffle, mainLiftId, excludeIds}`, next to the current `Workout`.
   - Arriving at UF-08.2 from "Suggest my workout" starts with `shuffle: 0`, `excludeIds: []` and the `Workout` UF-08.1 rendered (reference-equal, D-0107 §2). No new `suggest` call is made on arrival.
   - **Back to UF-08.1 discards the UF-08.2 adjustments.** UF-08.1's call is fixed at `shuffle: 0, mainLiftId: null, excludeIds: []` (T-0303a AC-6). "Suggest my workout" then hands over UF-08.1's `Workout` again. A time chip picked on UF-08.2 is kept, because `budgetMin` is shared and UF-08.1 shows it.
   - `shuffle` is never reset while the user stays on UF-08.2 (D-0056 Consequences). It is reset only by leaving UF-08.2 for UF-08.1.
2. **Every UF-08.2 re-suggest keeps the main lift.** Each action calls `suggest(history, targets, profile, library, {budgetMin, warmupInBudget, energy, shuffle, mainLiftId, pinnedIds: [], excludeIds}, now, tz)` exactly once, where `mainLiftId` = the current `workout.plan.mainLiftId`. The one exception is Remove on the main item, which passes `mainLiftId: null`. This extends D-0065 §4 from the time chips to Shuffle and an accessory Remove, so the main lift never changes under the user's hands while they adjust accessories. `now` and `tz` are the host's mount-time values (D-0107 §4).
3. **Time chips.** UF-08.2 shows the same five chips as UF-08.1, 20/30/45/60/90, in a group named "Time". The chip equal to `budgetMin` has `aria-pressed="true"`, and none is pressed at, say, 50. Re-pressing the active chip makes no call. There is no stepper on UF-08.2: a finer change goes through Back. This replaces D-0065 §4's "30/45/60 around the current value" and makes R7-E5 (30 → 20, bench-press kept) reachable in one tap.
4. **Row copy** (strings in `lib/i18n/flows/uf-08.ts`):
   - Name: the library `name`, falling back to the `exerciseId`.
   - Detail line: `itemSummary(item)` · weight · `{ceil(costS / 60)} min`, joined with " · ". The weight part is:
     - "Bodyweight" when the library exercise has `externalLoad: false`, whatever `prefill.weightKg` is;
     - "{w} kg" when `prefill.weightKg` is a number, with `w` from `Intl.NumberFormat(locale, {maximumFractionDigits: 2})` (en-GB 77.5);
     - left out when it is null (null means "ask", D-0057).
   - Back-off: "+ 1 back-off {w} × {reps}" from `item.backoff`, or "+ 1 back-off set" when `backoff.weightKg` is null.
   - Reason line: `itemReasonLine(item.reasons)`. An empty string renders no reason element.
   - Warm-up row: "Warm-up", the `plan.warmup` move names (library names) joined with ", ", and "{WARMUP_COST_S / 60} min" (3 min). It has no Remove or Swap control. When `plan.warmup` is empty, there is no warm-up row.
   - Empty plan: "Nothing fits in {budgetMin} min" (the UF-08.1 key, reused), and "Looks good" stays enabled (D-0065 §3).
5. **The bar.** One flex row, `aria-hidden="true"`, each segment's `flex-grow` = its seconds:
   - a warm-up segment of `WARMUP_COST_S` only when `warmupInBudget` is true;
   - one segment per item, `costS`, in plan order;
   - an unused segment of `unusedS` only when `unusedS > 0`.

   The text next to it carries the information (`aria-live="polite"`). Let `shownS` = `totalS` when the warm-up counts, else `itemsTotalS`, and `suffix` = "" when the warm-up counts, else " + warm-up":
   - Within the budget (`itemsTotalS ≤ availableS(budgetMin, warmupInBudget)`, the engine function): "About {ceil(shownS / 60)} of {budgetMin} min{suffix}".
   - Over it: "{ceil(shownS / 60)} min, {over} over{suffix}", where `over = ceil((itemsTotalS − availableS) / 60)`, and the item segments use `var(--wl-color-warn)`. Equality is within the budget.
6. **Focus after an action.** After Remove, focus moves to the Remove button of the row now at the same index, else to the last row's Remove button, else to "Looks good". After Shuffle or a time chip, focus stays on the control that was used.
7. **`lib/i18n/workout.ts` is imported, never edited, by T-0303b.** Every new UF-08.2 string goes in `flows/uf-08.ts`. T-0303b does not list `workout.ts` in its paths. D-0071 §1's permission ("T-0303b may add keys") stays available to a later ticket that lists the file. Consequences for scheduling:
   - T-0303b still depends on T-0302c, which creates the module it imports.
   - T-0302b no longer has to wait for T-0303b: nothing it reuses comes from T-0303b (this lifts the T-0302 parent's reason for that dep).
   - T-0303b and T-0302b share no file, so they may run in parallel.

## Consequences
- T-0303b encodes §1–§7 as ACs. The parent T-0303 AC-B4's "time chips 30/45/60" reads as §3.
- Orchestrator (board): T-0302b's deps may drop T-0303b (§7). This is an option, not a requirement.
- T-0303c (UF-08.3) sets the `Workout` from `SwapSheet`'s `onApply` without touching the inputs record. A later Remove, Shuffle or chip then re-suggests from the record and drops the swap, as the parent AC-C2 already says.

## Revisit when
- Users lose their UF-08.2 adjustments by going Back and complain. Then keep `excludeIds` and `shuffle` across Back.
- Users want a finer time change on UF-08.2 than the five chips.
- Two or more web features need the same weight formatter. Then add it to `workout.ts` through a ticket that lists the file.
