---
id: T-0227
title: "Backend: POST /workouts/suggest passes profile.goal to the engine, so the endpoint serves the goal's rep slots (D-0095 §5, D-0061 §1)"
lane: backend
screens: [UF-08.2, UF-01.4]
decisions: [D-0053, D-0061, D-0095]
deps: [T-0214]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom mode). Build flow: wl-build-backend. About ¼ day. Becomes ready when T-0214 is done and merged, with the vendored engine regenerated on main by the orchestrator. It touches supabase/**, so it needs a green draft-PR run (AC6). -->

## Why
D-0061 §1 (decided by the human) says the onboarding goal changes the workout, and T-0214 makes the engine's rep slots follow `profile.goal`. The Edge Function's `suggestProfile` (`supabase/functions/workouts/core.ts`) still passes only `level` and `equipment`. So `POST /workouts/suggest` serves build_muscle slots to every user (D-0095 §5).

A get_stronger user would then see 6–8 on the server plan and 3–5 on the device plan for the same history. That breaks principle 3: one deterministic engine everywhere.

## Scope
- In:
  - `supabase/functions/workouts/core.ts`: `suggestProfile` returns `{level, equipment, goal}` from the loaded `EngineProfile`. Type it as the vendored `suggest`'s profile parameter (`Parameters<typeof suggest>[2]`), so it tracks the engine type.
  - `supabase/tests/functions/unit/workouts-core.test.ts`: new Deno tests per goal (AC1–AC4).
  - `supabase/tests/functions/unit/fixtures/inputs.ts`: a `profileWithGoal(goal)` helper if useful. `PROFILE_A` stays build_muscle and byte-identical.
  - Edge cases:
    - zero history under each goal;
    - returning after 10 days off;
    - the 422 profile-missing path (the engine is still never called);
    - determinism.
- Out:
  - `applySwap`. It is not wired into any Edge Function (it is device-side, D-0071 §8). When it is wired, it passes the same profile.
  - `balance` and `sessions`, which have no rep slots.
  - `_shared/repo.ts`: `profiles.goal` is `not null` with a check constraint, and it is already mapped into `EngineProfile.goal`.
  - The vendored engine `supabase/functions/_shared/vendor/**`. The orchestrator regenerates it on `main` when T-0214 merges (D-0053 §1). This ticket does not edit or regenerate it.
  - `api/openapi.yaml`: the `Workout` shape is unchanged.

## Acceptance criteria
**Fixtures:**
- `NOW`, `TZ`, `PROFILE_A`, `nineAreaTargets()`, `libraryFixture()` and `historyFixture()` from `unit/fixtures/inputs.ts`.
- `SESSION_INPUT_30` from `workouts-core.test.ts`.
- `G(goal)` = `{...PROFILE_A, goal}`.

Each AC is at least one `Deno.test`, and the title starts with `T-0227 ACn`.

- **AC1 (main-lift reps follow the goal)**
  - **Given** `loadEngineInputs` returns `inputsFixture({profile: G(goal)})`.
  - **When** `suggestWorkoutCore(FAKE_CTX, {sessionInput: SESSION_INPUT_30, tz: TZ}, deps)` runs, **Then** the item with `isMain: true` exists and has `repsMin`/`repsMax`:
    - 3/5 for `get_stronger`;
    - 6/8 for `build_muscle`;
    - 8/12 for `general_fitness`.
  - Every other non-timed item matches the D-0061 §1 table for its role:
    - other compounds: 5–8 / 8–12 / 10–15;
    - isolations: 10–15 under every goal.
- **AC2 (the goal reaches the engine)**
  - **Given** a `suggest` spy that records its third argument, **When** the core runs under each goal, **Then** that argument deep-equals `{level: "intermediate", equipment: ["barbell", "rack", "bench", "dumbbell"], goal}`.
  - The result deep-equals the vendored `suggest(history, targets, {level, equipment, goal}, library, SESSION_INPUT_30, NOW, TZ)` called directly.
- **AC3 (the goal never changes selection or cost)**
  - Across the three goals, `[exerciseId, sets, costS]` per item, `itemsTotalS`, `totalS` and `unusedS` are identical.
  - Under `build_muscle`, the result deep-equals the existing AC13 direct call, which passes `{level, equipment}` with no goal. The T-0203b AC13 test stays unedited and green.
- **AC4 (edge cases per goal)**
  - With `history: []`, every goal returns `plan.version` 1. The main item's `prefill.reps` is the goal's low (3, 6, 8), with `kind` `first_time`.
  - With T-0203b AC21's returning-after-10-days history, every goal returns 200, and the main item's `prefill.reps` lies in its `[repsMin, repsMax]`.
  - With `loadEngineInputs` throwing `profileMissing()`, the spy records 0 calls (422).
  - Two runs per goal are deep-equal.
- **AC5 (nothing else changes)**
  - Every existing test in `supabase/tests/functions/**` passes unedited, including `workouts-core.test.ts` AC13 and AC17–AC23.
  - `deno check` of `supabase/functions/workouts/index.ts` passes.
  - `node supabase/scripts/vendor.mjs --check` exits 0 with no vendor file in this branch's diff.
  - If `--check` fails, or the vendored `suggest`'s profile type has no `goal`, then `main`'s vendor copy predates T-0214. Stop and return `blocked`, naming the orchestrator's regen. Do not regenerate the copy here.
- **AC6 (CI green on a draft PR)**
  - **Given** a draft PR from `t/T-0227-workouts-suggest-passes-goal` to `main`, **When** `CI` runs on `pull_request`, **Then** these jobs pass:
    - `supabase` (`vendor.mjs --check`, `gen-seed.mjs --check`, and the `deno test … supabase/tests/functions/` step);
    - `checks` (including `check-lane-paths`).
  - Put the run URL in the result notes. The ticket can't be accepted without it, because Deno may not be installed locally.

## Paths you may change
- `supabase/functions/**` (the lane: `backend`). The edit goes in `workouts/core.ts`; the vendored copy under `_shared/vendor/` stays as `main` has it (see Scope, Out).
- `supabase/tests/**` (the lane: `backend`).
- **Listed extras:**
  - `docs/tickets/T-0227-workouts-suggest-passes-goal.md`: this file, for the accept log.

## Contract impact
none. `api/openapi.yaml`, `docs/data-model.md` and `docs/engine-rules.md` are unchanged. The goal's effect on the response is already the engine contract (rule 7.2, D-0095).

## Coordination
- **Files this ticket changes:**
  - `supabase/functions/workouts/core.ts`;
  - `supabase/tests/functions/unit/workouts-core.test.ts`;
  - possibly `supabase/tests/functions/unit/fixtures/inputs.ts`.
- It starts after T-0214 merges and the orchestrator has regenerated `supabase/functions/_shared/vendor/**` on `main`. Rebase on that `main` first.
- T-0226 (engine) also regenerates the vendor copy at its merge. The two tickets don't conflict, because this one doesn't touch the vendor copy.

## Definition of done
- Tests for every AC pass. The Deno tests run on the draft PR (AC6), with the URL recorded.
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- `vendor.mjs --check` is green.
- Contracts are unchanged.
- Commit messages start with `T-0227` and cite UF-08.2 (e.g. `T-0227 UF-08.2: workouts/suggest passes profile.goal`).

## Accept log
- 2026-10-02, product-owner (accept): **done**. Branch `t/T-0227-workouts-goal` at 8e1a800. AC6 names the slug `t/T-0227-workouts-suggest-passes-goal`; the difference is cosmetic.
  - AC1–AC4: 17 new Deno tests titled `T-0227 ACn` in `supabase/tests/functions/unit/workouts-core.test.ts`, run per goal. 9 of them fail on the unfixed `core.ts`, and QA re-planted the fault and got exactly those 9 red. `suggestProfile` returns `{level, equipment, goal}`, typed `Parameters<typeof suggest>[2]`.
  - AC5: unit tests 96/96, with existing tests (AC13, AC17–AC23) unedited. `deno check` is clean. The vendor copy already carries `goal`, and no vendor file is in the diff.
  - AC6: draft PR #18 https://github.com/vestgoteUptive/workoutLab/pull/18. CI run 36945508501 (https://github.com/vestgoteUptive/workoutLab/actions/runs/36945508501) passed typecheck/lint/unit, the supabase db tests (including the Edge Function integration tests), and playwright e2e.
  - QA: PASS. Review: APPROVE, response contract unchanged. Review's nit: the AC4 returning-user test reuses AC21's history byte for byte, which is what the AC asks for. Not blocking.
  - Principles: principle 3 (deterministic engine) now holds across server and device: one engine and the same goal slots. Contracts unchanged.
