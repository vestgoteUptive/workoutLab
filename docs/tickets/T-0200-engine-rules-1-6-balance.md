---
id: T-0200
title: "Engine: rules 0–6 (normalise, mapping, hard sets, window, targets, deficit, recovery) + balance() (rule 11), purity lint, simulated 14-day histories"
lane: engine
screens: [UF-10.1, UF-10.2, UF-02.1]
decisions: [D-0004, D-0013, D-0015, D-0022, D-0023, D-0024, D-0027, D-0034]
deps: [T-0101]
status: ready
---
## Why
`balance()` is the data behind UF-10 Balance and the C-01 body map on UF-02.1, and rules 1–6 feed every later engine ticket (T-0201 session building, T-0202 adaptive targets, T-0204, T-0205). This is the critical path. `docs/engine-rules.md` v1 (T-0101, D-0027) makes every rule testable with fixed inputs, and principle 3 (deterministic engine) requires pure functions with no clock and no randomness. The ticket also folds in the board follow-ups: rule 3 excludes `deleted_at` sets (D-0015); the balance() output per `docs/specs/uf-10-balance.md`; the NFR-SYNC-2 "tombstone adds 0 load" engine test (`docs/specs/non-functional.md`, T-0005); the engine lint rule banning `Date.now()`/`Math.random()`/`new Date()`; and replacing the `@placeholder` engine test (D-0023 rule 4).

## Scope
- In:
  - `packages/engine/src`: types (D-0034 §1), history normalisation (rule 0), area mapping (rule 1), hard sets (rule 2), the local-calendar window (rule 3), `deriveTargets` (rule 4), deficit and attention (rule 5), recovery (rule 6), `balance()` (rule 11).
  - Public exports from `src/index.ts`, with these names (T-0201/T-0202 import them): `normalizeHistory`, `primaryAreas`, `isHardSet`, `localDate`, `windowOf`, `areaLoads`, `deriveTargets`, `recoveringAreas`, `balance`, `AREAS` (the fixed order) and the D-0034 types.
  - The purity lint rule in `packages/engine/eslint.config.mjs`, scoped to `src/**` (D-0034 §8).
  - Test fixtures: F-tz, F-targets, library L1 plus the warm-up moves, and 4 simulated histories in `test/fixtures/histories.ts` (D-0034 §9).
  - Every example R0-E1, R0-E2, R1-E1, R2-E1, R3-E1…E4, R4-E1…E5, R5-E1…E4, R6-E1, R6-E2 and R11-E1…E4 (22 ids) as unit tests. Each test title starts with its id.
  - One sentence added to rule 0 of `docs/engine-rules.md`: the equal-`edited_at` tie-break (named by D-0034 §3).
  - Edge cases: zero history, returning after 10 days off, offline-merged history (queue ∪ server, replays, tombstones), DST change inside the window, a set placed by `completed_at` even when edited later, future-dated sets, and a stale library.
  - Removing the bootstrap placeholder test (D-0023 rule 4).
- Out:
  - `suggest`, the eligible-exercise predicate, R0-E1 applied to `suggest`, time budget, warm-up, energy and time check (rules 7, 8 and 10: T-0201). "Time running out" (rule 8) is therefore not tested here. UF-10 is never shown in a workout.
  - Adaptive targets / `evaluateCheckin` (rule 9: T-0202), swaps and shuffle (T-0204), pre-fill (T-0205).
  - Running the simulated histories through `suggest`/`evaluateCheckin` (T-0201/T-0202 reuse the fixtures).
  - OpenAPI/`packages/shared` types (T-0102), the Edge Function (T-0203), UI (T-0307).
  - Recency weighting or decay (none in v1).

## Acceptance criteria
Fixtures unless stated: F-tz (`tz = Europe/Stockholm`, `now = "2026-09-27T12:00:00+02:00"`, D = 2026-09-27, window 2026-09-14…2026-09-27), F-targets (chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12, all `source: default`, `updatedAt: "2026-08-02T10:00:00Z"`), library L1 from `docs/engine-rules.md`. "N sets of X on DATE" means N hard sets (`isWarmup: false`, `deletedAt: null`, distinct `clientId`s) at 10:00 local on that date. Each AC is at least one Vitest test in `packages/engine/test/**`.

