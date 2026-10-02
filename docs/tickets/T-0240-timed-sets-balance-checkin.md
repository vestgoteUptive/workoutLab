---
id: T-0240
title: "Engine tests: balance() and evaluateCheckin count the timed hard sets of timedCoreHistory (plank) like any other hard set, pinned inline"
lane: engine
screens: [UF-10.1, UF-10.2, UF-11.1]
decisions: [D-0034, D-0041, D-0092, D-0094, D-0096]
deps: [T-0237]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ¼ day. Test-only: `src/**` is unchanged, so there is no vendor regen. Follow-up from the T-0237 accept log ("Accepted gap"). Engine tickets run one at a time (D-0096 §3); T-0237 and T-0235 are done, so this is ready now. -->

## Why
T-0237 retired the two tests that guarded rule 11 (`balance`) and rule 9 (`evaluateCheckin` via
`checkinSessions`) on a history with timed sets: "rule-11 (AC9) balance is unchanged …" and
"rule-9 (AC9) evaluateCheckin … matches the baseline's last ended period …". They compared against
a frozen snapshot, which is gone. So today nothing fails if a change starts to drop, or
double-count, a set because it has `durationS` instead of `reps`. A plank set is a hard set
(rule 2, D-0034 §4, D-0092 §1). It must fill core on UF-10 Balance and count as a completed session
for the UF-11 check-in, exactly like a rep set. Principle 4 (adaptive targets) depends on the
check-in count being right.

## Scope
- In (all under `packages/engine/test/`):
  - A new `t0240-timed-balance-checkin.test.ts` with the ACs below. All expected values are
    literals written in the test (no snapshot, no fixture file read, per the T-0236/T-0237
    pattern).
  - It may add a small helper inside the test file that rewrites the plank rows of a history to
    `dead-bug` rep rows (same `clientId` suffix scheme, `sessionId`, `completedAt`, `isWarmup`,
    with `reps` 10, `weightKg` `null`, `durationS` `null`). `dead-bug` is in L1 with `{core: 1}`,
    the same area weights as `plank`.
- Out:
  - `packages/engine/src/**`, `docs/engine-rules.md`, the vendored copy.
  - Edits to `fixtures/histories-timed.ts` or any existing test.
  - `suggest`, `rankSwaps`, `applySwap` (already covered by the T-0219, T-0226 and
    apply-swap-histories tests).

## Acceptance criteria
Test titles start with `T-0240 ACn`. Setup: `timedCoreHistory` (4 sessions at 18:00 local on
2026-09-20, -22, -24, -26; each 3 × bench-press, 3 × barbell-row, 3 × plank at 100/105/110/115 s),
`F_TARGETS`, `LIBRARY`, `NOW` = 2026-09-27T12:00:00+02:00, `TZ` Europe/Stockholm. Window
2026-09-14 … 2026-09-27.

- **AC1 (balance counts the plank sets, rule 11)** Given `balance(timedCoreHistory, F_TARGETS,
  LIBRARY, NOW, TZ)`, when the `core` entry is read, then:
  - `load` is 12, `target` 12, `deficit` 0, `coverageStep` 4;
  - `days` is 14 entries, 3 at indexes 6, 8, 10 and 12 and 0 elsewhere;
  - `lastTrainedDate` is `"2026-09-26"`;
  - `contributors` deep-equals `[{exerciseId: "plank", weightedSets: 12, lastDate: "2026-09-26"}]`.
  - And `chest` has `load` 12 and `deficit` 0.4 (bench-press, so the timed rows didn't push out the
    rep rows of the same sessions).
- **AC2 (a timed set equals a rep set, rule 2)** Given the same history with every plank row
  rewritten to a `dead-bug` rep row (the helper), when both `balance` results are compared, then
  they are deep-equal once core's contributor `exerciseId` `"dead-bug"` is mapped to `"plank"`
  (all 9 areas, their order, `windowStart`, `windowEnd`, `computedAt`).
- **AC3 (the warm-up pair)** Given `timedCoreHistory` with every plank row set to
  `isWarmup: true`, then core's `load` is 0, `coverageStep` 0 and `contributors` is `[]`, and
  `chest.load` is still 12. (Both values of `isWarmup` on a timed row are tested: AC1 and AC3.)
- **AC4 (checkinSessions counts the plank sets, D-0041 §3)** Given
  `checkinSessions(sessionRefsOf(timedCoreHistory), timedCoreHistory, LIBRARY)`, then it returns 4
  sessions in input order, each with `hardSetCount` 9 (3 + 3 + 3). Given the plank-only history
  (`timedCoreHistory` filtered to `exerciseId === "plank"`), each of the 4 sessions has
  `hardSetCount` 3.
- **AC5 (a plank-only session completes a check-in period, rule 9)** Given the plank-only history,
  `checkinProfile({rhythmMin: 2, rhythmMax: 3})` (onboarded and plan changed 2026-08-02),
  `NO_CHECKINS`, `NOW`, `TZ`, when `evaluateCheckin(checkinSessions(sessionRefsOf(h), h, LIBRARY),
  …)` runs, then the result deep-equals `{periods: [{index: 3, start: "2026-09-13", end:
  "2026-09-26", completed: 4, status: "on_plan"}], proposal: null, nextCheckinDate:
  "2026-10-11"}`. The pair: the same history with every plank row `isWarmup: true` gives
  `completed` 0, `status` `"under"` and a non-null `proposal` with `direction` `"down"`.
- **AC6 (red on a real break)** Temporarily make `isHardSet` in `src/history.ts` return `false`
  for a set with `durationS !== null` (one line). AC1, AC2, AC4 and AC5 must go red. Revert,
  record the red run (test names and first failure line) in the build log, and commit nothing in
  `src/`.
- **AC7 (no behaviour change)** `git diff --stat main...HEAD -- packages/engine/src` is empty
  (record it). The T-0230 budget guard, the T-0236 and T-0237 guards and the traceability tests
  pass unedited. The build log states the engine test count before and after.
- **AC8** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0240-timed-sets-balance-checkin.md`: this file, for the build and accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: one new test file. No other engine ticket is open, so it is parallel-safe by files.
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs
  `node supabase/scripts/vendor.mjs --check` at merge.
- If an AC1/AC5 literal disagrees with the engine on main, that is a real finding: stop and raise
  triage rather than editing the literal to match.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0240` (e.g. `T-0240 UF-10.1 UF-11.1: pin timed hard sets in balance and check-in`).

## Build / accept log
