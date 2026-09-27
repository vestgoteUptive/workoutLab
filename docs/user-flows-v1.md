> **Superseded** by `Design-docs/docs/product/user-flows.md` (v2), decision D-0002. Kept as history; do not use these IDs.

# Rolling 2-Week Workout — User Flows v1

Prototype canvas: https://claude.ai/artifact/E6PubNtobMhrncWvibuoRo (Design canvas, clickable in Play)

Reference screens by ID when iterating (e.g. "UF-04.2: add warm-up block").

| Flow | Screens | Purpose | Influences |
|---|---|---|---|
| UF-01 Sign up & log in | .1 Welcome, .2 Create account / log in | Value prop with body map, SSO-first | Fitbod, Hevy, Strava |
| UF-02 Onboarding | .1 Goal, .2 Priority areas, .3 Flexible rhythm (range/week → per 14 days), .4 Equipment & level | < 60 s to first plan | Freeletics, Fitbod, Apple Fitness |
| UF-03 Today | .1 Home: 14-day body map, attention areas, session strip, Start CTA | Daily entry point | Fitbod heatmap, Whoop/Garmin, Apple rings |
| UF-04 Start workout | .1 Time available (minutes or hard stop, energy, location), .2 Suggested workout with "why", swap/shuffle | Time-boxed, gap-driven suggestions | Fitbod, Nike Training Club, Future |
| UF-05 Exercise guide | .1 Illustration, muscles, steps, mistakes | Images with explanations | NTC, JEFIT, Hevy |
| UF-06 Logging | .1 Active workout (countdown, set table, rest), .2 Running over time → smart cuts | Finish on time | Strong, Hevy, Apple Watch, Fitbod |
| UF-07 Summary | .1 Before→after balance, effort rating, next up | Close the loop | Strava, Hevy, Whoop |
| UF-08 Balance | .1 All areas sets vs target (14 d), .2 Area detail | Rolling-window insight | Fitbod, Hevy, Garmin |
| UF-09 Plan | .1 Adaptive target check-in, goal/rhythm/priority edit, auto targets | Non-static targets | Apple Fitness, Freeletics |
| Components | C-01 Body map, C-02 Tab bar | Shared | — |

Core model: hard sets per body area (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves) over a rolling 14-day window vs per-area targets. Coverage colours: pale = untouched → deep teal = on target; orange outline = needs attention.

Open questions: guest mode before account; import history (Apple Health/Strava); warm-up counted in time budget; watch companion.
