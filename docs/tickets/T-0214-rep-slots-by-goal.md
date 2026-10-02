---
id: T-0214
title: "Engine: rule 7.2 rep slots depend on profile.goal (get_stronger 3–5/5–8/10–15, build_muscle unchanged, general_fitness 8–12/10–15/10–15), D-0061 §1, D-0095"
lane: engine
screens: [UF-08.2, UF-09.3, UF-09.4, UF-01.4]
decisions: [D-0024, D-0040, D-0057, D-0061, D-0093, D-0095, D-0096]
deps: [T-0205, T-0224]
status: done
---
<!-- Written by product-owner 2026-10-01 (groom mode). Build flow: wl-build-engine. About ½ day. Engine tickets run one at a time (D-0096 §3): T-0219 → T-0215 → T-0224 → T-0214. T-0224 is a dep so applySwap is made goal-aware in the same change. -->

## Why
The human decided (D-0061 §1) that the onboarding goal must change the workout. "Get stronger" means heavier sets with fewer reps, "General fitness" means lighter sets with more reps, and "Build muscle" keeps today's ranges. The goal changes only the rule 7.2 rep slots. Selection, costs (work stays 45 s per set), targets (rule 4) and level are unchanged, so the time budget and the deterministic plan are untouched (principles 2 and 3). Rule 14 progression reads the slot's low/high, so it follows automatically. D-0095 settles the build:
- `goal` is optional on the narrowed profile parameter and defaults to `build_muscle`, so the Edge Function caller keeps compiling;
- a new F-goal fixture line, instead of editing the pinned F-profile line;
- the back-off reps follow the goal.

## Scope
- In:
  - `packages/engine/src`:
    - the rep slot as a function of `(exercise, isMain, goal)`, per the D-0061 §1 table;
    - `suggest` and `applySwap` accept `goal?: Goal` on their profile parameter (absent means `build_muscle`; an unknown value throws `RangeError`);
    - every slot read uses it (D-0095 §2): item `repsMin`/`repsMax`, the rule 14 slot, the High back-off reps, rule 13's `previous` pre-fill, and `applySwap`'s rebuilt slot.
  - `docs/engine-rules.md` (D-0095 §4):
    - rule 7.2's Reps line becomes the goal table;
    - a new F-goal fixture line;
    - R7-E14 and R7-E15;
    - one Traceability row.
  - Tests: every AC below, including the simulated 14-day histories under each goal.
  - Edge cases:
    - zero history;
    - returning after 10 days off;
    - a goal change between sessions (the same history read against a new range);
    - bodyweight progression at the new high (D-0057 §2);
    - the High back-off;
    - a shuffled slot's carry;
    - offline-merged history.
- Out:
  - Rest, work time, targets, level and selection (unchanged by D-0061 §1).
  - The Edge Function caller (`supabase/functions/workouts/core.ts` passes only level and equipment; this is a backend follow-up, D-0095 §5).
  - The UF-01.2 goal copy (product or web).
  - Timed items, whose reps stay null.

## Acceptance criteria
**Fixtures unless an AC says otherwise:** F-tz, F-targets, F-profile (`goal: build_muscle`), F-input, `LIBRARY`, and `setsWithReps` (written `S(date, id, [w × r, …])`). Each AC is at least one Vitest test. A test for R7-E14 or R7-E15 starts its title with that id. `GS` = `profile({goal: "get_stronger"})`, `GF` = `profile({goal: "general_fitness"})`.

- **AC1 (R7-E14, the slots at zero history)** `suggest([], …, GS, …, F_INPUT)` gives the R7-E4 selection unchanged: bench-press × 4, inverted-row × 3, leg-extension × 2, `costS` [720, 555, 270], `itemsTotalS` 1545, `unusedS` 75.
  - Under `GS`: reps 3–5, 5–8 and 10–15, with pre-fills null × 3, 0 × 5 and null × 10 (`first_time`).
  - Under `GF`: 8–12, 10–15 and 10–15, with null × 8, 0 × 10 and null × 10.
  - Under F-profile, and under a profile object with no `goal` key: deep-equal to today's R7-E4 result.
- **AC2 (R7-E15, one history, three goals)** Given `S(2026-09-24, back-squat, [100×8, 100×8, 100×8])` and `input({mainLiftId: "back-squat"})`, item 0's `prefill` is:
  - under build_muscle: `{weightKg: 102.5, reps: 6, kind: "increase"}` (R14-E1);
  - under `GS` (3–5): `{102.5, 3, "increase"}`;
  - under `GF` (8–12): `{100, 9, "add_rep"}`.

  Its `repsMin`/`repsMax` are 6/8, 3/5 and 8/12.
- **AC3 (bodyweight, R7-E6 by goal)** With `equipment: []` and `budgetMin 15`, the item is push-up × 4 at 0 kg with reps 6 (build_muscle), 3 (`GS`) and 8 (`GF`).
  - Given `S(2026-09-24, push-up, [0×8, 0×8, 0×8])` and push-up as a compound accessory under `GS` (5–8), `prefill` gives `{0, 8, "increase"}`: high reps, D-0057 §2.
