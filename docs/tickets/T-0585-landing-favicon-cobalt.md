---
id: T-0585
title: "Landing favicon.svg.ts uses Cobalt tokens (plan.bg square, plan.ink bars)"
lane: landing
screens: []
decisions: [D-0208, D-0046]
deps: [T-0584]
status: done
---
<!-- Written by the orchestrator 2026-10-12 (T-0584 follow-up; the board row had no ticket file). Three-line change, built by the orchestrator. -->

## Why
The landing favicon still reads the flat Chalk & Iron `color.bg` / `color.accent`, which T-0625 will retire.

## Scope
- **In:** `apps/landing/src/pages/favicon.svg.ts` reads `tokens.color.plan.bg` (square) and `tokens.color.plan.ink` (bars); the AC13 test asserts exactly those two colours.
- **Out:** the app icons (T-0616).

## Acceptance criteria
- **AC1.** `dist/favicon.svg` uses exactly `plan.bg` and `plan.ink`, and no flat `color.bg`/`color.accent` read remains in `favicon.svg.ts`.

## Paths you may change
- `apps/landing/src/pages/favicon.svg.ts`, `apps/landing/test/ac13-theme-colour-favicon.test.ts` (lane)
- `docs/tickets/T-0585-landing-favicon-cobalt.md`

## Contract impact
none

## Build / accept log
Archived in `docs/tickets/log/T-0585.md` (D-0157).
