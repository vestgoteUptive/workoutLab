---
id: T-0423
title: "UF-09.7 a11y: at hold 0 the Pause timer toggle leaves the DOM, so keyboard focus falls to the body; keep it on the view's heading while the hold is saved, and move it to Log hold on a failed write"
lane: web-feature:UF-09
screens: [UF-09.7, UF-09.5]
decisions: [D-0071, D-0118, D-0119, D-0150]
deps: [T-0304d]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Follow-up from the T-0304c review/accept log. Build flow: wl-build-web. About ¼ day. Depends on T-0304d: both edit the UF-09 host and views (`host.tsx`, `views.tsx`), and they share the lane. Parallel-safe by files with T-0424 only if T-0424 stays in `timed-set.test.tsx` and this ticket keeps its tests in a new file (below). -->

## Why
`timed-set.tsx` renders "Pause timer" / "Resume timer" only while `remaining > 0`, and it is the
element the view focuses on mount. When the hold reaches 0 the button unmounts while it has focus,
so `document.activeElement` becomes `<body>`. A keyboard or screen-reader user is then dropped out
of the one task on screen (principle 1) for the length of the write, and if the write fails, the
recovery button "Log hold" appears without focus (WCAG 2.4.3 focus order, NFR-A11Y-1). On success
the next view (UF-09.5 Rest) focuses its own primary on mount, so that path is already fine and is
pinned here as the pair.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **`timed-set.tsx`.**
    - The `<h1>` gets `tabIndex={-1}` (focusable by script, outside the Tab order).
    - When the toggle leaves the DOM at 0 and focus was on it (so `document.activeElement` is now
      `document.body` or `null`), focus moves to the `<h1>`.
    - When "Log hold" appears (a failed write) and focus is on the `<h1>`, on the body, or inside
      the UF-09.7 view, focus moves to "Log hold".
    - A control the user focused in the chrome (for example "Pause workout") keeps focus in both
      cases.
  - The host only if the view needs a signal it doesn't have yet (for example a stable
    `holdFailed` edge). No new strings, no new buttons.
  - A new test file `__tests__/timed-set.focus.test.tsx` for every AC, using the existing
    `timed-set.test.tsx` setup (P1 plank item 3, `seedHold`, the `lib/offline` spy, fake clock).
- Out:
  - The UF-09.7 button pins (`["Pause workout", "Pause timer"]` while running,
    `["Pause workout", "Log hold"]` after a rejection) stay as they are.
  - Focus on other UF-09 views, Back (T-0394), the time check and pause (T-0304d).
  - The e2e spec (T-0304h owns the keyboard loop over UF-09).
  - Any contract or engine change.

### Edge cases that are in scope
- **Offline:** the write is to IndexedDB; a held (pending) write is the "phone is slow" case (AC-2).
- **Reload / kill:** a remount after the hold already ended has no toggle at mount, so focus starts
  on the `<h1>` (AC-4).
- **Time running out:** the ring pause and the workout pause are unchanged; a ring-paused hold
  never reaches 0 (T-0304c AC-4), so focus stays on "Resume timer" (AC-1 pair).

## Acceptance criteria
**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
**AC-2, AC-3 and AC-4 must fail on unfixed code:** run the new file against main's
`timed-set.tsx` and record the red run (test names and the first failure line) in the build log.

- **AC-1 (the pair: focus while the hold runs)** Given plank set 1 is mounted in the position
  phase, then `document.activeElement` is the "Pause timer" button. Given the ring is paused
  (click "Pause timer"), then focus is on "Resume timer", and after 120 s of fake time it is still
  there.
- **AC-2 (at 0 while the write is pending)** Given `recordSet` is held on a deferred promise and
  focus is on "Pause timer", when 53 s of fake time pass (3 s position + 50 s hold), then:
  - the screen is still `UF-09.7` and `timerText()` is "0:00";
  - `document.activeElement` is the `<h1>` "Plank", which has `tabindex="-1"`;
  - `document.activeElement` is never `document.body` (checked after each of 5 × 1 s more of fake
    time);
  - the button list is `["Pause workout"]`.
  - The pair: given focus was moved to the chrome's "Pause workout" before 0, then at 0 focus is
    still on "Pause workout".
- **AC-3 (a failed write)** Given `recordSet` rejects once, when the hold reaches 0, then
  `document.activeElement` is the "Log hold" button, and the status reads "Couldn't save. Tap Log
  hold to try again." (unchanged copy). When "Log hold" is clicked and that write rejects too, then
  focus is still on "Log hold". The pair: given focus is on "Pause workout" when the first write
  rejects, then focus stays on "Pause workout" and "Log hold" is rendered.
- **AC-4 (restore after the end)** Given a stored `timed` state whose hold ended 10 min ago and a
  held `recordSet`, when the host mounts, then `document.activeElement` is the `<h1>` "Plank" while
  the write is pending. Given that write then rejects, focus moves to "Log hold".
