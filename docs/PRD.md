# PRD — workoutLab (v1)

- **Screen IDs:** user flows v2, `Design-docs/docs/product/user-flows.md` (D-0002). `docs/user-flows-v1.md` is history only.
- **Updated:** 2026-10-07 by product-owner (favorite exercises, D-0202, GitHub #46); 2026-10-06 (excluded exercises, D-0199); first written 2026-09-27 (T-0001)

## Problem
Set and rep loggers show what you did, not what you've neglected. Users want to know which body areas need attention, and to get a workout that fits the time they have today.

## Core model
Hard sets per body area (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves) over a rolling 14-day window, compared with per-area targets. The window is the current local day plus the 13 before it (D-0013), used on every screen, including UF-06.1 (D-0002). The rules live in `docs/engine-rules.md` and are implemented as pure functions in `packages/engine`.

## Principles (non-negotiable)
1. **One task on screen during a workout.** UF-09 Focus mode shows only the current step. Everything else is behind UF-09.9 Paused.
2. **Time budget is a first-class input.** Every workout start asks how long the user has (UF-08.1). The warm-up counts by default (D-0004).
3. **Deterministic engine.** Rules pick the exercises. An LLM may only phrase the explanations.
4. **Targets are not static.** They adapt to what the user actually does, through UF-11 Plan check-in (D-0018). Always ask, never change silently.
5. **Onboarding under 60 seconds** to a first plan (UF-01.1 → UF-01.4, D-0014).

## Scope v1
| Flow | Screens | Summary | Ticket |
|---|---|---|---|
| UF-01 Onboarding | .1 Welcome · .2 Goal · .3 Level & equipment · .4 Schedule & plan · .5 Account | A personal plan in < 60 s. Account (magic link or Google) comes after the plan preview (D-0014). | T-0301 |
| UF-02 Today | .1 Today · .2 Workout preview | The daily entry point: C-01 14-day body map, attention areas, the UF-11.1 check-in card when one is pending, and Start. | T-0302 |
| UF-03 List view | .1 Active · .2 Rest · .3 Summary | Classic set-table logging, reached from UF-09.9. UF-03.3 is the finish summary: before → after balance, effort rating, next up. | T-0305 |
| UF-04 Exercise library | .1 Browse · .2 Exercise detail · .3 Compare variants | Explains every exercise and variant, with licence attribution on .2 (D-0005). | T-0306 |
| UF-05 Swap (in workout) | .1 Swap sheet | Replace an exercise mid-session with ranked alternatives. | T-0306 |
| UF-06 Progress | .1 Overview · .2 Exercise history | Consistency, volume and strength trend. Volume is shown per rolling 14 days. | T-0307 |
| UF-07 Routine builder | .1 Edit routine | Exercises, sets and progression rule. | T-0308 |
| UF-08 Session setup | .1 Time & energy · .2 Suggested · .3 Swap · .4 Ready · .5 Add exercise | A time-boxed, gap-driven workout with a "why" per exercise. | T-0303 |
| UF-09 Focus mode | .1 Get ready … .9 Paused | One step at a time: timers, auto-save, time check, pause. | T-0304 |
| UF-10 Balance | .1 All areas · .2 Area detail | All areas vs target over 14 days, and why. Spec: `docs/specs/uf-10-balance.md`. | T-0307 |
| UF-11 Plan check-in | .1 Check-in · .2 Plan · .3 Edit plan · .4 Account settings · .5 Excluded exercises · .6 Favorite exercises | Adaptive rhythm and targets, and editing goal, rhythm and priorities. Spec: `docs/specs/uf-11-plan-checkin.md`. | T-0308 |
| Excluded exercises | UF-11.5, plus controls on UF-04.2, UF-08.2, UF-08.3, UF-05.1 | A durable "never suggest" list per user: never picked by the engine or offered as a swap, still in the library and history. Spec: `docs/specs/excluded-exercises.md`. | D-0199 (T-0532…T-0542) |
| Favorite exercises | UF-11.6, plus a toggle on UF-04.2 and a tag on UF-04.1 and UF-08.2 | A durable favorites list per user (GitHub #46): a favorite is tried first inside the areas the gaps choose, never forced and never past recovery, equipment, level or the time fit. Mutually exclusive with excluded exercises. Spec: `docs/specs/favorite-exercises.md`. | D-0202 (tickets to be filed) |
| Add and reorder exercises | UF-08.5, plus UF-08.2 (Add exercise, Start with this, Reorder) and UF-09.9 (Do {name} later) | Before a workout: search and add exercises (favorites first) for this visit only, pick the one to start with, and reorder; the engine re-suggests the rest within the time budget, and an add that doesn't fit is refused. During a workout: move the current not-started exercise one place later from Pause, for a busy machine. No engine or contract change. Spec: `docs/specs/uf-08-add-and-reorder.md`. | D-0205 (tickets to be filed) |

Shared components: C-01 Body map, C-02 Tab bar (T-0300).

## Non-functional requirements
`docs/specs/non-functional.md` (D-0017): offline-first logging, sync conflicts, performance budget, WCAG 2.2 AA, English only, no third-party analytics, EU data with export and deletion, wall-clock timers.

## Out of scope v1
Each item is answered by a default in `docs/gaps.md` §D, revisited in Phase 5 through `wl-idea`.
- Watch companion, lock-screen live activity and voice cues, except the 3-2-1 sound cue in UF-08.4.
- Social features, nutrition.
- Importing history (Apple Health, Strava).
- Guest mode. Nothing past UF-01.5 works without an account (D-0014).
- Manual per-area target overrides (cut from UF-11 to keep it small).
- Platforms other than the PWA. v1 is free.
- Weights in lb (kg only, NFR-I18N-3).

## Resolved questions
| Question | Answer | Where |
|---|---|---|
| Does the warm-up count toward the time budget? | Yes. A toggle on UF-08.1, on by default, about 3 min. | D-0004 |
| Which hue means "on target"? | Plan coverage ramp `plan.coverage-0..4` (plan.raise → white, OKLCH). Attention is a 2 px `plan.attention` outline with a gap. | D-0003, D-0013, D-0208, D-0211 |
| Prototype inconsistencies (the plank on UF-09.7, set counts)? | The engine output is the truth; prototype numbers are only illustrative. | D-0002 |
| Weekly vs 14-day on UF-06.1? | 14 days everywhere. | D-0002 |
| Guest mode before the account? | No, but the account step comes after the plan preview. | D-0014 |
| Hard stop (clock time) instead of minutes on UF-08.1? | Both. A finish time converts to minutes at start. | owner product-owner, T-0303 |
| Carry weights over between variants on a swap? | Yes, when the variant shares a primary area and equipment type; otherwise use history or leave blank. | owner product-owner, T-0306 |
| Project name, platforms, commercial intent? | "workout LAB" (no company byline, D-0194; was "workout LAB by Uptive"). PWA only, free in v1. | owner product-owner, T-0309, T-0526 |
| Can a user stop an exercise from ever being suggested? | Yes: excluded exercises (UF-11.5). The list is an engine input (`excludeIds`, `rankSwaps`), exclusion beats a routine pin, and an area left with no exercise gets a neutral notice, never a fallback. Writes are online-only. | D-0199 |
| Can a user keep favorite exercises, e.g. barbell back squat on leg days? | Yes: favorite exercises (UF-11.6, UF-04.2). A soft preference: one new first ranking key inside an area's candidates (`sessionInput.favoriteIds`), so the gaps still choose the areas and recovery, equipment, level and the time fit still win. Several per area. An exclusion removes a favorite and the reverse; in the engine exclusion wins. | D-0202 |
| Swap ranking by reason, energy modifiers, weight progression and pre-fill, shuffle, main-lift concept (gap B4)? | Engine rules v1: rules 7–14 in `docs/engine-rules.md`, each with worked examples. | T-0101, D-0024, D-0025, D-0026, D-0027 |

## Open questions
| Question | Owner | Ticket / decision |
|---|---|---|
| Can the CC-BY-SA exercise text ship, or do we write our own before launch? | human (H-07) | D-0005 |
| Is the coverage ramp legible on a real device? | designer / human (H-07) | D-0003, D-0013 |
| Check-in thresholds and period length after real use. | product-owner | D-0018 |

## Success metrics
All metrics are computed with SQL on our own tables (NFR-AN-2). There is no third-party analytics.
| Metric | Definition | Target |
|---|---|---|
| Time to first plan | `onboarding_timing`: UF-01.1 first render → UF-01.4 first render with a plan, in ms. | p50 ≤ 45 s, p90 ≤ 60 s |
| Onboarding completion | Users who created an account (UF-01.5) ÷ users who reached UF-01.4 in the first user test. | ≥ 70 % |
| Finished within budget | Sessions with ≥ 1 hard set where `ended_at − started_at ≤ time_budget_min × 60 s + 120 s`, ÷ all sessions with ≥ 1 hard set. | ≥ 80 % |
| Areas on target after 4 weeks | For users on day 28 after onboarding with ≥ 4 completed sessions: the mean share of the 9 areas with `load ≥ target` (`coverage-4`). | ≥ 50 % |
| Check-ins answered | `plan_checkins` rows answered within 7 days of the proposal ÷ proposals shown. | ≥ 70 % |
