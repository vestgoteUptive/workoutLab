---
id: T-0202
title: "Engine: adaptive targets / plan check-in (rule 9: evaluateCheckin, checkinSessions) + simulated 14-day histories through evaluateCheckin; engine-rules.md plan_updated_at → plan_changed_at"
lane: engine
screens: [UF-11.1, UF-11.2, UF-02.1]
decisions: [D-0002, D-0018, D-0027, D-0034, D-0035, D-0036, D-0037, D-0041]
deps: [T-0200]
status: ready
---
## Why
Principle 4 says targets adapt to what the user actually does, and never silently. Rule 9 of `docs/engine-rules.md` (D-0018, D-0027) is the pure function behind the UF-11.1 check-in card on UF-02.1 Today, and behind "Next check-in: {date}" on UF-11.2 Plan. T-0308 (web-feature:UF-07) can't build UF-11 without it. Principle 3 means the proposal has to be recomputed from the same inputs every time. The engine is stateless and runs on the device, so it also works offline (D-0037 §2). This ticket also does three things. It renames `plan_updated_at` → `plan_changed_at` in the engine contract, because D-0035 found no `plan_updated_at` column and D-0041 names the edit. It returns the `CheckinEvaluation` shape from D-0037 §8. It runs the simulated histories from T-0200 through `evaluateCheckin`, as engine-rules §Required tests asks. D-0041 fixes the build defaults that rule 9 leaves open.

## Scope
- In:
  - `packages/engine/src`: `evaluateCheckin(sessions, profile, checkins, now, tz)` per rule 9 and D-0041 §2 and §4–6. It exports the types `CheckinSession`, `CheckinProfile`, `CheckinAnswer` (`{answeredAt: Instant | null}`), `CheckinPeriod` and `CheckinEvaluation` (D-0037 §8 shape).
  - `checkinSessions(sessions, history, library)` (D-0041 §3). It reuses `normalizeHistory` and `isHardSet` (D-0036 §2).
  - Public exports from `src/index.ts`: `evaluateCheckin`, `checkinSessions` and the types above.
  - Every example R9-E1…R9-E13 as unit tests. The UF-11 spec ACs they map to (AC1–5, AC7 engine part, AC8, AC11–14) are included, plus UF-11 AC6 and AC16 (statelessness and determinism) and AC17 (ceiling). Each test title starts with its R9 id or `UF-11 ACn`.
  - The simulated-history suite extended to `evaluateCheckin`, reusing `test/fixtures/histories.ts` unchanged.
  - The three text edits to `docs/engine-rules.md` named by D-0041 §1.
  - Edge cases:
    - zero history
    - returning after 10 days off
    - long absence (at least 28 days)
    - offline-merged history (queued sets, tombstones, replays)
    - a session across midnight
    - DST inside a period
    - `now` before onboarding
    - unanswered check-in rows
    - exact threshold boundaries.
- Out:
  - Running the simulated histories through `suggest`, and the 15- and 90-minute budget cases from engine-rules §Required tests. Both go to T-0201, because they need rule 7.
  - The card, its copy, the offline-disabled Accept and Keep, and UF-11.2/UF-11.3 UI (T-0308).
  - Writing `plan_checkins` rows and changing rhythm or targets on Accept (T-0308 plus the data lane). The engine never changes targets.
  - An API path for check-in (D-0037 §2: none in v1).
  - Moving the engine types to `@workoutlab/shared` (a follow-up).
  - "Time running out" (rule 8). It doesn't apply here: the check-in is never shown during a workout (UF-11 AC9 is a UI test in T-0308).

## Acceptance criteria
**Fixtures, unless an AC says otherwise.** Each AC is at least one Vitest test in `packages/engine/test/**`.

- **F-checkin:** `tz = Europe/Stockholm`; profile `{rhythmMin: 3, rhythmMax: 4, priorityAreas: [], onboardedAt: "2026-08-02T10:00:00+02:00", planUpdatedAt: "2026-08-02T10:00:00+02:00"}`; `checkins = []`.
- **Periods:**

  | Period | Local days |
  |---|---|
  | P0 | 08-02–08-15 |
  | P1 | 08-16–08-29 |
  | P2 | 08-30–09-12 |
  | P3 | 09-13–09-26 |
  | P4 | 09-27–10-10 |
  | P5 | 10-11–10-24 |
  | P6 | 10-25–11-07 |

  All dates are 2026.
