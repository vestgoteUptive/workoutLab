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
- Build (qa): `tests/e2e/uf-09-one-side.spec.ts`, 18 tests, green (1.0 min, 2 workers). It seeds its own flagged rows (`dumbbell-row` arm, `side-plank` side; the shared fixture is untouched, its unflagged `db-row` "Dumbbell row" is dropped from the spec's library so search is unambiguous). AC to test: AC1 focus = "every set reads 12 kg over × 10 per arm..." (+ barbell control, + side-plank "Hold 0:40 per side"), summary/history = "UF-03.3 PR band and UF-06.2 ..." (+ control, + side plank "40 s per side", + UF-03.1 List view "Set 2 reps per arm"); AC2 = "AC2 coverage" (dumbbell-row and barbell-row both back 0 to 3 of 16, not 6); AC3 = "zero history: 3 sets..." (flagged vs same row unflagged: same row detail and budget line) + "finds no 'unilateral'" (packages/engine, vendored engine); AC4 = same zero-history test (label on the first set) + "returning after 10 days off" (pre-fill 12 kg and plan equal unflagged); AC5 = "AC5 offline" (label from cache, queue plain 10 / 12 kg, 0 writes offline, upload after reconnect; online upload at once is in the AC1 test); AC6 = "AC6 accessibility" (axe + 44 px on UF-09.3, .4, UF-04.2; same blocks and buttons as a bilateral row; UF-09.9 same 6 buttons); AC7 = "AC7 onboarding" (3 activations, 9-area plan under 5 s, record under 60 s, no per-side words).
- Planted faults (each restored with cp, cmp clean, none committed): F1 confirm-set.tsx group label "Reps" -> AC1 focus red; F2 UF-06 stats.ts weighted row word null -> UF-06.2 test red; F3 engine load.ts `w * 2` -> both AC2 tests red (6 / 16); F4 engine comment containing "unilateral" -> grep test red; F5 UF-01 ScheduleScreen timingMs +61 s -> AC7 red (61671 ms).
- Gate: `-w format:check` clean, `-w lint:e2e` clean. `check-all.mjs` lists only files this branch did not touch (per-side.ts, uf-03/06/09 flow files, other tickets) as lane-path errors against a stale local `main`; nothing for this ticket's files.
- Product notes (no product code changed): (1) UF-09.3 shows the flagged label one render after the set (the cached detail is read in an effect), so each set paints unlabelled for a frame; the tests wait for it. (2) The AC3 engine pin is read through UF-08.2 (row detail and budget line), not by importing the engine.
