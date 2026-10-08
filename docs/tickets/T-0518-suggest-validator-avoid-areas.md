---
id: T-0518
title: "POST /workouts/suggest accepts sessionInput.avoidAreas and passes it to the engine; refresh the vendored engine and shared types (D-0191 §3, GitHub #33)"
lane: backend
screens: [UF-08.1]
decisions: [D-0191, D-0037, D-0053]
deps: [T-0516, T-0517]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33. Build flow: wl-build-backend. About ⅓ day.
Not on the user-facing path (the app suggests on the device, D-0063 §3); keeps the server in step
with the engine contract. -->

## Why
`supabase/functions/_shared/validate.ts` checks `SessionInput` against the openapi shape with
`additionalProperties: false`. Once T-0517 lands, a request carrying `avoidAreas` must be accepted
and must reach `suggest`, or the server and the device would build different workouts from the same
input.

## Scope
- In: `validate.ts` accepts an optional `avoidAreas` (array of the nine areas, no duplicates).
  The suggest function passes it to the engine. Refresh `supabase/functions/_shared/vendor/`
  (engine + shared) the way the repo already does it.
- Out: any other function, and rate limiting (T-0513).

## Acceptance criteria
- AC1 Given a valid request with `sessionInput.avoidAreas: ["quads","glutes"]` and zero history,
  When POST /workouts/suggest runs, Then 200 and no returned item has quads or glutes at weight 1.0
  (the engine's rule 6.1 through the function).
- AC2 Given the same request without `avoidAreas`, Then 200 and the body equals the pre-change
  response for the same fixture (a regression snapshot taken on unfixed code is recorded in the log).
- AC3 Given `avoidAreas: ["legs"]`, Then 400 `invalid_request`, with a message naming
  `sessionInput.avoidAreas`. Given `avoidAreas: "quads"` (not an array), Then 400 `invalid_request`.
- AC4 Given duplicates `["quads","quads"]`, Then 400 `invalid_request` (`uniqueItems`, T-0517).

## Paths you may change
`supabase/functions/**`, `supabase/tests/**`.

## Contract impact
none (implements T-0517's openapi change).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0518` and cite UF-08.1.

## Build / accept log
Archived in `docs/tickets/log/T-0518.md` (D-0157).