- **"Pk = n"** means n `CheckinSession`s with `hardSetCount: 3`, one per local day from the period's first day at 10:00 local. Past the 14th session, they wrap to 18:00 on the same days. Unless stated, P0 = P1 = 7 (on plan) and the other periods are empty.
- **"On DATE"** means `now = DATE` at 12:00 local (`+02:00` before 2026-10-25, `+01:00` from then on).
- **"period (i, n, s)"** is `{index: i, start, end, completed: n, status: s}`, where start and end are Pi's dates as `YYYY-MM-DD`.
- **Preview targets (T):** `T(r)` is `previewTargets` for rhythm r with no priorities: 9 `{area, setsPer14d}` entries in the fixed order (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves).

  | Rhythm | chest | back | shoulders | arms | core | glutes | quads | hamstrings | calves |
  |---|---|---|---|---|---|---|---|---|---|
  | T(2–3) | 14 | 14 | 11 | 9 | 9 | 14 | 14 | 11 | 9 |
  | T(4–5) | 26 | 26 | 21 | 15 | 15 | 26 | 26 | 21 | 15 |
  | T(7–7) | 30 | 30 | 24 | 18 | 18 | 30 | 30 | 24 | 18 |
  | T(1–1) | 10 | 10 | 8 | 6 | 6 | 10 | 10 | 8 | 6 |

**Rule 9 examples (R9-E1…E13 = UF-11 spec ACs)**
- AC1 (R9-E1, UF-11 AC1: under twice → lower)
  - Given P2 = 4 and P3 = 3, When `evaluateCheckin` runs on 2026-09-27, Then the result deep-equals `{periods: [(2, 4, under), (3, 3, under)], proposal: {direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: T(2–3)}, nextCheckinDate: "2026-10-11"}`.
  - Its keys are exactly `periods`, `proposal` and `nextCheckinDate`.
- AC2 (R9-E2, UF-11 AC2: one low period after 10 days off → nothing)
  - Given P2 = 7 and P3 = 2, When it runs on 2026-09-27, Then `periods` = [(2, 7, on_plan), (3, 2, under)] and `proposal` is null.
  - Given P4 = 3 as well, When it runs on 2026-10-11, Then `periods` = [(3, 2, under), (4, 3, under)], the proposal is down 2–3 with T(2–3), and `nextCheckinDate` is `2026-10-25`.
- AC3 (R9-E3, UF-11 AC3: threshold)
  - Given P2 = P3 = 5, on 2026-09-27, Then both are `on_plan` and `proposal` is null.
  - Given P2 = P3 = 4, Then both are `under` and the proposal is down 2–3.
- AC4 (R9-E4, UF-11 AC4: over twice → higher)
  - Given P2 = 9 and P3 = 10, on 2026-09-27, Then both are `over` and `proposal` = `{direction: "up", rhythmMin: 4, rhythmMax: 5, previewTargets: T(4–5)}`.
  - Given P2 = 9 and P3 = 8, Then the statuses are [over, on_plan] and `proposal` is null.
- AC5 (R9-E5, UF-11 AC5: mixed) Given P2 = 3 and P3 = 9, on 2026-09-27, Then the statuses are [under, over] and `proposal` is null.
- AC6 (R9-E6, UF-11 AC7 engine part: after Accept)
  - Given:
    - AC1's sessions plus P4 = 3
    - profile rhythm 2–3 with `planUpdatedAt` `2026-09-27T12:05:00+02:00`
    - `checkins = [{answeredAt: "2026-09-27T12:05:00+02:00"}]`
  - When it runs on 2026-10-11, Then `periods` = [(4, 3, on_plan)] (30 < 28 is false), `proposal` is null and `nextCheckinDate` is `2026-10-25`.
- AC7 (R9-E7, UF-11 AC8: Keep resets the streak)
  - Given AC1's sessions and `checkins = [{answeredAt: "2026-09-27T12:05:00+02:00"}]` with the profile unchanged:
    - At `now = "2026-09-27T12:10:00+02:00"`, Then `periods` = [] and `proposal` is null.
    - Given P4 = 3, on 2026-10-11, Then `periods` = [(4, 3, under)] and `proposal` is null.
    - Given P5 = 2 as well, on 2026-10-25, Then `periods` = [(4, 3, under), (5, 2, under)], the proposal is down 2–3, and `nextCheckinDate` is `2026-11-08`.
- AC8 (R9-E8, UF-11 AC11: zero history, new user)
  - Given `onboardedAt` = `planUpdatedAt` = `2026-09-20T10:00:00+02:00` and `sessions = []`:
    - On 2026-09-27, Then `periods` = [], `proposal` is null and `nextCheckinDate` is `2026-10-04`.
    - On 2026-10-18, Then `periods` = [{index 0, start 2026-09-20, end 2026-10-03, completed 0, under}, {index 1, start 2026-10-04, end 2026-10-17, completed 0, under}], the proposal is down 2–3, and `nextCheckinDate` is `2026-11-01`.
