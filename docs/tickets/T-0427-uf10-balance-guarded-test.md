---
id: T-0427
title: "e2e UF-10.1/UF-10.2: move uf-10-balance.spec.ts onto the guarded-test fixture, so both auto guards run on it and its hand-written console check goes"
lane: qa
screens: [UF-10.1, UF-10.2]
decisions: [D-0086, D-0091]
deps: [T-0425, T-0430]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. From T-0425 Scope/Out ("its Supabase routes have to be checked first"). Build flow: wl-build-qa. About ¼ day. No app code changes. It depends on T-0430: that is the qa-lane order in tests/e2e/**, and T-0430's rules (no own console listener, T-NNNN in the comment block above an allow) then apply to this spec. It touches only uf-10-balance.spec.ts, so it can run in parallel with T-0429. Ready when T-0430 is done. -->

## Why
- `uf-10-balance.spec.ts` imports `test` from `@playwright/test`. That makes it the one spec where
  neither the Supabase guard (D-0086) nor the console guard (T-0425) runs. An unmocked request or
  a React error on UF-10.1 or UF-10.2 goes green there.
- Its "QA: console errors and render-loop guard" block keeps its own `pageerror` and `console`
  listeners, a copy of the guard that T-0430 forbids in guarded specs.

## Scope
- In:
  - **Before editing,** list every Supabase request the spec makes, with its method, path and
    claiming route (`mockSupabaseData`, `mockSupabaseAuth`, or the `mockSupabaseRest` 501
    backstop). Record the list in the build log.
  - Switch the import to `import { expect, test } from "./fixtures/guarded-test.js"`, keeping
    `type Page` as a type-only import from `@playwright/test`.
  - Delete the QA block's `problems` array and its two listeners. Keep its render-loop check
    (`targetReads ≤ 2`, the `request` listener) and the 1500 ms settle.
  - One new test (AC1).
- Out:
  - App code (`apps/web/**`). A real error found on UF-10 is a follow-up for `web-feature:UF-10`.
  - Any edit to `fixture-guard.spec.ts`. Its T-0425 AC5 list picks this spec up by itself.
  - New UF-10 behaviour coverage.

## Acceptance criteria
Test titles start with `T-0427 ACn`, apart from the existing titles, which stay as they are.
- **AC1 (the auto guards run in this spec; red on main)** A test takes `page`, `supabaseGuard`
  and `consoleGuard`, opens `/balance` on the mixed fixture, and waits for
  `[data-screen-id="UF-10.1"]`. Then it checks two things: `supabaseGuard.unclaimed()` equals
  `[]` and `consoleGuard.errors()` equals `[]`. On main the spec can't use those fixtures
  (Playwright reports an unknown fixture, and typecheck fails). Record that red run.
- **AC2 (the routes are checked)** The build log lists each Supabase request from the Scope step
  and its claiming route. Every test in the spec passes under both guards, with no
  `forgetPlantedLeaks()` call. If a request was unclaimed, it gets a mock in this spec, and the
  build log names it.
- **AC3 (the in-spec console check goes, the loop check stays)**
  - The spec has no `page.on("console"` and no `page.on("pageerror"`, which T-0430 AC1's
    `ownConsoleListeners` confirms.
  - Both QA tests (`/balance`, `/balance/hamstrings`) still assert `targetReads ≤ 2` after
    1500 ms.
  - **Planted fault.** Temporarily add `await page.evaluate(() => console.error("t0427-planted"))`
    to the `/balance` QA test. It fails at teardown with `console error in e2e` and
    `t0427-planted`. Record the run, then revert.
- **AC4 (the T-0425 source checks cover it)** The T-0425 AC5 test
  `uf-10-balance.spec.ts imports test from guarded-test.js, not @playwright/test` exists and
  passes. T-0430's allow-comment check passes. Any `consoleGuard.allow(` added here has `T-NNNN`
  in the comment block directly above it and is listed in the build log with its follow-up.
- **AC5 (the suite is green)** `pnpm --filter @workoutlab/web test:e2e` passes in full. Every
  existing uf-10 test keeps all of its assertions.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`), in practice `tests/e2e/uf-10-balance.spec.ts` only.
- **Listed extras:**
  - `docs/tickets/T-0427-uf10-balance-guarded-test.md`: this file, for the build and accept logs.

## Contract impact
None.

## Coordination
- After T-0430 (qa-lane order). It may run in parallel with T-0429, which edits
  `fixture-guard.spec.ts` and adds `sw-registration.spec.ts`. The two share no file.
- With T-0427 merged, every `tests/e2e/*.spec.ts` imports the fixture. A later qa ticket can
  turn that into a source assertion ("every spec is guarded"). Filed as a follow-up, not done
  here.

## Definition of done
Tests for every AC pass, with the red run and the planted fault recorded · `pnpm -w typecheck
lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the
whole suite) · `format:check` and `check:repo` green · contracts unchanged · commits start
`T-0427` and cite the screens (for example `T-0427 UF-10.1/UF-10.2: run uf-10-balance under the
guarded fixture`).
