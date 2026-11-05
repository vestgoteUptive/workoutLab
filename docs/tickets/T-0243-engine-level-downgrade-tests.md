---
id: T-0243
title: "Engine tests: a level downgrade never picks an above-level favorite, pin or main lift (each is skipped with no error, deep-equal to leaving it out); rankSwaps drops it; an upgrade makes pull-up an item at budgetMin 30 (spec AC11, AC13); over the simulated 14-day histories"
lane: engine
screens: [UF-08.2, UF-08.5, UF-05.1, UF-11.6]
decisions: [D-0233, D-0230, D-0202, D-0096]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-engine (agent engine-dev). About ¼ day. Test-only: `src/**` is unchanged, so there is no vendor regen. This is the optional guard named in D-0233 Consequences. Engine tickets run one at a time (D-0096 §3); no other engine row is open on the board. Spec: docs/specs/editable-level.md AC11, AC13 and the "Pinned and favorited exercises that become above-level" edge case. -->

## Why
The editable-level spec ships with no engine change, because rule 0 (`isEligible`, level ≤ profile level) already reads `profile.level` on every call. It does lean on four engine claims that no test states for level:
- a downgrade can't make `suggest` pick an above-level favorite (rule 0.2), pin or `mainLiftId`;
- such an id is skipped without an error, like an excluded one (R7-E18, R7-E19);
- `rankSwaps` filters it;
- with level intermediate, the spec's AC11 inputs keep pull-up in the plan.

If a later change lets a pin or favorite bypass rule 0, nothing fails today. Principle 3 (a deterministic engine) holds only if these stay pinned.

## Scope
- In: a new `packages/engine/test/t0243-level-downgrade.test.ts`.
  - Expected values are literals or deep-equality against the same call without the id (no snapshot), per the T-0236/T-0237 pattern.
  - Fixtures: `F_PROFILE`, `F_TARGETS`, `F_INPUT`, `LIBRARY` (L1 has `pull-up` as its one intermediate row) and `SIMULATED_HISTORIES` from `test/fixtures/histories.ts`.
  - It may define a test-local library row at level advanced, built with the fixture's `ex()` helper (for example `barbell-deadlift-t`), for the advanced cases.
- Out:
  - `packages/engine/src/**`, `docs/engine-rules.md` and the vendored copy.
  - Edits to existing tests or fixtures.

## Acceptance criteria
Test titles start `T-0243 ACn`. "Beginner" means `{ ...F_PROFILE, level: "beginner" }`, and so on. NOW and TZ as in the existing rule 7 tests (Europe/Stockholm).
- **AC1 (favorite skipped, spec AC13)** For each history in `SIMULATED_HISTORIES` plus zero history, and `budgetMin` 20, 30, 45 and 60, given beginner with `favoriteIds: ["pull-up"]`:
  - `suggest` returns no item with `exerciseId` `pull-up`;
  - `mainLiftId !== "pull-up"`;
  - the result deep-equals the same call with `favoriteIds: []`.
- **AC2 (pin skipped, no error)** Given beginner, zero history and F-input with `pinnedIds: ["pull-up"]`, Then `suggest` doesn't throw, and its result deep-equals `pinnedIds: []`. The same holds over every `SIMULATED_HISTORIES` entry at `budgetMin 30`.
- **AC3 (main lift skipped)** Given beginner and F-input with `mainLiftId: "pull-up"`, Then the result deep-equals `mainLiftId` absent.
- **AC4 (upgrade sibling, spec AC11)** Given intermediate, zero history, F-input (`budgetMin 30`), back neither recovering nor in Skip today, and `pinnedIds: ["pull-up"]`, Then `items` include `pull-up` (rule 7.2 step 2), and the result is not deep-equal to the beginner result for the same input (AC2). Advanced gives a result deep-equal to intermediate for these inputs, because L1 has no advanced row.
- **AC5 (swaps, rule 12)** Given a workout from `suggest` at F-input whose items include a back exercise (for example barbell-row):
  - `rankSwaps` for that item at beginner returns no `pull-up` candidate;
  - at intermediate it returns one (sibling);
  - the call doesn't throw in either case.
- **AC6 (advanced row)** With the test-local advanced row added to `LIBRARY`:
  - at intermediate it is never an item for any AC1 input, whether it is a favorite, pin or `mainLiftId`;
  - at advanced it is eligible (`isEligible` true).