- AC9 (R9-E9, UF-11 AC12: floor)
  - Given rhythm 1–1, P2 = P3 = 0, on 2026-09-27, Then both periods are `under` (0 < 1.4) and `proposal` is null.
  - Given rhythm 1–2 and the same sessions, Then `proposal` = `{direction: "down", rhythmMin: 1, rhythmMax: 1, previewTargets: T(1–1)}`.
- AC10 (R9-E10, UF-11 AC13: session counting)
  - Given P2 = 7 and exactly these P3 sessions, built by `checkinSessions` from `{id, startedAt}` rows and the history:
    - `wu`, started `2026-09-15T10:00:00+02:00`: 3 back-squat sets with `isWarmup: true`, and 2 `wu-bodyweight-squat` sets with `isWarmup: false`
    - `mid`, started `2026-09-26T23:40:00+02:00`: 4 back-squat hard sets completed at 23:45, 23:55, 00:10 and 00:25 local (the last two are on 09-27)
    - `a`, started `2026-09-20T09:00:00+02:00`: 3 bench-press sets
    - `b`, started `2026-09-20T18:00:00+02:00`: 2 leg-curl sets
  - Then `hardSetCount`s are [0, 4, 3, 2] in input order.
  - On 2026-09-27, `periods` = [(2, 7, on_plan), (3, 3, under)] and `proposal` is null.
  - Given `mid` started at `2026-09-26T22:30:00Z` instead (00:30 local on 09-27), Then P3 completed is 2.
