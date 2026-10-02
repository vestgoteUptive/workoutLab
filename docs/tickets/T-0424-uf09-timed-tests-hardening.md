---
id: T-0424
title: "UF-09.7 timed tests hardening: assert elapsedS while the ring is held (+10, +20 during a 20 s ring pause), and the ring-paused remount uses cleanup() so only one host is mounted"
lane: web-feature:UF-09
screens: [UF-09.7]
decisions: [D-0066, D-0119, D-0150]
deps: [T-0304d]
status: ready
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
