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

## Build / accept log
- Build (qa): `tests/e2e/uf-09-rir-weight-step.spec.ts`, 16 tests, green (`scripts/locked.sh heavy npx playwright test ... --trace off`). AC1 hold 80x8 + reason; AC2 hold once (RIR 1) then 82.5x6; AC3 empty RIR 82.5x6; AC4 1.25 to pre-fill 21.25 and + step, Use default back to 22.5/25, server override; AC5 offline RIR 0 set holds next pre-fill and syncs rir 0, offline step applies and upserts on reconnect; AC6 zero history (curl with override, bench), 12 days off = 80x6 no reason; AC7 onboarding 3 activations under 60 s, no exercise_settings request or RIR/step text; AC8 axe clean, chips/field/buttons >= 44 px, plank and push-up have no row. Biceps curl stands in for db-curl (the fixture library has no db-curl). Faults (restored with cp, cmp clean): F1 rirMin gate >= 0 (4 red: AC1, AC2 hold, AC6 4-day, AC5 offline); F2 heldOnce off (AC2 step-up red); F3 effective library ignores step (3 red: AC4 x2, AC5 step); F4 queued rir dropped (AC5 offline red); F5 stepper ignores exercise step (AC4 + red). Gate: format:check, lint:e2e, check-all green. No product defects found.
