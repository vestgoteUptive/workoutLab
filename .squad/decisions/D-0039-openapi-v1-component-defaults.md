---
id: D-0039
title: OpenAPI v1 component details D-0037 leaves open (T-0102a)
status: revisit
date: 2026-09-28
by: data-modeler (T-0102a)
area: api
---
## Context
D-0037 §5–§9 fixes the OpenAPI v1 shapes. Building them in T-0102a needed a few details it doesn't state: the shape of `TimeCheckProgress` and `PlanCheckin`, how `rankSwaps` output is named as one component, how a component used by several engine functions is tagged, how Ajv (strict) treats the OpenAPI-only keywords, and how `api.gen.ts` is formatted so `prettier --check` and the AC13 drift test agree.

## Decision
1. **Helper components.** Shared sub-shapes get their own names: `Instant`, `LocalDate`, `TimeZone`, `ExerciseId`, `Goal`, `Level`, `ExerciseType`, `ExerciseKind`, `Energy`, `TargetSource`, `AreaDeficits`, `AreaSetCounts`, `AreaWeights`, `Backoff`, `WarmupMove`, `Contributor`, `CheckinPeriod`, `PreviewTarget`, `CheckinProposal`, `TimeCheckOption` and one `Reason*` object per code. `SwapCandidateList` (array of `SwapCandidate`, best first) is the `rankSwaps` output component.
2. **`TimeCheckProgress = {elapsedS, nextItemIndex}`**, both integers ≥ 0 (R8-E1 inputs). **`PlanCheckin`** is the camelCase `plan_checkins` row without `user_id`: `{id, periodIndex, completedPrev, completedLast, rhythmMinBefore, rhythmMaxBefore, proposedMin, proposedMax, proposedAt, answer (accepted|kept|withdrawn|null), answeredAt (nullable)}`.
3. **`Backoff.weightKg` is nullable** (a bodyweight or first-time back-off has no load yet). `PrefillResult.reps` and `durationS` are integers ≥ 1 or null.
4. **`x-engine-function`** is a string with one name, or several separated by `, ` (for example `balance, suggest` on `AreaTarget`). Components used only as sub-shapes don't carry it.
5. **Ajv.** The tests compile `components.schemas` as `$defs` with Ajv 2020-12 `strict: true`, `allowUnionTypes: true` and ajv-formats. They register `discriminator` and `x-engine-function` as annotation keywords, because Ajv's own discriminator does not support `mapping`. The `oneOf` + `const code` pair still discriminates.
6. **Generated file format.** `scripts/gen-api.ts` runs `openapi-typescript` (`alphabetize: false`) and formats with the repo's root Prettier config. It resolves `prettier` from the workspace root devDependency, so no new dependency is added to `packages/shared`. `gen:api` runs it with Node 22 type stripping.

## Consequences
- engine: when it adopts `@workoutlab/shared`, `coverageStep` arrives as `number`, not the `0|1|2|3|4` literal type, and `LibraryExercise.equipment` as `string[]`.
- backend (T-0203): uses these names in handlers.
- infra: a CI job can run `pnpm --filter @workoutlab/shared gen:api` and `git diff --exit-code`. AC13 already fails on drift.

## Revisit when
- The engine's rule 8 or rule 9 types (T-0201, T-0202) need different field names.
- Ajv gains `mapping` support, or a stricter OpenAPI validator replaces it.
