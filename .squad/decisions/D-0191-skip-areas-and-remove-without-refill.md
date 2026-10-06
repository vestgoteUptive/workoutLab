---
id: D-0191
title: "GitHub #33: UF-08.1 gets a per-workout \"Skip today\" area choice that reaches the engine as SessionInput.avoidAreas (treated like a recovering area), and UF-08.2 Remove drops the item without refilling it through a new pure engine function removeItem"
status: revisit
date: 2026-10-06
by: product-owner (GitHub #33 intake)
area: product
builds-on: D-0024, D-0027, D-0037 §7, D-0065 §4, D-0093, D-0109
amends: D-0065 §4 (Remove), D-0109 §1 §2 (the inputs record gains avoidAreas; Remove no longer re-suggests)
---
## Context
GitHub #33 (the owner, first real user, the day after go-live): "Today I couldn't select muscle
group when starting a workout. Did legs a couple of days ago and is sore. I couldn't deselect those
workouts items."

What the code does today (main fa4171e):
- **There is no way to pick or skip a body area for a workout.** UF-08.1 (user-flows v2) has time,
  warm-up and energy only. `SessionInput` (`packages/engine/src/types.ts:146-155`,
  `api/openapi.yaml` SessionInput) has no area input. Areas reach the engine only through the
  profile's priority areas (rule 4, a +25 % target, not a per-workout choice) and recovery (rule 6).
  So this half of the report is a **missing feature**, not a bug.
- **Recovery does not cover "sore after a couple of days".** Rule 6 skips an area only when
  ≥ 6 weighted hard sets landed in the last 48 h. Legs done "a couple of days ago" are usually past
  48 h (or were never logged in the app), so the engine sees a leg deficit and fills it first.
- **Remove exists but refills the same area.** UF-08.2 Remove (`Suggested.tsx:245-253`) calls
  `onRemove`, which re-runs `suggest` with the id appended to `excludeIds`
  (`SessionSetup.tsx:269-275`). Rule 7.2's greedy fill then takes the lowest-`r` area again, which
  is still the leg area, and adds its next candidate. The library has 8 exercises each with quads,
  glutes or hamstrings at weight 1.0 and 6 for calves, so a user has to tap Remove many times before
  legs leave the plan. To the user that reads as "I can't deselect it". This is working as specified
  (D-0065 §4: "The engine may fill the freed time"), and D-0065 named exactly this as its revisit
  trigger: "Remove refilling freed time confuses people (then add an engine 'drop without refill'
  option)". The trigger has fired.

Principle 3 rules out a UI-side filter: the area choice must be an engine input.

## Decision
1. **Skip today (UF-08.1).** Under Energy, an optional group "Skip today" with the nine areas as
   toggle chips in the fixed area order, none pressed by default. It belongs to this workout only:
   it is never saved to the profile or the server and starts empty on every new visit to
   `/session/setup`. Time stays the first input (principle 2), and onboarding is untouched
   (principle 5). It is UF-08.1 state like `budgetMin`, so going Back from UF-08.2 keeps it.
2. **Engine input `avoidAreas`.** `SessionInput` gains `avoidAreas: readonly Area[]`. It's optional,
   and absent means `[]`, so every existing caller and fixture is unchanged. An unknown area is a
   `RangeError`, and duplicates are ignored. New rule 6.1: an avoided area is treated like a recovering
   area for selection only:
   - it is never an eligible area in rule 7.2;
   - no main lift or candidate with an avoided area at weight 1.0 is selected, and a
     `mainLiftId` with an avoided primary area is ignored (rule 7.2 falls back);
   - its projected deficit counts 0 in gap fit;
   - a rule 13 shuffle pick with an avoided primary area is skipped, and the slot keeps its original.

   Weight-0.5 areas are not filtered, which matches rule 6. Avoided areas add no reason code, and
   they don't change balance, targets, recovery, check-ins or the warm-up rule (7.3 already builds
   from the items' areas). `rankSwaps` / `applySwap` are unchanged, because a swap is the user's
   explicit pick (revisit below). `[]` gives a result deep-equal to the current one.
3. **Contract changes named here.**
   - `docs/engine-rules.md` gets rule 6.1 and examples (engine lane, T-0516).
   - `api/openapi.yaml` SessionInput gets an optional `avoidAreas` (array of `Area`, `uniqueItems`,
     not in `required`), and `packages/shared` api.gen.ts is regenerated (data lane, T-0517).
   - The `/workouts/suggest` validator (`supabase/functions/_shared/validate.ts`) accepts and passes
     it through (backend lane, T-0518). The web app calls `suggest` on the device (D-0063 §3), so
     T-0517 and T-0518 don't block the user-facing fix.
4. **Remove without refill.** New pure engine function (rule 12.2)
   `removeItem(workout, exerciseId): Workout`, modelled on `applySwap`:
   - The item is dropped, and the order of the rest is kept.
   - `plan.mainLiftId` becomes null if the removed item was the main lift. No other item is promoted.
   - `itemsTotalS` = Σ costS, `totalS` = itemsTotalS + 180, `unusedS` = max(0, availableS(budgetMin,
     warmupInBudget) − itemsTotalS).
   - `plan.warmup` is not regenerated (as in `applySwap`).
   - `sessionReasons` loses the `area_deficit` entries whose area is no longer any remaining item's
     first primary area. `recovering_skipped` entries stay, and nothing is added back.
   - A `RangeError` when the id is not an item. Inputs are never mutated.

   UF-08.2 Remove calls `removeItem` (zero `suggest` calls) and still appends the id to the
   record's `excludeIds`, so a later Shuffle or time chip, which re-suggests per D-0109 §2, never
   brings it back. A later re-suggest may refill the freed time; Skip today is how the user keeps an
   area out across re-suggests.
5. **Empty plan after removals.** If Remove leaves 0 items, UF-08.2 shows "No exercises left. Pick a
   time to rebuild." instead of the "Nothing fits" copy. "Looks good" stays enabled (D-0065 §3).
6. **UF-08.2 shows what is skipped.** When `avoidAreas` is not empty, UF-08.2 shows one line under
   the why chips: "Skipping today: Quads, Glutes" (area labels in the fixed order). No control on
   UF-08.2: a change goes through Back (the same pattern as D-0109 §3's finer time change).

## Consequences
- Tickets: T-0516 (engine, avoidAreas), T-0517 (data, openapi), T-0518 (backend, validator),
  T-0519 (engine, removeItem), T-0520 (web UF-08.1/.2 Skip today), T-0521 (web UF-08.2 Remove).
  T-0516 and T-0519 both touch `packages/engine` and `docs/engine-rules.md`, so they run one after
  the other. T-0520 and T-0521 both touch `features/UF-08`, so they also run one after the other.
- `Design-docs/docs/product/user-flows.md` UF-08.1 and UF-08.2 are updated in this intake.

## Revisit when
- Users want a one-tap "Legs" or "Upper" group chip instead of nine area chips.
- Users skip an area and still get a swap candidate for it on UF-08.3 (then filter `rankSwaps` by
  `avoidAreas`).
- Users ask for the skip choice to persist, or to be pre-pressed from recent soreness. Then
  consider a soreness check-in, which is a data-model change.
- Users want avoided areas to also exclude weight-0.5 exercises (strict mode).
