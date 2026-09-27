# PRD — workoutLab (draft)

## Problem
Set/rep loggers show what you did, not what you've neglected. Users want to know which body areas need attention and get a workout that fits the time they have today.

## Core model
Hard sets per body area over a rolling 14-day window vs per-area targets. See `engine-rules.md`.

## Scope v1
| Flow | Summary |
|---|---|
| UF-01 Sign up & log in | SSO-first, email fallback |
| UF-02 Onboarding | Goal, priority areas, flexible rhythm (range per week → per 14 days), equipment & level |
| UF-03 Today | 14-day body map, attention areas, Start CTA |
| UF-04 Start workout | Time available, energy, location → suggested workout with "why", swap/shuffle |
| UF-05 Exercise guide | Image, muscles, steps, common mistakes |
| UF-06 Logging | Focus mode, countdown, rest timer, smart cuts when running over |
| UF-07 Summary | Before → after balance, effort rating, next up |
| UF-08 Balance | All areas vs target, area detail |
| UF-09 Plan | Adaptive target check-in, edit goal/rhythm/priorities |

Full detail: `user-flows-v1.md`.

## Out of scope v1
Watch companion, social features, nutrition.

## Open questions
- Guest mode before account creation?
- Import history (Apple Health, Strava)?
- Does warm-up count toward the time budget?
- Coverage colour scale vs lime accent: which hue for "on target"?
- Project name, target platforms beyond PWA, commercial intent.
- Known prototype inconsistencies (plank screen outside its planned workout, set counts differing between screens): resolve before the spec is final.

## Success metrics (proposal)
- Time from sign-up to first suggested workout < 60 s
- % of workouts finished within the stated time budget
- Share of areas on target after 4 weeks of use
