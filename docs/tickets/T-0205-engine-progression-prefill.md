---
id: T-0205
title: "Engine: progression and pre-fill (rule 14, prefill) wired into suggest; replaces the T-0201 first_time seam"
lane: engine
screens: [UF-09.3, UF-09.4, UF-08.2]
decisions: [D-0026, D-0034, D-0036, D-0037, D-0040, D-0042, D-0047, D-0057]
deps: [T-0200]
status: ready
---
## Why
UF-09.3/UF-09.4 pre-fill weight and reps — "pre-fill, don't ask" — so the user taps one 200 px button per set instead of typing (principle 1: one task on screen). UF-08.2 shows "sets × reps · weight" before the workout starts, so the same numbers have to exist at plan time. Rule 14 of `docs/engine-rules.md` (D-0026) is the deterministic 7-step waterfall behind both, and T-0201a deliberately left a `first_time`-only seam in `suggest` for this ticket to replace (D-0040 §4). T-0304 (UF-09 Focus mode) depends on T-0205. D-0057 fixes the build gaps rule 14 leaves open, the most important being bodyweight progression: with `incrementKg: null` there is no `W + inc`, so step 4 as literally written would drop a push-up user from the top of the rep range back to the bottom every session.

## Scope
- In:
  - `packages/engine/src`: `prefill(exercise, slot, history, library, now, tz, previous)` per rule 14 and D-0057 §1–§6, returning `PrefillResult` (`{weightKg, reps, durationS, kind}`, D-0037 §7). All 7 steps, the timed branch, and the `carry` case.
  - Replacing the D-0040 §4 `prefillFor` seam in `suggest` at the same call site, passing the slot's rep range and `previous` (D-0057 §7).
  - `floor5` alongside the existing `floorInc` (reused from `packages/engine/src/energy.ts`, board follow-up from T-0201b/D-0047).
  - Public exports from `src/index.ts`: `prefill`, `floor5`, and the rule-14 constants (`REENTRY_GAP_DAYS` 21, `HOLD_GAP_DAYS` 10, `TIMED_STEP_S` 5, `TIMED_MAX_S` 120, `TIMED_MIN_S` 15, `BACKOFF_FACTOR` already exists).
  - Every example R14-E1…E9 as unit tests, each test title starting with its id.
  - The simulated 14-day histories (`test/fixtures/histories.ts`, read-only) run through `suggest` asserting each item's `prefill` (definition of done: engine changes need the simulated-history tests).
  - Edge cases in scope: zero history (`first_time` for loaded and bodyweight); returning after 10 days off (`hold_after_break`) and after 21+ (`reentry`); offline-merged history with queued rows, replays and tombstones (a tombstoned session must not define last performance); a session that crosses midnight; DST between the last session and `now`; a session later today (`gap = 0`); a future-dated session; history with no recorded weight; a timed exercise with `durationS` null rows; the rep-range floor and ceiling; a loaded lift so light that `floorInc(0.9 W)` would be 0.
- Out:
  - Rule 12/13 swap ranking and shuffle (T-0204). This ticket consumes the `previous` argument T-0204 threads through, and must work with `previous: null` on its own if T-0204 has not landed.
  - Changing `applyEnergy`: the High back-off already uses `floorInc(0.9 × prefill weight)` at the main `repsMin` (rule 7.4, D-0040 §4, D-0047). R14-E9 is a test of that existing behaviour against a **non-null** pre-fill weight, not a change.
  - RIR: logged but not used in v1 (D-0026).
  - Writing rule 14's build details (D-0057 §2, §4, §6) into `docs/engine-rules.md` — that is a doc follow-up, not a behaviour change (D-0057 §10).
  - Plate loading (UF-09.3), the UF-09.4 confirm screen and the "why" copy (T-0304). The engine returns `kind`; the UI turns it into words (rule 10).
  - Adaptive targets (T-0202), the Edge Function (T-0203), UI (T-03xx), moving the engine types to `@workoutlab/shared` (a follow-up).

## Acceptance criteria
**Fixtures unless an AC says otherwise:** F-tz (`tz = Europe/Stockholm`, `now = "2026-09-27T12:00:00+02:00"`, D = 2026-09-27), F-targets, F-profile (beginner, `equipment` = full), F-input (`budgetMin 30, warmupInBudget true, energy normal, shuffle 0, mainLiftId null, pinnedIds [], excludeIds []`), and `LIBRARY` (L1 + the `wu-*` moves) from `packages/engine/test/fixtures/common.ts`. Each AC is at least one Vitest test in `packages/engine/test/**`, and a test that implements an `Rn-Em` example starts its title with that id.

