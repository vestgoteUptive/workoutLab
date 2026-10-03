---
id: T-0456
title: "UF-07.1: going offline while Delete has focus in the confirm dialog drops focus to body; Shift+Tab from outside the button list should land on the last button — folded into T-0454"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0164, D-0162]
deps: [T-0453, T-0454]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner. Folded into T-0454 (D-0164 §2): no separate branch or build. The work and its tests are T-0454 AC-4, AC-5 and AC-6. The orchestrator marks this row done when T-0454 merges. -->

## Why
T-0453 review: with the delete dialog open, going offline while "Delete" has focus disables it.
Chromium drops focus to `<body>`, where the trap can't see Tab. With focus on no button, Shift+Tab
lands on the first button, not the last.

## Scope
- In: delivered by **T-0454** (D-0164 §4).
- Out: any work on this branch.

## Acceptance criteria
- AC-1 Given `main` after T-0454 merges, When T-0454's AC-4, AC-5 and AC-6 run, Then they pass. On
  today's `main` AC-4 and AC-5 are red.

## Paths you may change
None of its own. T-0454 lists this file as an extra, so it can record "delivered by T-0454".

## Contract impact
None.

## Definition of done
T-0454 is done.

## Build / accept log
Archived in `docs/tickets/log/T-0456.md` (D-0157).
