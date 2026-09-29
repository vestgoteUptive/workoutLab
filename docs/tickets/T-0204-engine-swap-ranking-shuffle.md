---
id: T-0204
title: "Engine: swap ranking (rule 12, rankSwaps) + deterministic shuffle (rule 13) wired into suggest; R12-E1 muscleMatch correction"
lane: engine
screens: [UF-08.2, UF-08.3, UF-05.1]
decisions: [D-0025, D-0034, D-0036, D-0037, D-0039, D-0040, D-0042, D-0056]
deps: [T-0200]
status: done
---
## Why
UF-08.3 says "reason changes ranking" and UF-05.1 replaces an exercise mid-session; both need one ranked list from the engine, so the UI never re-sorts (D-0025). UF-08.2's Shuffle "picks alternates for non-main exercises", and principle 3 says that must be **deterministic**: rule 13 makes `sessionInput.shuffle = n` a counter into a ranked list, with no `Math.random()` anywhere (the T-0200 purity lint already bans it in `packages/engine/src`). T-0201a left `shuffle` ignored (D-0040 §8), so this ticket closes the last selection gap in `suggest`. T-0306 (UF-04/UF-05) and T-0303 (UF-08) are blocked on `rankSwaps`. D-0056 fixes the build gaps rule 12/13 leave open and names one contract correction: R12-E1's `muscleMatch` parenthetical contradicts rule 12's own formula.

## Scope
- In:
  - `packages/engine/src`: `rankSwaps()` per rule 12 and D-0056 §2–§7, and the `SwapCandidate` type (`{exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch}`, D-0037 §2, matching `api/openapi.yaml` `SwapCandidate`). A `muscleMatch()` helper.
  - Rule 13 shuffle inside `suggest`, between greedy selection and energy (D-0056 §8–§12), plus the `swap {reason: null}` item reason on a slot that changed and `shuffle` validation (D-0056 §13).
  - `suggest` passes the slot's previous exercise id and pre-fill weight into the existing first-time pre-fill seam, so T-0205 can add `carry` without another signature change (D-0056 §11).
  - Public exports from `src/index.ts`: `rankSwaps`, `muscleMatch`, `type SwapCandidate`.
  - Every example R12-E1…E5 and R13-E1, R13-E2 as unit tests, each test title starting with its id.
  - The one-line R12-E1 correction in `docs/engine-rules.md` named by D-0056 §1.
  - The simulated 14-day histories (`test/fixtures/histories.ts`, read-only) run through `suggest` with shuffle, and through `rankSwaps` for each reason (definition of done: engine changes need the simulated-history tests).
  - Edge cases in scope: zero history (every candidate never done); returning after 10 days off (`variety` ordering by last-done date); offline-merged history with queued rows, replays and tombstones; recovering areas (a shuffle pick is rejected); a slot with no candidates; a budget where no alternative fits; the main slot; a pinned slot; a timed slot; a library with only one exercise per area.
- Out:
  - Rule 14 pre-fill beyond the T-0201 `first_time` seam, including `carry` on a swapped or shuffled slot (T-0205, D-0056 §11, D-0057).
  - Applying a *user* swap to a stored plan, the UF-08.3 reason chips, "Always use this in <routine>" and the UF-05.1 sheet (T-0303, T-0306). The engine only ranks, and only fills `reason: null` for a shuffle.
  - Any change to `api/openapi.yaml`: `SwapCandidate` and `SwapCandidateList` already carry exactly the rule-12 fields (D-0039 §1). `packages/shared/test/schemas.test.ts` keeps its `0.667` fixture — it asserts schema validity, not engine values (D-0056 §1).
  - Correcting rule 0's `rankSwaps(… tz, now)` argument order (a follow-up, D-0056 §2).
  - Adaptive targets (T-0202), the Edge Function (T-0203), UI (T-03xx), moving the engine types to `@workoutlab/shared` (a follow-up).