**Slot ranges (rule 7.2):** main 6–8, other compounds 8–12, isolation 10–15, timed null–null. "Low" is `repsMin`, "high" is `repsMax`.

**"S(date, exerciseId, [w × r, …])"** means one session on that local date at 10:00 (`+02:00`) with one hard set per `w × r` entry (`weightKg: w`, `reps: r`, distinct `clientId`s, `isWarmup: false`, `deletedAt: null`). Add a `setsWithReps` helper to `test/fixtures/common.ts` for this; do not change any existing helper's behaviour.

### Rule 14 waterfall — the worked examples

- **AC1 (R14-E1, `increase`)** Given `S(2026-09-24, back-squat, [100×8, 100×8, 100×8])` and the main slot (6–8), When `prefill` runs, Then it returns `{weightKg: 102.5, reps: 6, durationS: null, kind: "increase"}` (`W` 100, gap 3, every set at `W` has reps ≥ 8, `inc` 2.5).
- **AC2 (R14-E2, `add_rep`)** Given `S(2026-09-24, back-squat, [100×8, 100×7, 100×6])` and the main slot, Then `{weightKg: 100, reps: 7, durationS: null, kind: "add_rep"}` (step 4 fails on 7 < 8; step 5 and step 6 fail because `minReps` 6 is not < low 6; step 7 gives `min(8, 6 + 1)`).
- **AC3 (R14-E3, `hold_after_break`)** Given `S(2026-09-15, back-squat, [100×8, 100×8, 100×8])` and the main slot, Then `{weightKg: 100, reps: 6, durationS: null, kind: "hold_after_break"}` (gap 12, so `10 ≤ gap < 21` wins before step 4).
- **AC4 (R14-E4, `reentry`)** Given `S(2026-09-01, back-squat, [102.5×8, 102.5×8, 102.5×8])` and the main slot, Then `{weightKg: 90, reps: 6, durationS: null, kind: "reentry"}` (gap 26, `floorInc(0.9 × 102.5, 2.5)` = `floorInc(92.25)` = 90).
- **AC5 (R14-E5, `deload` and `hold`)** Given `S(2026-09-20, back-squat, [100×5, 100×5, 100×4])` and `S(2026-09-24, back-squat, [100×5, 100×4, 100×4])` and the main slot, Then `{weightKg: 90, reps: 6, kind: "deload"}` (both sessions at `W` 100 with `minReps` < 6).
  - Given only the 09-24 session, Then `{weightKg: 100, reps: 6, kind: "hold"}` (step 5 needs two sessions).
  - Given the 09-20 session at `W` **95** instead (`[95×5, 95×5, 95×4]`) and the 09-24 session unchanged, Then `kind` is `"hold"`, not `"deload"`: step 5 needs the same `W` in both (D-0057 §5).
  - Given a third, older session `S(2026-09-16, back-squat, [100×5, 100×5, 100×5])`, Then `kind` is still `"deload"`: only the last two sessions are compared.
- **AC6 (R14-E6, `first_time`)** Given an empty history: `prefill(leg-curl, 10–15)` returns `{weightKg: null, reps: 10, durationS: null, kind: "first_time"}` and `prefill(push-up, 8–12)` (a compound accessory, `externalLoad: false`) returns `{weightKg: 0, reps: 8, durationS: null, kind: "first_time"}`.
- **AC7 (R14-E7, `carry`)** Given an empty history and `previous = {exerciseId: "lat-pulldown", weightKg: 50}`, When `prefill(seated-cable-row, 8–12, …)` runs, Then `{weightKg: 50, reps: 8, durationS: null, kind: "carry"}` (they share `back` at weight 1.0 and the equipment item `cable`).
  - Given `previous = {exerciseId: "barbell-row", weightKg: 60}` and `prefill(db-row, 8–12, …)`, Then `{weightKg: null, reps: 8, kind: "first_time"}` (`barbell` vs `dumbbell, bench`: no shared equipment item).
  - Given `previous = {exerciseId: "bench-press", weightKg: 80}` and `prefill(barbell-row, 8–12, …)`, Then `first_time` (they share `barbell` but no weight-1.0 area).
  - Given `previous = {exerciseId: "lat-pulldown", weightKg: null}`, Then `{weightKg: null, reps: 8, kind: "first_time"}`: there is no weight to carry.
  - Given `previous` names an exercise not in the library, Then `first_time`.
  - Given `previous` qualifies **but** the exercise already has history, Then the history wins (step 1 only applies when there is no history): with `S(2026-09-24, seated-cable-row, [40×12, 40×12, 40×12])` and the same `previous`, the result is `{weightKg: 45, reps: 8, kind: "increase"}` (`inc` 5).
