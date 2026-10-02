---
id: T-0425
title: "e2e: the guarded-test fixture fails a test on any console error or uncaught page error, with a named per-test allow list and the browser's network-status lines exempt"
lane: qa
screens: []
decisions: [D-0086, D-0091]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Follow-up from the T-0304c QA run and accept log ("the console was clean", checked by hand). Build flow: wl-build-qa. About ½ day. No app code changes. -->

## Why
Every UF ticket's QA step checks by hand that the browser console stayed clean, and two specs
carry their own copy of the check (`uf-08-setup.spec.ts` `consoleErrors`, `uf-10-balance.spec.ts`
"QA: console errors …"). Everything else can log a React warning-as-error, a failed `JSON.parse`
or an uncaught promise rejection and still go green. The Supabase guard (D-0086) already turns
"never hits the network" into an automatic check. This does the same for "logs no error", so the
check runs on every guarded test and the QA step stops being manual.

## Scope
- In:
  - `tests/e2e/fixtures/guarded-test.ts`:
    - an exported `installConsoleGuard(context)` that records, for every page of the context
      (pages opened later included), each `console` message of type `error` as
      `"console.error: <text> (<url>:<line>)"` and each `pageerror` as `"pageerror: <message>"`;
    - an exported `CONSOLE_ERROR_MESSAGE = "console error in e2e"`;
    - a second `auto` fixture, `consoleGuard`, next to `supabaseGuard`, that throws at teardown
      with that message and every recorded line;
    - `consoleGuard.allow(pattern: RegExp)`, which exempts matching lines for the current test
      only, and `consoleGuard.errors()`, which lists what was recorded;
    - one built-in exemption: console lines whose text starts with `Failed to load resource:`.
      These are the browser's own network-status lines (the mocks' deliberate 4xx/501 answers, the
      offline reloads). The Supabase guard owns network behaviour, and a `pageerror` is never
      exempt.
  - `tests/e2e/fixture-guard.spec.ts`: the self-tests below.
  - Any spec under `tests/e2e/` where the new guard finds a real error: add a
    `consoleGuard.allow(/…/)` with a comment that names the follow-up ticket, and list it in the
    build log and the result's follow-ups. The owning lane fixes the app code.
- Out:
  - App code (`apps/web/**`). A real console error found in the app is a follow-up for its lane.
  - Moving `uf-10-balance.spec.ts` onto the guarded fixture (it imports `@playwright/test` today):
    a follow-up, since its Supabase routes have to be checked first.
  - Removing the in-spec `consoleErrors` helper in `uf-08-setup.spec.ts` (it keeps working; the
    clean-up can come later).

## Acceptance criteria
Test titles start with `T-0425 ACn`.
- **AC1 (a console error fails the test, red on unfixed code)** Given a guarded test that opens
  `/welcome` and runs `console.error("t0425-planted")` in the page and asserts nothing, then the
  test fails at teardown with a message containing `console error in e2e` and `t0425-planted`.
  Written as `test.fail(...)`, the same pattern as the T-0904 AC-7 test. On main it reports
  "expected to fail, but passed"; record that red run in the build log.
- **AC2 (an uncaught error fails the test, red on unfixed code)** Given a guarded test that runs
  `setTimeout(() => { throw new Error("t0425-uncaught") })` in the page and waits 100 ms, then it
  fails at teardown naming `pageerror: t0425-uncaught`. Also a `test.fail`, also red on main. A
  second `test.fail` covers an unhandled promise rejection (`Promise.reject(new
  Error("t0425-rejected"))`).
- **AC3 (what passes)** Each of these guarded tests passes with no `test.fail`:
  - `console.warn`, `console.info` and `console.log` lines only;
  - a claimed 501 (via `mockSupabaseRest`, as in the T-0904 AC-6 backstop test), which logs
    `Failed to load resource: … 501`;
  - `consoleGuard.allow(/t0425-allowed/)`, then `console.error("t0425-allowed")`.
  - And, via `installConsoleGuard` on the test's own context: `errors()` lists a planted
    `console.error` exactly once, and an `allow` in one test doesn't carry over to the next test
    (the next test's guard records the same line).
- **AC4 (pages opened later)** Given a guarded test that opens a second page with
  `context.newPage()` and logs `console.error("t0425-second-page")` there, then the test fails
  (`test.fail`).
- **AC5 (every guarded spec is covered)** A source assertion in `fixture-guard.spec.ts`: every
  `tests/e2e/*.spec.ts` that imports from `./fixtures/guarded-test.js` imports `test` from there
  (the existing T-0904 check, widened from three specs to all of them that import the fixture).
  Each `consoleGuard.allow(` call in a spec other than `fixture-guard.spec.ts` has a `T-NNNN` on
  the line above it.
- **AC6 (the suite is green under the guard)** `pnpm --filter @workoutlab/web test:e2e` passes in
  full. The build log lists each `allow` added outside `fixture-guard.spec.ts`, with the error
  text and its follow-up ticket, or states that there were none.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`).
- **Listed extras:**
  - `docs/tickets/T-0425-e2e-console-error-guard.md`: this file, for the build and accept log.

## Contract impact
none

## Coordination
- T-0304d (UF-09 lane, in progress) appends rows to `tests/e2e/uf-09-focus.spec.ts`. If the guard
  finds an error in that spec while T-0304d is open, leave the spec as it is and report it as a
  follow-up for `web-feature:UF-09`, so the two branches don't conflict. Every other spec is free.
- Once this lands, a UF ticket's QA step can cite the guard instead of a hand check (orchestrator,
  `.squad/` process note).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check` and `check:repo`
green · contracts unchanged · commits start `T-0425` (for example `T-0425: fail guarded e2e tests
on console errors and page errors`).

## Build / accept log
Archived in `docs/tickets/log/T-0425.md` (D-0157).
