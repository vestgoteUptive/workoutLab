---
id: D-0050
title: Rule 9 (T-0202) build details — period index starts at 0, previewTargets helper, clamp keeps min ≤ max, rhythm validation as deriveTargets
status: revisit
date: 2026-09-28
by: engine-dev (T-0202)
area: engine
---
## Context
Building T-0202 (rule 9, UF-11.1, UF-11.2) raised four details that rule 9, D-0037 §8 and D-0041 don't settle:
- Rule 9 says period k covers `[onboarded + 14k, onboarded + 14k + 13]`, so the first period is k = 0. T-0202 AC8 and AC19 expect `index: 0` in `periods`. But `api/openapi.yaml` `CheckinPeriod.index` has `minimum: 1`. The engine output isn't sent over any path in v1 (D-0037 §2), but a client that validates it against that schema would reject a new user's first check-in (R9-E8 on 2026-10-18). `plan_checkins.period_index ≥ 1` is still right: it stores the later of the two periods, which is always ≥ 1.
- The ticket input asks for a `previewTargets` function, but rule 9 only names the output field.
- When the current rhythm is valid for `deriveTargets` but above 7 (for example 8–9), clamping `min ± 1` and `max ± 1` to 1–7 on their own could break min ≤ max.
- D-0041 §6 says an invalid rhythm throws "as `deriveTargets` does". `deriveTargets` rejects non-integers, values < 1 and min > max, but it doesn't reject values > 7.

## Decision
1. **Period index starts at 0 (rule 9 as written).** The engine emits `index: 0` for the period that starts on the onboarding date. The `CheckinPeriod.index` schema in openapi should be `minimum: 0`. That is a follow-up for the data lane, which owns `api/openapi.yaml`. The engine doesn't change it.
2. **`previewTargets(TargetInput): PreviewTarget[]`** is a public helper in `src/targets.ts`: rule 4 as the 9 `{area, setsPer14d}` entries in the fixed order. `evaluateCheckin` uses it for `proposal.previewTargets`, and T-0308 can reuse it for the UF-11.3 edit-plan preview. `periodStatus(completed, min, max)` and the rule 9 constants (`PERIOD_DAYS` 14, `UNDER_FACTOR_X10` 14, `OVER_FACTOR_X10` 22, `RHYTHM_FLOOR` 1, `RHYTHM_CEILING` 7, `COMPARED_PERIODS` 2) are also exported, so the numbers are named once.
3. **Clamp order:** `newMax = clamp(max ± 1, 1, 7)`, then `newMin = min(clamp(min ± 1, 1, 7), newMax)`. For every valid 1–7 rhythm this is the plain ±1 clamp (AC25). If the result equals the current rhythm, there is no proposal.
4. **Validation follows `deriveTargets`:** rhythm values must be integers ≥ 1 with min ≤ max. Values above 7 are accepted, as they are in rule 4, and the proposal clamps them into 1–7. Every session and check-in instant is validated before the before-onboarding early return, so bad input throws whatever `now` is.

## Consequences
- engine (T-0202): implements points 1–4.
- data: follow-up to relax `CheckinPeriod.index` to `minimum: 0` in `api/openapi.yaml` and regenerate `packages/shared/src/api.gen.ts`.
- web-feature:UF-07 (T-0308): may call `previewTargets` for the UF-11.3 preview instead of re-deriving rule 4.

## Revisit when
- The data lane decides that period numbering should start at 1. In that case rule 9 and R9-E8 change together.
- Rhythm gets a hard 1–7 input check across rules 4 and 9.
