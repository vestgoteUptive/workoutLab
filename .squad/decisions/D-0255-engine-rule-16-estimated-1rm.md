---
id: D-0255
title: "Engine rule 16 estimatedOneRepMax(history, library, exerciseId): a pure, display-only per-session e1RM series computed on the device; nothing stored"
status: revisit
date: 2026-11-20
by: product-owner (spec, proposed for the engine lane)
area: engine
builds-on: D-0254, D-0219, D-0021
---
## Context
Principle 3 says numbers come from pure engine functions. D-0021 says load is computed on the device from history, with no server view. Rule 15 `records` is the model: pure, display-only, never read by `suggest`.

## Decision
1. **New rule 16 in `docs/engine-rules.md`** and a pure export `estimatedOneRepMax(history, library, exerciseId): E1rmPoint[]` from `packages/engine`, with `E1rmPoint { sessionId, clientId, completedAt, weightKg, reps, e1rm }`, oldest first (`completedAt`, then `clientId`). `e1rm` is unrounded. An unknown id, a timed or bodyweight exercise returns `[]`. The rules are D-0254.
2. **Display only.** `suggest`, `balance`, `timeCheck`, `rankSwaps`, rules 14 and 15 never call it. No existing output changes.
3. **No clock, no time zone, no randomness.** The 56-day window and local-date placement are the web's job (the engine's `localDate`), like rule 15's display filter.
4. **Nothing is stored or sent:** no column, migration, openapi change or export change. The contracts that change are `docs/engine-rules.md` (rule 16) and the engine package.
5. **Worked examples** R16-E1+ cover: the formula (100 × 8 → 126.667; 100 × 1 → 100), range edges (10 in, 11 out), session best, ties, warm-up and tombstone, timed, bodyweight, unknown id, shuffled and duplicated input, and a simulated progressive history (the R15-E12 balanced fixture) with a fixed asserted series.

## Consequences
- T-0961 (engine) adds the rule, export, tests and re-vendors `supabase/functions/_shared/vendor/**`.
- The web ticket depends on it; nothing else does.

## Revisit when
- A server-side or longer-than-56-day series is wanted (H-37).
