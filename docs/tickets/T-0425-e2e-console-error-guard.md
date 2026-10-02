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

### Build (qa, 2026-10-02)
- `tests/e2e/fixtures/guarded-test.ts`: `installConsoleGuard(context)`, `CONSOLE_ERROR_MESSAGE`,
  `ConsoleGuard` (`allow`, `errors`, `assertClean`) and the `consoleGuard` auto fixture next to
  `supabaseGuard`. It attaches to `context.pages()` and to `context.on("page")`. Lines are
  `console.error: <text> (<url>:<line>)` and `pageerror: <message>`. The one exemption is console
  text starting with `Failed to load resource:`. A `pageerror` is never exempt (a self-test pins
  this with a thrown error that starts with that prefix). `errors()` lists every recorded line,
  allowed or not. `assertClean()` throws on the lines no `allow` matches.
- `tests/e2e/fixture-guard.spec.ts`: T-0425 AC1–AC5 self-tests. `test.fail` covers AC1, AC2
  (throw and rejection) and AC4. The direct `installConsoleGuard` tests pin the message text, the
  501 exemption, `allow`, "exactly once" and the serial carry-over pair. The AC5 source assertion
  now lists every `*.spec.ts` that imports the fixture (10 today, `uf-10-balance.spec.ts` still
  imports `@playwright/test` and is out of scope). It also checks that each `consoleGuard.allow(`
  outside this file has a `T-NNNN` on the line above. The spec list is built at collection time,
  so `read` uses `__dirname` instead of `test.info().file`.
- **Red on unfixed code:** the same four `test.fail` tests (AC1, AC2 x2, AC4) were run on the
  branch base `ba2862f`, before the guard existed. `4 failed`, each with "Expected to fail, but
  passed." Mutation check after the build: commenting out the fixture's `guard.assertClean()`
  gives the same 4 red.
- **Allows added outside `fixture-guard.spec.ts`: none.** The full suite (123 tests) found one
  real error, and it was in `fixture-guard.spec.ts` itself. In the T-0904 test "setOffline does
  not suspend interception", going offline right after the first `/welcome` load can beat the
  service worker's `sw.js` fetch. vite-plugin-pwa's injected `navigator.serviceWorker.register()`
  (`injectRegister: "auto"`) has no rejection handler, so the page logs `console.error: An unknown
  error occurred when fetching the script.` plus `pageerror: Failed to register a ServiceWorker
  for scope ('http://localhost:4173/') with script ('http://localhost:4173/sw.js'): An unknown
  error occurred when fetching the script.` That test now has a narrow
  `consoleGuard.allow(/Failed to register a ServiceWorker|An unknown error occurred when fetching
  the script/)` and a comment. Follow-up for web-shell: catch the failure of the SW registration.
  `uf-09-focus.spec.ts` (T-0304d in parallel): no finding, left untouched.
- Results: `flock … pnpm --filter @workoutlab/web test:e2e` gave 123 passed, run twice.
  `pnpm -w typecheck lint test --force --concurrency=1` gave 19/19 tasks. `test:repo-checks`
  gave 146 pass. `format:check` and `check:repo` were green.

### Accept (2026-10-02, product-owner): done
Checked at HEAD 0c4c5f6 against each AC.
- AC1: the `test.fail` "T-0425 AC1 a console.error fails the test at teardown" asserts nothing, so
  only the auto fixture can fail it. The paired direct test pins the line format
  `console.error: t0425-planted (<url>:<line>)` and the thrown message containing
  `console error in e2e` and `t0425-planted`. Red on base `ba2862f` ("Expected to fail, but passed").
- AC2: two `test.fail` cases, the thrown `t0425-uncaught` after a 100 ms wait and the
  `Promise.reject(new Error("t0425-rejected"))`. Both were red on base. A direct test pins
  `pageerror: <message>` for both. An extra test pins that a `pageerror` is never exempt, even when
  it starts with `Failed to load resource:`.
- AC3: warn/info/log pass and aren't recorded (a sentinel proves delivery). The claimed 501 via
  `mockSupabaseRest` passes, and the test checks that a `Failed to load resource:` line really was
  logged, so it isn't vacuous. `allow(/t0425-allowed/)` passes. `errors()` lists the line exactly
  once. The serial pair shows that an allow doesn't carry over: the second test's guard records
  `t0425-carry` and `assertClean()` throws on it.
- AC4: the `test.fail` on `context.newPage()` with `t0425-second-page` was red on base.
- AC5: the source assertion lists every `*.spec.ts` that imports the fixture (10 today), each
  importing `test` from `./fixtures/guarded-test.js`. It includes the T-0904 three. The
  `consoleGuard.allow(` line-above check covers every spec except `fixture-guard.spec.ts`.
- AC6: the whole e2e suite passed 123/123, twice. The build log says no allows were added outside
  `fixture-guard.spec.ts`. The one real finding (the SW registration rejection when going offline
  right after the first load) has a narrow allow in the T-0904 offline self-test and is filed as
  T-0429 (web-shell). `uf-09-focus.spec.ts` is untouched (T-0304d coordination).
- Mutation: with `guard.assertClean()` commented out, the same 4 `test.fail` cases go red.
- DoD: the `-w typecheck lint test --force --concurrency=1` gate passed 19/19, and
  `test:repo-checks` passed 146/146. `format:check` and `check:repo` are green, contracts are
  unchanged, no app code changed, and the commits start `T-0425`. Review approved.
- Principles hold. This is test infrastructure only, with no change to the UI, the engine or the
  contracts.
- Follow-ups: T-0429 (web-shell: catch the SW registration failure, then drop the allow). T-0430
  (qa: require the T-NNNN on a comment line, reject `/g` and `/y` allow patterns, and name T-0429
  in the allow comment in `fixture-guard.spec.ts`, which says "T-0425 finding, follow-up for
  web-shell" today). Moving `uf-10-balance.spec.ts` onto the guarded fixture is still open from
  Scope/Out.