- **AC8 (R14-E8, timed)** Given `S(2026-09-24, plank, [45 s, 45 s, 40 s])` (hard sets with `durationS` 45, 45, 40 and `reps: null`) and a timed slot, Then `{weightKg: null, reps: null, durationS: 45, kind: "add_rep"}` (`min(last)` 40, gap 3, so `40 + 5`).
  - Given an empty history, Then `{weightKg: null, reps: null, durationS: 45, kind: "first_time"}` (`defaultDurationS`).
  - Given the same sets on 2026-09-15 (gap 12), Then `durationS` 40 and `kind` `"hold_after_break"`.
  - Given the same sets on 2026-09-01 (gap 26), Then `durationS` = `max(15, floor5(0.9 × 40))` = `max(15, 35)` = 35 and `kind` `"reentry"`.
  - Given `S(2026-09-24, plank, [118 s, 120 s])`, Then `durationS` 120 (the `+ 5` cap), and given `[10 s, 12 s]` on 2026-09-01, Then `durationS` 15 (the floor).
  - Given `S(2026-09-24, plank, [null, null])` (every `durationS` null), Then the timed first-time branch applies: `durationS` 45, `kind` `"first_time"` (D-0057 §6).
- **AC9 (R14-E9, the High back-off)** Given `S(2026-09-24, bench-press, [80×8, 80×7, 80×6])`, F-input with `energy: "high"`, `budgetMin: 15` and `warmupInBudget: false`, When `suggest` runs, Then the bench-press item's `prefill` is `{weightKg: 80, reps: 7, durationS: null, kind: "add_rep"}` (main slot 6–8: step 4 fails on 7 < 8, steps 5–6 fail because `minReps` 6 is not < 6, step 7 gives `min(8, 7)`), **and** its `backoff` is `{weightKg: 70, reps: 6}` (`floorInc(0.9 × 80, 2.5)` = 70, at the main `repsMin`), with the reason `energy_high_backoff`. `applyEnergy` is unchanged; this AC proves the back-off now reads a real pre-fill weight instead of `null`.

### Build defaults (D-0057)

- **AC10 (bodyweight progression, §2)** Given `S(2026-09-24, push-up, [0×12, 0×12, 0×12])` and an 8–12 slot, Then `{weightKg: 0, reps: 12, durationS: null, kind: "increase"}` — the weight stays 0 and the reps go to **high**, not back to low.
  - Given `[0×12, 0×11, 0×10]`, Then `{weightKg: 0, reps: 11, kind: "add_rep"}`.
  - Given the same top-of-range sets on 2026-09-15 (gap 12), Then `{weightKg: 0, reps: 8, kind: "hold_after_break"}`, and on 2026-09-01 (gap 26), Then `{weightKg: 0, reps: 8, kind: "reentry"}` (no `floorInc`, the weight is 0).
  - Given `S(2026-09-20, push-up, [0×5, 0×5, 0×4])` and `S(2026-09-24, push-up, [0×5, 0×4, 0×4])`, Then `{weightKg: 0, reps: 8, kind: "deload"}`.
  - Given sets logged with `weightKg: null` instead of 0 on push-up, Then every result above is unchanged (a bodyweight exercise never needs a recorded weight).
- **AC11 (missing weights on a loaded exercise, §3)** Given `S(2026-09-24, back-squat, [null×8, null×8, null×8])` (every `weightKg` null on an `externalLoad: true` exercise) and the main slot, Then the result is `{weightKg: null, reps: 6, kind: "first_time"}`.
  - Given `previous = {exerciseId: "hip-thrust", weightKg: 60}` as well (shares `glutes` at 1.0 and `barbell`), Then `{weightKg: 60, reps: 6, kind: "carry"}`.
  - Given `S(2026-09-24, back-squat, [null×8, 100×8, 100×8])` (one set without a weight), Then `W` is 100 and the result is `{weightKg: 102.5, reps: 6, kind: "increase"}`.
  - Given `S(2026-09-24, back-squat, [100×null, 100×null])` (non-timed sets with no reps), Then `first_time` (no usable set at `W`).
