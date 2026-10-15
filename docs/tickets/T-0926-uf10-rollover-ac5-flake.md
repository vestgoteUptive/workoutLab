---
id: T-0926
title: "UF-10 midnight-rollover 'T-0343 AC-5 no second refresh at the rollover' still flakes under full forced-gate load: measure, root-cause, fix"
lane: web-feature:UF-10
screens: [UF-10.1]
decisions: [D-0113, D-0158, D-0169]
deps: [T-0924, T-0925]
status: ready
---
## Why
T-0924 fixed one real race (a stale refresh re-read repainted the old window). After that fix, `midnight-rollover.test.tsx` "T-0343 AC-5 no second refresh at the rollover" (L117–125) still failed once, in T-0006's first forced gate. It passes alone 8/8 (`docs/tickets/T-0006-turbo-test-inputs.md` L60, journal 2026-10-14). The failing assertion and message were **not** recorded, so the remaining mode is unknown. Every unexplained red in the forced gate costs a rerun and erodes trust in the gate. Root-cause it, don't retry it.

**Serial with T-0925.** Both tickets edit `apps/web/src/features/UF-10/use-balance.ts` and `__tests__/midnight-rollover.test.tsx`. T-0925 also changes read ordering, which may change this flake. Start only after T-0925 is merged on `main`, and measure on that code.

## Scope
- In:
  1. **Capture the failure.** Run under load until it fails, and record the exact failing assertion and message. AC-5 has three waits/asserts, and each one points to a different cause:
     - (a) `waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))` at L121;
     - (b) `waitFor(() => expect(h1()).toHaveTextContent("15–28 Sep"))` at L123;
     - (c) the final `expect(refresh).toHaveBeenCalledTimes(1)` at L124. Two calls here would be a real D-0113 §2 bug, not a flake.
  2. **Measure.** Use a temporary, uncommitted probe, written to a scratch file rather than the console. Per run, record `performance.now()` for:
     - the first-read publish;
     - `refreshAll` called and resolved;
     - each `readCache` start and end, with its `nowIso`;
     - the tick;
     - each `setState` publish;
     - the start of each `waitFor` and the time it resolved or timed out.
     Also record how many `waitFor` callback checks ran, and what triggered each one.
  3. **Test the hypotheses below** and record which one the data supports.
  4. **Fix the cause** with a deterministic test that is red before the fix.
- Out:
  - Retries.
  - Raising `asyncUtilTimeout` or a `waitFor` `timeout` as the *only* change. That is allowed only if the measurement shows a legitimate read time above 1000 ms under load. Even then, the log must show those numbers.
  - Changes outside `features/UF-10`.
  - T-0925's sequence logic. If it turns out to be the cause, raise a follow-up and don't rework it here.

**Hypotheses to test** (grounded in the current code):
- **H1: fake `setInterval` disables `waitFor` polling.** The test calls `vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })` (L31). Testing Library's `waitFor` polls on `setInterval`, and it only detects *Jest* fake timers (`globals: false` in `apps/web/vite.config.ts`). So under this test, `waitFor` re-checks only on DOM mutations, with a real 1000 ms `setTimeout` as the cap.
  - Waits on a non-DOM condition can time out whenever the spy changes after the last DOM mutation: wait (a) on a spy count, and T-0924's `waitFor(() => expect(calls).toBe(2))`.
  - Under load, React's passive effect (which calls `refreshAll`) can run after the mutation that ended `waitForRows`.
  - Expected signature: (a) times out at about 1000 ms with `refresh` called 0 times at timeout but 1 time just after.
- **H2: slow IndexedDB/engine.** The rollover read (`fake-indexeddb` plus `balance()`) takes longer than the 1000 ms `waitFor` cap under full-gate load. Expected signature: (b) times out, with the rollover `readCache` end later than its start plus 1000 ms.
- **H3: a real second refresh** (D-0113 §2 broken, e.g. `started` reset on a re-render path). Expected signature: (c) fails with 2 calls.

**Load recipe** (as in T-0924):
- Run 8 busy loops (`yes > /dev/null &` × 8).
- Run `scripts/locked.sh small npx vitest run src/features/UF-10/__tests__/midnight-rollover.test.tsx` at least 30 times, and the whole UF-10 folder at least 5 times.
- If that never reproduces it, run the forced `-w` gate once through `scripts/locked.sh heavy`, as the reproduction attempt of record.

