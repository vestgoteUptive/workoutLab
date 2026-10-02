---
id: T-0424
title: "UF-09.7 timed tests hardening: assert elapsedS while the ring is held (+10, +20 during a 20 s ring pause), and the ring-paused remount uses cleanup() so only one host is mounted"
lane: web-feature:UF-09
screens: [UF-09.7]
decisions: [D-0066, D-0119, D-0150]
deps: [T-0304d]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Follow-up from the T-0304c QA run and accept log (QA's F6 was not caught). Build flow: wl-build-web. About ¼ day. Test-only: `src/**` behaviour is unchanged. Depends on T-0304d: T-0304d changes `session.tsx`/`host.tsx`, which these tests exercise, and shares the lane. -->

## Why
- **F6 slips through.** T-0304c AC-4's host test reads `session().elapsedS` only after "Resume
  timer". A fault that stops rule 8's `elapsedS` *while* the ring is held (for example passing
  `timerPausedAtMs` as the workout `pausedAtMs` to `elapsedS`) is correct again after Resume, so the
  test stays green. Principle 2 says the ring pause holds only the hold; the workout clock keeps
  running, and UF-09.8's time check depends on that (D-0119 §2).
- **A leaked host.** "restore: a remount while ring-paused …" clears `document.body.innerHTML`
  and renders again. That detaches the DOM but leaves the first React root mounted, so two hosts
  (two stores, two timer loops) run during the assertions. The test can pass for the wrong reason
  and can flake under load.

