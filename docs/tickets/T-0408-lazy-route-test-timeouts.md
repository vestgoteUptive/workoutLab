---
id: T-0408
title: "Web tests: explicit timeouts on the lazy-route waits that time out under the --concurrency=1 gate (profile-gate AC-5, routes.phase3 renderAt, UF-08 ready-start AC-5 retry), plus a guard"
lane: web-shell
screens: [UF-01.5-save, UF-04.3, UF-08.4]
decisions: [D-0096]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Filed on the board as the web-shell row "T-0401". It was renumbered because T-0401 is already the infra Cloudflare Pages ticket (D-0010); the orchestrator updates the board row. Follow-up from the T-0304b QA, plus the T-0386 watch item. Test-only: no `src/**` behaviour changes. -->

## Why
Under the full `-w … --concurrency=1` gate, three web tests go red only under load. Each waits for a
lazy route chunk with Testing Library's default 1 s `waitFor`/`findBy*` timeout:
- `app/__tests__/profile-gate.test.tsx` "/ redirects to /welcome/save"
- `app/__tests__/routes.phase3.render.test.tsx`, the UF-04.3 compare row
- `features/UF-08/__tests__/ready-start.test.tsx` AC-5 "retry" (T-0386)

Run alone, each passes in well under 1 s. These are the web twin of the T-0230 engine budgets, and
the fix follows the same rule: explicit, local budgets on the named waits, with no global
`asyncUtilTimeout` or `testTimeout`, so a really slow test elsewhere still fails. A timeout only
bounds waiting. No assertion changes.

## Scope
- In (budgets: a wait gets `{ timeout: 5_000 }`, and its test gets `15_000` as the `it` third
  argument, so vitest's 5 s default can't cut a 5 s wait short):
  - `profile-gate.test.tsx`: the `waitFor` in `it.each(GATED)("%s redirects to /welcome/save", …)`,
    and that `it.each` call's budget.
  - `routes.phase3.render.test.tsx`:
    - the `waitFor` in `renderAt` and the `findByRole("navigation", …)` in `currentTabs`;
    - a budget on every `it`/`it.each` call whose callback calls `renderAt` or `currentTabs`.
  - `ready-start.test.tsx`:
    - the four `waitFor` calls in `toReady`;
    - in "retry: the second tap reuses the same id and navigates once on resolve", the
      `findByRole("alert")` (options as its third argument) and the `waitFor` on `focus`, plus that
      test's budget.
  - A file-level `const LAZY_WAIT_MS = 5_000` and `const LAZY_TEST_MS = 15_000` in each file are
    fine in place of literals.
  - A new guard, `apps/web/src/app/__tests__/lazy-route-timeouts.test.ts` (AC4).
- Out:
  - Any test body change besides those arguments, and any assertion change.
  - `vite.config.ts` / `vitest.setup.ts`: no global `testTimeout` or `configure({ asyncUtilTimeout })`.
  - Other `waitFor` calls in these files. List any that the builder sees go red under load in the
    build log as follow-ups.
  - App code (`src/**` outside `__tests__`).

## Acceptance criteria
Each new test title starts with `T-0408 ACn`.
- AC1 (profile-gate) **Given** `profile-gate.test.tsx`, **When** the guard reads the
  `"%s redirects to /welcome/save"` call, **Then** its third argument is ≥ `15000` and its one
  `waitFor` has an options object with `timeout` ≥ `5000`.
- AC2 (routes.phase3) **Given** `routes.phase3.render.test.tsx`, **Then** the `waitFor` in
  `renderAt` and the `findByRole` in `currentTabs` each have `timeout` ≥ `5000`. Every
  `it`/`it.each` call whose callback calls `renderAt` or `currentTabs` has a third argument
  ≥ `15000`, including "%s renders exactly one %s with an <h1>" and "%s marks exactly %s current".
