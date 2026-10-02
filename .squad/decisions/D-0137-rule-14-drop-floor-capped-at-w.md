---
id: D-0137
title: Rule 14's reentry and deload drop is capped at W, so a light off-grid lift never gets a heavier "drop"
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0235)
area: engine
supersedes: D-0057 §4 (the drop formula only, in part; the one-increment floor and the W = 0 case stay in force)
builds-on: D-0057 §4, D-0062 §4, D-0131, D-0132
---
## Context
Rule 14 steps 2 (`reentry`, gap ≥ 21) and 5 (`deload`) drop the weight to `max(inc, floorInc(0.9 W))` when `W > 0` (D-0057 §4, `packages/engine/src/prefill.ts` `dropped`). The one-increment floor stops a light lift from dropping to 0 kg. But it has no cap. When `W` is below one increment, the "drop" is heavier than the last performance. For example, bench-press logged at 2 kg (inc 2.5) and then left for 3 weeks gives `max(2.5, floorInc(1.8)) = 2.5` kg, labelled `reentry`. UF-09.3 then asks a returning beginner to lift more than last time, under a reason that promises less.

D-0131 settled the same problem for the High-energy back-off: one increment, capped at the main weight. Its "Revisit when" says rule 14 should use the same wording once it gets a cap. The T-0220 groom raised this as a product follow-up.

Options considered:
1. **Cap at W** (`min(W, max(inc, floorInc(0.9 W)))`). The drop is never heavier than last time. When `W < inc`, the weight holds at `W` and the reps go to the low end, which is still a lighter session than the one that failed or the one before the break.
2. **Leave it uncapped.** One increment is the smallest weight on the grid, but `W` itself was logged, so the user can lift it. Rejected: a heavier "drop" breaks the reason's meaning and principle 4 (targets follow what the user actually does).
3. **Drop to 0 or null.** Rejected by D-0057 §4: an empty bar is not an honest suggestion for a loaded lift.

## Decision
1. **Formula.** With `inc = exercise.incrementKg ?? 2.5` and a loaded lift (`externalLoad: true`):
   - `W > 0` → `min(W, max(inc, floorInc(0.9 × W, inc)))`, rounded to 3 decimals;
   - `W = 0` → 0 (unchanged, D-0062 §4);
   - bodyweight (`externalLoad: false`) → 0 (unchanged, D-0057 §2).

   `floorInc(0.9 W) ≤ 0.9 W < W` for every `W > 0`, so the cap binds only when `inc > W`, that is when `0 < W < inc`. The result is then `W`. Every other drop is byte-identical to D-0057 §4: R14-E4 (102.5 → 90) and R14-E5 (100 → 90) are unchanged.
2. **Kind and reps unchanged.** Step 2 still returns `reentry` and step 5 `deload`, at the slot's low reps. A capped result can equal `W`. The kind still reports why the engine chose low reps.
3. **Timed sets unchanged.** The timed `reentry` (`clamp(max(15, floor5(0.9 × min)))`) is out of scope.
4. **Contract change (engine lane).** `docs/engine-rules.md` rule 14:
   - steps 2 and 5: `max(inc, floorInc(0.9 W))` becomes `min(W, max(inc, floorInc(0.9 W)))` (the text T-0221 writes is the base);
   - the "Drop floor" edge-case bullet (D-0132 §1) gains one sentence: "The drop is capped at `W`, so when `0 < W < inc` steps 2 and 5 give `W` (D-0137)." It keeps every token T-0221 pins (`incrementKg ?? 2.5`, `one increment`, `0 + inc`), and adds a worked case in the same bullet: "bench-press 2 × 6, 6, 6 on 09-01: 2 × 6 (`reentry`), never 2.5".
   - one Traceability row for T-0235.
   - The `## 14.` heading, the "Last performance" paragraph, steps 1, 3, 4, 6 and 7, and the R14-E1…R14-E9 lines stay byte-identical. No new `- **R14-E…` line is added: T-0221 pins exactly nine.
5. `api/openapi.yaml` is unchanged (`PrefillResult.weightKg` stays `[number, null]`, `minimum: 0`).

## Consequences
- engine (T-0235): implements §1–§4 with unit tests, a property test and the simulated 14-day histories. The orchestrator regenerates the vendored engine at merge (D-0053 §1).
- The rule 7.4 back-off on a capped drop follows D-0131 unchanged: `W = 2`, inc 2.5 gives a 2 kg back-off.
- web: no change. UF-08.2 and UF-09.3 render `prefill.weightKg` as given.
- D-0131's "Revisit when" (rule 14 cap) is discharged: both floors now read `min(W, max(inc, …))`.

## Revisit when
- Users on light lifts edit the weight down after most re-entries. A capped `W` may then still be too heavy after a long break, and the reps or set count should carry the drop instead.
- Increments become per-user (a 1 kg plate set). The cap then binds less often, and this decision may be unnecessary.
