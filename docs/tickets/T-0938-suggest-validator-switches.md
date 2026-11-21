---
id: T-0938
title: "/workouts/suggest validator: accept optional boolean `autoMainLift` and `fill` and pass them to the engine (deferrable)"
lane: backend
screens: [UF-08.2]
decisions: [D-0237, D-0239, D-0063]
deps: [T-0937]
status: done
---
## Why
Once openapi has the two optional switches (T-0937, D-0237 §3), `/workouts/suggest` must accept them instead of returning 400 on `additionalProperties`. D-0239 makes this **deferrable**: the app runs `suggest` on the device (D-0063 §3), so nothing waits for it.

## Scope
- In: `supabase/functions/_shared/validate.ts`: add `"autoMainLift"` and `"fill"` to `SESSION_INPUT_KEYS`; when present, each must be a boolean (otherwise 400 `sessionInput.autoMainLift must be a boolean` / `sessionInput.fill must be a boolean`); pass them through to the engine's `SessionInput` only when present (absent stays absent, so the engine's deep-equal guarantee holds). A unit test in `supabase/tests/functions/unit/` (pattern: `workouts-favorite-ids.test.ts`).
- Out: openapi (T-0937), the engine (T-0936), the app (never calls this with the keys).

## Acceptance criteria
- AC1 Given a valid suggest request with `sessionInput.autoMainLift: false` and `fill: false`, When `validateSessionInput` runs, Then it returns an object with `autoMainLift: false` and `fill: false`.
- AC2 Given the same request with `autoMainLift: true` and `fill: true`, Then both are returned as `true`.
- AC3 Given a request without either key, Then the returned object has no `autoMainLift` or `fill` key (`Object.hasOwn` false), the sibling of AC1.
- AC4 Given `autoMainLift` or `fill` set to `"false"`, `0`, `1` or `null`, Then it throws the 400 error naming the field.
- AC5 Given an integration-style handler test with `autoMainLift: false`, `fill: false`, no pins and no `mainLiftId` at 30 min, Then the response's `items` is `[]` (the engine's R7-E31 through the endpoint).

## Paths you may change
`supabase/functions/**` (not `supabase/functions/_shared/vendor/**`, which only the vendor script writes), `supabase/tests/**`

## Contract impact
none (implements `api/openapi.yaml` as changed by T-0937 under D-0237).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0938` and cite UF-08.2.

## Build / accept log
- Built: `validateSessionInput` accepts optional boolean `autoMainLift` and `fill` (allow-list + `optionalBoolean`, 400 `sessionInput.<key> must be a boolean`); passed through only when present. `core.ts` already forwards `sessionInput` to the engine, so unchanged.
- AC1..AC5 -> `supabase/tests/functions/unit/workouts-session-switches.test.ts` (6 tests: false/false, true/true, single key, absent via `Object.hasOwn`, `"false"`/0/1/null 400, handler gives `plan.items == []` and the engine sees both false). Deno: `npx -y deno@2 test --config supabase/tests/functions/deno.json ...` 16 passed with the favorite-ids and avoid-areas siblings.
- Planted faults (restored from backup copy): keys removed from allow-list -> 5 red; loose boolean check -> AC4 red; `fill` not passed through -> 4 red; `autoMainLift` always emitted -> AC2/AC3 red. A first loose-check attempt failed type-check instead of the test, so it was redone type-safe.
- Note: the response is a `Workout`, so AC5's `items` is `plan.items`.
