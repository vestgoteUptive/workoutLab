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

> Gap to fix: UF-06.1 currently shows *weekly* sets per muscle. Align it with the rolling 14-day model.

## Design principles

1. **One task on screen during a workout.** Focus mode (UF-09) shows only the current step. Everything else is behind Pause (UF-09.9).
2. **Time is a first-class input.** The time budget (UF-08.1) shapes exercise selection, set counts and the mid-workout time check (UF-09.8).
3. **Pre-fill, don't ask.** Weights and reps are pre-filled from the plan and history; the user only edits when they miss.
4. **Explain the why.** Every suggested exercise carries a one-line reason.
5. **Deterministic engine.** Suggestions and swaps are rule-based and testable.

## Flow index

| Flow | Screens | Purpose | Influences |
|---|---|---|---|
| UF-01 Onboarding | .1 Welcome · .2 Goal · .3 Level & equipment · .4 Schedule & plan | Personal plan in < 60 s | Fitbod, Hevy |
| UF-02 Today | .1 Today · .2 Workout preview | Daily entry point | Strong, Hevy |
| UF-03 List view | .1 Active (set table) · .2 Rest · .3 Summary | Classic logging, reached from Pause | Strong, Hevy |
| UF-04 Exercise library | .1 Browse · .2 Exercise detail · .3 Compare variants | Explain every exercise and variant | JEFIT, wger |
| UF-05 Swap (in workout) | .1 Swap sheet | Replace mid-session | Fitbod |
| UF-06 Progress | .1 Overview · .2 Exercise history | Consistency, volume, strength trend | Hevy, Strong |
| UF-07 Routine builder | .1 Edit routine | Exercises, sets, progression rule | Liftosaur, Hevy |
| UF-08 Session setup | .1 Time & energy · .2 Suggested · .3 Swap · .4 Ready | Time-boxed, gap-driven workout | Fitbod, Future, NTC |
| UF-09 Focus mode | .1–.9 (below) | One step at a time | Apple Fitness, NTC |

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

## Open questions

- Guest mode before account; import history (Apple Health, Strava).
- Hard-stop clock time as an alternative to minutes (UF-08.1).
- Watch companion, lock-screen live activity, voice cues (UF-09).
- Carry weights over between variants when swapping (UF-05, UF-08.3).
- Known prototype inconsistencies: plank on UF-09.7 is not in the 45-min plan; set counts differ slightly between screens.
