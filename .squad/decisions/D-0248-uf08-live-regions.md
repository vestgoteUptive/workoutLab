---
id: D-0248
title: "UF-08.2: 'one live region' means the status line plus the Removed line's own persistent role=status; tests count two (T-0940 AC19, T-0941 AC14)"
status: decided
date: 2026-11-16
by: orchestrator (T-0940 build)
area: design
amends: D-0239
---
## Context
T-0940 AC19 asks for "exactly one role=status" on UF-08.2. The Removed line keeps its own persistent `role="status"` (D-0199 §10), and the UF-08.2 screen spec (Empty mode › Live region) says it is unchanged. Read literally, the AC would break D-0199.

## Decision
On UF-08.2, the status line is the only region that carries the D-0239 §9–§13 messages. The Removed line keeps its own region. A test counts exactly two `role="status"` elements: the status line and the Removed line. The budget line is never live in empty mode. T-0940 AC19 and T-0941 AC14 are read this way.

## Revisit when
A screen-reader test finds two regions confusing.