- AC11 (R9-E11, UF-11 AC14: long absence) Given P2 = 2, P3 = 0 and P4 = 0, on 2026-10-11, Then `periods` = [(3, 0, under), (4, 0, under)] (P2 isn't listed) and `proposal` is one object: down 2–3.
- AC12 (R9-E12: mid-period reset)
  - Given P2 = 4, P3 = 3, P4 = 3, P5 = 2 and `checkins = [{answeredAt: "2026-09-30T19:00:00+02:00"}]`:
    - On 2026-10-25 (`+01:00`), Then `periods` = [(4, 3, under), (5, 2, under)] and the proposal is down 2–3.
    - On 2026-10-11, Then `periods` = [(4, 3, under)] and `proposal` is null.
- AC13 (R9-E13: edit plan resets)
  - Given P2 = 4, P3 = 3 and `planUpdatedAt` `2026-09-20T10:00:00+02:00`, on 2026-09-27, Then `periods` = [(3, 3, under)] and `proposal` is null.
  - With `planUpdatedAt` `2026-09-12T10:00:00+02:00` (P2's last day, so end ≥ resetDate), Then the result equals AC1's.

**Other UF-11 spec ACs**
- AC14 (UF-11 AC17: ceiling)
  - Given rhythm 6–7 and P2 = P3 = 16, on 2026-09-27, Then both are `over` (160 > 154) and `proposal` = `{direction: "up", rhythmMin: 7, rhythmMax: 7, previewTargets: T(7–7)}`.
  - Given rhythm 7–7 and the same sessions, Then both are `over` and `proposal` is null.
  - Given rhythm 6–7 and P2 = P3 = 15, Then both are `on_plan`.
- AC15 (UF-11 AC6 and AC16: never silent, deterministic)
  - Given AC1's inputs, recursively deep-frozen, When `evaluateCheckin` runs on each of 2026-09-27, 09-28, 09-29, 09-30 and 10-01:
    - Then it doesn't throw.
    - The inputs deep-equal an unfrozen copy.
    - Every result has `proposal` down 2–3 and the same `periods`.
  - Running twice gives deep-equal results.
  - Reversing `sessions` and `checkins` gives deep-equal results.

**Build defaults (D-0041)**
- AC16 (exact thresholds, §5)
  - Given rhythm 5–5, on 2026-09-27:
    - P2 = P3 = 7 → both `on_plan` (70 < 70 is false)
    - P2 = P3 = 6 → both `under`, proposal down 4–4
    - P2 = P3 = 11 → both `on_plan` (110 > 110 is false)
    - P2 = P3 = 12 → both `over`, proposal up 6–6
- AC17 (when a period has ended)
  - Given P2 = 4 and P3 = 3:
    - At `now = "2026-09-26T23:59:00+02:00"`, Then `periods` = [(1, 7, on_plan), (2, 4, under)], `proposal` is null and `nextCheckinDate` is `2026-09-27`.
    - At `"2026-09-27T00:00:00+02:00"`, and at `"2026-09-26T22:30:00Z"` (00:30 local), Then the result equals AC1's.
- AC18 (reset inputs, §2 and §6). Given AC1's sessions, on 2026-09-27:
  - (a) `checkins = [{answeredAt: null}]` → equals AC1.
  - (b) `[{answeredAt: "2026-09-12T20:00:00+02:00"}]` → equals AC1 (P2 ends 09-12 ≥ 09-12).
  - (c) `[{answeredAt: "2026-09-12T22:30:00Z"}]` (local 09-13) → `periods` = [(3, 3, under)] and `proposal` is null.
  - (d) `[{answeredAt: "2026-09-13T08:00:00+02:00"}, {answeredAt: "2026-08-20T08:00:00+02:00"}]`, in both orders → equals (c).
- AC19 (before onboarding, outside every period, empty sessions)
  - Given `onboardedAt` `2026-09-20T10:00:00+02:00`:
    - At `now = "2026-09-19T12:00:00+02:00"`, Then `periods` = [], `proposal` is null and `nextCheckinDate` is `2026-10-04`.
    - The same holds at `"2026-09-20T08:00:00+02:00"`.
  - Given F-checkin with P0 = P1 = 0, plus 9 sessions (`hardSetCount` 3) on 2026-08-01, on 2026-08-30, Then `periods` = [(0, 0, under), (1, 0, under)] and the proposal is down 2–3.
  - Given P2 = 4 plus 9 sessions in P2 with `hardSetCount` 0, Then P2 completed is 4.
- AC20 (DST inside a period)
  - Given:
    - P5 = 2, plus a session at `2026-10-24T21:30:00Z` (23:30 CEST on 10-24)
    - a session at `2026-10-24T22:30:00Z` (00:30 CEST on 10-25) and one at `2026-11-01T10:00:00+01:00`
  - When it runs on 2026-11-08, Then:
    - `periods` = [{index 5, start 2026-10-11, end 2026-10-24, completed 3, under}, {index 6, start 2026-10-25, end 2026-11-07, completed 2, under}]
    - the proposal is down 2–3
    - `nextCheckinDate` is `2026-11-22`.
- AC21 (previewTargets with priorities)
  - Given AC1's sessions and `priorityAreas: ["back", "hamstrings", "arms"]`, Then `previewTargets` = chest 14, back 18, shoulders 11, arms 11, core 9, glutes 14, quads 14, hamstrings 14, calves 9, in the fixed order.
  - Each entry has exactly the keys `area` and `setsPer14d`.
- AC22 (validation, §6) Each of these makes `evaluateCheckin` throw `RangeError`:
  - `hardSetCount` of -1, 1.5 or `NaN`
  - `startedAt` `"2026-09-20T10:00:00"` (no offset)
  - `now` without an offset
  - `answeredAt` `"2026-09-20"`
  - `rhythmMin` 0
  - `rhythmMin` 5 with `rhythmMax` 4
- AC23 (`checkinSessions`, §3)
  - Given sessions `[s1, s2, s3, s4]` and this history:
    - `s1`: 2 back-squat hard sets and 1 set of unknown `exerciseId` `"not-in-library"`
    - `s2`: 1 bench-press server row, tombstoned by a queued row (`pending: true`, newer `editedAt`)
    - `s3`: 1 leg-curl server row plus an identical queued replay
    - `s4`: no rows
    - 3 sets with `sessionId` `"orphan"`, which isn't in the list
  - Then the result is `[{id: s1, startedAt: s1.startedAt, hardSetCount: 2}, {s2, 0}, {s3, 1}, {s4, 0}]`.
  - Reversing the history gives a deep-equal result.

**Simulated 14-day histories** (`test/fixtures/histories.ts`, unchanged)
- AC24 (through `evaluateCheckin`)
  - Setup: each history becomes one `{id, startedAt}` per distinct `sessionId`, in first-appearance order, where `startedAt` is the earliest `completedAt` of its rows, tombstones included. These go through `checkinSessions` with `LIBRARY`, then through `evaluateCheckin` with F-checkin.
  - On 2026-09-27:
    - balanced: 7 sessions, each `hardSetCount` 19; `periods` = [(2, 0, under), (3, 6, on_plan)]; `proposal` null; `nextCheckinDate` `2026-10-11`.
    - allChestNoLegs: 6 sessions of 10; the same `periods` and null.
    - returningAfter10Days: counts [19, 19, 19, 19, 3, 4]; `periods` = [(2, 4, under), (3, 2, under)]; proposal down 2–3 with T(2–3).
    - offlineMerged: 7 sessions (the 09-26 session has 9, the queued 09-27 session has 3, the others 10); `periods` = [(2, 0, under), (3, 6, on_plan)]; null.
  - On 2026-10-11:
    - balanced: [(3, 6, on_plan), (4, 1, under)]; null; `2026-10-25`.
    - allChestNoLegs: [(3, 6, on_plan), (4, 0, under)]; null.
    - returningAfter10Days: [(3, 2, under), (4, 0, under)]; down 2–3.
    - offlineMerged: [(3, 6, on_plan), (4, 1, under)]; null.
- AC25 (invariants)
  - Inputs: each of the 4 histories plus `[]`; `now` ∈ {`2026-09-27T12:00:00+02:00`, `2026-10-11T12:00:00+02:00`, `2026-10-25T12:00:00+01:00`, `2026-11-08T12:00:00+01:00`}; rhythm ∈ {1–1, 1–2, 3–4, 5–5, 6–7, 7–7}.
  - Then:
    - `periods.length` ≤ 2, and the indices are ascending and consecutive.
    - For each period: start = onboardDate + 14·index, end = start + 13, and end < D.
    - `completed` = the number of sessions with `hardSetCount` ≥ 1 and local `startedAt` in [start, end].
    - `status` follows §5.
    - `proposal` is non-null only when there are 2 periods with the same non-`on_plan` status. Then 1 ≤ min ≤ max ≤ 7, it equals the ±1 clamp, and it differs from the current rhythm.
    - `nextCheckinDate` = onboardDate + 14·(⌊(D − onboardDate)/14⌋ + 1).
    - A rerun is deep-equal.

**Contract and housekeeping**
- AC26 (D-0041 §1)
  - Given the branch, When a Vitest test reads `docs/engine-rules.md`, Then:
    - `plan_updated_at` occurs 0 times.
    - F-profile contains "`plan_changed_at` 2026-08-02".
    - Rule 9 Reset contains "local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041)".
    - R9-E13 contains "`plan_changed_at` 2026-09-20".
  - `git diff main -- docs/engine-rules.md` changes exactly those 3 lines.
- AC27 (traceability, public API, purity)
  - Test titles in `packages/engine/test/**` include each of R9-E1…R9-E13, and UF-11 AC1–AC8, AC11–AC14, AC16 and AC17. The existing T-0200 id check still passes.
  - `import { evaluateCheckin, checkinSessions, type CheckinSession, type CheckinProfile, type CheckinAnswer, type CheckinEvaluation } from "@workoutlab/engine"` typechecks.
  - An `expectTypeOf` test pins `CheckinEvaluation` to exactly the D-0037 §8 fields. `status` is `"under" | "on_plan" | "over"` and `direction` is `"down" | "up"`.
  - A full `EngineProfile`-shaped object (with `goal`, `level` and `equipment`) is accepted as `profile`.
  - `pnpm --filter @workoutlab/engine lint` passes: there's no clock or randomness in `src/**`.
  - There are 0 `@placeholder` or trivially-true assertions.

## Paths you may change
- `packages/engine/**`: `src/**` and `test/**`. Add new test files, and extend `test/housekeeping.test.ts` for AC26 and AC27. `test/fixtures/histories.ts` stays read-only.
- `docs/engine-rules.md`: only the 3 edits named by D-0041 §1 (the engine lane owns this contract).
- Don't add dependencies. `expectTypeOf` ships with Vitest.

## Contract impact
- `docs/engine-rules.md`: F-profile, rule 9 Reset and R9-E13 get `plan_updated_at` → `plan_changed_at`. D-0041 §1 names the change, per D-0035.
- `CheckinEvaluation` follows D-0037 §8 exactly. `CheckinSession` stays as in D-0037 §6.
- No change to `api/openapi.yaml` or `docs/data-model.md`.

## Coordination
- T-0308 builds `CheckinSession[]` with `checkinSessions` from `sessions` ∪ the offline queue. It takes UF-11.1's `{a}` and `{b}` from `periods[0].completed` and `periods[1].completed`, and `{newMin}–{newMax}` only from `proposal`.
- The board's Engine note "rule 9 / F-profile: plan_updated_at → plan_changed_at" is closed by this ticket.

## Definition of done
- Tests for every AC pass, including all 13 R9 ids and the 4 simulated histories.
- `npx -y pnpm@10.28.2 -w typecheck lint test` is green.
- The contract edit is linked to D-0041.
- Commit messages start with `T-0202` and cite UF-11.1 or UF-11.2 where relevant.
