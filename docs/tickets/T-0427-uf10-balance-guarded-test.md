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

## Build / accept log

### Build (qa, 2026-10-02)
- **Supabase request inventory (Scope step, before editing).** A throwaway probe copy of the
  spec, with a `context.on("response")`/`requestfailed` recorder, was deleted after the run.
  It ran all 7 existing tests. Every test makes the same 10 requests. All are `GET` and all get
  a `200` from a `mockSupabaseData` route. None reaches the `mockSupabaseAuth` (`/auth/v1/**`)
  or `mockSupabaseRest` (`/rest/v1/**`) 501 backstop, there is no `/auth/v1` call, and no
  request failed.

  | Method | Path | Claiming route |
  | --- | --- | --- |
  | GET | `/rest/v1/area_targets` | `mockSupabaseData` `area_targets*` |
  | GET | `/rest/v1/exercise_areas` | `mockSupabaseData` `exercise_areas*` |
  | GET | `/rest/v1/exercise_variants` | `mockSupabaseData` `exercise_variants*` |
  | GET | `/rest/v1/exercises` | `mockSupabaseData` `exercises*` |
  | GET | `/rest/v1/plan_checkins` | `mockSupabaseData` `plan_checkins*` |
  | GET | `/rest/v1/profiles` | `mockSupabaseData` `profiles*` |
  | GET | `/rest/v1/routine_items` | `mockSupabaseData` `routine_items*` |
  | GET | `/rest/v1/routines` | `mockSupabaseData` `routines*` |
  | GET | `/rest/v1/session_sets_live` | `mockSupabaseData` `session_sets_live*` |
  | GET | `/rest/v1/sessions` | `mockSupabaseData` `sessions*` |

  **No request was unclaimed, so this spec needs no new mock (AC2).** No `forgetPlantedLeaks()`
  call was added.
- **AC1 red run.** The new test `T-0427 AC1 /balance runs under the Supabase and console guards`
  was added first, with the old `import { expect, test, type Page } from "@playwright/test"`
  still in place. `flock … pnpm --filter @workoutlab/web test:e2e uf-10-balance` failed with
  `Test has unknown parameter "supabaseGuard".` and `Test has unknown parameter
  "consoleGuard".`. An ad-hoc strict `tsc --noEmit` on the spec (no tsconfig covers
  `tests/e2e`) failed with `TS2339: Property 'supabaseGuard' does not exist …` (118:3) and
  `… 'consoleGuard' …` (119:3). After the import switch, tsc exits 0 and the test passes.
- **AC3.** The `problems` array, the `pageerror` listener and the `console` listener are gone
  from the QA block. Its `request` listener, the 1500 ms settle and `targetReads ≤ 2` stay in
  both QA tests. Compiled `ownConsoleListeners` reports `uf-10-balance.spec.ts:206` and `:207`
  on main's version of the spec, and `[]` on this branch.
  **Planted fault:** `await page.evaluate(() => console.error("t0427-planted"))` was added
  after the settle in the `/balance` QA test. That test failed at teardown
  (`fixtures/guarded-test.ts:226`, `assertClean`) with `console error in e2e: 1 line(s) were
  logged as errors … - console.error: t0427-planted (:0)`. The other 7 tests passed. The
  fault was reverted from a backup, and grep finds no `t0427-planted`.
- **AC4.** `T-0425 AC5 uf-10-balance.spec.ts imports test from guarded-test.js, not
  @playwright/test` now exists and passes. So do `T-0425 AC5 every consoleGuard.allow( …` and
  `T-0430 AC1 no guarded spec registers its own console or pageerror listener`. **No allows
  were added.** `fixture-guard.spec.ts` is untouched (T-0429).
- **AC5.** All existing uf-10 assertions stay, apart from `expect(problems).toEqual([])`, which
  the `consoleGuard` teardown now enforces (the ticket's Scope removes it). Results:
  `flock … pnpm --filter @workoutlab/web test:e2e` gave 138 passed (whole suite).
  `flock … pnpm -w typecheck lint test --force --concurrency=1` gave 19/19 tasks.
  `test:repo-checks` gave 146 pass. `format:check` and `check:repo` were green.
- **Follow-up (from Coordination):** every `tests/e2e/*.spec.ts` now imports the fixture. A
  later qa ticket can assert "every spec is guarded" at the source level.
