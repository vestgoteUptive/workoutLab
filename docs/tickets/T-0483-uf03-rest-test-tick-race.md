---
id: T-0483
title: "UF-03.2 rest.test.tsx: drive the host's 1 s re-render with a faked setInterval instead of racing it with waitFor (the 'Go' announcer CI flake)"
lane: web-feature:UF-03
screens: [UF-03.1, UF-03.2]
decisions: [D-0175, D-0172, D-0142, D-0118, D-0158, D-0169]
deps: []
status: ready
---
<!-- Groomed 2026-10-03 by product-owner (D-0175 §2) from the "Related" section of
docs/ci/CI-T-0906-uf03-list-view-offline-flush-race.md. Test-only, no product change. Build flow:
wl-build-web. About ¼ day. Shares __tests__/list-helpers.tsx with T-0478: never in parallel. -->

## Why
CI run 37152271297 (`main` at `381a1cb`, unit job 111288462504) failed:
`rest.test.tsx › T-0418 AC-3 rest view (UF-03.2) › the chrome announcer speaks '10 seconds' at <= 10 s and 'Go' at expiry, with no own aria-live`.
The failure was `expected '10 seconds' to be 'Go'` at line 282, and the test took 2105 ms.

The test fakes only `Date` (`vi.useFakeTimers({ toFake: ["Date"] })`, line 47). "Go" comes only
on the host's next **real** re-render (`useRerenderEverySecond`, `RERENDER_MS = 1000`,
`features/UF-09/use-rerender.ts`). Testing Library's `waitFor` gives up after 1000 ms by default.
The `waitFor` at line 280 resolves right after a tick, so after `setSystemTime(nowMs + 120_000)`
the next tick is due almost exactly 1000 ms later: the margin is zero. On a loaded runner, the
tick plus the render plus the effect lands just past the timeout. Lines 279 and 280 race the same
tick.

Four more tests in the file wait for that real tick with `settle(1100)` (100 ms margin) or
`findEl` polling. They are the same class of flake with a little more margin. Raising timeouts
only moves the cliff. The fix is to drive the tick deterministically (D-0175 §2).

## Scope
- In (`apps/web/src/features/UF-03/__tests__/` only):
  - **A tick clock helper** in `list-helpers.tsx`, for example `useTickClock()`. It calls
    `vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: new Date(NOW) })`.
    Add a matching `tick(ms = 1000)` that does `act(() => { vi.advanceTimersByTime(ms); })` and
    then `await settle()` (the real 50 ms macrotask).
    - **Never fake** `setTimeout`, `clearTimeout`, `setImmediate`, `queueMicrotask` or
      `nextTick`. `waitReal`/`findEl`/`settle` use the global `setTimeout`, fake-indexeddb needs
      real `setImmediate`, and `waitFor`'s own timeout is a `setTimeout`.
  - **The five tick-dependent tests** call the helper at the start of the test, *before*
    `openList` mounts the host. The host's interval is created at mount, so faking it later has
    no effect. Each `settle(1100)`, tick-waiting `findEl(…, 200)` or tick-waiting `waitFor` that
    follows a `vi.setSystemTime` becomes `await tick()`, followed by a plain synchronous `expect`.
    1. AC-1 "the wall clock: Date advanced 90 s with no timer tick shows 0:30, same offline"
    2. AC-1 "expiry: at 0 the bar is gone"
    3. AC-3 "at 0:30, +15 s reads 0:45 and −15 s reads 0:30"
    4. AC-3 "the chrome announcer speaks '10 seconds' … and 'Go' at expiry, with no own aria-live"
       (all three waits: lines 279, 280, 282)
    5. AC-5 "with the rest view open and Date advanced past the end, it closes and focus lands on
       the first unchecked checkbox". Here only the wait for the tick becomes `tick()`. The focus
       `waitFor` after it stays: it no longer depends on a tick.
  - **The file header comment** (lines 1–4) is updated: timers are real except in the
    tick-driven tests, which fake `setInterval`.
