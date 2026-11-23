---
id: T-0932
title: "UF-03 list-view.swap.test.tsx 'focus returns to the Swap button' failed once under full-gate load: capture the failure, root-cause it, fix it, and extend the T-0922 guard to focus reads"
lane: web-feature:UF-03
screens: [UF-03.1]
decisions: [D-0071, D-0158, D-0178]
deps: [T-0922]
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ½ day, test-only unless the measurement finds a production race (then stop, see Out). Same family as T-0922 (a read right after a wait for something else; a cold dynamic import) and T-0926 (a wait on a non-DOM condition). Tier: large (timing, D-0178 §2). -->

## Why
In the T-0931 gate, `apps/web/src/features/UF-03/__tests__/list-view.swap.test.tsx`, in `describe("T-0478 AC-3 focus and a11y")`, failed once under full-gate load: "focus returns to the Swap button". It passed 15/15 on two reruns. The failing assertion and message were **not** recorded, so the mode is unknown. Every unexplained red in the forced gate costs a rerun and erodes trust in the gate. Root-cause it; don't retry it.

Two tests in that describe are candidates (line numbers on `main` at 8043f7b6):
- **"after Cancel, focus returns…" (L231–L240):** click Swap, `await screen.findByRole("dialog", …)`, click Close, `await settle()` (a 50 ms real sleep inside `act`), then a **synchronous** `expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" }))`. T-0922's log says `settle()` is "a 50 ms timing bet" and it fixed the same shape in `list-view.swap.host.test.tsx` (L261) by turning the read into `waitFor(() => expect(document.activeElement).toBe(…))`.
- **"after a resolved Apply, focus returns…" (L242–L257):** `await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())`, then a synchronous `document.activeElement` read. The dialog's removal and the focus call are **different effects** in `Card` (`ListView.tsx` L739–L743: the `useEffect` on `swapping` calls `swapRef.current?.focus()` after the commit that removes the sheet). `waitFor` can resolve on the DOM removal before that passive effect has run.

Both open the sheet through a `retryableLazy` wrapper around `import("../UF-05/index.js")` (`ListView.tsx` L46). The test mocks `../../UF-05/index.js`, but the `import()` is still a dynamic import, and T-0922 measured the first sheet-opening test of a file failing on a cold dynamic import under load (`Unable to find dialog`, after the 1000 ms `findBy` cap).

T-0922's guard (`wait-then-read.guard.test.ts`) only flags a read after a **heading** wait. It does not see these two shapes.