- **AC-5 (success hands focus to the next step)** Given `recordSet` resolves, when the hold
  reaches 0 on plank set 1, then the screen is `UF-09.5` and `document.activeElement` is its
  "Skip rest" button. Given the already-logged path (an entry for `(3, 0)` in `loggedSets`, the
  D-0150 `HOLD_ALREADY_LOGGED` case), the same holds.
- **AC-6 (nothing else moved)** The existing `timed-set.test.tsx`, `host.chrome.test.tsx`
  (the AC-7 button pins) and `exports-and-lint.test.ts` (strings, `react/jsx-no-literals`, the
  D-0071 §9 bans, the export pin) pass unedited. No key is added to `flows/uf-09.ts`.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0423-uf09-timed-focus-at-zero.md`: this file, for the build and accept log.

## Contract impact
none

## NFRs owned
A11Y-1 for UF-09.7 at 0 (AC-2 to AC-4).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check` and `check:repo`
green · contracts unchanged · commits start `T-0423` and cite the screen (for example
`T-0423 UF-09.7: keep focus on the heading at hold 0, Log hold on a failed write`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** After T-0304d (same host and views files, same lane). It doesn't depend on T-0424;
  if both are open, run them one after the other in the lane.
- **Default chosen here (product):** the heading is the focus target during the write because it
  names the current task and adds no control to the screen (principle 1). If review prefers the
  `role="timer"` element, that is an acceptable swap; record it in the build log.

## Build / accept log

### Build log (frontend-dev, 2026-10-02)
- **Change (`timed-set.tsx` only, no host change, no new strings or buttons):** the `<h1>` gets
  `tabIndex={-1}` and a ref. On mount, focus goes to the ring toggle, or to the `<h1>` when the hold
  has already ended (a restore). A layout effect on the `remaining > 0` edge moves focus to the
  `<h1>` when the toggle has left the DOM and `document.activeElement` is the body or `null`. A
  layout effect on the existing `holdFailed` prop moves focus to "Log hold" when focus is lost or
  inside the UF-09.7 view (which includes the `<h1>`). A chrome control ("Pause workout") keeps
  focus in both cases. The heading is the target during the write, as the product default says (not
  the `role="timer"` element).
- **Tests:** new `__tests__/timed-set.focus.test.tsx` (12 tests). AC-1: mount focus on "Pause
  timer"; ring paused → "Resume timer" after 120 s. AC-2: at 0 with a held write → `<h1>` "Plank",
  `tabindex="-1"`, never the body over 5 × 1 s, buttons `["Pause workout"]`; `tabindex=-1` while
  running; pair "Pause workout" keeps focus. AC-3: reject → "Log hold"; second rejected Log hold
  keeps it; `<h1>` → "Log hold" on a held rejection; pair "Pause workout" keeps focus with Log hold
  rendered. AC-4: remount 10 min after the end → `<h1>` while pending; reject → "Log hold". AC-5:
  resolve → UF-09.5 "Skip rest" focused; already-logged (3, 0) → same. AC-6: `timed-set.test.tsx`,
  `host.chrome.test.tsx`, `exports-and-lint.test.ts` unedited and green; `flows/uf-09.ts` untouched.
- **Red run on unfixed `timed-set.tsx`** (`npx vitest run …/timed-set.focus.test.tsx`): 6 failed,
  6 passed (the pairs pass).
  - AC-2 "focus moves to the <h1> 'Plank' (tabindex -1) and never falls to the body":
    `Expected the element to have attribute:` (tabindex).
  - AC-2 "the <h1> is outside the Tab order while the hold runs too": same.
  - AC-3 "focus moves to 'Log hold'; a second rejected Log hold keeps it there":
    `AssertionError: expected <body><div>…(2)</div></body> to be <button …>`.
  - AC-3 "the <h1> had focus during the pending write…": `expected <body>… to be <h1 …>`.
  - AC-4 "a remount 10 min after the hold ended…": `expected <body>… to be <h1 …>`.
  - AC-4 "the pair: that write rejects…": `expected <body>… to be <h1 …>`.
- **Gates:** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`
  4/4 tasks green (169 files, 2666 tests); `-w format:check` clean; `check-all.mjs` exit 0;
  `test:e2e` whole suite 137 passed (uf-09-focus.spec.ts 10/10).

### QA log (qa-tester, 2026-10-02, HEAD ac669c3)
- **AC → test** (`__tests__/timed-set.focus.test.tsx`): AC-1 "at mount … 'Pause timer'", "ring
  paused … 120 s"; AC-2 "focus moves to the <h1> …", "the <h1> is outside the Tab order …", pair
  "focus on the chrome's 'Pause workout' …"; AC-3 "focus moves to 'Log hold'; a second rejected …",
  "the <h1> had focus …", pair "focus on 'Pause workout' when the write rejects …"; AC-4 "a remount
  10 min after …", pair "that write rejects …"; AC-5 "recordSet resolves …", "already logged (3, 0)
  …"; AC-6 by diff against the merge base 10e9622 (only `timed-set.tsx`, the new test file and this
  ticket changed; `flows/uf-09.ts` untouched) plus the green gate.
- **Binary pairs:** running/paused ring (AC-1), view/chrome focus at 0 (AC-2) and at rejection
  (AC-3), first/second rejection (AC-3), pending/rejected on restore (AC-4), fresh/already-logged
  (AC-5). All present.
- **Planted faults in `timed-set.tsx` (each reverted):** F1 no heading focus at 0 (plus no mount
  fallback): 4 red (AC-2, AC-3 h1, AC-4 ×2). F2 no "Log hold" focus: 3 red (AC-3 ×2, AC-4 pair).
  F3 ignore the chrome guard: 2 red (both "Pause workout" pairs). F4 drop the `viewRef.contains`
  branch: 3 red (AC-3 ×2, AC-4 pair). F5 drop only the mount fallback `?? headingRef`: 12 green.
  The `[running]` layout effect also runs on mount, so it already covers the restore. The fallback
  is redundant but harmless (a cosmetic note, not a gap).
- **Gates:** `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`
  4/4 tasks green (169 files, 2666 tests); `test:e2e uf-09-focus` 10 passed; `-w format:check`
  exit 0; `check-all.mjs` exit 0.
- **Verdict:** done. No tests added.

### Build, attempt 2 (frontend-dev, 2026-10-02)
- **Review finding:** the passive mount effect always called `(toggle ?? heading).focus()`. It ran
  after the `holdFailed` layout effect, so a remount where `holdFailed` was already true (reject →
  Pause workout → Resume, or a closed List-view overlay) moved focus from "Log hold" to the `<h1>`.
- **Fix (`timed-set.tsx`):** the mount effect now focuses only the ring toggle. On a mount at 0,
  focus is placed by the `[running]` layout effect (the heading) and then the `[holdFailed]` layout
  effect ("Log hold"). The `?? headingRef` fallback, which QA found redundant, is removed.
- **New test:** "a remount with holdFailed already true (reject → Pause workout → Resume) focuses
  'Log hold'" (AC-3, in `timed-set.focus.test.tsx`). **Red** before the fix: 1 failed, 12 passed,
  `AssertionError: expected <h1 class="wl-uf09__title" …(1)></h1> to be <button type="button"
  …(2)></button>`. **Green** after it: 13/13.
- **Gates:** web turbo `typecheck lint test --force --concurrency=1` 4/4 tasks green (169 files,
  2667 tests); `-w format:check` clean; `check-all.mjs` exit 0; e2e `uf-09-focus.spec.ts` 10/10.

### Accept log (product-owner, 2026-10-02, HEAD b0050ce)
- **Inputs:** build 1 (ac669c3), QA pass (d65da54, faults F1–F4 red), review 1 changes requested
  (MEDIUM: the mount effect took focus from "Log hold" on a remount with `holdFailed` true), build 2
  (b0050ce, fix plus a new red-then-green test), re-review approve.
- **Per AC** (all in `__tests__/timed-set.focus.test.tsx`, 13/13 green):
  - AC-1 pass: mount focus on "Pause timer"; ring paused, "Resume timer" still focused after 120 s.
  - AC-2 pass: at 0 with a held write, the `<h1>` "Plank" with `tabindex="-1"` is focused, never the
    body over 5 × 1 s, buttons `["Pause workout"]`; the pair ("Pause workout" keeps focus) passes.
  - AC-3 pass: a rejection focuses "Log hold" with the unchanged copy; a second rejection keeps it
    there; the pair ("Pause workout" keeps focus, "Log hold" rendered) passes. The review case
    (a remount with `holdFailed` already true focuses "Log hold") is now pinned as well.
  - AC-4 pass: a remount 10 min after the end puts focus on the `<h1>` while pending, then on
    "Log hold" after the rejection.
  - AC-5 pass: fresh and already-logged (3, 0) both land on UF-09.5 with "Skip rest" focused.
  - AC-6 pass: the existing suites are unedited and green; `flows/uf-09.ts` is untouched (QA diff
    against 10e9622).
- **Red-on-main requirement:** recorded in build 1 (AC-2 ×2, AC-3 ×2, AC-4 ×2 red).
- **Principles:** one task on screen holds (no new control, and the heading isn't in the Tab
  order). Engine, time budget, targets and onboarding are not touched. Contracts unchanged.
- **DoD note:** the whole e2e suite ran green at build 1 (137 passed). Build 2 removed only the
  mount fallback in `timed-set.tsx`, and `uf-09-focus.spec.ts` ran 10/10 after it. Accepted on that
  basis; the orchestrator's pre-merge gate re-runs the full suite.
- **Verdict:** done. Optional follow-up: render the focus tests inside `<StrictMode>` as well
  (review low).
