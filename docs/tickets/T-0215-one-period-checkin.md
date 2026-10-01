---
id: T-0215
title: "Engine: plan check-in proposes after ONE ended period (rule 9, D-0061 §2, D-0094); re-derive R9-E1…E13 and the simulated histories"
lane: engine
screens: [UF-11.1, UF-11.2, UF-02.1]
decisions: [D-0018, D-0027, D-0041, D-0061, D-0070, D-0094, D-0096]
deps: [T-0202, T-0219]
status: ready
---
<!-- Written by product-owner 2026-10-01 (groom mode). Build flow: wl-build-engine. About ½ day. T-0223 (data) depends on this ticket, and T-0308c depends on both. Engine tickets run one at a time (D-0096 §3): T-0219 → T-0215 → T-0224 → T-0214. -->

## Why
Principle 4: targets adapt to what the user actually does, and never silently. The human decided (D-0061 §2) that two periods in a row was too slow. One 14-day period that is under (completed < 0.7 × 2·min) proposes one session fewer per week, and one that is over (> 1.1 × 2·max) proposes one more. The clamp, Accept/Keep, the reset and "never on UF-08/UF-09" are unchanged. D-0094 fixes the build:
- `periods` lists at most the last ended eligible period;
- the rule 9 text and the R9 examples are re-derived;
- the T-0202 rename guard follows the rewritten R9-E13 line.

## Scope
- In:
  - `packages/engine/src/checkin.ts`:
    - `evaluateCheckin` lists ≤ 1 period and proposes from it (D-0094 §1–§2);
    - `COMPARED_PERIODS` = 1;
    - the doc comments updated.
  - `docs/engine-rules.md` rule 9, per D-0094 §4:
    - the Proposal and Output lines;
    - the R9-E1…E11 mapping line;
    - R9-E12 and R9-E13;
    - one Traceability row.
  - Re-deriving the T-0202 expectations that D-0061 §2 changes, each listed below with its new value. This is required by a `decided` decision, not a weakened test.
  - Tests: every AC below, plus the simulated 14-day histories through `evaluateCheckin`.
  - Edge cases:
    - zero history: a new user, period 0;
    - returning after 10 days off;
    - a long absence;
    - offline-merged history;
    - a session across midnight;
    - DST inside a period;
    - `now` before onboarding;
    - unanswered check-in rows;
    - exact thresholds;
    - a mid-period plan change;
    - a Keep.
- Out:
  - `plan_checkins` / openapi `periodIndex ≥ 0` and nullable `completedPrev` (T-0223, data, depends on this ticket).
  - The card and its copy (T-0308c, already one-period by D-0070 §5).
  - The UF-11 spec text (`docs/specs/uf-11-plan-checkin.md`), which is a product follow-up.
  - `checkinSessions`, `previewTargets` and rule 4 are unchanged.
  - `test/fixtures/histories.ts` stays as it is.

## Acceptance criteria
**Fixtures:** T-0202's F-checkin, the period table P0…P6, "Pk = n", "On DATE", "period (i, n, s)" and T(r), all from `test/fixtures/checkin.ts`. At rhythm 3–4:
- under means completed ≤ 4;
- over means ≥ 9;
- 5–8 is on plan.

`DOWN_2_3` is `{direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: T(2–3)}`. Each AC is at least one Vitest test. Titles keep their R9 id and UF-11 AC id, and the existing titles are retitled where their meaning flips (e.g. R9-E2 "→ proposes").