## Scope
- In (`apps/web/src/features/UF-03/__tests__/**`):
  1. **Capture the failure.** Run under load until it fails and record the exact failing test, assertion and message. The possible failures map to causes:
     - **(a)** `Unable to find role="dialog"` or a `findBy` timeout in the first sheet-opening test of the file: a cold lazy import (H2);
     - **(b)** `expected <body> to be <button>` (or similar) on a `document.activeElement` read: a synchronous read before the focus effect (H1);
     - **(c)** the button found but not focused after `settle()`: a fixed-time bet (H1, the Cancel test).
  2. **Measure.** A temporary, uncommitted probe written to a scratch file (not the console): `performance.now()` at the Close click, at the dialog's removal (`MutationObserver`), at the focus effect's `focus()` call, at the assertion; and, for the first test, the time the lazy import took to resolve.
  3. **Hypotheses** (record which one the data supports):
     - **H1:** a synchronous `document.activeElement` read (after `settle()` or after the dialog `waitFor`) runs before the `swapping` effect has focused the button. Signature: (b) or (c), the read sees `<body>`, and a read a few ms later sees the button.
     - **H2:** the cold `import("../UF-05/index.js")` (the module and the SwapSheet's own imports) takes longer than 1000 ms under load, in whichever test opens the sheet first. Signature: (a), with the first test of the file failing and the rest passing.
     - **H3:** a real production race in `Card`'s focus effect. Signature: the focus call never happens in a fixed run. Not expected.
  4. **Fix the cause** with a deterministic test that is red before the fix.
  5. **Extend the guard** `wait-then-read.guard.test.ts` with the shape "focus read after a fixed sleep or a non-focus wait" (AC4).
- Out:
  - Production code under `features/UF-03` (`ListView.tsx`). If H3 is the cause, stop and raise a follow-up; do not fix it here.
  - Retries, and raising `asyncUtilTimeout` or any `waitFor` / `findBy` timeout as the only change. Allowed only if the measurement shows a legitimate resolve time above 1000 ms, and then the log must show those numbers.
  - Other flows' tests.

**Load recipe** (as T-0922 AC7): 8 busy loops (`yes > /dev/null &` × 8), then `scripts/locked.sh small npx vitest run src/features/UF-03/__tests__/list-view.swap.test.tsx` at least 30 times and the whole UF-03 folder at least 5 times. If it never reproduces, run the forced `-w` gate once through `scripts/locked.sh heavy` as the reproduction attempt of record.

## Acceptance criteria
Test titles start `T-0932 ACn`.
- **AC1 (failure mode recorded).** The log names the failing test and assertion (a, b or c), quotes the message, and gives timing data for at least one failing and one passing run, and says which of H1, H2, H3 (or a new H4) the data supports. If nothing reproduces in the recipe plus one forced gate, the log records the run counts and the timing distribution (maximum gap between the dialog's removal and the focus call, and the lazy import time), and AC2 targets the hypothesis those numbers make most likely.
- **AC2 (deterministic reproduction, red before the fix, no CPU load).** A new test forces the identified ordering.
  - H1: delay the focus effect (for example hold the `swapping` state flip behind a controlled promise in the mocked sheet's `onClose`, or flush passive effects late) so that the dialog is gone but the effect has not run, and show that the unfixed read sees `<body>`.
  - H2: make the mocked module's factory async and hold it for more than 1000 ms of real time, and show that the unfixed first test times out on `findByRole("dialog")`.
  - The test is red on the code before the fix, and the red run is recorded.
- **AC3 (fix).** With the fix, the AC2 test and the existing two focus tests pass, and each focus test still asserts the same thing.
  - H1 fix: both reads become `await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })))`, with no `settle()` in front of them.
  - H2 fix: a `beforeAll` that awaits `import("../UF-05/index.js")` (as T-0922 did in `list-view.swap.host.test.tsx`), plus the same for any other lazily loaded sibling this file opens; no timeout is raised.
  - Planted fault per fixed site, on a backup copy restored with `cp`: expected name "Swap Hip thrust" makes that test red; the CONTRAST test ("opening the sheet never moves focus to the Swap button") still passes, so the assertion is still about the close path.
- **AC4 (guard extended, positive and negative).** In `wait-then-read.guard.test.ts` the scanner also reports a **focus read**: a synchronous `document.activeElement` read (a line containing `document.activeElement` that is not inside an `await waitFor(` or `pollUntil(` callback) that follows `await settle(` or a non-focus `await waitFor(` / `await screen.findBy…` in the same test and precedes any `waitFor(() => … document.activeElement …)` ready signal. Given inline fixtures:
  - `await settle(); expect(document.activeElement).toBe(button);` Then 1 finding on line 2;
  - `await waitFor(() => expect(document.activeElement).toBe(button));` Then 0 findings;
  - a `document.activeElement` read right after `fireEvent.click(…)` with no wait in between (a synchronous focus move) Then 0 findings, so the CONTRAST test's shape stays legal;
  - `// same-commit: <reason>` clears one finding, an empty reason does not (as T-0922 AC4).
  - Real files: 0 findings, and the guard still asserts it read at least 10 files. Planted fault: put the `settle()` plus synchronous read back in a backup copy of `list-view.swap.test.tsx`: the guard goes red naming `list-view.swap.test.tsx:<line>`; restored with `cp`, green.
- **AC5 (load evidence).** On the fixed code, the recipe: `list-view.swap.test.tsx` 30/30, the UF-03 folder 5/5, and the forced gate once. Record the counts.
- **AC6 (binary sibling).** The Cancel path and the Apply path are both fixed and both covered (AC3); the CONTRAST test (no focus move on open) passes in the same 30 runs.

## Paths you may change
- `apps/web/src/features/UF-03/__tests__/**`

## Contract impact
none

## Definition of done
Every AC proven in the log, with red runs and planted faults recorded · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` green · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no probe code committed · no existing assertion weakened · no production file changed, so no e2e run · commits start `T-0932 UF-03.1:`. If no cause can be established after the recipe and one forced gate, return `blocked` with the AC1 data and the most likely hypothesis; do not merge a speculative timeout bump.

## Build / accept log

### Build (frontend-dev)
- Start: worktree clean, HEAD 5adf4679. Test-only; no production file changed (no e2e).
- **AC1 failure mode.** Reproduced under load (8 `yes` loops, 4 cores, other agents running; load avg ~20): 200 runs of the Apply focus test with a probe (scratch file, deleted): 3 failed = mode **(b)**. The read ran after the dialog's removal but before the `swapping` effect's `focus()`: removed -> read 0.3 ms later, `focus()` 135, 135 and 230 ms later (`activeElement` was not the button; a `waitFor` on it 70-90 ms later saw it). 197 passing runs: `focus()` 1.4-27 ms after removal, read 0.45-4.7 ms after `focus()` (a 0.45 ms margin: `waitFor` resolves on the removal, then RTL's drain macrotask races the passive effect). Cancel path (40 runs): `focus()` -0.5..-5 ms BEFORE removal (it runs inside the click's `act`), read 53-65 ms after: no failure, but a fixed 50 ms `settle()` bet. **H1 supported** (Apply), H3 ruled out (focus always fires), no H2 on the focus tests.
- **Second cause found in the 30-run recipe (H4: cold first mount).** Run 10 of 30: the FIRST test of the file (`opens SwapSheet…`) failed in `mount()`: `Unable to find role="button" and name /Romanian deadlift/` (cards still showing ids: the library read had not landed within the 1000 ms `findBy`). Measured, no load from me: the first `ListView` mount of a fresh worker takes 190-258 ms (6 cold runs), warm mounts 25-89 ms (about 4x). Not the lazy import.
- **Fixes.** `list-view.swap.test.tsx`: both focus reads are now `await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })))`, no `settle()` before them; same assertion. `beforeAll` (60 s hook timeout) warms the `ListView` mount and imports `UF-05/index.js`; no timeout raised. The same sync-focus-read shape existed in two more real tests, found by the extended guard and fixed the same way: `list-view.addset.host.test.tsx` (row-5 focus kept), `list-view.test.tsx` (How to dialog Close).
- **AC2 (deterministic, no load).** `deferSwapFocus(150)` runs the `.focus()` late. Red on the unfixed reads with `deferSwapFocus(200)` added to both existing focus tests: 2 failed (`expected <button> to be <button>`). New tests: "T-0932 AC2: after Cancel/Apply with a late focus effect, the dialog is gone first and focus still arrives" (asserts the button is NOT focused after removal, then focused via `waitFor`). Cold mount: `stallFirstLibraryRead` (first library read 1.2 s): "outlasts the 1 s find" rejects with the card not found (with a 100 ms stall it resolves, so the stall is what makes it red); "paid inside the warm-up" mounts fine; "warmed before the first test" is red if the `beforeAll` warm-up call is removed (planted, 1 failed).
- **AC3 planted faults** (backup copy, `cp` restore, `cmp` equal): expected name "Swap Hip thrust" at both fixed sites: the Cancel and Apply tests red, the CONTRAST test ("opening the sheet never moves focus") green (17/17 -> 2 failed).
- **AC4 guard.** `scanFocusReads` in `wait-then-read.guard.test.ts` (7 new fixture tests: settle+read = 1 finding on line 2; non-focus `waitFor`/`findBy` + read flagged; `waitFor` on focus = 0 and clears; read after click = 0; `.not.` read = 0 (cannot fail late, keeps the CONTRAST shape legal); marker with reason clears, empty does not; no leak into the next test). Real files: 0 findings, 24 test files read, at least 3 focus waits asserted. It first reported 2 real hits (addset.host L81, list-view L332), fixed above. Planted fault: `settle()` + sync read put back in a backup of `list-view.swap.test.tsx`: guard red naming `list-view.swap.test.tsx:251`; restored, green.
- **AC5 load evidence (fixed code).** 4 `yes` loops (machine load avg ~20): `list-view.swap.test.tsx` 30/30, UF-03 folder 5/5. With 8 loops on this 4-core box the load is beyond what the files tolerate: 28/30 (2 x the unchanged axe test over its 5 s default) and folder 0/5 (5 s timeouts in `exports-and-lint` ESLint, axe tests, cold mounts in many files); none of those failures were focus tests, and none was in a file I changed except an axe/mount timeout. Before the cold-mount fix, 29/30 under 8 loops (the run-10 cold failure above).
- **AC6.** Cancel and Apply both fixed and covered; the CONTRAST test passed in every run.
