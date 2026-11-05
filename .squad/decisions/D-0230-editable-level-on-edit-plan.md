---
id: D-0230
title: "Training level is editable on UF-11.3 Edit plan; a level-only save writes profiles.level alone (no target re-derive, no check-in withdraw, plan_changed_at unchanged); UF-11.2 shows Level"
status: revisit
date: 2026-11-05
by: product-owner (idea: editable level)
area: product
amends: docs/specs/uf-11-plan-checkin.md (UF-11.3 "level and equipment happen in settings"), D-0070 §3 (for a level-only save)
builds-on: D-0064, D-0081, D-0020, D-0021, D-0030
---
## Context
UF-01.3 preselects Beginner (D-0064 §2) and nothing after onboarding writes `profiles.level`. The uf-11 spec said "Changing level and equipment happens in settings"; equipment landed on UF-11.4 (D-0136), level never did. Re-running onboarding doesn't help (D-0064 §8, the existing profile wins). A real user was stuck behind "Above your level" on UF-08.5.

Facts from main (2026-11-05):
- `EditPlanBody.tsx` drafts goal, rhythm and priorities. `save-plan.ts` always runs three writes: `area_targets` upsert (`source: "default"`), `profiles.update`, `plan_checkins` withdraw of a pending answer.
- The `profiles_before_write` trigger sets `plan_changed_at := now()` only when `goal`, `rhythm_min`, `rhythm_max` or `priority_areas` change (data-model). `level` is already client-writable through `profiles_update`.
- Rule 4: goal and level don't change targets in v1. Rule 0: `isEligible` reads `profile.level` on every call.

## Decision
1. **Where:** UF-11.3 Edit plan gains a "Training experience" radiogroup (Beginner / Intermediate / Advanced), after Goal and before Rhythm, with the UF-01.3 labels and hints and one line "Level changes which exercises we suggest, not your targets." UF-11.2 "Your plan" shows a Level fact between Goal and Rhythm.
2. **Save:**
   - Only `level` differs from the baseline → one write, `profiles.update({ level })`. No `area_targets` upsert (an "Adapted" source survives), no `plan_checkins` withdraw (a pending card stays). `plan_changed_at` is untouched by the server trigger, so the rule 9 streak is unchanged.
   - Any of goal, rhythm or priorities differs → the D-0070 §3 three writes as today, with `level` in the `profiles` update.
   - Then `refreshAll` (as today), so the cached profile the offline engine reads has the new level.
3. **No reset** because nothing a level change affects feeds targets (rule 4) or the check-in evaluation (rule 9). Resetting would throw away adapted targets for no reason (principle 4: targets change only for a reason and never silently).
4. **No engine change, no contract change.** `docs/data-model.md` may gain a clarifying note on the `level` row ("client-writable, UF-11.3, D-0230; does not change `plan_changed_at`"), which this decision names; it changes no schema. A pgTAP test pins the trigger behaviour (spec AC3).
5. **Return target:** `/plan/edit?from=favorites` returns to `/plan/favorites` on Save and Cancel; any other `from` value is ignored (no open redirect).

## Consequences
- Spec: `docs/specs/editable-level.md` (AC1–AC7, AC9, AC11–AC13). `docs/specs/uf-11-plan-checkin.md` UF-11.3 section and `Design-docs/docs/product/user-flows.md` UF-11.2/UF-11.3 updated by product in the same change.
- Tickets: design screen spec, a backend pgTAP test, a data-model note, two UF-11 web tickets, an e2e.

## Revisit when
- Users ask for level in Account settings next to equipment instead.
- Level starts to change reps, rest or targets (then a level change must re-derive targets and this decision is revisited).