**Re-derived rule 9 examples** (T-0202's AC numbering in brackets):
- **AC1 (R9-E1, UF-11 AC1) [T-0202 AC1]** P2 = 4, P3 = 3, on 2026-09-27 → `{periods: [(3, 3, under)], proposal: DOWN_2_3, nextCheckinDate: "2026-10-11"}`. The keys are exactly `periods`, `proposal` and `nextCheckinDate`.
- **AC2 (R9-E2, UF-11 AC2: one low period after 10 days off → proposes) [AC2]**
  - P2 = 7 and P3 = 2, on 09-27 → `periods` [(3, 2, under)] and `DOWN_2_3`.
  - With P4 = 3 too, on 10-11 → [(4, 3, under)], `DOWN_2_3`, `nextCheckinDate` `2026-10-25`.
- **AC3 (R9-E3, threshold) [AC3]**
  - P3 = 5 → [(3, 5, on_plan)] and null.
  - P3 = 4 → [(3, 4, under)] and `DOWN_2_3`.
- **AC4 (R9-E4, over) [AC4]**
  - P3 = 10 → [(3, 10, over)] and up 4–5 with T(4–5).
  - P3 = 8 → [(3, 8, on_plan)] and null.
  - P3 = 9 → over, up 4–5. This is the boundary contrast: 90 > 88.
- **AC5 (R9-E5, mixed periods no longer cancel) [AC5]**
  - P2 = 3 and P3 = 9 → [(3, 9, over)] and up 4–5.
  - **Contrast:** P2 = 9 and P3 = 3 → [(3, 3, under)] and `DOWN_2_3`. Only the last period counts.
- **AC6 (R9-E6, after Accept) [AC6]** Unchanged: AC1's sessions plus P4 = 3, rhythm 2–3, `planUpdatedAt` and the answer at `2026-09-27T12:05:00+02:00`, on 10-11 → [(4, 3, on_plan)], null, `2026-10-25`.
- **AC7 (R9-E7, Keep resets) [AC7]** AC1's sessions and an answer at `2026-09-27T12:05:00+02:00`, profile unchanged:
  - At `2026-09-27T12:10:00+02:00`: [] and null. P3 ends 09-26 < 09-27.
  - With P4 = 3, on 10-11: [(4, 3, under)] and `DOWN_2_3`. This was null under two periods.
  - With P5 = 2 too, on 10-25 (`+01:00`): [(5, 2, under)], `DOWN_2_3`, `2026-11-08`.
- **AC8 (R9-E8, zero history, new user) [AC8]** With `onboardedAt` = `planUpdatedAt` = `2026-09-20T10:00:00+02:00` and no sessions:
  - On 09-27: [], null, `2026-10-04`.
  - **On 10-04** (the first day after P0): [{index 0, start 2026-09-20, end 2026-10-03, completed 0, under}], `DOWN_2_3`, `2026-10-18`. This is the period-0 proposal that T-0223 relies on.
  - On 10-18: [{index 1, start 2026-10-04, end 2026-10-17, completed 0, under}], `DOWN_2_3`, `2026-11-01`.
- **AC9 (R9-E9, floor) [AC9]**
  - Rhythm 1–1 with P3 = 0 → [(3, 0, under)] and null.
  - Rhythm 1–2 → down 1–1 with T(1–1).
- **AC10 (R9-E10, session counting) [AC10]**
  - `checkinSessions` gives `hardSetCount`s [0, 4, 3, 2] (unchanged).
  - On 09-27, `periods` is [(3, 3, under)] with `DOWN_2_3`.
  - With `mid` at `2026-09-26T22:30:00Z` (00:30 local on 09-27), P3's `completed` is 2.
- **AC11 (R9-E11, long absence) [AC11]** P2 = 2, P3 = 0, P4 = 0, on 10-11 → [(4, 0, under)] and `DOWN_2_3`.
- **AC12 (R9-E12, mid-period Keep) [AC12]** P2 = 4, P3 = 3, P4 = 3, P5 = 2 and an answer at `2026-09-30T19:00:00+02:00`:
  - On 10-11 → [(4, 3, under)] and `DOWN_2_3`. P4 ends 10-10 ≥ 09-30. This was null under two periods.
  - On 10-25 (`+01:00`) → [(5, 2, under)] and `DOWN_2_3`.
  - At `2026-09-30T20:00:00+02:00` → [] and null. P3 ends 09-26 < 09-30.
- **AC13 (R9-E13, plan edit) [AC13]** P2 = 4, P3 = 3:
  - With `planUpdatedAt` `2026-09-20T10:00:00+02:00`, on 09-27 → [(3, 3, under)] and `DOWN_2_3`. P3 ends 09-26 ≥ 09-20, so it is eligible.
  - With `planUpdatedAt` `2026-09-27T09:00:00+02:00` → [] and null.
  - With `2026-09-12T10:00:00+02:00` → equals AC1.

**Other T-0202 ACs, re-derived**
- **AC14 (ceiling) [AC14]**
  - Rhythm 6–7 with P3 = 16 → [(3, 16, over)] and up 7–7 with T(7–7).
  - Rhythm 7–7 → over and null.
  - Rhythm 6–7 with P3 = 15 → on_plan and null.
- **AC15 (never silent, deterministic) [AC15]** AC1's inputs, deep-frozen, on each of 09-27…10-01:
  - no throw;
  - the inputs are unchanged;
  - every result has `periods` [(3, 3, under)] and `DOWN_2_3`.

  Reruns and reversed `sessions`/`checkins` are deep-equal.
- **AC16 (exact thresholds) [AC16]** Rhythm 5–5, P3 only:
  - 7 → on_plan (70 < 70 is false);
  - 6 → under and down 4–4;
  - 11 → on_plan;
  - 12 → over and up 6–6.
- **AC17 (when a period has ended) [AC17]** P2 = 4, P3 = 3:
  - At `2026-09-26T23:59:00+02:00` → [(2, 4, under)], `DOWN_2_3`, `2026-09-27`. This was null under two periods.
  - At `2026-09-27T00:00:00+02:00` and at `2026-09-26T22:30:00Z` → equals AC1.
- **AC18 (reset inputs) [AC18]** AC1's sessions, on 09-27:
  - (a) `[{answeredAt: null}]` → AC1.
  - (b) `[{answeredAt: "2026-09-12T20:00:00+02:00"}]` → AC1.
  - (c) `[{answeredAt: "2026-09-26T22:30:00Z"}]` (00:30 local on 09-27) → [] and null. **Contrast:** `"2026-09-26T21:30:00Z"` (23:30 local on 09-26) → AC1, because the end 09-26 ≥ 09-26.
  - (d) `[{answeredAt: "2026-09-27T08:00:00+02:00"}, {answeredAt: "2026-08-20T08:00:00+02:00"}]`, in both orders → equals (c).
- **AC19 (before onboarding, outside every period) [AC19]**
  - The before-onboarding results are unchanged.
  - F-checkin with P0 = P1 = 0, plus 9 sessions on 2026-08-01, on 08-30 → [(1, 0, under)] and `DOWN_2_3`.
  - P2 = 4 plus 9 sessions in P2 with `hardSetCount` 0, on **2026-09-13** → [(2, 4, under)].
- **AC20 (DST inside a period) [AC20]** P5 = 2, plus sessions at `2026-10-24T21:30:00Z` (23:30 CEST on 10-24), `2026-10-24T22:30:00Z` (00:30 CEST on 10-25) and `2026-11-01T10:00:00+01:00`:
  - On 10-25 (`+01:00`) → [{index 5, 2026-10-11, 2026-10-24, completed 3, under}], `DOWN_2_3`, `2026-11-08`.
  - On 11-08 → [{index 6, 2026-10-25, 2026-11-07, completed 2, under}], `DOWN_2_3`, `2026-11-22`.
- **AC21 (previewTargets with priorities) [AC21]**, **AC22 (validation)** and **AC23 (`checkinSessions`)**: unchanged and still green with no expectation edited.

**Simulated 14-day histories and invariants**
- **AC24 (through `evaluateCheckin`) [T-0202 AC24]** Same setup as T-0202 (each history → `checkinSessions` → `evaluateCheckin` with F-checkin).
  - On 2026-09-27, with `nextCheckinDate` `2026-10-11`:
    - balanced → [(3, 6, on_plan)] and null;
    - allChestNoLegs → [(3, 6, on_plan)] and null;
    - returningAfter10Days → [(3, 2, under)] and `DOWN_2_3`;
    - offlineMerged → [(3, 6, on_plan)] and null.
  - On 2026-10-11, with `2026-10-25`:
    - balanced → [(4, 1, under)] and `DOWN_2_3`;
    - allChestNoLegs → [(4, 0, under)] and `DOWN_2_3`;
    - returningAfter10Days → [(4, 0, under)] and `DOWN_2_3`;
    - offlineMerged → [(4, 1, under)] and `DOWN_2_3`.
- **AC25 (invariants) [T-0202 AC25]** Same input grid.
  - `periods.length` ≤ 1.
  - When it is 1, its index is `⌊(D − onboardDate)/14⌋ − 1` and its end ≥ `resetDate`.
  - `proposal` is non-null exactly when that one period is not `on_plan` and the ±1 clamp changes the rhythm.
  - The other T-0202 AC25 invariants hold as written.
- **AC26 (the rename guard follows R9-E13, D-0094 §5)**
  - `test/fixtures/rename-d0041.ts`'s third pair is updated:
    - `after` = the new R9-E13 line, verbatim;
    - `before` = the same line with `` `plan_changed_at` `` → `` `plan_updated_at` ``.
  - Both `housekeeping.test.ts` AC26 tests pass with no change to their logic.
  - The AC27 test "a full EngineProfile and PlanCheckin-shaped rows are accepted" expects period indices `[3]` instead of `[2, 3]`.
- **AC27 (the contract text, D-0094 §4)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - rule 9's Proposal line equals D-0094 §4's sentence;
  - the Output line says `periods` holds at most one entry;
  - the R9-E1…E11 line contains "re-derived for one period (D-0094)";
  - the R9-E12 line says 2026-10-11;
  - the R9-E13 line contains `` `plan_changed_at` 2026-09-20 `` exactly once and cites D-0094;
  - the Traceability table has a T-0215 row.

  The committed test pins only this ticket's own content. There is no committed "every other section unchanged" test (D-0096 §2). Instead, before returning, run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. The expected sections are rule 9 and Traceability. Code review checks that list against the Listed extras grant. If no earlier engine ticket has re-scoped the two whole-file guards, do T-0219 AC14 here (D-0092 §6).
- **AC28 (public API, purity)**
  - `COMPARED_PERIODS === 1`, and `CheckinEvaluation`'s type is unchanged (the T-0202 `expectTypeOf` test stays green).
  - `pnpm --filter @workoutlab/engine lint` passes.
  - There are 0 placeholder or trivially-true assertions.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: rule 9's Proposal and Output lines, the R9-E1…E11 mapping line, R9-E12, R9-E13, and one Traceability row (D-0094 §4).

## Contract impact
- `docs/engine-rules.md` rule 9 changes under D-0061 §2 and D-0094 (engine lane owns this contract).
- `CheckinEvaluation`'s shape (D-0037 §8) is unchanged. Only its `periods` length shrinks to ≤ 1.
- `api/openapi.yaml` and `docs/data-model.md` are T-0223's (D-0070 §6). It depends on this ticket.

## Coordination
- **Files this ticket changes:**
  - `packages/engine/src/checkin.ts`;
  - `test/rule-9-checkin.test.ts`, `test/rule-9-histories.test.ts`, `test/rule-9-sessions.test.ts` (only if an AC10 expectation lives there), `test/fixtures/checkin.ts` (`AC1_RESULT`), `test/fixtures/rename-d0041.ts` (pair 3) and `test/housekeeping.test.ts` (one expectation);
  - `docs/engine-rules.md` rule 9 and the Traceability table.
- **Engine tickets run one at a time** (D-0096 §3; they share `packages/engine/**`): T-0219 → **T-0215** → T-0224 → T-0214. T-0215 goes second because it unblocks the data lane's T-0223, which can then run while T-0224 builds.
- **T-0223 (data) depends on T-0215:** `plan_checkins.period_index >= 0`, nullable `completed_prev`, and openapi `CheckinPeriod.index` / `PlanCheckin.periodIndex` minimum 0. AC8's period-0 proposal is the case that needs it. T-0308c depends on both.
- Product follow-up: `docs/specs/uf-11-plan-checkin.md` ACs 1–5, 8 and 11–14 get one-period wording (D-0070 Consequences).

## Definition of done
- Tests for every AC pass, including all 13 R9 ids and the 4 simulated histories.
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- The contract change is linked to D-0094.
- Commit messages start with `T-0215` and cite UF-11.1 (e.g. `T-0215 UF-11.1: propose after one period`).
