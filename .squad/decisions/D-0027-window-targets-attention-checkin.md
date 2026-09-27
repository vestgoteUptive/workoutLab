---
id: D-0027
title: Window rules made testable — rhythm factor in targets, needsAttention = deficit ≥ 0.5 and ≥ 6 days untrained, 48 h recovery clock, balance() shape, check-in reset window
status: revisit
date: 2026-09-27
by: product-owner (T-0101)
area: engine
---
## Context
Rule 4 says targets come from "goal + level + rhythm", but only gives defaults, so the UF-11.1 before → after preview would be empty. Rule 5's "fewer than ~40 % of the window's days remain" has no meaning in a rolling window. Rule 6 doesn't say how "48 h" is measured. D-0013 and D-0015 ask T-0101 to encode the window, the tombstones and `coverageStep`. D-0018 doesn't say which periods count after a reset.

## Decision
This decision names the change to `docs/engine-rules.md` rules 3, 4, 5, 6, 9 and 11. Rules 3 and 9 encode D-0013, D-0015 and D-0018 as written.
- **Targets (rule 4):** `target = roundHalfUp(base × S × P / 56)`, where `S = clamp(2 × (rhythmMin + rhythmMax), 7, 21)` and `P` = 5 for a priority area, 4 otherwise. The base is 20 / 16 / 12. With rhythm 3–4, the targets equal the old defaults. Goal and level do not change targets in v1.
- **Attention (rule 5):** `needsAttention = deficit ≥ 0.5 AND (lastTrainedDate is null OR D − lastTrainedDate ≥ 6)` (6 = ⌈0.4 × 14⌉). If the window holds no hard sets at all, every area is `false`. The empty state speaks instead.
- **Recovery (rule 6):** Σ weighted hard sets with `completed_at` in `(now − 48 h, now]` ≥ 6. This uses absolute time, not local days.
- **balance() (rule 11):** the fields in `docs/specs/uf-10-balance.md`, plus pass-through `targetSource` and `targetUpdatedAt`. The areas come already sorted in the D-0013 order.
- **Check-in reset (rule 9):** `resetDate = max(local date of the last plan_checkins.answered_at, local date of profiles.plan_updated_at)`. A period is eligible if it ends on or after `resetDate`. The engine evaluates the last two ended eligible periods. It is stateless: the proposal is recomputed on every open.

## Consequences
T-0200 implements rules 3–6 and 11. T-0202 implements rule 9. data (T-0100) adds `profiles.plan_updated_at` (set at onboarding and on UF-11.3 Save). T-0102 mirrors the balance() and evaluateCheckin() shapes.

## Revisit when
Users find the attention outline too noisy or too rare on UF-10.1, or rhythm 1–2 or 6–7 users report unrealistic targets.
