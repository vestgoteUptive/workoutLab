---
id: T-0211
title: "Engine tests: pin D-0059 (c), where a plan item with no library row makes rankSwaps throw RangeError; and build the rule 12 AC24 done-set from normalizeHistory + isHardSet, with a tombstone case that tells the two apart"
lane: engine
screens: [UF-08.3, UF-05.1]
decisions: [D-0059, D-0056, D-0034, D-0015, D-0096]
deps: [T-0204]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ¼ day. Test-only: `src/**` is unchanged, so there is no vendor regen and no new simulated-history requirement, though AC2 runs over the simulated histories. There is no contract impact. Engine tickets run one at a time (D-0096 §3). Order: T-0220 → T-0221 → T-0212 → T-0211. -->

## Why
Two T-0204 review gaps in `packages/engine/test/rule-12-swaps.test.ts`:

1. **D-0059 (c) has no test.** `rankSwaps` throws `RangeError` when `currentExerciseId` is a plan item but has no row in `library` (`src/swaps.ts`, "is not in the library"). That happens when the library is stale or a row was removed. The AC11 `no-such-id` case fails the plan check first, so this branch is never run. Deleting it would go unnoticed, and `rankSwaps` would then hit an undefined `cur` and throw a `TypeError`, or return garbage.
2. **The AC24 done-set uses raw rows.** "rule-12 (AC24) rankSwaps holds the AC12 invariants…" builds `doneIds` from `history.filter(deletedAt === null && !isWarmup)`. Rule 0 dedupes by `clientId` first (D-0034), so an old live version of a set whose newest version is a tombstone (D-0015) counts as "done" in the test but not in the engine. Today's fixtures never hit this, so the test is weaker than it looks: it can't catch an engine that forgot to normalise.

## Scope
- In:
  - `packages/engine/test/rule-12-swaps.test.ts`:
    - AC1's tests;
    - the AC24 done-set built by a helper `doneIdsOf(history, library)` = the `exerciseId`s of `normalizeHistory(history).filter((s) => isHardSet(s, lib.get(s.exerciseId)))`, using the engine's exports;
    - the AC2 tombstone variant.
  - If the variant history is reused, put it in `packages/engine/test/fixtures/histories.ts` as a new export. `SIMULATED_HISTORIES` keeps its four entries, unchanged.
- Out:
  - `packages/engine/src/**`.
  - `docs/engine-rules.md`.
  - Every other assertion in the AC24 tests, including the returningAfter10Days concrete `variety` list.

## Acceptance criteria
**Fixtures:** `fSwap()` (bench-press × 4 main, barbell-row × 3, leg-extension × 2), `F_PROFILE`, `LIBRARY`, `NOW`, `TZ`, and `REASONS` = `[null, "equipment_taken", "discomfort", "variety", "short_on_time"]`. Each new test title starts with `T-0211 ACn`.

- **AC1 (D-0059 c)**
  - **Given** `session = fSwap()` and `lib = LIBRARY.filter((e) => e.id !== "barbell-row")`, **When** `rankSwaps("barbell-row", r, session, F_PROFILE, lib, [], NOW, TZ)` runs for every `r` in `REASONS`, **Then** it throws a `RangeError` whose message matches `/barbell-row is not in the library/`.
  - The same holds for the main slot: `bench-press` with `bench-press` removed from the library.
  - With a non-empty history (`balancedHistory`), the result is the same.
  - **Contrast:** with the full `LIBRARY`, the same calls don't throw.
  - **Mutation proof:** temporarily delete the `cur === undefined` guard in `src/swaps.ts`, run the test, and show it goes red: the error isn't a `RangeError` with that message. Then restore the guard. Record the red run in the build log. Don't commit the mutation.
- **AC2 (the AC24 done-set)**
  - The existing AC24 invariant test uses `doneIdsOf` over all four `SIMULATED_HISTORIES` and still passes.
  - **Tombstone variant:**
    - **Given**:
      - `w = suggest(offlineMergedHistory, F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ)`;
      - `B` = the first item of `w` with back at weight 1.0;
      - `L = rankSwaps(B, "variety", w, F_PROFILE, LIBRARY, offlineMergedHistory, NOW, TZ)`;
      - `X` = the first never-done candidate in `L` that is followed in `L` by at least one more never-done candidate.
    - The variant history is `offlineMergedHistory` plus two rows for `X` with one `clientId` (`"t0211-x"`) and one `sessionId`:
      - a live server row completed 2026-09-20T10:00:00+02:00 and edited at the same instant;
      - a queued (`pending: true`) tombstone edited and deleted 2026-09-21T10:00:00+02:00.
    - **Then:**
      - `doneIdsOf(variant, LIBRARY)` excludes `X`, and the old raw filter includes `X`. This is the non-vacuity check: the two definitions differ on this input.
      - `suggest(variant, …)` deep-equals `w`, and `rankSwaps(B, "variety", w, …, variant, …)` deep-equals `L`, because the engine normalises the tombstone away.
      - The AC24 invariant holds over that list with `doneIdsOf`.
      - With the raw filter it fails: `X` reads as done, but a never-done candidate follows it. The test asserts that failure explicitly.
  - Precondition: `w` has a back item and `L` has at least two never-done candidates. If not, stop and record the observed `w` and `L` in the result. Don't change the variant to make it fit.
- **AC3 (no behaviour change)**
  - `git diff --stat main...HEAD -- packages/engine/src` is empty. Record it in the build log.
  - Every existing engine test passes. No assertion other than the AC24 done-set line is edited.
  - The engine test count rises only by the new T-0211 tests.