**Rule 0: normalisation and purity**
- AC1 (R0-E2) Given rows `c1` (back-squat, `editedAt` 10:00, reps 8), `c1` (`editedAt` 10:05, reps 6), `c2` (`editedAt` 10:00, live) and `c2` (`editedAt` 10:05, `deletedAt` 10:05), When `normalizeHistory` runs, Then it returns exactly one `c1` row, with reps 6, and no `c2` row. Input order reversed gives the same result.
- AC2 (NFR-SYNC-2: a tombstone adds 0 load) Given a server row `c1` = 1 back-squat set on 2026-09-25 (`editedAt` 10:00) and a queued row `c1` with `pending: true`, `editedAt` 10:05 and `deletedAt` 10:05, When `balance()` runs, Then quads, glutes, hamstrings and core all have load 0, all `days` are 0, `contributors` is `[]` and `lastTrainedDate` is null. When the queued tombstone appears twice (a replay), Then the result is deep-equal. When a further queued row `c1` (`editedAt` 10:10, `deletedAt` null) is added, Then quads load is 1.
- AC3 (equal `edited_at`, D-0034 §3) Given a server row `c1` (1 back-squat set on 09-25, `editedAt` 10:00, live) and a queued row `c1` (`pending: true`, `editedAt` 10:00, `deletedAt` set), When `balance()` runs, Then quads load is 1 (the server row wins). Given two queued rows `c1` with equal `editedAt`, one live and one tombstoned, in either order, Then quads load is 0.
- AC4 (R0-E1 applied to `balance`) Given F-tz, F-targets, L1 and the "balanced" history (AC29), When `balance()` runs twice, Then the results are deep-equal. When every input is deep-frozen (`Object.freeze`, recursively), Then it doesn't throw and the result is unchanged. When the history array is reversed, Then the result is deep-equal.
- AC5 (purity lint) Given `packages/engine/eslint.config.mjs`, When ESLint (Node API, `lintText` with `filePath` under `src/`) checks each of `Date.now()`, `Date()`, `new Date()` and `Math.random()`, Then each one reports exactly one `no-restricted-syntax` error. When it checks `new Date("2026-09-27T12:00:00+02:00")` and `new Date(0)` under `src/`, or `Date.now()` under `test/`, Then there are 0 errors. `pnpm --filter @workoutlab/engine lint` passes on the finished `src/`.

**Rule 1: mapping**
- AC6 (R1-E1) Given 1 back-squat set on 09-25, When `areaLoads` runs, Then it returns quads 1, glutes 1, hamstrings 0.5, core 0.5 and 0 for the other 5 areas. `primaryAreas(back-squat)` returns `["glutes", "quads"]` (fixed order), and `primaryAreas(bench-press)` returns `["chest"]`.

**Rule 2: hard sets**
- AC7 (R2-E1) Given 6 hard sets and 2 `isWarmup: true` sets of back-squat on 2026-09-25, Then quads 6, glutes 6, hamstrings 3, core 3. Given 2 sets (`isWarmup: false`) of `wu-bodyweight-squat` (kind `warmup`) on 09-25, Then quads and glutes gain 0. Given 2 sets of an `exerciseId` that isn't in the library, Then every load is unchanged and it isn't in any `contributors` (D-0034 §4).