- AC3 (ready-start) **Given** `ready-start.test.tsx`, **Then** the four `waitFor` calls in `toReady`
  and the `findByRole`/`waitFor` in the "retry: …" test each have `timeout` ≥ `5000`. The "retry: …"
  test has a third argument ≥ `15000`.
- AC4 (the guard, red on unfixed code) `lazy-route-timeouts.test.ts` parses the three files with
  `ts.createSourceFile` (`ScriptKind.TSX`) and checks AC1–AC3.
  - A wait counts as budgeted when its options are an object literal whose `timeout` is a numeric
    literal, or an identifier bound by a file-level `const NAME = <numeric literal>` (T-0230 AC2
    rule). The same applies to a test's third argument.
  - On failure it lists each offender as `file:line what` (e.g. `profile-gate.test.tsx:344 waitFor
    without timeout ≥ 5000`).
  - **Non-vacuity:** it fails if any named title or function (`"%s redirects to /welcome/save"`,
    `renderAt`, `currentTabs`, `toReady`, "retry: the second tap …") isn't found. It asserts at
    least 9 waits and 4 test calls were checked.
  - **Unit pair:** on in-memory sources, `it("t", async () => { await waitFor(() => {}); });` is
    reported, and `it("t", async () => { await waitFor(() => {}, { timeout: 5_000 }); }, 15_000);`
    isn't.
  - **Red proof:** run the guard against main's three files. It must fail and name every site in
    Scope. Record this in the build log.
- AC5 (no behaviour change) In each of the three files, the diff adds only timeout arguments
  (and the optional consts). Record it in the build log, without asserting it in a test. Every test
  in the three files passes, and their test counts are unchanged.
- AC6 (load) Run `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` twice in a row
  on one otherwise idle machine. Both runs are green, and none of the three named tests fails.
  Record both runs in the build log.

## Paths you may change
- `apps/web/src/app/**` (the lane: `web-shell`).
- **Listed extras:**
  - `apps/web/src/features/UF-08/__tests__/ready-start.test.tsx`: timeout arguments only.
  - `docs/tickets/T-0408-lazy-route-test-timeouts.md`: this file, for the build and accept log.

## Contract impact
none

## Coordination
- Files: `app/__tests__/{profile-gate,routes.phase3.render}.test.tsx`, the new
  `app/__tests__/lazy-route-timeouts.test.ts` and `features/UF-08/__tests__/ready-start.test.tsx`.
- Same lane as T-0398 (doing, `app/__tests__/build.test.ts` area) and T-0385 (doing, `lib/offline`).
  The files are disjoint, so it can run in parallel with both. UF-08 has T-0391 and T-0397 ready.
  Neither lists `ready-start.test.tsx` (T-0397 adds a new test file and keeps the existing UF-08
  tests unedited), so whichever merges second rebases onto the other.
- Stagger verification runs (one vitest per machine, state.md). AC6 needs an idle machine.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green (twice, AC6) · contracts unchanged · commit messages start with `T-0408` and cite the screens
(e.g. `T-0408 UF-01.5 UF-04.3 UF-08.4: explicit lazy-route wait budgets`).

