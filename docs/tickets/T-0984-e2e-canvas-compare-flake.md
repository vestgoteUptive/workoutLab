---
id: T-0984
title: "Root-cause the canvas-compare e2e failures seen once in the full suite (AC1 and AC5 at 390 x 844)"
lane: qa
screens: []
decisions: [D-0197]
deps: []
status: ready
---
## Why
In the T-0692 full-suite gate (2026-11-23, 779 tests, 2 workers, while other worktrees ran heavy Playwright jobs) `tests/e2e/canvas-compare.spec.ts` AC1 ("captures app and canvas artboard … links both from today.html") and AC5 ("a missing ref writes only the app PNG and annotates") both failed. The spec alone passed 48/48 right after. The diff under test (engine rule 7.2) does not touch the canvas tooling. A flake is not a root cause.

## Scope
- In: reproduce (full suite, parallel worktree load), name the cause (shared output path, port, preview server, timing), fix the test or tooling.
- Out: app code.

## Acceptance criteria
- AC1 The log names the cause with evidence.
- AC2 The full suite with a parallel heavy run in another worktree passes canvas-compare 5 times in a row.
- AC3 A planted fault (missing artboard link) still fails AC1.

## Paths you may change
`tests/e2e/**`, `scripts/canvas-compare*` (if it exists)

## Contract impact
none.

## Definition of done
Every AC has evidence · `-w lint:e2e`, `-w format:check` green · commit messages start with `T-0984`.

## Build / accept log
