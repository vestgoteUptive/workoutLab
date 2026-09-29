---
id: D-0070
title: UF-07 routines v1 and UF-11 plan/check-in UI — routines are ordered exercise lists (no sets/reps editing), online-only plan writes and their order, one-period card copy (D-0061), plan_checkins fields under one period, data follow-up T-0223
status: revisit
date: 2026-09-29
by: product-owner (T-0308 groom)
area: product
---
## Context
UF-07.1 edits a routine's exercises, sets and progression rule. But the engine ignores routines: `suggest` takes only `pinnedIds`, and T-0101 put routine-specific progression out of scope. Sets per exercise are fitted to the time budget (principle 2), and progression is rule 14 for every exercise (principle 3). So editable sets, reps or a progression selector would promise behaviour that doesn't exist.

UF-11 writes several rows with plain supabase-js calls (D-0001): `profiles`, 9 `area_targets` and `plan_checkins`. There's no transaction, so the write order decides what a partial failure leaves behind.

D-0061 changed the check-in to propose after ONE period (engine: T-0215). That breaks the UF-11 spec copy ("in the last two 14-day periods", `{a} and {b}`) and the schema:
- `plan_checkins.period_index ≥ 1` and `PlanCheckin.periodIndex minimum 1` reject period 0. Under one-period evaluation, period 0 can now trigger a proposal, as in UF-11 AC11-style zero history. D-0050 already flagged `CheckinPeriod.index`.
- `completed_prev` is `not null`, but there is no earlier period.

## Decision
1. **Routines v1 = a name plus an ordered list of 1–8 distinct exercises** (8 = `MAX_ITEMS`, rule 7.2).
   - UF-07.1 edits the name (1–40 chars, trimmed), adds exercises (an in-screen search picker over `kind: exercise`), removes them and reorders them (move up / move down buttons, which are keyboard-accessible; drag is optional).
   - The progression card is read-only: "Double progression. When every set reaches the top of its rep range, the weight goes up next time. After a long break or two short sessions in a row, it steps back." This is rule 14 as the engine applies it.
   - No sets, reps or progression editing. Rows are written with `sets = 3` (rule 7.2 "pinned at 3"), `reps_min`/`reps_max`/`duration_s` null and `progression = 'double_progression'` (the column default).
   - Starting a workout from a routine (routine items → `sessionInput.pinnedIds` on UF-08.1) is a follow-up for web-feature:UF-08. Until then, a routine is a saved list shown on UF-11.2.
2. **Routine writes are online only.** Offline, Save and Delete are disabled with "Connect to save" (NFR-SYNC-3 server-wins, no queue).
   - Save: upsert `routines {id, name}` (a new routine gets a client `crypto.randomUUID()` id). Then `delete routine_items where routine_id = R and position >= n`, then upsert the n items `onConflict: 'routine_id,position'`. Then `refreshRoutines`.
   - Delete (after a confirm): `delete routines where id = R`, which cascades.
3. **UF-11 writes are online only, in this order.** Each step runs only if the previous one succeeded, and any failure shows "Couldn't update your plan. Try again." and keeps the screen state. After success, `refreshAll()` runs.
   - **Accept:** (1) upsert the 9 `area_targets` with `sets_per_14d` from `proposal.previewTargets` (the engine's values, principle 3) and `source 'adapted'`. (2) Update `profiles` `rhythm_min/max` to the proposal (the trigger bumps `plan_changed_at`). (3) Update the shown `plan_checkins` row to `answer 'accepted'`, `answered_at = now`. The order means a partial failure never records an answer for a plan that didn't change.
   - **Keep current:** update the row to `answer 'kept'`, `answered_at = now`.
   - **UF-11.3 Save:** (1) upsert the 9 targets from `previewTargets({rhythmMin, rhythmMax, priorityAreas})` (engine, D-0050 §2) with `source 'default'`. (2) Update `profiles` goal/rhythm/priority_areas. (3) Every unanswered `plan_checkins` row gets `answer 'withdrawn'`, `answered_at = now`.
4. **The row is inserted when first shown** (D-0021). When the card first renders online with a proposal and no row exists for its `period_index`, the client inserts one:
   - `period_index` = the last listed period's `index`
   - `completed_last` = its `completed`
   - `completed_prev` = the period before it in `periods` if there is one, else `completed_last` (see §6)
   - `rhythm_*_before` = the current profile, `proposed_*` = the proposal, `proposed_at = now`
   A `23505` makes the client read the existing row instead (the second-device rule). Offline, the card still renders, and the insert waits until the next online render.
5. **Card copy under D-0061 (one period).** The UI takes the numbers from the **last** entry of `evaluation.periods`, whatever the length of the list, so the copy works with the T-0202 two-period output and the T-0215 one-period output alike:
   - **Down:** "You trained {n} times in your last 14-day period ({d MMM}–{d MMM}). Your plan is {2·min}–{2·max}. Switch to {newMin}–{newMax} per week?"
   - **Up:** the same, ending "Step up to {newMin}–{newMax} per week?".
   - `{newMin}–{newMax}` is `proposal.rhythmMin/Max` from the engine, never UI arithmetic (the D-0018 clamp).
   - A before → after list follows: the 9 areas in the fixed order, "{Area} {current setsPer14d} → {previewTarget}".
   - This amends the spec copy in `docs/specs/uf-11-plan-checkin.md` §UF-11.1 (a product follow-up edits the spec).
6. **Data follow-up T-0223 (data lane, names the contract change).**
   - `plan_checkins.period_index` check `>= 0`.
   - `completed_prev` nullable, with null meaning "one-period evaluation".
   - `api/openapi.yaml`: `PlanCheckin.periodIndex` and `CheckinPeriod.index` get `minimum: 0` (the latter is the D-0050 follow-up), `PlanCheckin.completedPrev` becomes nullable, and the shared types are regenerated.
   - Until T-0223 lands, §4's fallback (`completed_prev = completed_last`) keeps inserts valid for periods ≥ 1. T-0308c depends on T-0223, so period 0 is never inserted against the old check.
   - When T-0223 lands, T-0308c writes `completed_prev = null` in the one-period case.
7. **Where the card may appear.** Only UF-02.1 (below C-01) and the top of UF-11.2. It's never on `/session/*` (UF-03, UF-08, UF-09), which is enforced by the D-0067 §2 import ban and a route test. Accept and Keep are disabled offline with "Connect to update your plan", and re-enable on the `online` event without a reload (UF-11 AC10). UF-11.3 Save is disabled offline too.

## Consequences
- T-0308a/b/c encode §1–§7.
- The data lane builds T-0223.
- A product follow-up updates the UF-11 spec copy and the ACs to one period (T-0215 re-derives the engine ACs).
- A web-feature:UF-08 follow-up: "Start from routine" → `pinnedIds`.

## Revisit when
- D-0061's revisit trigger fires (back to two periods), which restores the two-number copy.
- Users ask to set sets or reps per routine exercise. The engine would then need a routine input, which is a new engine decision.
- Partial-failure reports appear. Then move the Accept writes into one Edge Function or RPC.