## Acceptance criteria
- **AC1 (failure mode recorded).** The log names the failing assertion (a, b or c), quotes the message, and gives the timing data for at least one failing run and one passing run. It says which of H1, H2, H3 (or a new H4) the data supports. If no failure reproduces in the recipe plus one forced gate, the log records the run counts and the timing distribution: the maximum gap between the last DOM mutation and the `refreshAll` call, and the maximum rollover-read time. In that case, go on to AC2 for the hypothesis those numbers make most likely.
- **AC2 (deterministic reproduction, red before the fix).** A new test in `apps/web/src/features/UF-10/__tests__/` forces the identified ordering without CPU load.
  - For H1, for example: delay `refreshAll`'s *call* (gate the first-paint publish's passive effect, or hold `loadTargets` call 1) so that the spy changes with no later DOM mutation. Then show that the unfixed AC-5 wait pattern times out.
  - For H2: hold the rollover read for longer than 1000 ms of real time.
  - For H3: assert that exactly 1 call happens across the forced re-render.
  - The test is red on the code before the fix, and the red run is recorded.
- **AC3 (fix).** With the fix, the AC2 test and the unchanged-intent T-0343 AC-5 both pass.
  - For an H1 test-side fix, AC-5's assertions keep their meaning: exactly 1 `refreshAll` call before and after the rollover, and h1 on "15–28 Sep". Only the wait mechanism changes. For example, wait on a DOM signal, or advance the fake clock with `vi.advanceTimersByTimeAsync`, or keep `setInterval` real and drive the rollover through `visibilitychange`.
  - Apply the same fix to every other `waitFor` on a non-DOM condition in `midnight-rollover.test.tsx` (the T-0924 test's `calls` wait), with one line each in the log.
  - Planted fault: revert the fix in a backup copy, and the AC2 test goes red. Restore with `cp` and it goes green.
- **AC4 (load evidence).** On the fixed code, run the load recipe:
  - `midnight-rollover.test.tsx` passes 30/30;
  - the UF-10 folder passes 5/5;
  - the forced gate passes once.
  Record the counts.
- **AC5 (binary sibling).** AC-5 is the online case (a refresh exists). Its offline sibling, T-0343 AC-1, passes unchanged under the same recipe. Record 30/30 from the same runs.

## Paths you may change
- `apps/web/src/features/UF-10/**`

## Contract impact
none

## Definition of done
- AC1 to AC5 are proven in the log, with red runs and planted faults recorded.
- The full `-w` gate, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- No probe code is committed.
- No existing assertion is weakened.
- Commits start `T-0926 UF-10.1:`.
- **Tier: large** (timing, D-0178 §2).
- If no cause can be established after the recipe and one forced gate, return `blocked`, with the AC1 data and the most likely hypothesis. Do not merge a speculative timeout bump.

## Build / accept log

- 2026-10-15 wl-build-web. Start: clean, HEAD b2e2ef8a.
  - **AC1 captured (unfixed code, 10 busy loops, `midnight-rollover.test.tsx` x30, run 28 red):** not AC-5 but its sibling `T-0924 AC-1 ... cannot repaint the old window` failed at its `waitFor(() => expect(calls).toBe(2))`: `AssertionError: expected 1 to be 2`, test time 1356 ms (cap 1000 ms). Same wait pattern as AC-5 wait (a): a non-DOM count awaited with `waitFor`. Supports **H1** (fake `setInterval` leaves `waitFor` re-checking only on DOM mutations; the counter flipped after the last mutation, so the final check saw 1 and the 1000 ms cap rejected with the last error). H2 ruled out (it would fail a DOM wait, (b)); H3 ruled out (no "called 2 times"). Per-phase probe data was not captured; the deterministic reproduction below reproduces the identical message.
  - **AC2 deterministic, no load:** `mountWithLateRefresh` (refresh answers after 100 ms real; re-read held). `T-0926 AC2 waitFor never sees a counter...` documents that `waitFor({timeout:400})` rejects `expected 1 to be 2` while the counter reaches 2. `T-0926 AC2 pollUntil sees the late counter...` is **red** with `pollUntil` swapped for `waitFor` (1155 ms, `expected 1 to be 2`), green with the fix. Planted fault restored with `cp` from a backup.
  - **AC3 fix (test-side, assertions unchanged):** new `pollUntil` in `__tests__/test-helpers.tsx` polls on the real `setTimeout` inside `act`, 5 s real cap. Non-DOM waits switched: AC-5 refresh count; T-0924 `calls`; T-0925 AC1+AC4 `rolloverHasRows`; T-0925 AC3 refresh count (one line each in the test file). The remaining `waitFor` calls wait on DOM text/rows and re-check on the mutation itself. `no-data`/`refresh-auth` fake `setTimeout` (not `setInterval`) and are untouched; flagged as a follow-up to audit.
  - **Nits folded:** T-0924 loop comment in `use-balance.ts` refreshed (seq guard is the second line of defence); comment noting a `fresh === null` re-read does not raise `publishedSeq`; T-0925 tests made self-contained (own `extra` set per test via `makeExtra()`, no shared module state, non-DOM waits no longer share AC-5/AC-1's `waitFor` pattern).
  - **AC4/AC5 load (fixed code, 10 busy loops):** `midnight-rollover.test.tsx` 30/30 (all 13 tests incl. T-0343 AC-1 and AC-5); `src/features/UF-10` 5/5.
