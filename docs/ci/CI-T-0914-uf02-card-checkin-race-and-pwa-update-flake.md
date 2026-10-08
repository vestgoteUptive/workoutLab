---
ticket: T-0914
classification: flaky   # both failures; (1) is a deterministic test bug with a timing-dependent symptom
lane: web-feature:UF-02 (failure 1); web-shell (failure 2, with qa for the spec)
runs:
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37837784196   # 28719f5, unit red
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37838981416   # d4c75ec, all green (same test passed)
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37840542222   # aa94b39, unit red
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37842006018   # ace90c4, unit red
  - https://github.com/vestgoteUptive/workoutLab/actions/runs/37843828513   # 0d18b2e, unit red + e2e red
date: 2026-10-08
---
Investigated at HEAD `0d18b2e` on `main` (clean apart from untracked docs and decisions).

# Failure 1: UF-02 card test sees the real UF-11 check-in card

## What failed
Workflow `CI`, job `typecheck / lint / unit test`, step `Run pnpm turbo run test --concurrency=1`
(`@workoutlab/web:test`). This is on `main` at 28719f5, aa94b39, ace90c4 and 0d18b2e. d4c75ec (20:22Z),
between them, passed the same test. The first red run was **28719f5 (T-0574 merge, 20:13Z)**, not aa94b39.

## Evidence
```
FAIL  src/features/UF-02/__tests__/card.test.tsx > AC-2 card render (W-R7E4) > Start is still the only primary action and goes to /session/setup; the card has no button
AssertionError: expected [ <button …(3)></button>, …(1) ] to have a length of +0 but got 2
 ❯ src/features/UF-02/__tests__/card.test.tsx:223:45
    221|     const el = await waitForCard();
    222|     expect(document.querySelectorAll(".wl-today__start")).toHaveLength…
    223|     expect(screen.queryAllByRole("button")).toHaveLength(0);
 Test Files  1 failed | 312 passed (313)
```
The run at 28719f5 shows the same lines with 309 files.

## Reproduction
- `card.test.tsx` passes alone, under TZ=UTC, and pinned to one CPU core with 3 busy loops
  (5 of 5 runs). The race does not reproduce locally.
- **Deterministic reproduction:** I ran a throwaway copy of the test (deleted afterwards) with
  `await new Promise(r => setTimeout(r, 300))` between `waitForCard()` and line 223. It fails every time with
  `BUTTONS: ["Accept","Keep current"]`. Those two buttons are the UF-11.1 `CheckinCard` buttons.
- I also ran a throwaway probe of `evaluateCheckin([], PROFILE, [], <now>, tz)`, using the UF-02 fixture `PROFILE`
  (onboarded/planUpdated `2026-08-02`, rhythm 3–4) with zero sessions. Every instant from 2026-10-07 to
  2026-10-09, in UTC and in Europe/Stockholm, returns a `direction: "down"` proposal (period 3, 13–26 Sep,
  0 completed). The card therefore has a proposal to show on any real date in this range.
- Cross-file leakage is ruled out. Vitest uses the default `forks` pool with `isolate: true`, and the setup file
  only loads `fake-indexeddb/auto` and runs `cleanup()`. The leak is inside the test: real code with a real clock.

## Root cause
`Today` mounts `todayCheckinSlot` (lazy `UF-11` `CheckinCard`, T-0471) once `status !== "loading"`.
`card.test.tsx` is the only UF-02 test file that renders `Today` without
`vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }))`. Every sibling has this mock
(today, favorites, excluded, reads, real, slot, resume-slot, checkin-answered). So the real `CheckinCard` runs, and:
- it reads `loadProfile`/`loadEngineHistory` through the test's mocks (fixture profile, no history) and
  `loadSessions`/`loadCheckins` from empty fake-indexeddb;
- it uses `systemClock` and `resolveTimeZone()`, because `Today`'s `CheckinSlot` does not forward the injected
  `now`/`timeZone`/`locale` (`ResumeSlot` does). Against the real clock, the fixture profile is "0 sessions last
  period", so a down proposal is shown with **Accept** and **Keep current**.

Line 223 therefore races that card's async read (lazy chunk, then Dexie reads on fake-indexeddb macrotasks)
against `waitForCard()`'s resolution. Until 28719f5 the assertion won on CI. T-0570 (`9ccec1e`, in the
28719f5 push) gated the first cache read on a second live Dexie list (`useFavoriteList`, with
`excludedLoaded = excluded.loaded && favorites.loaded`). That shifted when `waitFor` observes the ready card
relative to the check-in read, and on the CI runner the card now usually lands first. The failing test runs in
about 56 ms, roughly one `waitFor` 50 ms interval tick, which leaves the card's read time to finish. T-0576/T-0571
did not cause this; they just landed on an already-red main. Both bugs are latent since T-0471:
the time bomb (a real clock against a fixed fixture date) and the missing mock.

## Proposed fix (web-feature:UF-02)
1. `apps/web/src/features/UF-02/__tests__/card.test.tsx`: add the same
   `vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }))` its siblings use.
   The file is about the suggestion card. The slot's own behaviour is covered by `slot.test.tsx` and
   `checkin-answered.test.tsx`. This is the deterministic fix, not a weakened assertion.
