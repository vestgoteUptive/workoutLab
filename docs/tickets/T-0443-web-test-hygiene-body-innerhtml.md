---
id: T-0443
title: "Test hygiene across apps/web: replace the two remaining `document.body.innerHTML =` resets (UF-01, UF-08) with cleanup(), and guard all of apps/web/src against new ones"
lane: web-shell
screens: [UF-01.5, UF-08.2]
decisions: [D-0157, D-0182]
deps: [T-0424]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main b99a184 (D-0182 §3). From the T-0424 review.
Build flow: wl-build-web. About ⅛ day. -->

## Why
Clearing `document.body.innerHTML` doesn't unmount React. The root stays mounted on a detached
node, with its effects, timers and store subscriptions still running, while the next render
mounts a second root next to it. T-0424 found this causing double hosts in UF-09 and added a
UF-09-only guard (`features/UF-09/__tests__/t0424-test-hygiene.test.ts`). The squad's common rules
already say "never reset the DOM with `document.body.innerHTML =` in a test; use `cleanup()`".

Two resets remain outside UF-09 on main `b99a184`:
- `apps/web/src/features/UF-01/__tests__/keyboard.test.ts:7`, in an `afterEach`. That test builds
  a bare `<button>` with `document.createElement`, not through React.
- `apps/web/src/features/UF-08/__tests__/suggested-actions.test.tsx:418`, mid-test, between the
  offline and online runs of the "same sequence" determinism test. The first run's React tree is
  still mounted when the second renders. That's exactly the double-host hazard, in a test that
  guards principle 3 (the engine is deterministic).

Nothing stops a new one from appearing in any other folder.

## Scope
- In:
  - `features/UF-08/__tests__/suggested-actions.test.tsx`: replace the mid-test reset with
    `cleanup()` from `@testing-library/react`. The test's assertions stay exactly as they are.
  - `features/UF-01/__tests__/keyboard.test.ts`: replace the `afterEach` reset with removing the
    nodes the test appended (for example, keep a reference to the button and call
    `button.remove()`). No React tree is mounted there, so `cleanup()` alone would leave the
    button behind.
  - A web-shell source test, `apps/web/src/app/__tests__/test-hygiene.source.test.ts`, that walks
    **all** of `apps/web/src` (every `*.ts` and `*.tsx`) and fails if any file matches
    `/document\.body\.innerHTML\s*=(?!=)/`. Use the same walk as `profile-gate.source.test.ts`.
    The regex as written in source doesn't match itself (escaped dots), so the file needs no
    self-exclusion. A read like `expect(document.body.innerHTML).not.toMatch(…)` stays allowed.
- Out:
  - `features/UF-09/__tests__/t0424-test-hygiene.test.ts`. It's in the UF-09 lane and harmless
    once the wider guard exists. Leave it as it is.
  - An ESLint `no-restricted-syntax` rule. A later flat-config block with the same rule replaces
    an earlier one, and T-0313's planned `ImportExpression` ban is likely to use that rule on
    feature files, so the two would clobber each other (D-0182 §3). A source test avoids that.
  - `tests/e2e/**` (Playwright runs in a real browser, so there's no jsdom reset hazard) and
    `apps/landing`.

## Acceptance criteria
Each test title starts with `T-0443 AC-n`.

- **AC-1 (the guard, red on main)**
  - **Given** `apps/web/src` on this branch, **when**
    `test-hygiene.source.test.ts` runs, **then** it reports 0 offending files.
  - It also asserts that it read more than 400 `.ts`/`.tsx` files (476 on main `b99a184`), so an
    empty walk can't pass. Record the measured count in the log.

  **Red:** on main, the guard lists exactly
  `features/UF-01/__tests__/keyboard.test.ts` and
  `features/UF-08/__tests__/suggested-actions.test.tsx`. Record that run.
- **AC-2 (the guard bites anywhere)** Plant, on a backup copy, a
  `document.body.innerHTML = "";` line, once in a `lib/**` test and once (with no spaces:
  `document.body.innerHTML="";`) in a `components/**` test. AC-1 must fail naming each file.
  Restore each from the backup with `cp`.
- **AC-3 (UF-08 unchanged)** `suggested-actions.test.tsx` passes with `cleanup()` in place of
  the reset. Its "the same sequence gives deep-equal rows and Workouts" case still asserts
  `refresh` was called once and that both runs made no fetch.
- **AC-4 (UF-01 unchanged)** `keyboard.test.ts` passes. After its `afterEach`,
  `document.body.childElementCount` is 0. Add that assertion in a second `afterEach`, or as the
  last line of the test after an explicit remove.

## Paths you may change
- `apps/web/src/app/__tests__/test-hygiene.source.test.ts`, a new file in the lane
  (`web-shell`).
- **Listed extras:**
  - `apps/web/src/features/UF-01/__tests__/keyboard.test.ts`: replace the reset (AC-4).
  - `apps/web/src/features/UF-08/__tests__/suggested-actions.test.tsx`: replace the reset (AC-3).
  - `docs/tickets/T-0443-web-test-hygiene-body-innerhtml.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red run and the planted faults recorded.
- No e2e is needed: the diff is test-only and changes no product file (D-0178).
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0443` and cite UF-01.5 / UF-08.2 for the two touched suites.

## Notes
- **Parallel:** runs alongside T-0343 (UF-10) and T-0472 (UF-03), with no shared files. It
  touches one UF-08 and one UF-01 test file. Neither lane has a ticket in flight, and T-0481
  (UF-11) and T-0482 (UF-02) don't touch either.
- Small enough for D-0178's skip-review path, if the orchestrator wants it.

## Build / accept log