- Out:
  - Any `features/UF-09` file (the host, `use-rerender.ts`), and any product code. The product is
    correct.
  - The other tests in `rest.test.tsx`, their titles, and every asserted value.
  - Raising any timeout (`waitFor`'s `timeout`, `findEl`'s `tries`, `settle`'s ms), or adding
    `retry`/`repeats`.
  - Faking timers file-wide in `beforeEach`. That would stop `waitFor`'s polling, which the AC-5
    focus tests rely on (a focus change is not a DOM mutation, so only the polling interval sees
    it; D-0175 Context).
  - Other UF-03 test files. If the dev sees the same pattern elsewhere, they list it as a
    follow-up.

### Edge cases that are in scope
- **Time running out:** the rest reaching 0 under the List view (tests 2 and 5) and the "Go"
  announcement (test 4) are exactly the expiry paths. They are now driven by `tick()`, not by real
  time.
- **Offline:** test 1 keeps its `navigator.onLine = false` spy. The wall-clock maths is the same
  offline.
- **The host's exact-expiry `setTimeout`** (`host.tsx`, `setTimeout(fireExpired, endsAt − now)`)
  stays real. It is scheduled ~120 s ahead and never fires in the test. Expiry comes through the
  post-render `fireExpired` effect on the driven tick, which is the path NFR-TIME-1 relies on when
  a timeout fires late.
- **Zero history / returning after 10 days off:** not applicable to this test file.

## Acceptance criteria
**Test rules.** Each changed test keeps its title, so the T-0418 AC map still holds. A negative
assertion waits at least 50 ms (`settle()`). The build log records the red run and the planted
faults below.

- **AC-1 ("Go" is driven, not raced).** Given the announcer test with the tick clock installed
  before `openList`, a set checked (rest 2:00), and `vi.setSystemTime(nowMs + 111_000)`, when
  `tick()` runs once, then `restBarText()` is `"Rest · 0:09 left"` and the announcer reads
  `"10 seconds"`. Both are checked with plain `expect`, not `waitFor`. When
  `vi.setSystemTime(nowMs + 120_000)` is followed by one `tick()`, then the announcer reads `"Go"`.
  The aria-live assertions after it are unchanged.
- **AC-2 (the other four tick waits).** Tests 1, 2, 3 and 5 from Scope install the tick clock
  before `openList`. Each wait for the host's tick after `setSystemTime` is one `tick()`. Their
  assertions are unchanged: "Rest · 0:30 left"; no rest bar; "0:30" → "0:45" → "0:30"; UF-03.1
  shows and focus is on "Mark set 3 done".
- **AC-3 (no real tick wait left).** In `rest.test.tsx` there is no `settle(` with an argument
  ≥ 1000, no `findEl(…, n)` with `n` > 80, and no `waitFor` whose only way to pass is a host
  tick. A reviewer checks the diff, and the build log lists every `vi.setSystemTime` call with the
  `tick()` that follows it.
- **AC-4 (fault proof).** Neither of these faults is committed.
  1. **Red on old code:** the CI log above (run 37152271297, job 111288462504) is the recorded
     red. Locally, the dev also runs main's file with `RERENDER_MS` temporarily set to 1100 in
     `features/UF-09/use-rerender.ts` (a local edit, restored with `cp` from a backup). The old
     announcer test fails, which shows that it depends on real tick timing.
  2. **Planted fault on the new code:** remove the `tick()` after
     `vi.setSystemTime(nowMs + 120_000)` in the announcer test. It must fail on every run
     (announcer stays `"10 seconds"`), which shows the tick is driven explicitly. Restore it.

  `git diff main -- apps/web/src/features/UF-09` must be empty.
- **AC-5 (stable and quick).** `scripts/locked.sh small npx vitest run src/features/UF-03/__tests__/rest.test.tsx`
  (run from `apps/web`) passes 10 runs in a row. The log records the announcer test's duration
  from one run (expected well under 1 s of wall time after `openList`, against 2105 ms on CI).
  The rest of the UF-03 suite passes unedited.

## Paths you may change
- `apps/web/src/features/UF-03/__tests__/rest.test.tsx`
- `apps/web/src/features/UF-03/__tests__/list-helpers.tsx` (the two helpers only, appended)
- `docs/tickets/T-0483-uf03-rest-test-tick-race.md` (this file, for the build and accept logs)
- **Not yours:** `apps/web/src/features/UF-09/**` (AC-4's local edit is temporary), any
  non-test UF-03 file, `docs/ci/**`.

## Contract impact
None. This is test-only.

## Definition of done
Every AC has a passing test or a recorded run (AC-4). While working:
`scripts/locked.sh small npx vitest run <files>`. Once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
`node .github/scripts/check-all.mjs`. No e2e: no product code changes. Contracts are unchanged.
Commits start `T-0483` and cite the screen, for example
`T-0483 UF-03.2: drive the host tick in rest.test.tsx`.

## Notes
- **Flow:** `wl-build-web`.
- **Why `setInterval` and not `setTimeout`.** The UF-09 tests' `useFakeClock` (`features/UF-09/__tests__/helpers.tsx`)
  fakes both and keeps a captured `realSetTimeout` for its `flushReal`. UF-03 tests may not import
  UF-09 test helpers (D-0071 §4). UF-03's `waitReal` uses the global `setTimeout`, so faking it
  would hang every `settle`/`findEl`. Faking only the interval is the smallest change that makes
  the tick deterministic.
- **Vitest re-install.** `beforeEach` already calls `vi.useFakeTimers({ toFake: ["Date"] })`.
  Calling `vi.useFakeTimers` again inside a test replaces that install. `afterEach`'s
  `vi.useRealTimers()` restores both. If the installed vitest version behaves differently, call
  `vi.useRealTimers()` first inside the helper.
- **Parallel.** T-0478, T-0464, T-0472 and T-0473 are in the same lane, and T-0478 also edits
  `list-helpers.tsx` (`makeCtx`). Run them one after another, in either order.

## Build / accept log
Archived in `docs/tickets/log/T-0483.md` (D-0157).
