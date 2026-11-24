---
id: T-0930
title: "UF-10 tests: audit every fake-timer test for waits on non-DOM conditions (no-data, refresh-auth and the rest), fix what is at risk, and add a guard so the T-0926 shape cannot return"
lane: web-feature:UF-10
screens: [UF-10.1]
decisions: [D-0113, D-0158, D-0169]
deps: [T-0926]
status: done
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ½ day, test-only. Low priority: nothing is shown failing. -->

## Why
T-0926 found that `waitFor` does not poll under a faked `setInterval` (Testing Library polls on `setInterval`, and it only detects Jest's fake timers, not Vitest's). A wait on a non-DOM condition (a spy count, a flag) then re-checks only when the DOM mutates, so it times out when the condition flips after the last mutation. T-0926 fixed `midnight-rollover.test.tsx` with the real-clock `pollUntil` in `__tests__/test-helpers.tsx` and left a follow-up: audit `no-data.test.tsx` and `refresh-auth.test.tsx`, which also call `vi.useFakeTimers`.

What a first read of the code shows (the builder confirms it, this is not a finding yet):
- `no-data.test.tsx` fakes only `setTimeout` and `clearTimeout` (L58) in one test (AC-2), which already waits for its spy count with a hand-written `setImmediate` loop, not `waitFor`; its two `waitFor` calls (L84, L114) are in other tests, with real timers, and wait on the DOM row count.
- `refresh-auth.test.tsx` fakes only `setTimeout` and `clearTimeout` (L230) in the 3 s cap test, which drives time with `advanceTimersByTimeAsync`; its non-DOM waits (`expect(refresh).toHaveBeenCalledTimes(1)` at L124, L139, L172, L190, L204, L319 and L320, `fromCalls` at L173) run in tests with real timers.
- So today no non-DOM `waitFor` appears to run while `setInterval` is faked. The risk is latent: one added `vi.useFakeTimers()` with no `toFake` list (which fakes everything, `setInterval` included) would make those waits flaky, and nothing stops that.

This ticket proves which waits are at risk, fixes them, and adds a cheap source guard in the style of T-0922's `wait-then-read.guard.test.ts`.

## Scope
- In (`apps/web/src/features/UF-10/__tests__/**`, test-only):
  - **Audit.** Every `waitFor(` and `findBy…(` in every UF-10 test file that calls `vi.useFakeTimers` (today `midnight-rollover`, `no-data`, `refresh-auth`; the builder re-greps), plus the two named files in full. Record one row per wait in the log: `file:line`, the test, which timers are faked at that line (none, `setTimeout` only, `setInterval`, `Date`), the condition (DOM or non-DOM), and the verdict (`ok`, `latent`, `at risk`). A wait is **at risk** when it is non-DOM and `setInterval` is faked at that line, or when it needs a faked `setTimeout` to fire and nothing advances it.
  - **Fix** each `at risk` wait with `pollUntil` (real clock) or a DOM signal, or by advancing the fake clock with `vi.advanceTimersByTimeAsync`. The assertion keeps its meaning. A `latent` wait is left alone unless it is cheaper to convert than to explain.
  - **Guard** `__tests__/fake-timer-waits.guard.test.ts` (`// @vitest-environment node`, pure scanner function in the file, reads its sibling files with `readdirSync`).
- Out:
  - Production code under `features/UF-10`.
  - Raising `asyncUtilTimeout` or a `waitFor` timeout.
  - Other flows' tests, and ESLint config.
  - `midnight-rollover.test.tsx` beyond what the guard needs (T-0926 already converted it).