- **AC12 (the `floorInc` floor, §4)** Given `S(2026-09-01, biceps-curl, [2×10, 2×10, 2×10])` (gap 26, `inc` 2) and a 10–15 slot, Then `{weightKg: 2, reps: 10, kind: "reentry"}`: `floorInc(1.8, 2)` = 0, so the result is `max(inc, 0)` = 2, never 0.
  - Given `S(2026-09-01, back-squat, [2.5×8])` and the main slot, Then `{weightKg: 2.5, reps: 6, kind: "reentry"}` (`max(2.5, floorInc(2.25, 2.5) = 0)`).
  - Given `S(2026-09-01, back-squat, [50×8])`, Then `{weightKg: 45, reps: 6, kind: "reentry"}` (the floor does not disturb a normal weight).
  - The same floor applies to `deload`: given `S(2026-09-20, biceps-curl, [2×5, 2×5])` and `S(2026-09-24, biceps-curl, [2×5, 2×4])` with a 10–15 slot, Then `{weightKg: 2, reps: 10, kind: "deload"}`.
- **AC13 (session recency and `gap`, §5, §9)** Given `S(2026-09-24, back-squat, [100×8, 100×8, 100×8])` and `S(2026-09-26, back-squat, [90×8, 90×8])`, Then the 09-26 session is the last performance: `{weightKg: 92.5, reps: 6, kind: "increase"}`.
  - Given a second 09-26 session (a different `sessionId`) whose sets share the same `completedAt`, Then the smaller `sessionId` wins (D-0040 §9) and the result is deterministic across a reversed history.
  - Given `S(2026-09-27, back-squat, [100×8, 100×8, 100×8])` (today, `gap` 0), Then `increase`.
  - Given a **future** session `S(2026-09-28, back-squat, [100×8, 100×8, 100×8])` and no other history, Then it is still the last performance with `gap` 0 → `increase` (rule 3's window does not apply to last performance, §9).
  - Given a session at `2026-09-16T23:40:00+02:00` with sets completed at 23:45 and 00:10 local (crossing midnight into 09-17), Then `gap` is computed from the **later** set's local date 09-17 (gap 10 → `hold_after_break`), because recency is the greatest `completedAt`.
  - Given `now = "2026-11-06T12:00:00+01:00"` and `S(2026-10-24, back-squat, [100×8, 100×8, 100×8])` at 10:00 `+02:00` (a DST change in between), Then `gap` is 13 → `hold_after_break`.
- **AC14 (tombstones and the offline queue)** Given `S(2026-09-24, back-squat, [100×8, 100×8, 100×8])` where all three rows are tombstoned by newer queued rows (`pending: true`, `deletedAt` set), and no other history, Then the result is `first_time`.
  - Given one of the three tombstoned and the other two live, Then `W` is 100 and the result is `increase`.
  - Given the live rows plus an identical queued replay of each, Then the result deep-equals the no-replay result.
  - Given a queued row (`pending: true`) that raises one set to `110×8` with a newer `editedAt`, Then `W` is 110 (rule 0 keeps the greatest `editedAt`).
  - Given a set of an `exerciseId` that is not in the library, Then it never defines a pre-fill (rule 0 / D-0034 §4).
- **AC15 (rep-range floor and ceiling)** For each slot range (6–8, 8–12, 10–15): given a last performance at `W` with every set at `high + 3` reps, Then the result is `increase` at low reps (or at `high` for a bodyweight exercise, AC10), never above `high`; and given `add_rep` from `minReps = high − 1`, Then `reps` is exactly `high` and never `high + 1`. Given `minReps = high`, Then step 4 (not step 7) applies.

### `suggest` integration

- **AC16 (the T-0201 seam is replaced, D-0057 §8)** Given `[]` (zero history) and F-input over `energy` normal, low and high, and over `budgetMin` 15, 20 and 30 with `warmupInBudget` on and off, Then every `suggest` result deep-equals the pre-change result: every item's `prefill` is `{weightKg: null | 0, reps: repsMin, durationS, kind: "first_time"}` exactly as D-0040 §4 specified, and every `prefill {kind}` reason is `first_time`. **Every existing T-0200, T-0201a, T-0201b and T-0202 test stays green with no expectation edited.** If one has to change, stop and raise triage instead of editing it.
- **AC17 (`suggest` uses real progression)** Given `balancedHistory` (its last session is 2026-09-27 at 10:00, `weightKg` 50 and `reps` 8 on every set) and F-input, When `suggest` runs, Then each selected item whose exercise appears in that history has a `prefill` derived from rule 14 rather than `first_time`, its `prefill {kind}` reason matches `prefill.kind`, and the exact `{exerciseId, prefill}` pairs are asserted as literals. Items whose exercise has no history keep `first_time`.
- **AC18 (`carry` through a shuffle, D-0056 §11)** Given F-input with `shuffle: 1` and an empty history except `S(2026-09-24, inverted-row, …)`, When `suggest` runs, Then the shuffled slot's `prefill` uses `previous` per rule 14 step 1 when it qualifies, and `kind` is `carry` with the `swap {reason: null}` reason present.
  - If T-0204 has **not** landed on this branch's base, then `shuffle` is ignored, `previous` is always `null`, and this AC asserts only that `prefill` never throws and never returns `carry`. Say which case applies in the commit message.
- **AC19 (determinism and purity, R0-E1)** For `[]` and each of the 4 simulated histories at F-input: two `suggest` runs are deep-equal; deep-frozen inputs neither throw nor change; reversing `history` or `library` gives a deep-equal result; and calling `prefill` directly twice with the same arguments is deep-equal. `pnpm --filter @workoutlab/engine lint` passes on the finished `src/`: no `Date.now()`, bare `new Date()` or `Math.random()` (the T-0200 purity-lint and housekeeping tests stay green).
- **AC20 (validation)** `prefill` throws `RangeError` when: `slot.repsMin` is greater than `slot.repsMax`; exactly one of `repsMin`/`repsMax` is null; `repsMin` is 0, negative or non-integer; `now` has no offset (`"2026-09-27T12:00:00"`); or `previous.weightKg` is negative. A non-timed exercise with a null rep range, and a timed exercise with a non-null rep range, both throw.
- **AC21 (shape)** Every `prefill` result has exactly the keys `weightKg, reps, durationS, kind`. `weightKg` is null or a finite number ≥ 0 rounded to 3 decimals; `reps` is null or an integer ≥ 1; `durationS` is null or an integer in 15…120; `kind` is one of the 8 `PrefillKind` codes. A timed item always has `reps: null` and `weightKg: null`; a non-timed item always has `durationS: null`. This matches `api/openapi.yaml` `PrefillResult` (`weightKg` ≥ 0, `reps` ≥ 1, `durationS` ≥ 1, `additionalProperties: false`) — assert with a Vitest test, not by editing the schema.

### Simulated 14-day histories

- **AC22 (pre-fill over the simulated suite)** For each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory` and `offlineMergedHistory` at F-input, assert every item's `{exerciseId, prefill}` as literals in the test — no snapshots. Derive them by hand from rule 14 and record them in this ticket's Accept log. Expected shape of the answers:
  - `balancedHistory`: the last session is 09-27, so every repeated exercise has `gap` 0 and lands in step 4, 6 or 7 (never `reentry` or `hold_after_break`).
  - `returningAfter10DaysHistory`: back-squat was last done 09-15 (`gap` 12 → `hold_after_break`) and romanian-deadlift 09-17 (`gap` 10 → `hold_after_break`); the exercises last done 09-12 (`gap` 15) are also `hold_after_break`; nothing reaches `gap` 21 at F-tz.
  - `offlineMergedHistory`: the queued rows and the tombstone are honoured, so the result deep-equals `suggest` on `normalizeHistory(offlineMergedHistory)` with `pending` removed, and a replay of every queued row is deep-equal.
  - `allChestNoLegsHistory`: chest is recovering, so the selected items are inverted-row, back-squat and calf-raise (D-0040 §11) — none has history, so all three are `first_time`. Assert this explicitly: it is the case that proves `first_time` survives a non-empty history.
- **AC23 (invariants over a long sweep)** For each of the 4 histories plus `[]`, over `now` ∈ {`2026-09-27T12:00:00+02:00`, `2026-10-01T12:00:00+02:00`, `2026-10-11T12:00:00+02:00`, `2026-11-06T12:00:00+01:00`} and `budgetMin` in 15…120 step 15 with `warmupInBudget` on and off: every item's `prefill` satisfies AC21; `kind` is `reentry` only when the last performance's `gap` ≥ 21 and `hold_after_break` only when `10 ≤ gap < 21`; a `first_time` result never has a non-null `weightKg` on an `externalLoad: true` exercise; a `carry` result never appears when `previous` is null; and the existing R7-E8 invariants (Σ `costS` ≤ available, ≤ 8 items, ≤ 2 items per primary area) still hold, because pre-fill never changes selection or cost.

### Traceability and housekeeping

- **AC24 (public API)** `import { prefill, floor5, REENTRY_GAP_DAYS, HOLD_GAP_DAYS, TIMED_STEP_S, TIMED_MAX_S, TIMED_MIN_S, type PrefillResult, type PrefillKind } from "@workoutlab/engine"` typechecks under the package's strict tsconfig. `REENTRY_GAP_DAYS === 21`, `HOLD_GAP_DAYS === 10`, `TIMED_STEP_S === 5`, `TIMED_MAX_S === 120`, `TIMED_MIN_S === 15`. `floor5(37) === 35`, `floor5(35) === 35`, `floor5(36.0000001) === 35`. An `expectTypeOf` test pins `PrefillKind` to exactly the 8 codes `first_time | carry | reentry | hold_after_break | increase | deload | hold | add_rep`.
- **AC25 (traceability)** Test titles in `packages/engine/test/**` include each of R14-E1…R14-E9, and the existing T-0200 id check still passes. There are 0 `@placeholder` or trivially-true assertions (D-0023 rule 4). `docs/engine-rules.md` is **unchanged** by this ticket: assert `git diff main -- docs/engine-rules.md` is empty (or, if T-0204 landed first, contains only its R12-E1 line).

## Paths you may change
- `packages/engine/**`: `src/**` and `test/**`. You may extend `test/fixtures/common.ts` with the `setsWithReps` helper **without changing any existing T-0200/T-0201/T-0202 expectation**. `test/fixtures/histories.ts` stays read-only.
- Nothing else. This ticket changes **no** contract: `docs/engine-rules.md`, `api/openapi.yaml` and `docs/data-model.md` all already describe rule 14 and `PrefillResult`.
- Don't add dependencies to `packages/engine/package.json`: that changes `pnpm-lock.yaml`, which infra owns. `expectTypeOf` ships with Vitest.
- Don't touch `packages/shared/**` or `supabase/functions/**`.

## Contract impact
- None. Rule 14 and `PrefillResult` are already specified (D-0026, D-0037 §7). D-0057 §2, §4 and §6 are build details **inside** the rule; if a human wants them in the rule text, that is a follow-up doc edit under D-0057, not part of this ticket.
- The vendored engine copy in `supabase/functions/_shared/vendor` is refreshed by the backend lane (D-0053 §1), not here.

## Coordination
- **T-0204 and T-0205 both change `packages/engine/src/session.ts` and must not run in parallel.** One engine worktree at a time; whichever lands second rebases. T-0205 is written so it works with `previous: null` if T-0204 has not landed (AC18).
- T-0304 (UF-09 Focus mode) renders `prefill.weightKg`/`reps`/`durationS` as the pre-filled values on UF-09.3/UF-09.4 and may show `prefill.kind` as the one-line "why". A null `weightKg` means "ask the user" (the first session on a loaded lift), never "0 kg".
- The board's Phase 2 note "T-0205: replace T-0201's first-time pre-fill stand-in with rule 14" and "T-0205: reuse floorInc from packages/engine/src/energy.ts" are both closed by this ticket.
- If the delivered `prefill` needs any change to `applyEnergy` to satisfy R14-E9, stop and raise triage: D-0047 settled that code and this ticket does not own it.

## Definition of done
- Tests for every AC pass, including R14-E1…R14-E9 and the simulated 14-day histories through `suggest`.
- Every pre-existing engine test is green with **no expectation edited** (AC16).
- `npx -y pnpm@10.28.2 -w typecheck lint test` is green (verify merges with `--force`: turbo replays cross-worktree cache, `.squad/state.md`).
- No contract file changed.
- Commit messages start with `T-0205` and cite UF-09.3, UF-09.4 or UF-08.2 where relevant.