## Scope
- In (all in `apps/web/src/features/UF-09/__tests__/`):
  - `timed-set.test.tsx`, describe "T-0304c AC-4 the ring-only pause in the host":
    - "Pause timer … elapsedS +20 …": add asserts of `session().elapsedS − elapsedBefore` at 10 s
      and at 20 s of fake time *before* "Resume timer" is clicked (AC-1). The existing asserts stay.
    - "restore: a remount while ring-paused …": replace `document.body.innerHTML = ""` with
      `cleanup()` from `@testing-library/react` (or the first render's `unmount()`), and add the
      AC-2 asserts. The existing asserts stay.
  - A source guard in a new `__tests__/t0424-test-hygiene.test.ts` (AC-3).
- Out:
  - Any `src/**` change in `features/UF-09` (the planted fault is a scratch edit, reverted).
  - Other test files, and other `document.body.innerHTML` uses outside `features/UF-09`
    (UF-01, UF-08: their lanes).
  - The e2e spec.

## Acceptance criteria
**Test rules.** Negative asserts wait ≥ 50 ms. Rescoped tests keep their `T-0304c AC-4` describe;
the new guard's title starts with `T-0424 AC3`.

- **AC-1 (elapsedS runs while the ring is held)** Given plank set 1 at 30 s left and
  `elapsedBefore = session().elapsedS`, when "Pause timer" is clicked and 10 s of fake time pass,
  then `session().elapsedS − elapsedBefore` is 10 and `timerText()` is "0:30". After 10 s more
  (still held) it is 20 and `timerText()` is still "0:30". After "Resume timer" it is 20 (the
  existing assert). **Red on a real break:** temporarily make `session.tsx` pass
  `state.pausedAtMs ?? state.timerPausedAtMs` as `pausedAtMs` to `elapsedS` (one line). The new
  10 s and 20 s asserts must go red while the post-Resume assert alone would stay green. Revert,
  record the red run in the build log, commit nothing in `src/`.
- **AC-2 (one host after the remount)** Given the ring is paused at 30 s left and the first host is
  unmounted with `cleanup()`, when 10 s of fake time pass and the host is rendered again, then:
  - `document.querySelectorAll("[data-screen-id]")` has length 1, and it is `UF-09.7`;
  - "Resume timer" is shown and `timerText()` is "0:30";
  - `storedState()` deep-equals the state stored before the unmount;
  - after 50 ms (`flushReal(50)`), `recordSpy` has 0 calls.
- **AC-3 (the guard, red on unfixed code)** A test reads every `*.test.ts` and `*.test.tsx` under
  `apps/web/src/features/UF-09/__tests__/` (more than 20 files, excluding itself) and asserts none
  contains `document.body.innerHTML =` (the pattern built from parts, so the guard doesn't match
  itself). On main it fails on `timed-set.test.tsx`; record the red run in the build log.
- **AC-4 (nothing else moved)** Every other test in `timed-set.test.tsx` and the rest of
  `features/UF-09/__tests__/` passes unedited. `git diff --stat main...HEAD --
  apps/web/src/features/UF-09 ':!apps/web/src/features/UF-09/__tests__'` is empty (record it). The
  build log states the UF-09 test count before and after.

## Paths you may change
- `apps/web/src/features/UF-09/__tests__/**` (inside the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0424-uf09-timed-tests-hardening.md`: this file, for the build and accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`format:check` and `check:repo` green · contracts unchanged · commits start `T-0424` and cite the
screen (for example `T-0424 UF-09.7: assert elapsedS while the ring is held`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** After T-0304d (same lane; T-0304d changes the session and host code these tests run).
  It doesn't depend on T-0423, which adds its tests in a separate file; if both are open, run them
  one after the other in the lane.

## Build / accept log

### Build 2026-10-02 (frontend-dev)
- **Changed (tests only):** `__tests__/timed-set.test.tsx` (two tests in "T-0304c AC-4 the ring-only
  pause in the host"), new `__tests__/t0424-test-hygiene.test.ts`. No `src/**` change.
- **AC-1** "Pause timer … elapsedS +20 …": `session().elapsedS − elapsedBefore` is 10 at 10 s and 20 at
  20 s of fake time while held, `timerText()` "0:30" at both; the post-Resume asserts are unchanged.
  Red run: scratch edit in `session.tsx`, `pausedAtMs: state.pausedAtMs ?? state.timerPausedAtMs`.
  The new test failed at the 10 s assert (`expected +0 to be 10`, timed-set.test.tsx:345). Under
  the same fault, main's version of the test (post-Resume assert only) **passed** (1 passed). That
  is F6. Reverted; `git diff -- apps/web/src/features/UF-09/session.tsx` was empty afterwards.
- **AC-2** "restore: a remount while ring-paused …": `cleanup()` replaces the `document.body.innerHTML`
  reset; added asserts: one `[data-screen-id]` and it is `UF-09.7`, and `recordSpy` has 0 calls after
  `flushReal(50)`. The existing Resume timer / "0:30" / `storedState()` deep-equal asserts stay.
  Red runs: (a) `cleanup()` removed from the test, which left two hosts mounted: red with
  `expected one [data-screen-id], found UF-09.7,UF-09.7` (:417); (b) scratch edit in `host.tsx`,
  where a ring-paused mount calls `lib/offline.recordSet` directly, behind the machine: only the new
  `recordSpy` assert went red (`expected "vi.fn()" to be called +0 times, but got 1 times`, :425),
  5 other AC-4 tests green. Both reverted.
- **AC-3** guard `T-0424 AC3 …`: reads 34 `*.test.ts(x)` files (itself excluded) and builds the
  pattern from parts. Red on main's `timed-set.test.tsx`: offenders `["timed-set.test.tsx"]`
  (t0424-test-hygiene.test.ts:25). The file-count floor is red too: with the filter planted as
  `.spec.` it read 0 files (`expected 0 to be greater than 20`). Reverted.
- **AC-4** No other test edited. `git diff --stat main...HEAD -- apps/web/src/features/UF-09
  ':!apps/web/src/features/UF-09/__tests__'` is empty. UF-09 tests: **679 before (33 files), 681 after
  (34 files)**.
- **Gate:** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: 4/4
  tasks, 171 files / 2676 tests passed. `-w format:check` clean. `node .github/scripts/check-all.mjs`
  exit 0. `--filter @workoutlab/web test:e2e uf-09`: 10 passed.

### QA 2026-10-02 (qa-tester): pass
- **AC-1** Planted F6 in `session.tsx` (`pausedAtMs: state.pausedAtMs ?? state.timerPausedAtMs`):
  the branch test went red at :345 (`expected +0 to be 10`). main's version of the test under the
  same fault: 2 passed (F6 slips through on main). Reverted from a backup copy.
- **AC-2** With `cleanup()` removed, the test went red at :417 (`expected one [data-screen-id], found
  UF-09.7,UF-09.7`). Reverted.
- **AC-3** With main's `timed-set.test.tsx`, the guard went red with offenders `["timed-set.test.tsx"]`.
  **Tightened (review note):** the pattern is now `/document\.body\.innerHTML\s*=(?!=)/`. Proof with a
  scratch `zz-plant.test.ts`: `innerHTML="";` (no space) red; tab/newline before `=` red;
  `===` / `==` / `expect(document.body.innerHTML)` green. With the self-exclusion removed, still green
  (the regex source doesn't match itself). Branch: 2 passed. Scratch file removed.
- **AC-4** `git diff --stat main...HEAD -- apps/web/src/features/UF-09 ':!…/__tests__'` is empty;
  34 UF-09 test files.
- **Gates:** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: 4/4,
  171 files / 2676 tests passed. `test:e2e uf-09`: 10 passed. `-w format:check` clean.
  `check-all.mjs` exit 0.

### Accept 2026-10-02 (product-owner): done
- **AC-1 pass.** `timed-set.test.tsx:340-353` asserts `elapsedS − elapsedBefore` is 10 and 20 with
  `timerText()` "0:30" while the ring is held, and keeps the post-Resume assert. Build and QA both
  ran F6: red at :345 on the branch, green on main's test. Principle 2 (the workout clock keeps
  running during a ring-only pause, D-0119 §2) is now encoded.
- **AC-2 pass.** `cleanup()` replaces the body reset (:414). The test asserts one `[data-screen-id]`
  and that it is `UF-09.7`, Resume timer, "0:30", the `storedState()` deep-equal, and 0 `recordSpy`
  calls after `flushReal(50)` (:417-425). Red without `cleanup()` (two hosts), and red on a planted
  direct `recordSet`.
- **AC-3 pass.** `t0424-test-hygiene.test.ts`: both titles start `T-0424 AC3`, it reads 34 files
  (itself excluded), and the floor is `> 20`. The pattern is `/document\.body\.innerHTML\s*=(?!=)/`
  (QA tightened it). It is a regex literal, not built from string parts, but the escaped dots mean
  it can't match its own source, and QA proved that with the self-exclusion removed. That meets the
  AC's intent. Red on main's `timed-set.test.tsx`.
- **AC-4 pass.** The non-test diff under `features/UF-09` is empty. UF-09 went from 679 tests
  (33 files) to 681 (34). The other tests are unedited and green.
- **DoD:** web gate 4/4 (2676 tests), e2e uf-09 10/10, format:check and check-all green. No contract
  change. Principles 1-5 are unaffected (test-only).
- **Follow-up:** T-0443 (the same `document.body.innerHTML` reset in UF-01 and UF-08 tests, their own
  lanes), already filed by review.