**Rule 3: window**
- AC8 (R3-E1) Given 1 back-squat set at `2026-09-14T23:59:00+02:00` and 1 at `2026-09-13T23:59:00+02:00`, When `now` = F-tz, Then quads load is 1 (only the 09-14 set). When `now` = `2026-09-28T00:00:00+02:00`, Then quads load is 0 and `windowStart` is `2026-09-15`.
- AC9 (R3-E2) Given 1 back-squat set at `2026-09-26T22:30:00Z`, Then quads `days[13]` = 1 and `days[12]` = 0.
- AC10 (R3-E3) Given 3 back-squat sets on 09-25 with one tombstoned, Then quads load is 2.
- AC11 (R3-E4, zero history) Given `history = []`, Then all 9 loads are 0 and every `days` is 14 zeros.
- AC12 (DST inside the window) Given `now = "2026-11-06T12:00:00+01:00"` and back-squat sets at `2026-10-23T21:30:00Z`, `2026-10-23T22:30:00Z`, `2026-10-25T01:30:00Z` and `2026-11-06T10:59:00Z`, Then `windowStart` is `2026-10-24`, `windowEnd` is `2026-11-06`, quads load is 3, and quads `days[0]` = 1, `days[1]` = 1, `days[13]` = 1 (the 10-23 local set is excluded).
- AC13 (placement by `completed_at` only) Given 1 back-squat set with `completedAt` `2026-09-13T23:59:00+02:00` and `editedAt` `2026-09-20T10:00:00+02:00`, Then quads load is 0. Given 1 back-squat set with `completedAt` `2026-09-28T09:00:00+02:00` (a future local day), Then quads load is 0 and every `days` value is 0.

**Rule 4: targets**
- AC14 (R4-E1…E5) `deriveTargets({rhythmMin, rhythmMax, priorityAreas})` returns all 9 areas as integers: 3–4 with no priorities → chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12. 3–4 with priorities [back, hamstrings, arms] → back 25, hamstrings 20, arms 15, everything else unchanged from R4-E1. 2–3 → back 14, shoulders 11, arms 9. 1–1 → back 10, shoulders 8, arms 6. 7–7 → back 30, arms 18. 7–7 with priority back → back 38.

**Rule 5: deficit and attention**
- AC15 (R5-E1, returning after 10 days off) Given only 4 romanian-deadlift sets on 2026-09-17, Then hamstrings has deficit 0.75, `lastTrainedDate` `2026-09-17` and `needsAttention` true. Glutes has deficit 0.9 and `needsAttention` true. Chest has deficit 1, `lastTrainedDate` null and `needsAttention` true.
- AC16 (R5-E2) Given the same 4 sets on 2026-09-23 only, Then hamstrings and glutes have `needsAttention` false, and chest has true.
- AC17 (R5-E3, boundary) Given 8 leg-curl sets on 2026-09-21, Then hamstrings has deficit 0.5 and `needsAttention` true. Adding 1 back-squat set on 2026-09-21 (load 8.5, deficit 0.46875) → `needsAttention` false. Moving the 8 leg-curl sets to 2026-09-22 (5 days) → `needsAttention` false.
- AC18 (R5-E4, zero history) Given `history = []`, Then every deficit is 1 and every `needsAttention` is false.

**Rule 6: recovery**
- AC19 (R6-E1, R6-E2) Given 6 back-squat sets at `now − 47 h`, When `recoveringAreas` and `balance()` run, Then quads and glutes are recovering, and hamstrings (3) and core (3) are not. At `now − 49 h`, nothing is recovering.
- AC20 (absolute clock, boundaries) Given 6 back-squat sets at exactly `2026-09-25T12:00:00+02:00` (`now − 48 h`), Then quads is not recovering. At `2026-09-25T12:00:01+02:00`, it is. Given 6 sets at `now + 1 min`, Then nothing is recovering. Given `now = "2026-10-26T12:00:00+01:00"` (after the DST change), 6 sets at `2026-10-24T12:30:00+02:00` (48.5 h) → quads is not recovering, and at `2026-10-24T13:30:00+02:00` (47.5 h) → quads is recovering.

