---
id: TR-0036
status: open
raised_by: frontend-dev (build) on T-0304a
date: 2026-10-02
---
## Conflict
T-0304a (D-0066 §2, D-0111 §7) loads the UF-09 plan with `parseSessionPlan(row.plan)` from `@workoutlab/shared`. In the **built** app that call always fails, so every real session shows "This workout isn't on this device" and focus mode can never start.

- `parseSessionPlan` (`packages/shared/src/session-plan.ts`) compiles the JSON Schema at runtime with `new Ajv2020(...).compile(SESSION_PLAN_SCHEMA)`. Ajv compiles by generating code and running it through `new Function`.
- The app's CSP (`apps/web/vite.config.ts`, pinned by `apps/web/build.test.ts` "no unsafe-eval", T-0300a AC-A10) is `script-src 'self'` with no `'unsafe-eval'`. The browser blocks the `new Function`, so the compile throws. `validate()` then throws "SessionPlan schema failed to compile", and `parseSessionPlan` catches that and returns `{ok: false, error: "invalid"}`. The caller can't tell this apart from a really invalid plan.
- No screen on main called `parseSessionPlan` in the browser before T-0304a, so nothing caught this. Vitest runs in jsdom, which has no CSP, so all T-0304a unit tests pass. Only the e2e shows the bug.

The ticket and the decided CSP can't both hold, and the fix isn't in `web-feature:UF-09`. It is either `packages/shared` (the data/contracts lane) or the CSP (web-shell).

## Evidence
- Branch `t/T-0304a-focus-machine`, `tests/e2e/uf-09-focus.spec.ts` › "AC-7 the chrome on a seeded session". A valid `sessions` row is seeded into the app's `wl-offline` IndexedDB (read back: correct `userId`, `ended_at: null`, `started_at` now, a v1 plan that `parseSessionPlan` accepts in Node). `/session/<id>` then renders "This workout isn't on this device".
- In that page, `new Function("return 1")` throws `EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script: script-src 'self'`. The console logs Ajv's "Error compiling schema, function code: …".
- That e2e row is marked `test.fail(true, "TR-0036: …")`, so the suite stays green while the bug is visible. When the fix lands, the row turns red and the marker must be removed. The AC-13 rows (not on this device, online, offline and axe) don't depend on parsing, and they pass.

## Options
1. **(Recommended) Precompile the validator in `packages/shared`.** Generate an Ajv standalone validator (`ajv/dist/standalone`) at codegen time, next to `session-plan.schema.gen.ts`, as a `session-plan.validate.gen.ts`. `parseSessionPlan` then calls it with no runtime compile. The behaviour and the contract are unchanged, the CSP stays strict, and Ajv's compiler leaves the web bundle, which also helps `check:size`. The work is a data-lane ticket plus a `gen-*.mjs --check` for drift. Add an e2e row, or a `build.test.ts` assert, that the built app parses a v1 plan.
2. **Allow `'unsafe-eval'` in the CSP.** This is a one-line change in web-shell. It reverses T-0300a AC-A10, weakens XSS protection, and needs a decision.
3. **A hand-written structural check in UF-09.** This would reimplement a shared contract's validator in the UI, so the two could drift. It isn't recommended.

## Impact
T-0304a is otherwise complete (AC-1 to AC-12 in Vitest, AC-13 in e2e). Until this is fixed, focus mode can't start a workout in the real app. T-0304b to T-0304e and every e2e that starts a session (T-0304d AC-D7 to D10) depend on the fix.
