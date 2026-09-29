---
id: D-0018
title: Plan check-in (UF-11) — 14-day periods from onboarding, planned = rhythm range × 2, two periods in a row both ways
status: decided
date: 2026-09-27
by: product-owner (T-0001)
area: product
---
## Context
Engine rule 9 says "< 70 % of planned sessions twice in a row → lower, > 110 % → higher; always ask". It doesn't define a period, a planned session, a completed session, or whether "twice" applies to raising too. Gap B4 leaves "planned sessions" open.

## Decision
- **Period:** 14 local calendar days. Period 0 starts on the day onboarding completes, and period k covers days [14k, 14k+13]. Evaluation happens at the first app open after a period ends.
- **Completed session:** a session with ≥ 1 hard set (not warm-up). Its date is the local date of `started_at`.
- **Planned:** rhythm `min–max` per week gives 2·min–2·max per period. **Under** = completed < 0.7 × 2·min. **Over** = completed > 1.1 × 2·max. Being inside the range is on plan.
- **Proposal:** two consecutive evaluated periods that are both under lead to a proposal of rhythm −1 on both bounds. Two in a row both over lead to +1 on both bounds. Bounds are clamped to 1–7 per week. At the floor (1–1) or ceiling (7–7), no proposal is made.
- **Answer:** Accept or Keep current. Both record a `plan_checkins` row and reset the streak, so the next proposal needs two new consecutive periods. Targets change only on Accept (rule 4 re-derives them, `source = adapted`).
- **Where:** a card on UF-02.1 Today and on UF-11.2. Never on UF-08.* or UF-09.* (principle 1).
- **Offline:** the card shows, but Accept and Keep are disabled until the device is back online.

## Consequences
T-0101 encodes this in `docs/engine-rules.md` rule 9. T-0100 adds `plan_checkins` (period index, completed counts, proposal, answer, answered_at). T-0202 tests it with simulated histories.

## Revisit when
After 4 weeks of real use, or if users report proposals as nagging or too slow.

## Amended
Amended 2026-09-29 by D-0061 (human review). Read it together with this file.
