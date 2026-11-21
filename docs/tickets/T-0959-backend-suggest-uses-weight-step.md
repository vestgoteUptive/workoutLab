---
id: T-0959
title: Backend, workout suggestions on the server use the user's own weight step
lane: backend
screens: [UF-08.2]
decisions: [D-0259, D-0252, D-0251, D-0001]
deps: [T-0951, T-0952]
status: todo
---
## Why
`POST /workouts/suggest` runs the engine with the database library. If it ignored the user's `exercise_settings`, the server's back-off and pre-fill step would differ from the client's (D-0259 §15). Server and client must agree.

## Scope
- In:
  - `supabase/functions/workouts/core.ts` reads the caller's `exercise_settings` through the user's RLS client and builds the effective library (replace `incrementKg` where an override exists), the same rule as the web builder.
  - Re-vendor the engine into `supabase/functions/_shared/vendor/**` via `vendor.mjs` after T-0952 and run `vendor.mjs --check`.
  - Pass `rir` through from the history the function loads, if it builds history itself.
- Out: `api/openapi.yaml` (request and response unchanged), the table (T-0951), the web (T-0954).

## Acceptance criteria
- AC1 Given a caller with an override of 1.25 for bench-press and energy High, When `POST /workouts/suggest` runs, Then the back-off for bench-press from 80 x 6 is 71.25 x 6; without the override it is 70 x 6.
- AC2 Given user A has an override and user B has none, When each calls suggest, Then B's result uses the library step and A's row is never read for B (RLS client).
- AC3 Given a caller with no `exercise_settings` rows, When suggest runs, Then the output equals today's output (golden).
- AC4 Given the same history, library and override, When the web effective library and the server run `suggest`, Then the pre-fill weights and reasons are equal (shared fixture).
- AC5 Given history with RIR 0 on every top-rep set, When suggest runs, Then the pre-fill reason is `hold_effort`.
- AC6 Given the engine re-vendored, When `vendor.mjs --check` runs, Then it passes.
- AC7 Given the settings read fails (database error), When suggest runs, Then it returns the existing error shape and not a silently wrong step.

## Paths you may change
- `supabase/functions/_shared/repo.ts` (extra: the history loader must carry `rir`; orchestrator grant)
- `supabase/functions/workouts/**`
- `supabase/functions/_shared/vendor/**` (re-vendor only via `vendor.mjs`; no hand edits; extra, named explicitly)
- `supabase/tests/**`

## Contract impact
none (`api/openapi.yaml` unchanged; D-0259 §15).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0959` and cite UF-08.2.
