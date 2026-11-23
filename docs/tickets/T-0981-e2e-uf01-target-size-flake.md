---
id: T-0981
title: "Root-cause the one-off failure of the UF-01 onboarding 44 px target check (uf-01-onboarding.spec.ts AC6)"
lane: qa
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4]
decisions: [D-0197]
deps: []
status: done
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
- Build (qa, T-0981 UF-01): NOT REPRODUCED on unfixed code (AC1 honest result). Under 6-8 busy loops on 4 cores: AC6 x20 (4 workers) 20/20; uf-01 + uf-08-level-change x4 (6 workers, 140 tests) 139/140, the one red being an unrelated UF-01.5 AC-14 write-order test (`writes` empty, line 369) that failed under load; AC6 x60 (8 workers) 60/60. No measured box was captured. Static reading: the CSS gives every row/chip/segment `min-block-size: 44px`, so a mid-transition or font-swap box can only read small if the stylesheet (lazy UF-01 chunk CSS) or `[data-wl-state]` styles land a frame after the markup that `toBeVisible()` already accepted. Most likely mechanism: a one-shot `getBoundingClientRect()` taken in the same task as the visibility check, before layout settled. Fix (a hardening against that mechanism, not a proven cause): `tests/e2e/helpers/settled-box.ts` (`settledBox`, `settledTargets`) waits for `document.fonts.ready` and running animations, then reads until 3 frames agree; no sleeps, no assertion retries.
- AC2: AC6 x30 under 6 busy loops, 6 workers, both files: 30/30. AC3: `.wl-option` forced to 40 px in the test (backup copy, restored with cp, cmp identical): red, `UF-01.2 Build muscleHypertrophy · 6–12 reps height  Expected >= 44, Received 40`.
- AC4: every spec with a one-shot `boundingBox()` feeding a 44 assertion (21 specs, 52 call sites) now uses `settledBox`; the 21 changed specs ran 417/417. Left as is, safe: uf-11-account, uf-11-excluded, uf-11-favorites, uf-11-plan-layout (a single in-page `getBoundingClientRect` after a prior wait on the loaded content; none flaked, and they measure many nodes in one frame), and canvas/figure specs (geometry, not 44 px targets).
- Follow-up: the UF-01.5 AC-14 write-order test is load-sensitive (empty `writes`); needs its own ticket.
