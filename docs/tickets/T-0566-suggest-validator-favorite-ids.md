---
id: T-0566
title: "POST /workouts/suggest validator accepts sessionInput.favoriteIds and passes it to the engine; refresh the vendored engine and shared types (D-0202 §4) — off the user path"
lane: backend
screens: [UF-08.1]
decisions: [D-0202, D-0037, D-0053]
deps: [T-0565]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §4, GitHub #46). Flow: wl-build-backend (agent backend-dev). About ¼ day. The T-0518 pattern. Not on the user path: the app suggests on the device (D-0071 §8). -->

## Why
The `/workouts/suggest` validator uses `additionalProperties: false`, so a request carrying `favoriteIds` is refused today. D-0202 §4 keeps the server in step with the engine and openapi.

## Scope
- In: `supabase/functions/_shared/validate.ts` (or the suggest validator) accepts an optional `favoriteIds` array of exercise-id strings; the suggest handler passes it to the vendored engine unchanged; vendored engine/shared files current (`node supabase/scripts/vendor.mjs --check`). Deno tests under `supabase/functions/**` or `supabase/tests/**`.
- Out: any change to the engine or openapi; any web change.

### Edge cases that are in scope
- **Absent field:** a request without `favoriteIds` behaves exactly as today (AC1).
- **Bad shape:** a non-array or non-string entry is a 400 with the existing error shape (AC3).
- Offline, zero history, time running out, returning after 10 days: not applicable to the validator; zero history is AC2's fixture.

## Acceptance criteria
- **AC1** Given the R7-E4 request body without `favoriteIds`, When POST `/workouts/suggest` runs, Then the 200 body equals the response recorded before this change (bench-press × 4 main, inverted-row × 3, leg-extension × 2).
- **AC2** Given the same body with `favoriteIds: ["db-bench-press"]` and an empty history, Then the 200 body's items are db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2 (R7-E22).
- **AC3** Given `favoriteIds: "db-bench-press"` or `favoriteIds: [3]`, Then 400 with the existing validation error code and `x-request-id`.
- **AC4** `vendor.mjs --check` exits 0.

Checklist (D-0197 §7): field present and absent (AC1, AC2); valid and invalid shape (AC2, AC3).

## Paths you may change
- `supabase/functions/**`, `supabase/tests/**` (lane)

## Contract impact
None (implements T-0565's openapi change).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · contracts unchanged · commits start with `T-0566:` and cite UF-08.1.

## Build / accept log
