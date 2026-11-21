---
id: T-0977
title: End-to-end check of "one side at a time" labels, counting and offline
lane: qa
screens: [UF-09.3, UF-09.4, UF-03.3, UF-06.2, UF-04.2, UF-01]
decisions: [D-0260, D-0262, D-0263]
deps: [T-0974, T-0975, T-0976]
status: todo
---
## Why
Proves the whole feature in a browser: the labels, the count of one hard set per both-sides set, the engine cost pin and the principles (one task on screen, onboarding under 60 s). Runs last (D-0263 §10).

## Scope
- In: a Playwright spec for dumbbell-row and side-plank through focus mode, summary, history and how-to; offline run; engine cost pin; axe and target size.
- Out: product code changes (failures go back as follow-ups), the parked time change (T-0978).

## Acceptance criteria
- AC1 Given a signed-in user logging dumbbell-row 10, 10, 9 at 12 kg, When the set screen, summary and history are opened, Then each shows "per arm" in the formats of T-0974 and T-0975, and side-plank shows "40 s per side".
- AC2 Given the same sets, When Balance is opened, Then back coverage rose by 3 hard sets, not 6.
- AC3 Given 3 sets of a flagged row planned in a 30-minute budget, When the engine cost is read, Then it equals a bilateral row's (D-0262 pin), and a search of `packages/engine` and the vendored copy finds no `unilateral`.
- AC4 Given a new user with zero history, When the first flagged set is shown, Then the label is there from the first set; Given a user returning after 10 days off, Then the label and hold rules are unchanged.
- AC5 Given the library cached and the network off, When a flagged set is logged, Then the label shows, the set queues with plain reps and weight, and it uploads after reconnect; Given online, Then the same set uploads at once.
- AC6 Given UF-09.3, UF-09.4 and UF-04.2 with a flagged row, When axe runs, Then it passes and targets are at least 44 px; UF-09 shows no new element (one reps line, no extra row or step; UF-09.9 unchanged).
- AC7 Given a new user, When onboarding to a first plan, Then it completes in under 60 s as before.

Checklist (D-0197 §7): AC4 and AC5 cover first launch/returning and online/offline.

## Paths you may change
Lane `qa`: `tests/e2e/**` (new spec and fixtures it needs).

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0977` and cite screen IDs. Run only this spec (`npx playwright test <file>`) through `scripts/locked.sh heavy`.

## Build / accept log