## Acceptance criteria
Test titles start `T-0930 ACn`.
- **AC1 (audit recorded).** Given the UF-10 test folder, When the audit is done, Then the log holds the table above with a verdict for every wait in a fake-timer file, and says in one line which files fake `setInterval` (expected: `midnight-rollover` only). If the table has no `at risk` row, the log says so and AC2 is satisfied by that statement plus AC3.
- **AC2 (every at-risk wait fixed, still a real assertion).** Given an `at risk` row, When it is fixed, Then the test's assertion is unchanged in meaning, and a planted wrong expectation (backup copy, restored with `cp`) turns it red. One log line per site.
  - Red before the fix: a deterministic test in the same folder (as T-0926's `mountWithLateRefresh`) shows the old wait pattern timing out when the spy flips after the last DOM mutation. Not needed when AC1 finds none.
- **AC3 (guard, positive and negative).** Given the scanner and inline fixture sources:
  - a file that calls `vi.useFakeTimers({ toFake: ["setInterval", "Date"] })` and has `await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))`, When scanned, Then 1 finding on that line;
  - the same file with `await pollUntil(() => expect(refresh).toHaveBeenCalledTimes(1))`, Then 0 findings;
  - the same file with `await waitFor(() => expect(rowAreas()).toHaveLength(9))` (a DOM read), Then 0 findings;
  - a file whose `useFakeTimers` lists only `setTimeout` and `clearTimeout`, with the first `waitFor`, Then 0 findings (polling still works there; sibling of the first case);
  - `vi.useFakeTimers()` with no options (fakes everything) counts as faking `setInterval`;
  - a `// dom-wait: <reason>` comment on the line above clears one finding; an empty reason does not.
  - What counts as a DOM read is a short list in the scanner (`screen.`, `within(`, `container`, `document.`, and the folder's own row helpers such as `rowAreas(`, `rowValue(`, `h1(`, `contributorTexts(`), written down in the log.
- **AC4 (real files are clean, non-vacuously).** Given the real UF-10 test files, When scanned, Then 0 findings. The test also asserts it read at least 10 files and saw at least 1 file that fakes `setInterval` and at least 5 `waitFor` calls, so a broken glob or regex fails instead of passing empty.
  - Planted fault: put one `pollUntil` in `midnight-rollover.test.tsx` back to a non-DOM `waitFor` (backup copy): the guard goes red and names `midnight-rollover.test.tsx:<line>`. Restored with `cp`, it goes green.
- **AC5 (load evidence, not a test).** With 8 busy loops (`yes > /dev/null` × 8) run `scripts/locked.sh small npx vitest run src/features/UF-10/__tests__/no-data.test.tsx src/features/UF-10/__tests__/refresh-auth.test.tsx` 10 times. Record the pass count (target 10/10). A failure is evidence of another at-risk wait; it is never a reason to raise a timeout.

Binary-condition check (D-0197 §7):
- Fake `setInterval` or not: AC3 cases 1 and 4.
- DOM or non-DOM wait: AC3 cases 1 and 3.
- Marker with and without a reason: AC3 last case.
- Online and offline do not apply: the guard is a static scan.

## Paths you may change
- `apps/web/src/features/UF-10/__tests__/**`

## Contract impact
none

## Definition of done
Every AC proven in the log with red runs and planted faults recorded · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` green · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no production file changed (so no e2e run) · no assertion weakened · commits start `T-0930 UF-10.1:`.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`. Listing several script names after one `--filter` runs only the first; pnpm passes the rest to it as plain CLI arguments, so they never run.

## Build / accept log
- **T-0930 build (frontend-dev, 2026-11-23).** Test-only; no production file changed.
- **AC1 audit.** Files calling `vi.useFakeTimers`: `midnight-rollover` (faked `Date`, `setInterval`, `clearInterval`, every test), `no-data` (L58 only, `setTimeout`/`clearTimeout`, AC-2 test), `refresh-auth` (L230 only, `setTimeout`/`clearTimeout`, AC6 3 s cap test). Only `midnight-rollover` fakes `setInterval`. No `at risk` row, so AC2 is met by this statement plus AC3.
  - `midnight-rollover` (setInterval faked): L48 `waitForRows`, L73, L85, L91, L107, L130, L153, L196, L269, L270 all DOM, ok. L128, L151, L191, L263, L312 already `pollUntil`, ok. L241/243/248 `vi.waitFor` (Vitest's own, advances/uses real timers), ok. L299 non-DOM `waitFor` on purpose (the T-0926 red demo), ok with a `// dom-wait:` marker added above it.
  - `no-data`: L84, L114 DOM, none faked at that line, ok. `findByRole` L45/L103 DOM, ok. The only fake is L58, which waits via a `setImmediate` loop, ok.
  - `refresh-auth` (none faked at these lines, `setTimeout` fakes are in other tests and restored by `useRealTimers`): L98, L112, L306 DOM, ok. L124, L139, L172, L173, L190, L204, L319, L320 non-DOM, latent (would break if a no-option `useFakeTimers()` were added; the guard now catches that).
  - DOM-read list in the scanner: `screen.`, `within(`, `container`, `document.`, `rowAreas(`, `rowValue(`, `rowElements(`, `rowFill(`, `rowBarWidth(`, `row(`, `outlinedRowAreas(`, `mapButton`, `h1(`, `contributorTexts(`, `contributorRows(`, `noDataLine(`, `location(`.
- **AC3** `fake-timer-waits.guard.test.ts`, nine scanner tests (non-DOM finding, pollUntil, DOM read, setTimeout-only, no-option fake, no fake, `vi.waitFor`, multi-line, marker with/without reason). **AC4** the same file's real-files test (>= 10 files, >= 1 setInterval file, >= 5 waits, 0 findings).
- **Red runs.** First run of AC4 was red on `midnight-rollover.test.tsx:299` (the deliberate demo); fixed with the marker. Planted fault: `pollUntil` -> `waitFor` at `midnight-rollover.test.tsx:128` (backup copy): guard red, named `midnight-rollover.test.tsx:128`. Restored with `cp`, `cmp` identical, guard green (10/10).
- **AC5** 8 `yes` loops, `no-data` + `refresh-auth` x10: first batch 9/10 (the one failure's output was not captured, so its cause is unknown, not shown to be a wait); two re-runs with logs kept: 12/12 and 10/10. No timeout raised. Worth a follow-up if it recurs.
- **Gate (after merging main-hzlbfc).** Web typecheck, lint green; web test 405 files / 5331 tests green; `-w format:check` green after prettier on the guard file; `check-all.mjs` reports only `ticket-not-on-base` (the ticket file is not on main yet; orchestrator action). The full `-w` run and `test:repo-checks` were not run.