## Acceptance criteria
**Fixtures unless an AC says otherwise:** F-tz (`tz = Europe/Stockholm`, `now = "2026-09-27T12:00:00+02:00"`, D = 2026-09-27), F-targets, F-profile (beginner, `equipment` = full), F-input (`budgetMin 30, warmupInBudget true, energy normal, shuffle 0, mainLiftId null, pinnedIds [], excludeIds []`), zero history, and `LIBRARY` (L1 + the `wu-*` moves) from `packages/engine/test/fixtures/common.ts`. "X × n" means an item with `sets = n`. The simulated histories are the T-0200 exports in `test/fixtures/histories.ts`. Each AC is at least one Vitest test in `packages/engine/test/**`, and a test that implements an `Rn-Em` example starts its title with that id.

**F-swap (the rule 12 fixture):** the session is the `Workout` whose `plan.items` are bench-press × 4 (`isMain: true`, `costS` 720), barbell-row × 3 (555) and leg-extension × 2 (270), with `budgetMin 30`, `warmupInBudget true`, `itemsTotalS` 1545 (so `availableS` = 1620 and 75 s are free). The current exercise is `barbell-row` unless stated. Build it with the T-0201 fixture helpers, not by hand-writing a literal.

### Rule 12 — `rankSwaps`

- **AC1 (muscleMatch)** `muscleMatch(cur, alt)` over L1: `barbell-row → db-row` = 1, `barbell-row → straight-arm-pulldown` = 0.667 (rounded to 3 decimals, so `1/1.5`), `bench-press → push-up` = 0.75, `bench-press → db-bench-press` = 1, `barbell-row → barbell-row` = 1, and `back-squat → leg-extension` = `1/3` (`Σ w_cur = 3`) rounded to 0.333. Every value is in [0, 1]. The rounding is symmetric with the R12 expectations, so no candidate list depends on float noise.
- **AC2 (R12-E1, reason `null`)** Given F-swap and `reason: null`, When `rankSwaps` runs, Then the ids are `["db-row", "inverted-row", "lat-pulldown", "seated-cable-row", "straight-arm-pulldown"]`, the `muscleMatch` values are `[1, 1, 1, 1, 0.667]` (D-0056 §1), `bestMatch` is true only at index 0, `pull-up` is absent (level), `barbell-row` is absent (it is the current exercise), and `bench-press` and `leg-extension` are absent (already in the session).
- **AC3 (R12-E2, `short_on_time`)** Given F-swap and `reason: "short_on_time"`, Then the ids are `["straight-arm-pulldown", "db-row", "inverted-row", "lat-pulldown", "seated-cable-row"]`, `timeCostS` is `[375, 555, 555, 555, 555]` (the slot's 3 sets), and every `fitsBudget` is true.
- **AC4 (R12-E3, `variety`)** Given F-swap, `reason: "variety"` and a history of 3 lat-pulldown sets on 2026-09-20 and 3 db-row sets on 2026-09-10, Then the ids are `["inverted-row", "seated-cable-row", "straight-arm-pulldown", "db-row", "lat-pulldown"]` (never done first by muscleMatch then id, then last-done ascending).
  - Given the same history but with the db-row sets **outside** the 14-day window at 2026-08-10 (still inside the 56 days callers pass), Then the order is unchanged: `variety` looks at the whole passed history, not the window (D-0056 §6).
  - Given lat-pulldown and db-row both last done on 2026-09-20, Then the tail is `["db-row", "lat-pulldown"]` (the date ties, so muscleMatch then id decides).
  - Given a tombstoned lat-pulldown set on 2026-09-20 as its only history, Then lat-pulldown counts as never done and sorts into the first group.
- **AC5 (R12-E4, `discomfort`)** Given F-swap and `reason: "discomfort"`, Then the ids are `["lat-pulldown", "seated-cable-row", "straight-arm-pulldown", "db-row", "inverted-row"]` (no shared equipment first — none shares barbell — then guided (cable or machine) first, then muscleMatch desc, then id).
  - Given the session bench-press × 4 (main), **lat-pulldown × 3**, leg-extension × 2 with the current exercise `lat-pulldown` (equipment `[cable]`, so seated-cable-row and straight-arm-pulldown share it), Then the ids are `["barbell-row", "db-row", "inverted-row", "seated-cable-row", "straight-arm-pulldown"]`: the three with no shared equipment come first (none of them is guided, so muscleMatch 1 then id), then the two cable candidates (both guided, so muscleMatch 1 then 0.667).
- **AC6 (R12-E5, `equipment_taken`, main slot)** Given F-swap with the current exercise `bench-press` and `reason: "equipment_taken"`, Then the ids are `["push-up"]` with `muscleMatch` 0.75: db-bench-press shares the bench and is dropped, and every isolation is dropped because the main slot takes compounds only. `timeCostS` is 720 (push-up compound at the main slot's 4 sets).
  - Given `reason: null` at the same slot, Then the ids are `["db-bench-press", "push-up"]` with `muscleMatch` `[1, 0.75]`.
- **AC7 (`equipment_taken` fallback, D-0025)** Given the current exercise `lat-pulldown` in a session of bench-press × 4 (main), lat-pulldown × 3, leg-extension × 2, a profile with equipment `["cable"]`, and `reason: "equipment_taken"`, Then the ids are `["seated-cable-row", "straight-arm-pulldown"]` and the list is **not** empty. Derivation: only cable exercises are eligible, so the candidates sharing back 1.0 are seated-cable-row and straight-arm-pulldown; both share `cable`, so dropping the sharers would drop all of them and rule 12's fallback keeps all and sorts by fewest shared (both 1, a tie), then muscleMatch desc (seated-cable-row `1.5/1.5` = 1, straight-arm-pulldown `1/1.5` = 0.667), then id.
  - Given the same session with profile equipment = full, Then the sharers **are** dropped and the ids are `["barbell-row", "db-row", "inverted-row"]` (muscleMatch 1 each, id ascending).
- **AC8 (`none` sort key: same type, then last session)** Given F-swap, `reason: null`, and a most-recent session (2026-09-25) containing 3 db-row sets, Then the ids are `["inverted-row", "lat-pulldown", "seated-cable-row", "db-row", "straight-arm-pulldown"]`: the four compounds tie at muscleMatch 1 and type, so db-row drops behind the others, and the isolation stays last on muscleMatch.
  - Given instead that the most-recent session contains 3 straight-arm-pulldown sets, Then the order deep-equals AC2's (the isolation is already last).
- **AC9 (`fitsBudget`, D-0056 §3)** Given the current exercise `leg-extension` in F-swap (an isolation at 2 sets, `costS` 270, so 75 s are free) and `reason: null`, Then `back-squat` has `timeCostS` 390 and `fitsBudget` false (1545 − 270 + 390 = 1665 > 1620), it is **still returned**, and `bestMatch` is true at index 0 whether or not that entry fits.
  - Given the same session with `warmupInBudget: false` (`availableS` 1800), Then `back-squat` has `fitsBudget` true.
- **AC10 (recovering and eligibility)** Given F-swap (a hand-built fixture plan, so it may hold an item whose area later recovers) and a history of 6 hard back-squat sets at `now − 24 h` (quads and glutes recovering), When the current exercise is `leg-extension` and `reason: null`, Then the list is `[]`: the only quads-1.0 candidate, `back-squat`, has a recovering area at weight 1.0.
  - Given F-swap with profile level `intermediate` and `reason: null`, Then the ids are `["db-row", "inverted-row", "lat-pulldown", "pull-up", "seated-cable-row", "straight-arm-pulldown"]`: `pull-up` is now eligible at muscleMatch 1 and sorts by id among the compounds.
  - Given F-swap with profile equipment `["barbell", "rack"]` (so only barbell and rack exercises are eligible), Then the ids are `["inverted-row"]`.
- **AC11 (no candidates and validation)** Given F-swap with the current exercise `barbell-row` and a library of only L1's back exercises minus the alternatives (or profile equipment `[]`), When no candidate is eligible, Then `rankSwaps` returns `[]` and no entry has `bestMatch` true.
  - Given a `currentExerciseId` that is not an item in `session.plan.items` (`"no-such-id"`, or `"db-row"` which is eligible but not in the plan), Then `rankSwaps` throws `RangeError` (D-0056 §2).
  - Given a `reason` outside the `SwapReason` union at runtime (`"nope"` cast through `as SwapReason`), Then it throws `RangeError`.
- **AC12 (shape and determinism)** For each of `null` and the 4 reasons, over F-swap and each of the 4 simulated histories: every entry has exactly the keys `exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch`; `equipment` deep-equals the library row's `equipment`; `timeCostS` is a positive integer; `muscleMatch` is in [0, 1] and greater than 0; ids are unique and never include `currentExerciseId` or any other id in the plan; `bestMatch` is true exactly at index 0 when the list is non-empty; two runs are deep-equal; deep-frozen inputs neither throw nor change; and reversing `history` or `library` gives a deep-equal result.

### Rule 13 — shuffle

- **AC13 (`shuffle: 0` is a no-op, D-0056 §12)** Given F-input (`shuffle: 0`) over `[]` and each of the 4 simulated histories, at `energy` normal, low and high, Then the result deep-equals the same call with `shuffle: 0` before this ticket's change: the items, `itemsTotalS`, `totalS`, `unusedS`, `sessionReasons`, every `prefill` and every item's `reasons` are unchanged, and no item carries a `swap` reason. In particular the AC6 R7-E4 plan is still bench-press × 4, inverted-row × 3, leg-extension × 2 at `itemsTotalS` 1545.
- **AC14 (R13-E1, n = 1)** Given F-input with `shuffle: 1` and zero history, Then the items are bench-press × 4 (main, unchanged), **barbell-row × 3** and **leg-extension × 2**: the back slot's list is `[inverted-row, barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown]` (`len` 6 — against inverted-row, `Σ w_cur` = 2.0, so the four `back 1, arms .5` candidates score 0.75 and sort by id, and straight-arm-pulldown scores 0.5) so entry 1 is barbell-row, which fits at 555 s; the quads slot's list is `[leg-extension, back-squat]` (`len` 2) so entry 1 is back-squat, which does **not** fit (720 + 555 + 390 = 1665 > 1620) and the slot keeps its original. `itemsTotalS` is 1545, `totalS` 1725 and `unusedS` 75. The barbell-row item carries `swap {reason: null}` and the leg-extension item does not.
- **AC15 (R13-E2, n = 2 and n = 6)** Given F-input with `shuffle: 2`, Then the items are bench-press × 4, **db-row × 3** and leg-extension × 2 (`itemsTotalS` 1545). Given `shuffle: 6`, Then the plan deep-equals the R7-E4 plan exactly (6 mod 6 = 0 and 6 mod 2 = 0), including every reason, so no item carries a `swap` reason.
- **AC16 (the main lift is never shuffled)** For every `shuffle` in 0…12 with zero history and F-input, Then `plan.mainLiftId` is `bench-press`, the first item is bench-press × 4 with `isMain: true`, and no item with `isMain: true` ever carries a `swap` reason.
- **AC17 (pinned slots are never shuffled)** Given F-input with `pinnedIds: ["biceps-curl"]` and `shuffle: 1` (the T-0201a AC11 plan is bench-press × 4, biceps-curl × 3, inverted-row × 2 at `itemsTotalS` 1485), Then the items are bench-press × 4, **biceps-curl × 3** and **barbell-row × 2**: the pinned biceps-curl slot is skipped entirely and carries no `swap` reason, while the inverted-row slot takes entry 1 (barbell-row, 390 s at 2 sets, so `itemsTotalS` stays 1485 and `unusedS` 135) and carries `swap {reason: null}`.
  - Given `pinnedIds: ["biceps-curl"]` and `shuffle: 0`, Then the plan deep-equals the T-0201a AC11 plan exactly.
- **AC18 (a shuffled item's reasons and pre-fill, D-0056 §11)** For AC14, the barbell-row item's `reasons` are exactly `[area_deficit {back, 1}, days_since {back, null}, swap {reason: null}, prefill {first_time}]` (the new exercise's first primary area, at the session-start deficit), its `repsMin`/`repsMax` are 8–12 (a compound accessory), its `costS` is 555, and its `prefill` is `{weightKg: null, reps: 8, durationS: null, kind: "first_time"}`. `sessionReasons` still covers chest, back and quads.
- **AC19 (a shuffled pick keeps the rule 7.2 invariants, D-0056 §9)** Given a history where a shuffle candidate's primary area is already the primary area of 2 items, or where that candidate has a recovering area at weight 1.0, Then the slot keeps its original exercise. Construct both cases explicitly, and assert that for every `shuffle` in 0…20, over `[]` and each of the 4 simulated histories, with `warmupInBudget` on and off and `energy` normal, low and high: Σ `costS` ≤ `max(0, availableS)`; there are ≤ 8 items; no area is the primary area of more than 2 items; no `exerciseId` repeats; every item is eligible and has no recovering area at weight 1.0; `itemsTotalS` = Σ `costS`; `totalS` = `itemsTotalS` + 180; `unusedS` = `max(0, availableS − itemsTotalS)`; and the item count equals the `shuffle: 0` item count (shuffle replaces, never adds or drops).
- **AC20 (shuffle then energy, D-0056 §8)** Given F-input with `shuffle: 1` and `energy: "low"`, Then the items are bench-press × 4, **barbell-row × 2** and leg-extension × 2: Low trims the *shuffled* exercise, the barbell-row item's `reasons` are exactly `[area_deficit {back, 1}, days_since {back, null}, swap {reason: null}, energy_low_trim, prefill {first_time}]` (`swap` directly after `days_since`, before the energy reason, D-0056 §11), and `itemsTotalS` is 1380.
  - Given `shuffle: 2`, `budgetMin: 15`, `warmupInBudget: false` and `energy: "high"`, Then the main lift is bench-press × 4 with a back-off (`energy_high_backoff`) exactly as R7-E12, and no accessory exists to shuffle.
- **AC21 (determinism, R0-E1 with shuffle)** For each `shuffle` in {0, 1, 2, 3, 7, 41} over `[]` and each of the 4 simulated histories: two `suggest` runs are deep-equal; deep-frozen inputs neither throw nor change; reversing `history` or `library` gives a deep-equal result; and the plan is a pure function of `shuffle` (calling with 1, then 2, then 1 again gives the same result for 1 both times — no hidden state).
- **AC22 (validation, D-0056 §13)** Given F-input with `shuffle` of −1, 1.5, `NaN`, `Infinity` or `"1"` cast through `as unknown as number`, Then `suggest` throws `RangeError`. Given zero history and F-input, Then `shuffle: 6` and `shuffle: 1_000_002` (both multiples of 6, so ≡ 0 mod the back slot's `len` 6 and mod the quads slot's `len` 2) give deep-equal plans that also deep-equal `shuffle: 0`, and neither throws: `n` is a counter that wraps, with no upper bound.

### Simulated 14-day histories

- **AC23 (shuffle over the simulated suite)** For each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory` and `offlineMergedHistory` at F-input with `shuffle` 0, 1 and 2, assert the **exact** item list (`[exerciseId, sets]` pairs) and `itemsTotalS` as literals in the test — no snapshot files, no computed expectations. Derive each literal by hand from rule 13 (`shuffle: 0` must equal the pre-change plan, AC13), write the derivation into the commit message, and add the 12 resulting lists to this ticket's Accept log so a later reader can re-check them. Additionally:
  - Each `shuffle: 1` and `shuffle: 2` plan has the same item count and the same `isMain` item as its `shuffle: 0` plan.
  - For `allChestNoLegsHistory`, the main lift stays `inverted-row` (D-0040 §11) at every `shuffle`.
  - For `offlineMergedHistory` at each `shuffle`, the result deep-equals `suggest` on `normalizeHistory(offlineMergedHistory)` with `pending` removed, and appending a second copy of every queued row (a replay) gives a deep-equal result.
- **AC24 (`rankSwaps` over the simulated suite)** For each of the 4 histories, build the session with `suggest` at F-input, then for each item and each of `null` and the 4 reasons: `rankSwaps` does not throw, every AC12 invariant holds, and the `variety` ranking is consistent with the history (every never-done candidate precedes every done candidate). For `returningAfter10DaysHistory`, assert one concrete `variety` list with its last-done dates.

### Contract, traceability and purity

- **AC25 (R12-E1 correction, D-0056 §1)** Given the branch, When a Vitest test reads `docs/engine-rules.md`, Then rule 12's R12-E1 line contains `muscleMatch 1.0` and `0.667`, no longer claims `0.667` for db-row, and cites D-0056; the listed order `db-row, inverted-row, lat-pulldown, seated-cable-row` and `straight-arm-pulldown` is unchanged; and `git diff main -- docs/engine-rules.md` changes exactly that one line. No other rule text changes.
- **AC26 (public API)** `import { rankSwaps, muscleMatch, type SwapCandidate } from "@workoutlab/engine"` typechecks under the package's strict tsconfig. An `expectTypeOf` test pins `SwapCandidate` to exactly `{exerciseId: string; muscleMatch: number; timeCostS: number; equipment: string[]; fitsBudget: boolean; bestMatch: boolean}`, matching `api/openapi.yaml` `SwapCandidate` (`required: [exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch]`, `additionalProperties: false`).
- **AC27 (purity and traceability)** `pnpm --filter @workoutlab/engine lint` passes on the finished `src/`: there is **no** `Math.random()`, `Date.now()` or bare `new Date()` in `packages/engine/src` (the T-0200 purity-lint and housekeeping tests stay green), and shuffle's only entropy source is `sessionInput.shuffle`. A test asserts that `packages/engine/src/**` contains zero occurrences of `random` (case-insensitive). Test titles in `packages/engine/test/**` include R12-E1…R12-E5 and R13-E1, R13-E2, and the existing T-0200 id check still passes. There are 0 `@placeholder` or trivially-true assertions.

## Paths you may change
- `packages/engine/**`: `src/**` and `test/**`. You may extend `test/fixtures/common.ts` (for F-swap helpers) **without changing any existing T-0200/T-0201/T-0202 expectation**. `test/fixtures/histories.ts` stays read-only.
- `docs/engine-rules.md`: only the one R12-E1 line named by D-0056 §1 (the engine lane owns this contract).
- Don't add dependencies to `packages/engine/package.json`: that changes `pnpm-lock.yaml`, which infra owns. `expectTypeOf` ships with Vitest, and the seeded generator in `test/fixtures/random.ts` (D-0036 §5) is already there.
- Don't touch `api/openapi.yaml`, `packages/shared/**` or `supabase/functions/**`.

## Contract impact
- `docs/engine-rules.md`: one line, R12-E1's `muscleMatch` values, named by D-0056 §1. Rule 12's formula, sort keys and every listed order are unchanged; the example's parenthetical was simply inconsistent with the formula (R12-E5 confirms the formula).
- `api/openapi.yaml`: none. `SwapCandidate`/`SwapCandidateList` already carry exactly these fields (D-0037 §2, D-0039 §1), and `SessionInput.shuffle` is already `integer, minimum: 0`.
- `docs/data-model.md`: none.

## Coordination
- T-0205 replaces the pre-fill seam this ticket threads `previous` through (D-0056 §11, D-0057 §1). The two tickets both touch `packages/engine/src/session.ts`, so **they must not run in parallel** — one lane, one worktree at a time. Whichever lands second rebases.
- T-0303 (UF-08.2/UF-08.3) increments `shuffle` by 1 per tap and never resets it, and renders `rankSwaps` order without re-sorting. T-0306 (UF-05.1) does the same in the workout.
- The board's Phase 2 note "T-0201: shuffle and swaps are out (T-0204)" is closed by this ticket.

## Definition of done
- Tests for every AC pass, including R12-E1…E5, R13-E1, R13-E2 and the simulated 14-day histories through both `suggest` (with shuffle) and `rankSwaps`.
- `npx -y pnpm@10.28.2 -w typecheck lint test` is green (verify merges with `--force`: turbo replays cross-worktree cache, `.squad/state.md`).
- The contract edit is linked to D-0056; no other contract file changes.
- Commit messages start with `T-0204` and cite UF-08.2, UF-08.3 or UF-05.1 where relevant.

## Accept log
**2026-09-29, product-owner: accepted (`done`).**

Delivered as commits 0418804, 136399c, c8c3663, 60855e8 and e106270 (engine-dev), plus e3c8ab7 (QA). The hand derivation of the AC23 lists is in the body of 60855e8.

- **Code review: approve, no blocking findings.** Rules 12 and 13 match the spec and D-0056 §5–§13. The `docs/engine-rules.md` diff is exactly the R12-E1 line, with the "(D-0056)" citation that AC25 requires. The refactor commit only moves code. The AC13 baseline (`test/fixtures/pre-t0204-suggest.json`) equals origin/main's `suggest` output for all 15 history × energy cases. No T-0200–T-0202 expectation changed.
- **QA: pass.** AC1–AC27 each have a real test. Of 38 planted faults, 11 survived the builder's suite. QA's `test/t0204-qa-mutation-gaps.test.ts` kills all 11, including the excludeIds-in-shuffle case. The engine suite is 225/225 (`--force --concurrency=1`). The 2 remaining survivors are equivalent mutants in the unreachable D-0056 §9 recovering check (see D-0059 §1). QA re-derived the balanced and allChestNoLegs lists by hand at n = 0, 1 and 2, and they match.
- **Builder defaults** are recorded in D-0059 (status revisit): (a) `rankSwaps` drops recovering candidates, so it enforces D-0056 §9's recovering rejection; (b) the shuffle pool excludes `excludeIds`; (c) a current exercise with no library row throws `RangeError`.
- **Principles hold.** The engine stays deterministic: `shuffle` is the only entropy source and `src/**` has no `random` (AC27). The main lift and pinned slots are never shuffled. Shuffle replaces an exercise but never adds or drops items, and it respects the time budget (AC19).

**AC23 shuffle lists** (F-input, `[exerciseId, sets]`, `itemsTotalS`). At n ≥ 1 only the second item carries `swap {reason: null}`.

| History | shuffle | Items | itemsTotalS |
|---|---|---|---|
| balancedHistory | 0 | db-bench-press × 4 (main), db-row × 3, leg-extension × 2 | 1545 |
| balancedHistory | 1 | db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2 | 1545 |
| balancedHistory | 2 | db-bench-press × 4 (main), lat-pulldown × 3, leg-extension × 2 | 1545 |
| allChestNoLegsHistory | 0 | inverted-row × 4 (main), back-squat × 3, calf-raise × 2 | 1545 |
| allChestNoLegsHistory | 1 | inverted-row × 4 (main), hip-thrust × 3, calf-raise × 2 | 1545 |
| allChestNoLegsHistory | 2 | inverted-row × 4 (main), leg-extension × 3, calf-raise × 2 | 1365 |
| returningAfter10DaysHistory | 0 | bench-press × 4 (main), inverted-row × 3, calf-raise × 2 | 1545 |
| returningAfter10DaysHistory | 1 | bench-press × 4 (main), db-row × 3, calf-raise × 2 | 1545 |
| returningAfter10DaysHistory | 2 | bench-press × 4 (main), lat-pulldown × 3, calf-raise × 2 | 1545 |
| offlineMergedHistory | 0 | inverted-row × 4 (main), back-squat × 3, calf-raise × 2 | 1545 |
| offlineMergedHistory | 1 | inverted-row × 4 (main), hip-thrust × 3, calf-raise × 2 | 1545 |
| offlineMergedHistory | 2 | inverted-row × 4 (main), leg-extension × 3, calf-raise × 2 | 1365 |

These rows match the `EXPECTED` literals in `packages/engine/test/rule-13-shuffle.test.ts`. As a cross-check, the returningAfter10Days back-slot `variety` list is `[db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown, barbell-row (last done 2026-09-12)]` (AC24), which gives db-row at n = 1 and lat-pulldown at n = 2.

**Follow-ups:** fix the openapi `SwapCandidate` example `muscleMatch` from 0.667 to 1.0 (data); fix rule 0's `rankSwaps` argument order to `(… now, tz)` (engine, D-0056 §2); add a test for D-0059 (c) (engine); fix the pre-existing `format:check` failure on 5 supabase files (backend); count only normalised hard sets in the AC24 done-set (engine); record D-0059 §1 at D-0056's revisit (product); T-0205 rebases on the new `session.ts` seam (engine).
