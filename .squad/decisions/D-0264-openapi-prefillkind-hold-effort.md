---
id: D-0264
title: "api/openapi.yaml: PrefillKind gains hold_effort (additive enum value); corrects D-0259's 'no openapi change' for T-0952"
status: decided
date: 2026-11-21
by: orchestrator (T-0952 build)
area: data
amends: D-0252, D-0259
---
## Context
T-0952 added the new pre-fill reason `hold_effort` to the engine (D-0252 §3). The web passes the engine's `Workout` into code typed by the generated `PrefillKind` enum in `api/openapi.yaml`, which has 8 codes, so the web typecheck fails. D-0259 had said there was no openapi change, which is wrong for this enum.

## Decision
1. `api/openapi.yaml` `PrefillKind` gains `hold_effort` as the 9th value, after `add_rep`. The change is additive: old clients never receive it from an older engine, and a stored `sessions.plan` from an older engine stays valid.
2. Regenerate `packages/shared/src/api.gen.ts` and the session-plan schema with `pnpm --filter @workoutlab/shared gen:api`, then re-vendor the copy in `supabase/functions/_shared/vendor`.
3. Update the enum tests that pin the code list (`rule-14-suggest.test.ts` `KINDS`, and any shared schema test).
4. T-0952 carries the change, so its paths gain `api/openapi.yaml`, `packages/shared/**` and the vendor folder.

## Revisit when
Never by itself. It follows rule 14.
