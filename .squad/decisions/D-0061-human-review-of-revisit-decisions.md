---
id: D-0061
title: Human review of the H-07 revisit decisions — most confirmed; goal changes reps, check-in after one period, equipment profiles plus a custom list
status: decided
date: 2026-09-29
supersedes: none
amends: D-0018 (period count), D-0022 (equipment choice), D-0024 (rep slots)
lane: product
tickets: [T-0214, T-0215, T-0216]
---
## Context
H-07 asked the human to review the defaults the squad had marked `revisit`. The orchestrator put one question per decision, with a recommendation, to the human on 2026-09-29. This file records the answers. Where an answer changes behaviour, it names the contract change, and a follow-up ticket carries it out.

## Decision
**Confirmed as they are** (status `revisit` → `decided`; they reopen only through their own "Revisit when" trigger or a new decision):
- **D-0005:** keep the wger text under CC-BY-SA 4.0, with attribution on UF-04.2. Share-alike applies only to the exercise text. The human accepts it, and we don't need to replace the text before launch.
- **D-0014:** an account is required at UF-01.5 after the plan preview. No guest mode.
- **D-0015 / D-0020:** set sync stays client-clock based ("newest `edited_at` wins", tombstones, immutable `completed_at`). Two-device editing of the same set is not a real use case.
- **D-0017:** v1 NFRs unchanged: English only, kg only, no third-party analytics, EU region, in-app export and deletion.
- **D-0026:** double progression unchanged. RIR is logged but not used.
- **D-0030:** effort rating stays 1–5.
- **Internal decisions**, with no user-facing effect: D-0019, D-0021, D-0023, D-0029 and D-0059. (D-0031's guard exclusions are also confirmed, but the file stays `revisit` because its ramp values do, see below.)

**Kept as `revisit`, with a trigger:**
- **D-0003, D-0013 (and the ramp values in D-0031):** keep the ramp and thresholds. The human reviews C-01 on a real phone once T-0300d is merged and the app runs (H-12), and the values are tuned then. The tokens allow ΔE_OK ≤ 0.02 of tuning without a new decision (D-0019).
- **D-0027:** the attention and recovery thresholds stay. Tune them after real use.

**Changed:**
1. **The goal changes rep ranges (amends D-0024 "Reps").** Rep slots depend on `profile.goal`:

   | goal | main lift | other compounds | isolation |
   |---|---|---|---|
   | `get_stronger` | 3–5 | 5–8 | 10–15 |
   | `build_muscle` | 6–8 | 8–12 | 10–15 (today's values) |
   | `general_fitness` | 8–12 | 10–15 | 10–15 |

   Level still doesn't change reps, and goal and level still don't change targets (D-0027 rule 4 unchanged). The time model is unchanged (work stays 45 s per set). Rule 14 progression uses the slot's low/high as it does today, so it follows automatically. Contract change: `docs/engine-rules.md` rule 7's rep line (engine lane). Ticket T-0214.
2. **The check-in proposes after ONE period (amends D-0018 "Proposal").** A single evaluated 14-day period that is under (completed < 0.7 × 2·min) leads to a proposal of rhythm −1. A single period that is over (completed > 1.1 × 2·max) leads to +1. Clamping (1–7), Accept/Keep, the streak reset and "never on UF-08/UF-09" are unchanged. After a reset, the next proposal needs one new eligible ended period (D-0027 `resetDate` rule unchanged). Contract change: `docs/engine-rules.md` rule 9 (engine lane). Ticket T-0215.
3. **Equipment: three profiles plus an editable list (amends D-0022 point 6).** UF-01.3 keeps the three quick profiles (Bodyweight / Dumbbells / Full gym) for the 60 s budget. An "Edit equipment" checklist of the 10 vocabulary items is added in account settings. It writes `profiles.equipment[]` directly, and the engine already filters on that list. No schema or engine change. Ticket T-0216 (web).

## Consequences
- engine: T-0214 (rep slots by goal) and T-0215 (one-period check-in). Each updates its `docs/engine-rules.md` rule and the worked examples, re-derives the affected T-0201/T-0202 expectations, and has the simulated 14-day history tests. T-0214 changes `packages/engine/src/session.ts`, so it must not run in parallel with T-0205 or any other `session.ts` change.
- web: T-0216, equipment checklist in account settings.
- product: UF-01.2 goal copy can now promise a real difference (strength = heavier, fewer reps).
- H-07 is closed. A new H-12 (review C-01 on a device) carries the D-0003/D-0013 trigger.

## Revisit when
The first user test, or 4 weeks of real use, shows the one-period check-in proposes too often (then go back to two periods for raising only), or the goal rep ranges feel wrong.
