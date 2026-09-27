# User Flows — v2

Source of truth for screens and IDs. Prototype canvas (clickable in Play):
https://claude.ai/artifact/VRmZLyeChxb6WR4zLbkz8w

Reference screens by ID in issues, PRs and commits, e.g. `UF-09.5: add haptic at 10 s`.
New screens take the next step number (UF-09.10). New flows take the next flow number (UF-10).
Supersedes `user-flows-v1.md`; the v1 core model below still applies.

## Core model (from v1)

Hard sets per body area (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves)
over a rolling 14-day window, compared with per-area targets. Suggestions (UF-08.2) fill the
biggest gaps within the user's time budget.

> Rolling 14 days everywhere, including UF-06.1 (D-0002). The window is the current local day plus the 13 before it (D-0013). Prototype numbers are only illustrative; screens show what the engine returns.

## Design principles

1. **One task on screen during a workout.** Focus mode (UF-09) shows only the current step. Everything else is behind Pause (UF-09.9).
2. **Time is a first-class input.** The time budget (UF-08.1) shapes exercise selection, set counts and the mid-workout time check (UF-09.8).
3. **Pre-fill, don't ask.** Weights and reps are pre-filled from the plan and history; the user only edits when they miss.
4. **Explain the why.** Every suggested exercise carries a one-line reason.
5. **Deterministic engine.** Suggestions and swaps are rule-based and testable.

## Flow index

| Flow | Screens | Purpose | Influences |
|---|---|---|---|
| UF-01 Onboarding | .1 Welcome · .2 Goal · .3 Level & equipment · .4 Schedule & plan · .5 Account | Personal plan in < 60 s | Fitbod, Hevy |
| UF-02 Today | .1 Today · .2 Workout preview | Daily entry point | Strong, Hevy |
| UF-03 List view | .1 Active (set table) · .2 Rest · .3 Summary | Classic logging, reached from Pause | Strong, Hevy |
| UF-04 Exercise library | .1 Browse · .2 Exercise detail · .3 Compare variants | Explain every exercise and variant | JEFIT, wger |
| UF-05 Swap (in workout) | .1 Swap sheet | Replace mid-session | Fitbod |
| UF-06 Progress | .1 Overview · .2 Exercise history | Consistency, volume, strength trend | Hevy, Strong |
| UF-07 Routine builder | .1 Edit routine | Exercises, sets, progression rule | Liftosaur, Hevy |
| UF-08 Session setup | .1 Time & energy · .2 Suggested · .3 Swap · .4 Ready | Time-boxed, gap-driven workout | Fitbod, Future, NTC |
| UF-09 Focus mode | .1–.9 (below) | One step at a time | Apple Fitness, NTC |
| UF-10 Balance | .1 All areas · .2 Area detail | All areas vs target over 14 days, and why | Fitbod, Hevy, Garmin |
| UF-11 Plan check-in | .1 Check-in · .2 Plan · .3 Edit plan | Adaptive targets; edit goal, rhythm, priorities | Apple Fitness, Freeletics |

Shared components: C-01 Body map, C-02 Tab bar.

## UF-01.5 Account

Comes after UF-01.4 (D-0014). "Save your plan" with a magic link or Google. Returning users reach it from "I have an account" on UF-01.1. The UF-01.4 plan is computed on the device and saved after sign-in. There is no guest mode, and the < 60 s is measured from UF-01.1 to UF-01.4.

## UF-08 Session setup

**Entry:** Start on UF-02.1 or UF-02.2.

- **UF-08.1 Time & energy**
  - Minutes stepper (±5, 15–120) and quick chips 20/30/45/60/90. Shows "done by HH:MM".
  - Toggle: warm-up counts in the time budget (default on).
  - Energy: Low / Normal / High. Low trims accessory sets, keeps main-lift weights. High may add a back-off set.
  - Live fit line: "Lower A fits: N exercises, M sets".
- **UF-08.2 Suggested workout**
  - Time-budget bar: one segment per item, proportional to estimated minutes; unused time shown as empty; turns orange if over.
  - "Why" chips for the whole session (e.g. days since last trained, area below target).
  - Per exercise: sets × reps · weight · minutes · one-line reason; swap and remove actions. Warm-up is not removable.
  - Shuffle picks alternates for non-main exercises.
  - Changing time rebuilds the list (main lift kept, accessories trimmed or added).
- **UF-08.3 Swap before starting**
  - Asks why: equipment taken / discomfort / variety / short on time. Reason changes ranking.
  - Each alternative shows muscle match, time cost and equipment; top result marked "Best match".
  - Option "Always use this in <routine>".