2. Do the same check for `preview.test.tsx`. It does not mock `slots.js`. It renders `UF-02.2` through
   `renderSwitch`, which can mount `Today` on Back.
3. Secondary (the same lane, `Today.tsx`): pass `now`/`timeZone`/`locale` through `CheckinSlot` to
   `CheckinCard` (it already accepts `now?: Clock`, `timeZone`, `locale`), as `ResumeSlot` does. Then
   `Today`'s test seam controls every clock on the screen, and no UF-02 test can depend on the real date.

## Regression test
- In `card.test.tsx`, keep line 223, and after `waitForCard()` add `await macrotask()` (the existing 50 ms helper)
  before the "no button" assertion. With the mock in place it stays green. Without the mock it fails every time, on
  any machine, so the race becomes a deterministic red. Record the red run without the mock in the ticket log.
- In `slot.test.tsx` (or a new UF-02 test), render `Today` with `now = F_TZ.now` and assert that the check-in card
  is evaluated at that injected instant (fix 3).
- Optional repo check (`source.test.ts` already scans UF-02 sources): every `__tests__/*.test.tsx` that calls
  `renderToday`/`renderSwitch` either mocks `../slots.js` or is on an allow-list (slot, resume-slot,
  checkin-answered).

# Failure 2: pwa-update.spec.ts:109 (e2e)

## What failed
Workflow `CI`, job `playwright e2e`, step `Run pnpm exec playwright test --config tests/e2e/playwright.config.ts`,
`main` at 0d18b2e (run 37843828513). There are no retries (`retries: 0`), and 331 tests passed.

## Evidence
```
1) [chromium] › tests/e2e/pwa-update.spec.ts:109:7 › T-0552 PWA applies new builds › UF-04 AC9 on a safe path a resume applies the new build with one reload
   Error: expect(received).toBe(expected) // Object.is equality
   Expected: 0
   Received: 1
   - Timeout 15000ms exceeded while waiting on the predicate
   > 115 |     await expect.poll(() => boot(page).catch(() => 1), { timeout: 15_000 }).toBe(0);
```
The report artifact's page snapshot shows the page still on `/plan` and never reloaded (with the check-in card
visible, which does not matter here).

## Reproduction
- `npx playwright test tests/e2e/pwa-update.spec.ts --repeat-each=15`: line 109 passed 15 of 15.
- `-g "safe path a resume" --repeat-each=40`, pinned to 2 cores with 2 busy loops: 40 of 40 passed.
- History: in the last 60 CI runs, this is the only failure of this spec. The spec and `apps/web/src/lib/pwa/update.ts`
  have not changed since T-0552/T-0553 (7 Oct). T-0571's diff touches neither the service worker nor `lib/pwa`.
  **Classification: flaky. It is not caused by recent changes.**
- A side finding from the same local run: `pwa-update.spec.ts:118` failed 1 of 15 times on the console guard,
  `TypeError: Failed to fetch dynamically imported module: …/assets/index-*.js`. This is a second flake in the same
  spec, a lazy chunk fetch cut off by the activation or reload.

## Root cause (most likely; not reproduced locally)
`startUpdateChecks` only learns about a new worker in two ways: `adopt(registration.waiting)` when `watch()` first
attaches, which happens inside `container.ready.then(...)`, or `updatefound` after that. A worker that is still
**installing** when `watch()` attaches is not caught by either:
- `watch` adopts `waiting`, not `installing`;
- `updatefound` has already fired.

After that miss, nothing recovers it. A later `visibilitychange` calls `check()`, but `watch()` is a no-op for an
already watched registration, `registration.update()` does not re-fire `updatefound` for a worker that is already
waiting, and `waitingWorker` stays `undefined`. So `activateIfSafe` never posts `SKIP_WAITING`, the worker never
activates, and no reload happens. This matches the snapshot: still on `/plan` with `__wlBoot === 1`. On a slow runner,
`ready` resolves late relative to the spec's `publishNewBuild` (register `/sw.js?t0552=2`), which opens the window.
This also affects users: a build that installs during the first moments after a load is only applied on the next
full load.

## Proposed fix (web-shell, `apps/web/src/lib/pwa/update.ts`)
- In `watch()`, also `adopt(registration.installing)`.
- On every `check()` (load and each resume), re-adopt `registration.waiting` (and `installing`) even when the
  registration is already watched. Keep a `WeakSet<ServiceWorker>` so each worker gets only one `statechange`
  listener. Then the resume in UF-04 AC9 recovers any missed transition, which is exactly what the spec describes.
- No timeout change in the spec.

## Regression test
- `apps/web/src/lib/pwa/__tests__/update.test.ts` (web-shell):
  (a) the registration has `installing` set when `ready` resolves, and `updatefound` is never fired, then it moves
  to `installed`: `SKIP_WAITING` is posted on a safe path;
  (b) `registration.waiting` appears without `updatefound`, then `visibilitychange`: it is adopted and activated.
  Both fail on today's code.
- Secondary (qa, `tests/e2e/pwa-update.spec.ts:118`): find the chunk that fails to fetch during activation or reload.
  The fix is either app-side (web-shell: no lazy import in flight across the reload) or a named, justified
  `consoleGuard.allow` with a ticket. Don't widen the timeout.