- **AC7 (determinism, R0-E1)** Every `suggest` call above, run twice, is deep-equal, and the only input that differs between paired cases is `profile.level` (asserted by a helper that diffs the two inputs).
- Planted fault (log): on a backup copy of the eligibility check in `src/` (rule 0's level comparison), make pinned ids bypass it, so AC2 goes red. Restore with `cp`, and `git diff --stat packages/engine/src` is empty afterwards.

Binary-condition check (D-0197 §7):
- Below and at-or-above level: AC1–AC3 against AC4 and AC6.
- Zero history and returning histories: AC1 covers both (`SIMULATED_HISTORIES` includes `returningAfter10DaysHistory`).

## Paths you may change
- `packages/engine/**` (lane): the new `test/t0243-level-downgrade.test.ts`
- `docs/tickets/T-0243-engine-level-downgrade-tests.md` (log)

## Contract impact
none.

## Definition of done
- Tests for every AC pass: `scripts/locked.sh small npx vitest run packages/engine/test/t0243-level-downgrade.test.ts`, then the full gate once. The fault's red run is logged.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Commits start `T-0243 UF-08.2:`.

## Build / accept log
- 2026-11-05 engine-dev build. Start: clean tree at d2cb3ddc. Added `packages/engine/test/t0243-level-downgrade.test.ts` (16 tests); `src/**`, rules and fixtures unchanged. The advanced row `barbell-deadlift-t` is built inline in the same shape as `ex()` (that helper isn't exported, and fixtures are out of scope).
  - AC1 → "T-0243 AC1 (spec AC13) …" (5 histories × 4 budgets, plus non-vacuity: the intermediate pair picks pull-up at least once)
  - AC2 → two "T-0243 AC2 …" tests (zero history; every simulated history at 30 min)
  - AC3 → "T-0243 AC3 …" (zero + every simulated history)
  - AC4 → three "T-0243 AC4 …" tests (inputs, intermediate includes pull-up and ≠ beginner, advanced = intermediate)
  - AC5 → four "T-0243 AC5 …" tests (back item; beginner no pull-up / intermediate has it; downgrade rankSwaps + applySwap with current pull-up don't throw; advanced row dropped at intermediate)
  - AC6 → four "T-0243 AC6 …" tests (60 cases favorite/pin/main; isEligible; pinned at advanced is an item)
  - AC7 → `run()` calls suggest twice, deep-equal, and `diffPaths` asserts the only differing input in each pair (plus "T-0243 AC7 diffPaths …")
  - Planted fault (backup in scratch, restored with `cp`): pinned ids bypass the level check in `selectPinned` → 5 red (both AC2, AC4, two AC6). `git diff --stat packages/engine/src` empty after.
  - Mutations (each restored with `cp`): isEligible ignores level → 11 red (AC1–AC6); `>` flipped to `>=` → 10 red; rankSwaps looks `current` up in the pool → 1 red (AC5 downgrade, "RangeError: pull-up is not in the library").
  - Findings: none; the engine skips every above-level id silently.
  - Gate: `turbo run typecheck lint test --filter=@workoutlab/engine --force --concurrency=1` green (3/3 tasks, 50 files, 813 tests); `-w format:check` green.
- 2026-11-05 code-review + QA. Start: clean tree at e9a4b509. Spec fidelity, fixture (`barbell-deadlift-t` same shape as `ex()`, valid areas/equipment, no library id clash), determinism (no clock/random) and lane all OK.
  - Reviewer mutations (each restored with `cp`, `git diff --stat packages/engine/src` empty): favorites bypass rule 0 → 2 red (AC1, AC6); mainLiftId looked up outside the eligible pool → 2 red (AC3, AC6); rankSwaps appends an above-level current → 1 red (AC5); applySwap throws on an above-level current → 1 red (AC5); level compared as strings → 6 red (AC4–AC6).
  - Gap closed: AC2 over simulated histories, AC3 and AC6 favorite/main had no per-case level pair, so "mainLiftId ignored at every level" left AC3 green. Added 3 "T-0243 QA non-vacuity" tests (pin at intermediate per history; main at intermediate per history; advanced row as main/favorite at advanced). Proof: mainLiftId ignored → 2 red; favorites ignored → 2 red.
  - Gate: engine `turbo typecheck lint test --force` green (50 files, 816 tests).
