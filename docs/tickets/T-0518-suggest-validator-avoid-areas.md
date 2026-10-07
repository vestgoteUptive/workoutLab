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

- **Build (backend-dev, 2026-10-06).** Start: `git status` clean, HEAD `7ce4ae7` on `t/T-0518-suggest-validator-avoid-areas`. Deno via `npx -y deno@2`; local podman stack (not reset or stopped); `psql` via a scratch shim (not committed).
  - `validate.ts`: `avoidAreas` added to the closed key list; optional; must be an array, every entry one of the nine `AREAS` (string, exact case), no duplicates (matches openapi `uniqueItems`, engine would ignore them). 400 `invalid_request` message names `sessionInput.avoidAreas`. Returned only when present, so requests without it produce an identical `SessionInput`. `workouts/core.ts` already forwards the validated object, so no change there.
  - Vendor refreshed with `node supabase/scripts/vendor.mjs` (`--check` exit 0). Besides `avoidAreas` it also pulled in already-merged engine changes the vendor copy lacked (`remove-item.js`, apply-swap, index exports).
  - AC2 snapshot taken on unfixed code (before the validator edit) via the real `suggestWorkoutCore`: `supabase/tests/functions/unit/fixtures/suggest-30min-no-avoid.snapshot.json`.
  - AC→test (`unit/workouts-avoid-areas.test.ts`): AC1 "avoidAreas [quads, glutes] with zero history" (90-min budget; precondition asserts the unfiltered plan does contain a quads/glutes weight-1.0 item); AC2 "equals the pre-change snapshot" (also with `avoidAreas: []`); AC3 two tests (`["legs"]`, wrong case, non-string, and `"quads"`/null/object non-arrays); AC4 duplicates.
  - Planted faults (backup copy, restored with `cp`): drop the area-membership check -> AC3 unknown-area test red; disable duplicate check -> AC4 red. Both restored, green.
  - Deno `supabase/tests/functions/` against the local stack: 170 passed, 1 failed = `seed-roundtrip` AC3, only because the shim runs psql inside the container and cannot read the host temp file (`-f`); unrelated to this change. Unit dir 123 passed. AC23-style no-leak tests green.
  - Gates (via `scripts/locked.sh`): `-w typecheck lint test --concurrency=1` 19/19; `-w test:repo-checks` pass 301 fail 0 (one run had `supabase-prod-release` AC-1 exit 141 SIGPIPE under load; passes alone and on rerun); `-w format:check` clean; `check-all.mjs` exit 0.