**Rule 11: balance()**
- AC21 (shape) Given F-history and F-targets, but with hamstrings `source: adapted`, `updatedAt: "2026-09-20T08:00:00Z"`, When `balance()` runs, Then the result has `windowStart` `2026-09-14`, `windowEnd` `2026-09-27`, `computedAt` === the `now` string, and exactly 9 areas with unique `area` values. Each area has `area, load, target, targetSource, targetUpdatedAt, deficit, coverageStep, needsAttention, recovering, lastTrainedDate, days (length 14), contributors`. Hamstrings has `targetSource` `adapted` and `targetUpdatedAt` `2026-09-20T08:00:00Z`.
- AC22 (R11-E1, coverage steps) Given a quads target of 20 and quads loads 0, 6, 7, 14, 20 and 24 (from back-squat sets), Then `coverageStep` is 0, 1, 2, 3, 4 and 4. With a target of 100 (a test-only target), loads 33 → 2 and 66 → 3. With the hamstrings target of 16, load 0.5 (1 back-squat set) → 1.
- AC23 (R11-E2) Given 4 romanian-deadlift sets on 09-20 and 4 back-squat sets on 09-25, Then hamstrings has load 6, deficit 0.625, `lastTrainedDate` `2026-09-25`, `days[6]` = 4, `days[11]` = 2, and `contributors` = `[{exerciseId: "romanian-deadlift", weightedSets: 4, lastDate: "2026-09-20"}, {exerciseId: "back-squat", weightedSets: 2, lastDate: "2026-09-25"}]`.
- AC24 (R11-E3) Given the AC15 history and `now = "2026-10-01T12:00:00+02:00"`, Then hamstrings has load 0, all 14 `days` are 0, `lastTrainedDate` is `2026-09-17`, and every area has `needsAttention` false (the window holds no hard sets).
- AC25 (R11-E4, offline) Given the AC23 server history plus 3 queued (`pending: true`) romanian-deadlift sets at `2026-09-27T09:00:00+02:00`, Then hamstrings is 9 (6 + 3) and glutes is 7.5 (6 + 1.5), and the romanian-deadlift contributor has 7 weighted sets with `lastDate` `2026-09-27`.
- AC26 (area order) Given the AC23 history, Then `areas` are in the order chest, back, shoulders, arms, calves (needsAttention, deficit 1, fixed order), core (0.8333…), quads (0.8), glutes (0.7), hamstrings (0.625).
- AC27 (contributor ties) Given 3 lat-pulldown and 3 seated-cable-row sets on 09-25, Then back `contributors` are lat-pulldown then seated-cable-row ("Lat pulldown" < "Seated cable row"). Given two library exercises with the same name and weighted sets, Then they're ordered by id ascending. The sort doesn't call `localeCompare` (D-0034 §5).
- AC28 (invalid targets) Given targets missing calves, or with chest `setsPer14d` 0 or 12.5, When `balance()` runs, Then it throws `RangeError`.

**Simulated 14-day histories** (`test/fixtures/histories.ts`, each through `balance()` at F-tz unless stated)
- AC29 (balanced) Seven sessions on 09-15, 09-17, 09-19, 09-21, 09-23, 09-25 and 09-27 at 10:00, each with bench-press 3, barbell-row 3, back-squat 3, overhead-press 2, romanian-deadlift 2, calf-raise 2, biceps-curl 2 and dead-bug 2 sets. Then the loads are chest 21, back 21, shoulders 24.5, arms 42, core 31.5, glutes 28, quads 21, hamstrings 24.5 and calves 14. Every area has deficit 0, `coverageStep` 4, `needsAttention` false and `lastTrainedDate` `2026-09-27`, so `areas` are in the fixed order. Only arms is recovering (6 in the 09-27 session). Arms `contributors` are biceps-curl 14, barbell-row 10.5, bench-press 10.5 (the tie is broken by name) and overhead-press 7.
- AC30 (all chest, no legs) Six sessions on 09-16, 09-18, 09-20, 09-22, 09-24 and 09-26 at 18:00, each with bench-press 4, db-bench-press 3 and push-up 3 sets. Then chest 60, shoulders 21, arms 30 and core 9, and the other areas 0. back, glutes, quads, hamstrings and calves have deficit 1, `lastTrainedDate` null and `needsAttention` true. Core has deficit 0.25 and false. The order is back, glutes, quads, hamstrings, calves, core, chest, shoulders, arms. Only chest is recovering. `coverageStep` is chest/shoulders/arms 4, core 3 and the others 0.
- AC31 (returning after 10 days off) The AC29 session template on 09-03, 09-06, 09-09 and 09-12, then 3 back-squat sets on 09-15 and 4 romanian-deadlift sets on 09-17. Then quads 3, glutes 5, hamstrings 5.5 and core 1.5, and the others 0. `lastTrainedDate` is 09-12 for chest, back, shoulders, arms and calves, 09-15 for quads and core, and 09-17 for glutes and hamstrings. Every area has `needsAttention` true. The order is chest, back, shoulders, arms, calves, core, quads, glutes, hamstrings. Hamstrings has `days[1]` = 1.5, `days[3]` = 4 and `coverageStep` 2. At `now = "2026-10-01T12:00:00+02:00"`, every load is 0, every `needsAttention` is false, the order is the fixed order, and `lastTrainedDate` is still 09-17 (hamstrings), 09-15 (quads) and 09-12 (chest).
- AC32 (offline-merged) The AC30 server rows plus a queue (`pending: true`) holding (a) 3 romanian-deadlift sets at `2026-09-27T09:00:00+02:00`, (b) a tombstone (newer `editedAt`) for one 09-26 bench-press set, and (c) an identical replay (same `clientId` and `editedAt`) of one 09-26 push-up set. Then chest 59, shoulders 20.5, arms 29.5, core 9, hamstrings 3 and glutes 1.5. Chest `days[12]` = 9. Chest is still recovering. The order is back, quads, calves, glutes, hamstrings, core, chest, shoulders, arms.
- AC33 (invariants) For each of the 4 histories plus `[]`, at `now` ∈ {F-tz, `2026-09-28T00:00:00+02:00`, `2026-10-01T12:00:00+02:00`}, Then for every area: Σ `days` = `load` = Σ `contributors.weightedSets` (±1e-9); `deficit` = `max(0, target − load) / target`; `coverageStep` matches rule 11; `days.length` = 14; and running twice gives deep-equal results.