- **AC4** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0211-rankswaps-missing-library-row-test.md`: this file, for the build and accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `test/rule-12-swaps.test.ts` and possibly `test/fixtures/histories.ts` (a new export only).
- Engine lane, one ticket at a time (D-0096 §3). It runs last of the four. It shares no file with T-0212's guards, but serial order still applies.
- No vendor regen: `src/**` is unchanged (D-0053 §1).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · contracts unchanged · commit messages start with `T-0211` and cite UF-08.3 (e.g. `T-0211 UF-08.3: pin D-0059 (c) and normalise the AC24 done-set`).

## Build / accept log

### Build (engine-dev, 2026-10-02)
- **AC1:** I added three tests in `packages/engine/test/rule-12-swaps.test.ts`. The first covers `barbell-row` (a plain slot) and the second covers `bench-press` (the main slot). Each removes the current item from `LIBRARY` and checks that every `REASONS` entry throws `RangeError` matching `/<id> is not in the library/`, with both `[]` and `balancedHistory`. The third is the contrast case: with the full `LIBRARY`, the same calls don't throw.
- **AC1 mutation proof (not committed):** I replaced the `cur === undefined` guard on `src/swaps.ts:219` with a comment and ran `vitest run test/rule-12-swaps.test.ts -t "T-0211 AC1"`. Both AC1 tests went red with `AssertionError: expected error to be instance of RangeError`, because the call threw a `TypeError` instead (2 failed | 1 passed | 27 skipped). The contrast test stayed green. I restored the guard with `git checkout src/swaps.ts`.
- **AC2:** The AC24 done-set now comes from `doneIdsOf(history, LIBRARY)`, which is `normalizeHistory` + `isHardSet`. The test passes over all four `SIMULATED_HISTORIES`.
  - Observed precondition values:
    - `w` = inverted-row × 4, back-squat × 3, calf-raise × 2;
    - `B` = `inverted-row`;
    - `L` (variety) = barbell-row, db-row, lat-pulldown, seated-cable-row, all at 0.75 and none of them done;
    - `X` = `barbell-row`.
  - The variant is built inside the test. It isn't reused, so `fixtures/histories.ts` is unchanged.
  - Results on the variant:
    - `doneIdsOf` excludes `X`, and the raw filter includes it;
    - `suggest` deep-equals `w`, and `rankSwaps` deep-equals `L`;
    - the invariant holds with `doneIdsOf`;
    - with the raw filter it fails, and the test asserts that failure explicitly.
- **AC3:** `git diff --stat main...HEAD -- packages/engine/src` is empty. The only edits to existing lines are the AC24 done-set line and the imports. The engine test count went from 632 to 636: the 4 new T-0211 tests.
- **AC4 and the other checks, all green:**
  - `flock … pnpm --filter @workoutlab/engine typecheck`, `lint` and `test` (37 files, 636 tests);
  - `pnpm -w format:check`;
  - `node .github/scripts/check-all.mjs`;
  - `node supabase/scripts/vendor.mjs --check`.

### Accept (product-owner, 2026-10-02): done
I read `packages/engine/test/rule-12-swaps.test.ts` at 86fe4fe and checked it against every AC. I didn't rerun the tests myself (this session had no shell). The test evidence is the build log plus the orchestrator's QA and review, which relied on the mutation proof and the contrast cases.
- **AC1:** met.
  - The test is parameterised over `barbell-row` (a plain slot) and `bench-press` (the main slot).
  - Each removes the current item from `LIBRARY` and runs across all five `REASONS` with both `[]` and `balancedHistory`.
  - It asserts `toThrow(RangeError)` and `toThrow(/<id> is not in the library/)` separately, so a `TypeError` can't pass.
  - The contrast test makes the same calls with the full `LIBRARY` and asserts `not.toThrow()`.
  - Mutation proof: with the guard removed, the test went red (2 failed, `TypeError`). The guard was restored and isn't committed.
- **AC2:** met.
  - `doneIdsOf` is exactly `normalizeHistory` + `isHardSet` from the engine's exports, and the existing AC24 invariant test now uses it over all four `SIMULATED_HISTORIES`.
  - The tombstone variant follows the AC to the letter: `clientId` `t0211-x`, one `sessionId`, and the timestamps at 2026-09-20 and 2026-09-21 +02:00 with `pending: true`.
  - `X = neverDone[0]` with `neverDone.length >= 2`, which meets the "followed by at least one more never-done" rule.
  - The test asserts all four points: the non-vacuity check (the raw filter has `X`, `doneIdsOf` doesn't), `suggest` and `rankSwaps` deep-equal on the variant, the invariant holds with `doneIdsOf`, and it explicitly fails with the raw filter.
  - The preconditions are asserted, with `w` or `L` in the failure message.
- **AC3:** met. `src/**` diff is empty. Outside the new T-0211 block, the only edits are the imports, the helpers and the AC24 done-set line. The `returningAfter10Days` concrete list is untouched. The count went from 632 to 636, which is the 4 new T-0211 tests. `SIMULATED_HISTORIES` and `fixtures/histories.ts` are unchanged.
- **AC4:** met. Engine typecheck, lint and test are green (37 files, 636 tests), and format:check, check-all and vendor --check are green.
- **Principles:** unaffected. This is a test-only change, and it makes the deterministic-engine guarantee stronger.
