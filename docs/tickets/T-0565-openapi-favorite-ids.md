---
id: T-0565
title: "openapi SessionInput optional favoriteIds: ExerciseId[] + regenerate api.gen.ts (D-0202 §4) — off the user path"
lane: data
screens: [UF-08.1]
decisions: [D-0202, D-0037, D-0071]
deps: [T-0562, T-0564]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §4, GitHub #46). Flow: wl-build-data (agent data-modeler). About ⅛ day. The T-0517 pattern. Depends on T-0564 only because both regenerate files under packages/shared/** in the same lane. -->

## Why
D-0202 §4: the server's `/workouts/suggest` contract must describe the same session input as the engine (T-0562). The web app suggests on the device (D-0071 §8), so this is off the user path.

## Scope
- In: `api/openapi.yaml` `SessionInput` gains `favoriteIds` (`type: array`, `items: $ref ExerciseId`, description "Favorite exercises (D-0202): ranked first inside an area the gaps chose; absent means []"), **not** in `required`; one example in the SessionInput examples carries `favoriteIds: ["back-squat"]`. Regenerate `packages/shared/src/api.gen.ts` (`gen:api`); the shared types test (AC13 drift) stays green.
- Out: the Edge Function validator (T-0566); engine types (T-0562).

### Edge cases that are in scope
- **Absent field:** an old client that never sends `favoriteIds` stays valid (AC2).
- Offline, zero history, time running out, returning after 10 days: not applicable (schema only).

## Acceptance criteria
- **AC1** Given the regenerated `api.gen.ts`, Then `components["schemas"]["SessionInput"]["favoriteIds"]` is `components["schemas"]["ExerciseId"][] | undefined` (a type-level test in `packages/shared/test/`).
- **AC2** Given `packages/shared`'s schema validator test, When a SessionInput without `favoriteIds` and one with `["back-squat"]` are validated, Then both pass; with `favoriteIds: "back-squat"` (not an array) it fails.
- **AC3** `gen:api` run twice produces no diff (drift test green).

Checklist (D-0197 §7): field present and absent both tested (AC2).

## Paths you may change
- `api/openapi.yaml`, `packages/shared/**` (lane)

## Contract impact
`api/openapi.yaml`: optional `SessionInput.favoriteIds`. Named by D-0202 §4.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green (`--force`, contract change) · contract change linked to D-0202 · commits start with `T-0565:` and cite UF-08.1.

## Build / accept log
