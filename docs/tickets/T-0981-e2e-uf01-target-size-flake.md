---
id: T-0981
title: "Root-cause the one-off failure of the UF-01 onboarding 44 px target check (uf-01-onboarding.spec.ts AC6)"
lane: qa
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4]
decisions: [D-0197]
deps: []
status: ready
---
## Why
In the T-0686b gate (2026-11-23), `tests/e2e/uf-01-onboarding.spec.ts` "T-0605 … AC6 every option row, chip, segment, button and link is ≥ 44 × 44" failed once (34 tests, 2 workers). It then passed 112/112 (uf-01 ×4) and 105/105 (uf-01 + uf-08-level-change ×3). The test measures `getBoundingClientRect()` once, right after the screen becomes visible, so a box caught mid-transition (scale/opacity enter animation), before the web fonts settle, or before a lazily loaded stylesheet applies would read small. A flake is not a root cause.

## Scope
- In: reproduce (CPU pressure, `--repeat-each`, more workers), name the cause with evidence, fix the measurement so it reads the settled layout (e.g. wait for `document.fonts.ready` and for `document.getAnimations()` to finish, or poll the size), and apply the same fix to any other spec that measures 44 px targets the same way.
- Out: app CSS changes, unless the cause is a real undersized frame a user can tap (then report it as a product defect).

## Acceptance criteria
- AC1 Given the cause, When it is written in the log, Then it names the mechanism and the evidence (a reproduced failure with the measured box, or a trace).
- AC2 Given the fix, When the AC6 test runs with `--repeat-each 30` under the same load that reproduced it, Then all pass.
- AC3 Given a planted fault (one option row set to 40 px tall), Then the test still fails.
- AC4 Given the other specs that measure targets with a one-shot `getBoundingClientRect`, Then each uses the shared settled-measure helper or is listed with why it is safe.

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · `-w lint:e2e`, `-w format:check` green · commit messages start with `T-0981`.

## Build / accept log
