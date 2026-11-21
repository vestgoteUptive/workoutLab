---
id: T-0954
title: Web, remember each exercise's own weight step and feed it to the engine
lane: web-feature:UF-04
screens: [UF-04.2, UF-09.4, UF-08.2]
decisions: [D-0251, D-0252, D-0259, D-0199, D-0202]
deps: [T-0951]
status: todo
---
## Why
The engine takes the weight step from `LibraryExercise.incrementKg`. The web layer must hold the user's overrides on the device first (favorites pattern), queue the writes, and pass an "effective library" (library rows with `incrementKg` replaced where an override exists) to every engine call, so the pre-fill, the High-energy back-off and the UF-09.4 +/- stepper agree on one step.

## Scope
- In:
  - Device store for overrides: a new IndexedDB store and version bump (favorites pattern), plus hooks (`exercise-settings.ts`, `exercise-settings-hooks.ts` beside `favorites.ts`).
  - Queued `upsert(onConflict: 'user_id,exercise_id')` and queued delete (reset); last write wins by `updated_at`; sync on reconnect.
  - Effective library builder used for `suggest`, `prefill`, `applySwap`, `insertItem`, `rankSwaps`; `prefill.ts:226` and `session.ts:430` then use one step. UF-09.4 `confirm-set.tsx` stepper steps by the effective `incrementKg`.
  - One shared external-load predicate in `packages/shared` used by the UI and the engine feed.
  - A running workout keeps the pre-fill already shown; the new step applies from the next pre-fill computation. A step change never rewrites history.
- Out: the UF-04.2 control (T-0956), RIR (T-0953), server (T-0959).

## Acceptance criteria
- AC1 Given no override for db-curl (library step 2.5), When the effective library is built, Then db-curl `incrementKg` is 2.5. Given an override 1.25, Then 1.25.
- AC2 Given an override 1.25 for bench-press and High energy with pre-fill 80 x 6, When the plan is built, Then the back-off is 71.25 x 6; and the pre-fill after 80 x 8, 8, 8 at RIR 3 is 81.25 (one test over `suggest`, `prefill`, `applySwap`).
- AC3 Given the override 1.25 and UF-09.4 open on that exercise, When the user taps + on the weight stepper, Then it moves by 1.25.
- AC4 Given the device offline, When the override is set to 1.25, Then it applies to the next pre-fill at once and the upsert is queued; Given the network returns, Then the upsert is sent and the queue empties. Sibling (online): the upsert is sent immediately.
- AC5 Given an override exists, When it is reset, Then the device row is removed at once and a delete is queued (offline) or sent (online); the engine then uses the library step.
- AC6 Given two writes for the same exercise (1.25 on device A earlier, 5 on device B later), When both sync, Then the later `updated_at` wins and the device converges on the next sync.
- AC7 Given a rejected queued write (`status: "rejected"`), When the store loads, Then the device value reverts to the server value and the rejection is surfaced to the UI hook as an error.
- AC8 Given the IndexedDB upgrade, When a database with favorites, excluded and history rows (including tombstoned ones) is opened, Then all survive and the new store is empty.
- AC9 Given a workout in progress with a pre-fill of 82.5 shown, When the override changes to 1.25, Then the shown pre-fill stays; the next pre-fill computation uses 1.25.
- AC10 Given a timed exercise and a bodyweight exercise, When the external-load predicate runs, Then both are false; a barbell exercise is true.
- AC11 Given an exercise with zero history and an override, When pre-fill runs, Then `first_time` is unchanged.
- AC12 Given last weight 80 and the new step 1.25 after a 2.5 history (off-grid), When pre-fill runs, Then it is 81.25 (`W + new step`, `W` not re-rounded).

## Paths you may change
- `apps/web/src/lib/account/__tests__/**` (extra: the Dexie table list in the wipe/seed tests; orchestrator grant)
- `.squad/decisions/D-0265-*.md` (the builder recorded its store/queue decision; orchestrator grant)
- `apps/web/src/features/UF-04/**`
- Extras, named explicitly: `apps/web/src/lib/offline/**` (store, queue, db version, effective library, hooks and tests; web-shell path); `apps/web/src/features/UF-09/**` only for `confirm-set.tsx` reading the effective step; `packages/shared/src/**` for the external-load predicate (data-lane path).

## Contract impact
none (plain CRUD through supabase-js; table from T-0951 under D-0251; no openapi change).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0954` and cite UF-04.2 and UF-09.4.

Per-package commands: `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`; same three for `@workoutlab/shared`.