- **AC4 (the back-off follows the goal)**
  - With `input({budgetMin: 15, warmupInBudget: false, energy: "high"})` at zero history (R7-E12), bench-press's `backoff` is `{weightKg: null, reps: 3}` under `GS` and `{null, 8}` under `GF`. `costS` is 885 in every case.
  - With R14-E9's history `S(2026-09-24, bench-press, [80×8, 80×7, 80×6])` and `mainLiftId "bench-press"`:
    - under `GS`, `prefill` is `{82.5, 3, "increase"}` and `backoff` `{72.5, 3}` (`floorInc(74.25, 2.5)`);
    - under `GF`, `prefill` is `{80, 8, "hold"}` (`minReps` 6 < 8 with one session) and `backoff` `{70, 8}`.
- **AC5 (a goal change between sessions)** Given `S(2026-09-24, back-squat, [100×6, 100×6, 100×6])` as the main lift:
  - build_muscle gives `{100, 7, "add_rep"}`;
  - `GS` gives `{102.5, 3, "increase"}`;
  - `GF` gives `{100, 8, "hold"}`.
  - Given a second, earlier `S(2026-09-20, back-squat, [100×6, 100×6, 100×6])`, `GF` gives `{90, 8, "deload"}`.
- **AC6 (returning after 10 days off)** Given `S(2026-09-15, back-squat, [100×8, 100×8, 100×8])` (gap 12) as the main lift, every goal gives `hold_after_break` at 100 kg and the goal's low reps (6, 3, 8).
- **AC7 (shuffle carry reads the goal)** Re-run T-0205 AC18's cable-only case (lat-pulldown → seated-cable-row through `shuffle`) under `GS`:
  - the carried weight equals lat-pulldown's own rule 14 pre-fill weight at the `GS` compound slot (5–8);
  - the swapped item's reps are 5;
  - `kind` is `"carry"`.

  Assert the literals, derived by hand in the test.
- **AC8 (`applySwap` reads the goal, D-0093 §2)**
  - R12-E8 under `GS`: push-up in the main slot at reps 3–5 with `prefill` 0 × 3.
  - R12-E6 under `GF`: barbell-row at 10–15 with `prefill` null × 10.
  - Under F-profile, every R12-E6…R12-E11 result is unchanged.
- **AC9 (validation and the default)**
  - `suggest` and `applySwap` with `goal: "bulk"` throw `RangeError`.
  - A profile without `goal` deep-equals the build_muscle result for every input in AC1–AC4.
  - `suggest`'s profile parameter type accepts `{level, equipment}` with no `goal`, which keeps `supabase/functions/workouts/core.ts` compiling (an `expectTypeOf` test).
- **AC10 (byte-identical under build_muscle)** Every existing engine test stays green with no expectation edited (F_PROFILE is build_muscle). If one has to change, stop and raise triage.
- **AC11 (simulated 14-day histories under every goal)** For each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, T-0219's `timedCoreHistory` and `[]`, under each of the three goals at F-input:
  - `[exerciseId, sets, costS]` per item, `itemsTotalS` and `unusedS` are identical across goals (the goal never changes selection or cost);
  - every non-timed item's `repsMin`/`repsMax` match the D-0061 §1 table for its role;
  - every `prefill.reps` lies in `[repsMin, repsMax]`;
  - R7-E8's caps hold over `budgetMin` 15…120 step 15, with the warm-up on and off.

  For T-0205 AC22's "balancedHistory, main bench-press + pinned" variant, assert these literals:
  - **`GS`:**
    - bench-press 52.5 × 3 `increase`;
    - back-squat, barbell-row, overhead-press and romanian-deadlift 52.5 × 5 `increase`;
    - calf-raise 45 × 10 `deload`;
    - dead-bug 0 × 10 `deload`;
    - db-row null × 5 `first_time`.
  - **`GF`:**
    - bench-press 50 × 9 `add_rep`;
    - back-squat, barbell-row, overhead-press and romanian-deadlift 45 × 10 `deload` (both last sessions at 50 with `minReps` 8 < 10);
    - calf-raise 45 × 10 `deload`;
    - dead-bug 0 × 10 `deload`;
    - db-row null × 10 `first_time`.
- **AC12 (the contract text, D-0095 §4)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - rule 7.2's Reps line names all three goals with the D-0061 §1 ranges and cites D-0061 and D-0095;
  - a `- **F-goal:**` line follows F-profile;
  - the F-profile line is byte-identical (the T-0202 guard stays green);
  - lines starting `- **R7-E14` and `- **R7-E15` exist;
  - the Traceability table has a T-0214 row.

  The committed test pins only this ticket's own content and the byte-identical F-profile line. There is no committed "every other section unchanged" test (D-0096 §2). Instead, before returning, run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. The expected sections are §Fixtures, §7.2 and Traceability. Code review checks that list against the Listed extras grant. If no earlier engine ticket has re-scoped the two whole-file guards, do T-0219 AC14 here (D-0092 §6).
