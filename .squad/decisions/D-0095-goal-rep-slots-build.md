---
id: D-0095
title: Rep slots by goal (T-0214 build of D-0061 §1) — optional profile.goal on suggest/applySwap defaulting to build_muscle; F-goal fixture line instead of editing F-profile; back-off at the goal's main low
status: revisit
date: 2026-10-01
by: product-owner (T-0214 groom)
area: engine
builds-on: D-0061 §1, D-0057 §1, D-0040 §4, D-0093
---
## Context
D-0061 §1 (human, `decided`) makes the rule 7.2 rep slots depend on `profile.goal`:

| goal | main lift | other compounds | isolation |
|---|---|---|---|
| `get_stronger` | 3–5 | 5–8 | 10–15 |
| `build_muscle` | 6–8 | 8–12 | 10–15 |
| `general_fitness` | 8–12 | 10–15 | 10–15 |

Three build points are open:
1. `suggest` takes `profile: Pick<EngineProfile, "level" | "equipment">`, and the Edge Function
   (`supabase/functions/workouts/core.ts`) passes exactly those two fields. A required `goal`
   would break that caller's typecheck, and the backend lane owns it.
2. The rules' F-profile line has no goal. The T-0202 rename guard pins that line verbatim, so
   editing it would break an unrelated test.
3. Rule 7.4's back-off uses "the main reps", and rule 13's shuffled `previous` is pre-filled at
   the original's slot. Both read the slot.

## Decision
1. **Optional goal, safe default.** `suggest` and `applySwap` (D-0093) accept a profile with an
   optional `goal`. When it is absent, the slots are `build_muscle`'s, which are today's
   values, so every existing result is byte-identical. `EngineProfile.goal` stays required. Only
   the narrowed parameter type is widened. An unknown goal string throws `RangeError`.
2. **Every slot read uses the goal.** This covers:
   - each item's `repsMin`/`repsMax`;
   - the rule 14 slot passed to `prefill`, so progression follows automatically: "low" and
     "high" are the goal's;
   - the High back-off reps, which are the goal's main `repsMin` (get_stronger 3,
     general_fitness 8);
   - rule 13's `previous` pre-fill of the original exercise;
   - `applySwap`'s rebuilt slot.

   Timed items keep null reps. Costs are unchanged, because work stays 45 s per set (D-0061 §1).
3. **A goal change takes effect on the next `suggest`.** The engine is stateless. Rule 14 reads
   the last performance against the new range. For example, 100 × 8, 8, 8 becomes
   102.5 × 3 `increase` under get_stronger, and 100 × 9 `add_rep` under general_fitness.
4. **Contract text (engine lane):**
   - Rule 7.2's **Reps** line becomes the D-0061 §1 table, cited.
   - A new fixture line **F-goal** ("`goal` is `build_muscle` unless an example says
     otherwise, D-0061 §1, D-0095") is added after F-profile. F-profile itself stays verbatim.
   - New worked examples **R7-E14** (the slots by goal at zero history) and **R7-E15** (the
     same history progresses differently by goal).
   - A Traceability row for T-0214.
   - Rule 14's "Ranges come from rule 7.2 (low/high)" already covers progression and is
     unchanged.
5. **Callers.**
   - The Edge Function's `suggestProfile` should pass `goal` (backend follow-up). Until then the
     endpoint serves build_muscle slots, which is today's behaviour.
   - Web callers pass the cached profile, which includes `goal`.

## Consequences
- engine (T-0214): `src/session.ts` (the rep-slot function and the `suggest` profile type),
  `applySwap`'s source if T-0224 has landed, `src/types.ts` if a narrowed profile type is
  named there, `src/index.ts`, new tests, and `docs/engine-rules.md` §Fixtures, §7.2 and
  Traceability.
- backend: pass `goal` in `supabase/functions/workouts/core.ts` and regenerate the vendored
  engine (D-0053 §1).
- product: the UF-01.2 goal copy can promise a real difference (D-0061 Consequences).

## Revisit when
D-0061's trigger fires (the goal rep ranges feel wrong), or a goal should also change rest or
targets.
