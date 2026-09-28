---
id: D-0041
title: Rule 9 (T-0202) — rename plan_updated_at → plan_changed_at in engine-rules.md; evaluateCheckin inputs, periods = last ≤ 2 ended eligible, exact-integer thresholds, checkinSessions helper
status: revisit
date: 2026-09-28
by: product-owner (T-0202 groom)
area: engine
---
## Context
D-0035 established that `profiles.plan_changed_at` **is** D-0027's `plan_updated_at`, and that no `plan_updated_at` column exists. `docs/engine-rules.md` v1 still says `plan_updated_at` in F-profile and rule 9. D-0035 is a data decision, so it can't change the engine contract. The rename needs an engine decision that names it.

Grooming T-0202 found more gaps that rule 9, D-0018, D-0027 and D-0037 don't settle:
- The `CheckinEvaluation.periods` list (D-0037 §8) doesn't say which periods it holds.
- D-0037 §6 gives `CheckinSession = {id, startedAt, hardSetCount}` and names a `PlanCheckin` input without a shape. D-0036 §2 says T-0202 decides "session with ≥ 1 hard set" with `isHardSet`, but the simulated histories (`test/fixtures/histories.ts`) are `HistorySet[]`, not sessions.
- `0.7 × 2·min` and `1.1 × 2·max` are decimal factors, so a floating-point version can be off by one ulp (in JS, `1.1 * 3` is `3.3000000000000003`). Which side of the line an exact boundary like 7 or 11 (at rhythm 5–5) lands on then depends on how the expression is written.
- Nothing says whether input order matters, or which check-in is "the last" when several rows exist.
- Nothing covers `now` before the onboarding date, sessions outside every period, or check-in rows with no answer.

## Decision
1. **Contract change (named here).** In `docs/engine-rules.md`, exactly three text edits:
   (a) F-profile: "`plan_updated_at` 2026-08-02" becomes "`plan_changed_at` 2026-08-02".
   (b) Rule 9, Reset: "local date of profile.plan_updated_at" becomes "local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041)".
   (c) R9-E13: "`plan_updated_at` 2026-09-20" becomes "`plan_changed_at` 2026-09-20".
   No other rule text changes. The engine field name stays `planUpdatedAt` (D-0035, D-0037 §6).
2. **Inputs.** `evaluateCheckin(sessions, profile, checkins, now, tz)` takes:
   - `sessions: readonly CheckinSession[]`, where `CheckinSession = {id, startedAt, hardSetCount}` as in D-0037 §6, unchanged. A session is completed when `hardSetCount ≥ 1`.
   - `profile: CheckinProfile = {rhythmMin, rhythmMax, priorityAreas, onboardedAt, planUpdatedAt}`, so a full D-0037 `EngineProfile` can be passed in. T-0201 owns `EngineProfile`.
   - `checkins: readonly {answeredAt: Instant | null}[]`, so any `PlanCheckin` superset can be passed in. Only `answeredAt` is read. A row with `answeredAt` null (shown, not answered) never resets anything. "The last `answered_at`" is the latest non-null instant, whatever the array order.
   - The result doesn't depend on the order of `sessions` or `checkins`. Session ids aren't deduplicated: each element counts once. `checkinSessions` gets unique ids from `sessions` rows.
3. **`checkinSessions(sessions: readonly {id, startedAt}[], history, library): CheckinSession[]`.** A new public helper. It runs `normalizeHistory`, then counts each session's sets with `isHardSet` (D-0036 §2). Warm-up sets, `kind: warmup` moves, tombstoned sets and unknown exercises therefore don't count. The output keeps the input order. Sets whose `sessionId` isn't in the list are ignored. The simulated-history tests take each session's `startedAt` from the earliest `completedAt` among its rows, tombstoned rows included.
4. **`periods` = the last ≤ 2 ended eligible periods, in ascending `index`.** Eligible periods form a suffix of the ended ones, so when there are two, they're consecutive. UF-11.1 `{a}` and `{b}` are `periods[0].completed` and `periods[1].completed`. `status` is set for each listed period, even when there is no proposal.
5. **Exact thresholds.** Under is `10·completed < 14·rhythmMin`. Over is `10·completed > 22·rhythmMax`. Both are integer arithmetic. This is rule 9 as written, without float drift.
6. **Edges.** `D` = the local date of `now`, and `onboardDate` = the local date of `onboardedAt`, both in `tz`. Period dates are local calendar days, so they don't drift across DST. If `D < onboardDate`, then `periods` is `[]`, `proposal` is null and `nextCheckinDate` = `onboardDate + 14`. Sessions whose local `startedAt` date is before `onboardDate` or after `D` count in no period. `previewTargets` lists the 9 areas in the fixed order as `{area, setsPer14d}` = `deriveTargets({proposed rhythm, profile.priorityAreas})`. `evaluateCheckin` throws `RangeError` for a `hardSetCount` that isn't an integer ≥ 0, for the D-0036 §3 instant errors, and for an invalid rhythm (as `deriveTargets` does).

## Consequences
- engine (T-0202): implements points 2–6 and makes the three point-1 edits.
- data (T-0102a/b): `CheckinSession` stays as in D-0037 §6. `PlanCheckin` may carry more fields; the engine reads only `answeredAt`.
- web-feature:UF-07 (T-0308): builds `CheckinSession[]` with `checkinSessions` from sessions ∪ the offline queue, and takes the card's copy numbers from `periods`.

## Revisit when
- UF-11.2 needs the engine to return more than two periods, for example a history chart.
- A stale library makes real sessions stop counting (point 3 inherits D-0034 §4).
- Users say that counting sessions from before a mid-period Keep (R9-E12) feels wrong.
