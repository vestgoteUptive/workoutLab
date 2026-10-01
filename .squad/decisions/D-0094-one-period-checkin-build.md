---
id: D-0094
title: One-period check-in (T-0215 build of D-0061 §2) — periods lists only the last ended eligible period; rule 9 text and examples re-derived; the T-0202 rename guard follows the new R9-E13 line
status: revisit
date: 2026-10-01
by: product-owner (T-0215 groom)
area: engine
builds-on: D-0061 §2, D-0041 §4, D-0070 §5–§6
amends: D-0041 §4 (at most two listed periods)
---
## Context
D-0061 §2 (human, `decided`) changes rule 9: a single evaluated 14-day period that is under or over
leads to a proposal. The clamp, Accept/Keep and the `resetDate` rule are unchanged. Three
build points are open:
- what `evaluateCheckin.periods` lists (D-0041 §4 says the last ≤ 2 ended eligible periods);
- how the rule 9 text and worked examples change;
- how the T-0202 housekeeping guard, which pins the R9-E13 line verbatim, follows a line that
  must change.

## Decision
1. **`periods` lists at most one period:** the last ended period (index `currentIndex − 1`) if
   it is eligible (end ≥ `resetDate`), otherwise `[]`.
   - Eligibility only grows with the end date, so when the last ended period is ineligible,
     every earlier one is too, and there is nothing to fall back to.
   - The UI already reads the last entry (D-0070 §5), and `plan_checkins.completed_prev` becomes
     null for a one-period evaluation (D-0070 §6, T-0223).
   - `COMPARED_PERIODS` stays exported, with the value 1.
2. **Proposal.** If that period is `under`, propose (min − 1, max − 1). If it is `over`, propose
   (min + 1, max + 1). The clamp to 1–7 and min ≤ max are unchanged. If the result equals the
   current rhythm, or there is no listed period, there is no proposal. `nextCheckinDate`, the
   period boundaries, the status thresholds (D-0041 §5) and `checkinSessions` are unchanged.
3. **Consequences the human accepted with D-0061**, stated so tests pin them:
   - A new user with 0 sessions in period 0 gets a "down" proposal on the first day after it
     (period index 0, which is why T-0223 relaxes `period_index ≥ 1`).
   - Returning after 10 days off with one low period proposes "down".
   - A plan change in the middle of a period leaves that period eligible (end ≥ `resetDate`), so
     it can propose at its end.
   - After a Keep, the next ended period whose end ≥ the answer date can propose again.
4. **Rule 9 text (engine lane contract, under this decision):**
   - The **Proposal** line becomes: "Look at the last ended period, if it is eligible. If it is
     under, propose (min − 1, max − 1). If it is over, propose (min + 1, max + 1). Clamp to 1–7,
     keeping min ≤ max. If the result equals the current rhythm, there is no proposal. With no
     eligible ended period, there is no proposal (D-0061 §2, D-0094)."
   - The **Output** line says `periods` holds at most one entry.
   - The R9-E1…E11 line keeps its UF-11 AC mapping and adds "re-derived for one period
     (D-0094)". Each re-derived result is stated in T-0215's ACs and its tests.
   - R9-E12 and R9-E13 are rewritten to their one-period results. The new R9-E13 line keeps the
     fragment "`plan_changed_at` 2026-09-20" exactly once, so the D-0041 §1 rename guard's
     intent (no `plan_updated_at`; `plan_changed_at` only on F-profile, Reset and R9-E13) still
     holds.
5. **The T-0202 rename guard follows the line.** `test/fixtures/rename-d0041.ts` pins the three
   renamed lines verbatim. T-0215 updates its third pair only:
   - `after` = the new R9-E13 line;
   - `before` = that line with `plan_changed_at` → `plan_updated_at`.

   The test logic is unchanged. This is a fixture re-derivation that D-0061 §2 requires. It does
   not weaken the test.
6. **Data stays T-0223** (D-0070 §6). It depends on T-0215 and is unchanged by this decision.

## Consequences
- engine (T-0215):
  - `src/checkin.ts`;
  - the rule 9 tests and fixtures (`rule-9-checkin.test.ts`, `rule-9-histories.test.ts`,
    `fixtures/checkin.ts`, `fixtures/rename-d0041.ts`), plus the one `housekeeping.test.ts`
    expectation of period indices `[2, 3]`, which becomes `[3]`;
  - `docs/engine-rules.md` rule 9 and its Traceability row.
- data (T-0223): `period_index ≥ 0` and nullable `completed_prev`.
- web (T-0308c): the copy is already one-period (D-0070 §5). It writes `completed_prev = null`.
- product: `docs/specs/uf-11-plan-checkin.md` ACs 1–5, 8 and 11–14 need their one-period wording
  (D-0070 Consequences). That is a product follow-up, and the engine tests do not read the spec.

## Revisit when
D-0061's trigger fires (the one-period check-in proposes too often). The likely change is two
periods for "up" only, which would bring back a second listed period.
