---
id: T-0438
title: "UF-09 comment drift after T-0435: the SessionWrites docblock and the createSessionWrites comment still say a plan write landing after finish() started 'moves nothing' (D-0153 §6) — folded into T-0394"
lane: web-feature:UF-09
screens: [UF-09.8, UF-09.9]
decisions: [D-0153, D-0162]
deps: [T-0435, T-0394]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner. Folded into T-0394 (D-0162 §2): no separate branch or build. The work and its test are T-0394 AC-8. The orchestrator marks this row done when T-0394 merges. -->

## Why
T-0435 review: since D-0153 §6, a plan write that lands after `finish()` started is held in
`SessionWrites.landed`. A failed finish applies it, and a finish that succeeds drops it. Two
comments on `main` still say such a write "moves nothing":
- the `SessionWrites` docblock in `apps/web/src/features/UF-09/session.tsx`;
- the comment above `createSessionWrites()` in `apps/web/src/features/UF-09/host.tsx`.

## Scope
- In: the two comments, delivered by **T-0394** (AC-8 and its "T-0438 comments" scope bullet).
- Out: any code change.

## Acceptance criteria
- AC-1 Given `main` after T-0394 merges, When `t0394.comments.test.ts` reads `session.tsx` and
  `host.tsx`, Then neither contains "moves nothing" and both comments cite `D-0153 §6`. This is
  T-0394 AC-8. On today's `main` it is red.

## Paths you may change
None of its own. T-0394 lists this file as an extra, so it can record "delivered by T-0394".

## Contract impact
None.

## Definition of done
T-0394 is done with AC-8 passing.

## Notes
- **Why it's folded:** T-0415 (in QA) edits both files, and T-0394 is already serial after it and
  edits `host.tsx`. A separate two-comment branch would only add a merge in the same files.
