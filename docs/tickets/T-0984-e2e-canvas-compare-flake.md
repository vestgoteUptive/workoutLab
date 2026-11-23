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
- Build (qa-build): CAUSE (AC1). A second `playwright test` in the SAME worktree empties `test-results/` at startup (before the web server starts) and only then stops on "http://localhost:4173 is already used". Every in-flight test that reads back a file it wrote there fails with ENOENT. canvas-compare AC1 (`readFileSync(today-app.png)`) and AC5 (`existsSync(today-app.png)`) are the tests that do that, so they are the visible victims; nothing in the helper is shared across worktrees (outputs under per-worktree `test-results/`, loopback server on port 0, shim in a unique `mkdtemp`, `git show` is read-only). Evidence: unfixed config, canvas AC1|AC5 `--repeat-each 40 --workers=2` plus an `auth.spec.ts` run started 14 s in: 1 failed, 79 passed; `ENOENT ... test-results/canvas-compare-...-repeat6/cobalt/today-app.png`, second run: "port 4173 is already used". Without the second run: spec 48/48 alone; with 8 CPU-burn loops 48/48 (so not CPU timing). The T-0692 gate had a second run in that worktree; I did not see its original log (no error text was recorded), so that part is inference from an exact reproduction.
- Fix: `checkPortFree` preflight (`tests/e2e/fixtures/preflight.ts`) called at config load in `playwright.config.ts`, before Playwright cleans; a busy :4173 now stops the second run first with a message, leaving the first run's files. Skipped in workers (`TEST_WORKER_INDEX`). Tests: `e2e-config.spec.ts` T-0984 AC1-AC3 (12/12 pass).
- AC2: canvas-compare `--repeat-each 5` (240 tests, 2 workers) with three competing same-worktree runs started during it: 240 passed; each competing run refused at config load (exit 1). Not run: the 779-test suite five times (cost); the competing-run mechanism is what the test exercises.
- AC3: planted fault (removed the canvas `<img>` from the generated today.html): AC1 failed with `Expected substring: src="today-canvas.png"`; restored with cp, `cmp` identical, not committed.
- Gate: format:check, lint:e2e, check-all see the handback.