- **AC13 (determinism and purity)** For AC1–AC8's inputs: reruns are deep-equal, deep-frozen inputs neither throw nor change, and reversed `history`/`library` give deep-equal results. `pnpm --filter @workoutlab/engine lint` passes.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: the F-goal fixture line, rule 7.2's Reps line, R7-E14, R7-E15, and one Traceability row (D-0095 §4).

## Contract impact
- `docs/engine-rules.md` §Fixtures (a new F-goal line) and rule 7.2's Reps line change under D-0061 §1 and D-0095 (engine lane owns this contract).
- `api/openapi.yaml` and `docs/data-model.md` are unchanged: `profiles.goal` already exists, and `repsMin`/`repsMax` keep their types.

## Coordination
- **Files this ticket changes:**
  - `packages/engine/src/session.ts` (the rep slot, the `suggest` profile type, the back-off reps, shuffle `previous`);
  - `applySwap`'s source (T-0224's `src/apply-swap.ts` or `src/swaps.ts`);
  - possibly `src/types.ts` and `src/index.ts`;
  - new `test/rule-7-goal-reps.test.ts`;
  - `docs/engine-rules.md` §Fixtures, §7.2 and Traceability.
- **Engine tickets run one at a time** (D-0096 §3): T-0219 → T-0215 → T-0224 → **T-0214**. T-0224 is a dependency, so AC8 always applies.
- Backend follow-up: `supabase/functions/workouts/core.ts` `suggestProfile` passes `goal`, and the vendored engine is regenerated (D-0053 §1).

## Definition of done
- Tests for every AC pass, including R7-E14, R7-E15 and the simulated histories under each goal (AC11).
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- The contract change is linked to D-0095.
- Commit messages start with `T-0214` and cite UF-08.2 or UF-09.3 (e.g. `T-0214 UF-08.2: rep slots by goal`).

## Accept log
**2026-10-02, product-owner: accepted (`done`).** Branch at cc1b214.

- **Build.** Rule 7.2's rep slot is now a function of `(exercise, isMain, goal)`, following the D-0061 §1 table: get_stronger 3–5/5–8/10–15, build_muscle unchanged, general_fitness 8–12/10–15/10–15. `goal` is optional on `SuggestProfile` and on `applySwap`'s profile, and defaults to `build_muscle`. An unknown value or `null` throws `RangeError`. Every slot read uses the goal (D-0095 §2): item reps, the rule 14 slot, the High back-off reps, rule 13's shuffled `previous`, and `applySwap`'s rebuilt slot. The engine suite has 528 tests: 478 existing tests, none edited, plus 50 new ones in `test/rule-7-goal-reps.test.ts`. The build_muscle output is byte-identical, including every pre-T-0219 `suggest` snapshot (AC10). `docs/engine-rules.md` changes only in §Fixtures (F-goal), §7.2 Reps with R7-E14/R7-E15, and Traceability. That matches the Listed extras grant.
- **QA: pass, all 13 ACs.** QA re-derived R7-E14, R7-E15 and the AC4 back-offs by hand. All 3 planted faults went red, and no existing test file was touched. Web tests pass 931/931.
- **Code review: approve.** `SuggestProfile` narrows the openapi `Profile` without diverging from it. Rejecting `null` matches the not-null `profiles.goal` contract. One nit, not blocking: the internal default-goal parameters could be required.
- **AC7 strengthening (spec gap, no behaviour change).** The ticket's AC7 fixture (T-0205 AC18's lat-pulldown at 50 × 12 ×3) gives `increase` to 55 under both build_muscle and get_stronger. So it can't tell whether the shuffled slot's `previous` pre-fill reads the goal's slot or build_muscle's. The builder added a second AC7 case: lat-pulldown at 50 × 8 ×3 gives 55 × 5 `increase` at get_stronger 5–8 and 50 × 9 `add_rep` at build_muscle 8–12, and the carry must be 55 × 5 `carry`. QA confirmed that this case is the only test that catches the shuffled-`previous` fault. I accept it as part of AC7. This was my error in the spec, and the practice note below covers it.
- **Principles hold.** The goal never changes selection, cost, targets or level. AC11 shows identical `[exerciseId, sets, costS]`, `itemsTotalS` and `unusedS` across goals over every simulated 14-day history, with R7-E8's caps holding at 15…120 min. So the time budget (principle 2) and the deterministic engine (principle 3, AC13 purity lint green) are untouched. The onboarding goal (UF-01.2) now actually changes the plan, as D-0061 §1 requires.

**Follow-ups:** T-0227 (backend: `supabase/functions/workouts/core.ts` passes `goal`, D-0095 §5) is already on the board. The orchestrator regenerates the vendored engine at merge (D-0053 §1). Engine, optional: make the internal default-goal parameters required, so that only the public `suggest`/`applySwap` boundary defaults. Product practice: for an AC that checks a value is carried, pick a fixture where the goals give different results.
