---
id: D-0254
title: "Estimated 1RM: Epley, from a session's best hard set of a weighted, non-timed exercise with 1–10 reps; reps only (no RIR); one point per session"
status: revisit
date: 2026-11-20
by: product-owner (spec, proposed for the engine lane)
area: product
builds-on: D-0219, D-0015, D-0024
---
## Context
The owner asked for an estimated one-rep max per exercise with a chart over time (inspired by wger). Rule 15 already ranks records by Epley (H-36) but never shows the number. Spec: `docs/specs/estimated-1rm.md`.

## Decision
1. **Formula:** Epley, `weightKg × (1 + reps / 30)`, and `reps = 1` gives the weight itself. The same constant as rule 15, so a record and a chart peak agree. Not Brzycki.
2. **Valid reps 1–10.** A set with 11+ reps, 0 reps or null reps gives no estimate (it still counts for records and load).
3. **Sets:** after `normalizeHistory`, hard sets only, of library exercises with `kind = "exercise"`, not timed, `externalLoad = true`, `weightKg > 0`. Warm-ups, tombstones and unknown exercises never count.
4. **One point per (exercise, session):** the highest estimate; ties to the earlier `completedAt`, then the smaller `clientId`.
5. **Reps only, no RIR adjustment** in v1: `rir` is optional and mixing adjusted and unadjusted sessions would step the line.
6. **Excluded:** timed, bodyweight (`externalLoad: false`), and bodyweight exercises with added load.

## Consequences
- The engine ticket (T-0961) writes this as rule 16 with examples (D-0255).
- Defaults the owner may change: the 1–10 range, reps-only, bodyweight-with-load excluded.

## Revisit when
- Most logged sets carry an `rir`, or users report the estimate is off at 8–10 reps.
- Weighted bodyweight lifts (pull-ups with a belt) need support.
