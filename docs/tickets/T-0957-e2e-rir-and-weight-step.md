---
id: T-0957
title: End-to-end, RIR holds the weight and the own weight step reaches the workout
lane: qa
screens: [UF-04.2, UF-09.4, UF-08.2, UF-01]
decisions: [D-0250, D-0251, D-0259]
deps: [T-0953, T-0956]
status: todo
---
## Why
Proves the whole path in the browser: RIR logged in a workout changes the next pre-fill, and a step set on UF-04.2 flows to the pre-fill and the UF-09.4 stepper, including offline, with onboarding still under 60 s (principle 5).

## Scope
- In: Playwright specs under `tests/e2e/` with fixtures for a user with seeded history.
- Out: unit coverage (the build tickets).

## Acceptance criteria
- AC1 Given history 80 x 8, 8, 8 with RIR 2, 2, 0 for bench-press, When the user starts a workout including it, Then the pre-fill is 80 x 8 with the "Same weight again..." reason.
- AC2 Given a first session at RIR 1 and a second session at the same 80 x 8 top reps at RIR 1, When the third workout starts, Then the pre-fill is 82.5 x 6 (held once, then up).
- AC3 Given history with every RIR empty, When the workout starts, Then the pre-fill is 82.5 x 6 (no change for users who skip RIR).
- AC4 Given the user sets the step to 1.25 kg for db-curl on UF-04.2, When the next workout pre-fills it and the user taps + on UF-09.4, Then the pre-fill is `W + 1.25` and + moves by 1.25; Given "Use default", Then both return to 2.5.
- AC5 Given the device offline, When the user logs a set at RIR 0 at the top reps and starts the next workout, Then the pre-fill is `hold_effort` with no network; Given the user sets a step offline, Then it applies and, after reconnect, the upsert reaches the server.
- AC6 Given zero history for an exercise with an override, Then the first pre-fill is the usual first-time value. Given 12 days off after an RIR 0 session, Then the weight is `hold_after_break` and RIR is ignored.
- AC7 Given a new user, When they go from the first screen to the first plan, Then no new request or step appears and the timing test (under 60 s) passes.
- AC8 Given UF-04.2 with the row, Then axe reports no violations and chips are at least 44 px; for a timed exercise the row is absent.

## Paths you may change
- `tests/e2e/**`

## Contract impact
none

## Definition of done
Tests for every AC pass (run only these specs plus the onboarding timing spec) · `pnpm -w typecheck lint test` green · commit messages start with `T-0957` and cite UF-04.2 and UF-09.4.