- **UF-08.4 Ready**
  - Summary: duration, exercises, sets, finish time.
  - Explains focus mode in four steps. Settings: sound cues, voice 3-2-1, keep screen awake.
  - Start → UF-09.1.

## UF-09 Focus mode

Every screen: pause button, thin progress bar (warm-up + one segment per exercise), exercise index. No other chrome.

| ID | Screen | Shows | Primary action | Timer |
|---|---|---|---|---|
| UF-09.1 | Get ready | 5-s countdown, first item | Start now / Skip warm-up | 5 s auto |
| UF-09.2 | Warm-up | Move name, figure, one cue | Pause · restart · next move | 40 s per move, auto-advance |
| UF-09.3 | Current set | Exercise, "Set n of N", weight × reps, plate loading, one cue | **Done set** (200 px) | none |
| UF-09.4 | Confirm set | Pre-filled reps and weight, reps in reserve | Save · start rest | auto-save after 5 s unless touched |
| UF-09.5 | Rest | Countdown ring, next set only | −15 s · +15 s · Skip | auto-start; orange + cue at 10 s; "GO" at 0 |
| UF-09.6 | Next exercise | Name, illustration, sets/reps/weight, cue | I'm ready · Swap | set-up countdown 60 s |
| UF-09.7 | Timed set | Hold name, ring | Pause/resume | 3-s get-in-position, then hold time; auto-logs |
| UF-09.8 | Time check | Minutes behind, projected finish, 3 options | Continue | only between exercises, only when behind |
| UF-09.9 | Paused | Elapsed, left, sets done | Resume · swap · skip · how-to · list view · end | all timers stopped |

**Loop per set:** 09.3 → 09.4 → 09.5 → 09.3. **Between exercises:** 09.8 (if behind) → 09.6 → 09.3. **Finish:** UF-03.3 summary.

## UF-10 Balance

Full spec and ACs: `docs/specs/uf-10-balance.md` (D-0013). **Entry:** the body map on UF-02.1, the Balance card on UF-06.1, "See balance" on UF-03.3. Never reachable from UF-08 or UF-09.

- **UF-10.1 All areas**
  - Header "Last 14 days · date range", C-01 body map, and nine rows: `load / target`, a coverage bar (`coverage-0..4`), a `warn` outline when the area needs attention, and a "Recovering" tag.
  - Order: attention first, then deficit descending, then the fixed area order.
  - Zero history: every area `0 / target`, with "Start workout". Offline: "Offline · last synced HH:MM", recomputed on the device including queued sets.
- **UF-10.2 Area detail**
  - `load / target`, deficit %, target source, "Last trained N days ago", a 14-day strip (sets per day) and the contributing exercises.
  - When the engine flags rule 6: a "Recovering" tag explained as "≥ 6 weighted hard sets in the last 48 h".

## UF-11 Plan check-in

Full spec and ACs: `docs/specs/uf-11-plan-checkin.md` (D-0018). Principle: targets adapt, and never silently.

- **UF-11.1 Check-in**: a card on UF-02.1 and UF-11.2 when two 14-day periods in a row were under (< 70 % of the planned minimum) or over (> 110 % of the planned maximum). It proposes rhythm −1 or +1 per week on both bounds, clamped to 1–7, and shows the clamped values (1–2 → "Switch to 1–1 per week?", never "0–1"; 6–7 → "Step up to 7–7 per week?"). No card when the clamped rhythm equals the current one (1–1 under, 7–7 over). It previews the new targets. Accept / Keep current. Never shown on UF-03, UF-08 or UF-09. Offline: the actions are disabled.
- **UF-11.2 Plan**: goal, rhythm, priority areas, per-area targets with source, next check-in date, the last 3 check-ins.
- **UF-11.3 Edit plan**: goal, rhythm (1–7 per week), up to 3 priority areas. Save re-derives the targets and resets the check-in streak.

## Open questions

Answered by default (revisit in Phase 5):
- Guest mode: no; the account step comes after the plan preview (D-0014). Importing history (Apple Health, Strava): out of scope v1 (owner product-owner, `docs/gaps.md` §D, Phase 5 `wl-idea`).
- Hard-stop clock time on UF-08.1: both; a finish time converts to minutes at start (owner product-owner, T-0303).
- Watch companion, lock-screen live activity, voice cues: out of scope v1 except the 3-2-1 cue in UF-08.4 (owner product-owner, Phase 5 `wl-idea`).
- Carry weights between variants on a swap (UF-05, UF-08.3): yes when the variant shares a primary area and equipment type (owner product-owner, T-0306).
- Prototype inconsistencies (the plank on UF-09.7, set counts): the engine output is the truth (D-0002).
