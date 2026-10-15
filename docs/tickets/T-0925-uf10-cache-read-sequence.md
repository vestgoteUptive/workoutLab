---
id: T-0925
title: "UF-10 use-balance: a cache read that started earlier never publishes over one that started later (read sequence number)"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0113, D-0071, D-0104, D-0115]
deps: [T-0924]
status: ready
---
## Why
T-0924 (merged `fa148052`) stopped the refresh's **post-refresh re-read** from repainting an older window. The mirror race is still open. `use-balance.ts` has two kinds of cache read:
- **Effect 1 (L125–141):** the first paint, and every rollover (`nowIso`/`timeZone` change). It publishes whenever its own effect is still `live`, and `live` only turns false when `nowIso`/`timeZone`/`stub` change again.
- **Effect 2 (L146–184):** the refresh's re-read, after `refreshAll`.

The race: a rollover read starts **while `refreshAll` is still running**, so it reads the pre-refresh cache. The refresh then lands, and its re-read publishes the fresh rows for the new window. Then the slow rollover read resolves and publishes its pre-refresh rows over the fresh ones. The window (h1) is right but the counts are stale until the next remount, so data the user just synced appears lost. The newest *start* must win, not the newest *finish*. Board row T-0925, from the T-0924 follow-up.

## Scope
- In:
  - `apps/web/src/features/UF-10/use-balance.ts`: a per-hook monotonically increasing read sequence number. Every cache read (effect 1's reads and the refresh re-read) takes the next number when it **starts**. A read publishes `setState` only if its number is greater than the last published number, and then it records its own. A read that is dropped still runs effect 1's `setFirstReadDone(true)`, so `settled` cannot stick.
  - The builder may simplify or keep T-0924's "re-read until inputs held still" loop. T-0924 AC-1 must stay green either way; say in the log which was chosen.
  - New tests in `apps/web/src/features/UF-10/__tests__/midnight-rollover.test.tsx` (or a sibling file in that folder).
- Out:
  - The 3 s cap case (D-0071 §8). If `refreshAll` outlives `REFRESH_TIMEOUT_MS`, its late write is not re-read on this mount. That is accepted behaviour and stays as it is.
  - T-0926 (AC-5 flake root cause), which runs after this ticket on the same files.
  - Anything outside `features/UF-10`.

## Acceptance criteria
- **AC1 (the race, deterministic; red on current `main`).**
  - **Given:** signed in and online. `refreshAll` is mocked to return a promise the test holds open. The cache is seeded as in `mountSeeded()`: one back-squat set at `2026-09-14T23:59+02:00`, time `2026-09-27T23:59:30+02:00`, so the first paint shows quads "1 / 20" and h1 "14–27 Sep".
  - `loadEngineHistory` (from `lib/offline/engine-feed.js`) is spied so that **call 2** (the rollover read) first resolves the real read, sets a flag, and then waits on a test-held gate. Use T-0924's gated-read technique, but gate the *history* read so that the pre-refresh rows are captured for certain.
  - **When:**
    1. the 60 s tick rolls the window to "15–28 Sep";
    2. the test waits for the flag (the rollover read has its pre-refresh history);
    3. the test resolves `refreshAll`, after writing one more back-squat set at `2026-09-27T20:00:00+02:00` with `seedCache`;
    4. the test waits until h1 reads "15–28 Sep" and quads reads "1 / 20" (the refresh re-read published);
    5. the test releases the gate and waits 50 ms of real time inside `act`.
  - **Then:** quads still reads "1 / 20" (not "0 / 20") and h1 still reads "15–28 Sep".
  - **Red on unfixed code:** the final `rowValue("quads")` assertion receives "0 / 20". Record it in the log before the fix.
  - **Planted fault after the fix:** in a backup copy, replace the sequence comparison with an unconditional publish. AC1 goes red. Restore with `cp` and it goes green.
- **AC2 (sibling, offline; no refresh to race).** Given offline (`navigator.onLine` false) and the same seed, When the tick rolls the window, Then the rollover read publishes as before: quads "0 / 20", h1 "15–28 Sep". The existing T-0343 AC-1 covers this and must stay green unchanged.
- **AC3 (in-order reads still publish).** Given online, with `refreshAll` resolving immediately (writing the same extra set), When the window rolls over **after** the refresh has finished, Then the rollover read (a higher sequence number) publishes quads "1 / 20" and h1 "15–28 Sep". This proves the guard does not drop a newer read. Planted fault: invert the comparison (`<`) and AC3 goes red.
- **AC4 (a dropped read still settles).** Given AC1's sequence, When the gated read is dropped, Then `useBalance(...).settled` is `true` after the release. Assert it through the screen's settled signal (the no-data/loading state is absent and the nine rows are present), or through a `renderHook` on `useBalance`.
- **AC5 (no regressions).** T-0924 AC-1 and T-0343 AC-1 to AC-7 pass unchanged. So does every other test in `apps/web/src/features/UF-10/__tests__/`. Do not edit the assertions of existing tests.

Binary-condition check (D-0197 §7):
- Online/offline: AC1 versus AC2.
- Read order: stale-finishes-last (AC1) versus in-order (AC3).
- Signed-out: no refresh runs (D-0113 §1), so it reduces to AC2's single-read case. The existing `refresh-auth.test.tsx` covers it.

## Paths you may change
- `apps/web/src/features/UF-10/**`

## Contract impact
none. `docs/engine-rules.md` is untouched: this is UI read ordering, not engine behaviour.

## Definition of done
- Every AC has a passing test, AC1 with a recorded red run on unfixed code and a planted fault.
- `scripts/locked.sh small npx vitest run src/features/UF-10/__tests__/` passes 3 times in a row.
- The full `-w` gate (`typecheck lint test --concurrency=1`), `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- E2E: `tests/e2e/uf-10-balance.spec.ts` only.
- Commits start `T-0925 UF-10.1:`.
- **Tier: large.** This is a timing change, so per D-0178 §2 it gets review.
- **Serial:** T-0926 edits the same two files and must start after this merges.

## Build / accept log