## Build / accept log
- 2026-10-02 build (frontend-dev): the new `apps/web/src/app/__tests__/lazy-route-timeouts.test.ts` has 5 tests. They are the AC1–AC3 guard, AC4 non-vacuity, the AC4 unit pair (two tests), and a case that checks a file-level const budget counts and that a `findByRole` timeout is read from its third argument. The checker parses each file with `ts.createSourceFile(…, ScriptKind.TSX)`. A wait is a `waitFor` call (options are argument 2) or a `findBy*`/`findAllBy*` call (options are argument 3). A wait counts as budgeted when its options are an object literal whose `timeout` is a numeric literal, or an identifier bound by a file-level numeric `const`. A test's third argument follows the same rule. The guard checks these sites:
  - profile-gate: the `"%s redirects to /welcome/save"` call and every wait in its callback (exactly 1).
  - routes.phase3: every wait in `renderAt` and `currentTabs` (1 each), plus every `it`/`it.each` whose callback calls either function (5 calls). The two titles named in AC2 must be among those 5.
  - ready-start: every wait in `toReady` (exactly 4), plus the "retry: …" call and its 2 waits.
  - Non-vacuity: a missing function, title or wait count fails the guard. It also checks that ≥ 9 waits and ≥ 4 tests were seen (actual: 9 waits, 7 tests).
  - Red on unfixed code: on main's three files the guard failed and named 16 offenders, which is every Scope site. Non-vacuity passed. The offenders were `profile-gate.test.tsx:341` (test budget) and `:344` waitFor; `routes.phase3.render.test.tsx:23` waitFor, `:104` findByRole, and test budgets at `:40` "%s renders exactly one %s with an <h1>", `:52` "%s shows the tab bar only when the table says so", `:80` "%s renders %s", `:94` "/session/setup never renders …" and `:111` "%s marks exactly %s current"; `ready-start.test.tsx:99`, `:102`, `:104` and `:107` waitFor (toReady), `:307` "retry: …" (test budget), `:312` findByRole and `:314` waitFor.
  - The fix adds file-level `LAZY_WAIT_MS = 5_000` and `LAZY_TEST_MS = 15_000` to each of the three files. Each wait listed above gets `{ timeout: LAZY_WAIT_MS }`. `findByRole("alert")` became `findByRole("alert", undefined, { timeout: LAZY_WAIT_MS })`. Each listed test gets `LAZY_TEST_MS` as its third argument. There is no global `testTimeout`/`asyncUtilTimeout`, and `vite.config.ts`/`vitest.setup.ts` are untouched.
  - AC5: `git diff -w` on the three files shows only the consts, the timeout and budget arguments, and Prettier's re-wrapping of the touched calls. No test body, assertion or other wait changed. Test counts are unchanged: 135 before (89 + 33 + 13), and 140 after with the guard's 5 added.
  - AC6: `flock /tmp/workoutlab-tests.lock npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` ran twice in a row with the machine idle (it held the lock). Run 1: 19/19 tasks, 2m37s. Run 2: 19/19 tasks, 2m24s. Both were green: web 1973 tests in 131 files, engine 558, shared 215, exercises 206, landing 115, design-tokens 74. All three named tests passed both times (profile-gate 89 tests in 5.3 s / 5.3 s, routes.phase3.render 33 in 5.5 s / 5.7 s, ready-start 13 in 2.8 s / 2.7 s).
  - `-w format:check` and `.github/scripts/check-all.mjs` exit 0.
  - Follow-ups: no other `waitFor` in these files went red under load in the two gate runs, so there's nothing to file.
- 2026-10-02 accept (product-owner): **done**. Checked against faea020.
  - AC1–AC3: the "T-0408 AC1 AC2 AC3" guard test checks every Scope site. The const and usage counts in the three files match the build log: profile-gate 2 consts + 1 wait + 1 budget; routes.phase3 2 + 2 waits + 5 budgets; ready-start 2 + 6 waits + 1 budget.
  - AC4: the guard parses with `ts.createSourceFile(…, ScriptKind.TSX)`. It reads budgets as numeric literals or file-level numeric consts, and reports offenders as `file:line what`. Non-vacuity covers missing names, exact wait counts, and the ≥ 9 waits / ≥ 4 tests floor. The unit pair matches the ticket's two sources verbatim. The build log records the red proof on main's files: 16 offenders, every Scope site.
  - AC5: the orchestrator reviewed the `git diff -w` of the three files. It adds only the consts, the timeout and budget arguments, and Prettier rewrapping, and no assertion changed. Test counts are 135 before and 140 after (+5, all from the guard).
  - AC6: two consecutive `--force --concurrency=1` gate runs under the test lock were green (19/19, web 1973), with all three named tests passing both times.
  - There is no global `testTimeout`/`asyncUtilTimeout` in `apps/web` config, there is no `src/**` behaviour change, and contracts are untouched. The principles are unaffected (test-only).