**Housekeeping**
- AC34 (placeholder and traceability) Given the finished branch, When `packages/engine` is searched for `@placeholder`, and for `expect(true)`, `expect(1)`, `expect("x")`, `expect(null)` or `expect(undefined)`, Then there are 0 matches (D-0023 rule 4). When the test titles in `packages/engine/test/**` are searched, Then each of the 22 ids R0-E1, R0-E2, R1-E1, R2-E1, R3-E1…E4, R4-E1…E5, R5-E1…E4, R6-E1, R6-E2 and R11-E1…E4 appears in at least one `it(`/`test(` title.
- AC35 (public API) Given `import { normalizeHistory, primaryAreas, isHardSet, localDate, windowOf, areaLoads, deriveTargets, recoveringAreas, balance, AREAS } from "@workoutlab/engine"` in a test, Then it typechecks under the package's strict tsconfig, and `AREAS` deep-equals `["chest","back","shoulders","arms","core","glutes","quads","hamstrings","calves"]`.
- AC36 (contract sentence) Given `docs/engine-rules.md` rule 0, Then it contains the equal-`edited_at` tie-break from D-0034 §3 and cites D-0034. No other rule text changes.

## Paths you may change
`packages/engine/**` (engine lane: `src/**`, `test/**`, `eslint.config.mjs`, `tsconfig*.json`). `docs/engine-rules.md`: only the rule-0 sentence named by D-0034 §3 (engine owns this contract). Don't add dependencies to `packages/engine/package.json`, because that changes `pnpm-lock.yaml` (infra). The AC5 test imports `eslint` from the root workspace install. If that doesn't resolve, raise a follow-up to infra rather than editing the lockfile.

## Contract impact
`docs/engine-rules.md`: one sentence in rule 0 (the equal-`edited_at` tie-break), named by D-0034. Otherwise none: T-0200 implements rules 0–6 and 11 as written in v1 (D-0027, D-0013, D-0015).

## Coordination
- T-0004 (infra, doing) adds `// @placeholder T-0200` to `packages/engine/test/index.test.ts`. T-0200 deletes or replaces that file. Merge T-0004 first, or resolve the conflict by dropping the file. Once T-0004 lands, its placeholder check fails any `t/T-0200-*` branch that still has the marker.
- The balance() shape here is what T-0102 mirrors in `/balance` and T-0307 renders.

## Definition of done
Tests for every AC pass · the 22 Rn-Em ids and the 4 simulated histories are covered · `pnpm -w typecheck lint test` green (run as `npx -y pnpm@10.28.2 -w typecheck lint test`) · the contract change is linked to D-0034 · commit messages start with `T-0200` and cite UF-10.1/UF-10.2 where relevant.
