---
id: T-0924
title: UF-10 midnight-rollover flake: root-cause and fix
lane: web-feature:UF-10
screens: [UF-10.1]
decisions: [D-0113]
deps: []
status: review
---
## Why
`midnight-rollover.test.tsx` "no second refresh at the rollover" (AC-5) flaked in the T-0625 and T-0923 full gates and passed alone.

## Scope
- In: `apps/web/src/features/UF-10/use-balance.ts`, its `__tests__`.
- Out: everything outside the UF-10 folder.

## Acceptance criteria
- AC1 Given a signed-in online mount whose refresh re-read is still in flight, When the window rolls over at midnight, Then the late re-read does not repaint the old window (h1 and rows stay on the new window).
- AC2 (offline sibling) Given offline, the rollover is covered by the existing T-0343 AC-1 (no refresh exists to race).

## Paths you may change
`apps/web/src/features/UF-10/**`, this file.

## Contract impact
none

## Definition of done
Tests pass · gate green · commit cites T-0924 UF-10.

## Build / accept log
- Root cause (code race, not test timing): the refresh's post-refresh cache re-read captured `latest.current` before an async IDB read, then published unconditionally. If the 60 s rollover landed during that read, the rollover read painted the new window and the stale re-read then overwrote it with the old one, so AC-5's `h1` wait failed. Only reachable when IDB reads are slow (full-gate load).
- Red on unfixed code: new test "T-0924 AC-1 ..." forces the ordering deterministically (gate on the refresh re-read's `loadTargets`); failed at the final h1 assertion. Not reproducible by CPU load alone (6 runs with 8 busy loops, 3 UF-10 dir runs with 16 loops: all green), hence the deterministic test.
- Fix: `use-balance.ts` re-reads until `nowIso`/`timeZone` held still across the read, then publishes.
- After fix: file passes 3x; see gate below.
- Gate: typecheck/lint/test (-w) green, test:repo-checks, format:check, check-all green. 4 UF-10 dir runs under 8 busy loops: 167/167 each.
