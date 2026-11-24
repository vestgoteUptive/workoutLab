---
id: T-1016
title: "e2e UF-04.1 T-0639 AC8 read the result count before the Legs filter applied (PR #75 CI)"
lane: qa
screens: [UF-04.1]
decisions: [D-0197]
deps: []
status: ready
---
## Why
PR #75 CI run 45331140049: `tests/e2e/uf-04-library.spec.ts` "T-0639 AC8 Legs, open an exercise, Back returns to the Legs list with the same count" expected "24 results" after Back and got "8 results". The test clicks Legs, then waits for the count to match `/^\d+ results$/` — which the unfiltered "24 results" already does — and stores that as `before`. When the filter commits a frame later the real Legs count is 8, and Back correctly returns to 8. The app is right; the test read too early.

## Acceptance criteria
- AC1 The test stores `before` only after the count has changed from the unfiltered value (and the row count matches it).
- AC2 A planted fault (Back drops the `group` filter) still fails the test.
- AC3 The spec passes `--repeat-each 20`.

## Paths you may change
- `tests/e2e/uf-04-library.spec.ts`

## Contract impact
none.

## Definition of done
Every AC has evidence · `-w lint:e2e`, `-w format:check` green · commit messages start with `T-1016`.

## Build / accept log
