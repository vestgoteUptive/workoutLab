---
id: D-0013
title: Balance (UF-10) — the window is today plus 13 local days; coverage steps at 0 / <⅓ / <⅔ / <1 / ≥1; attention first
status: revisit
date: 2026-09-27
by: product-owner (T-0001)
area: product
---
## Context
Engine rule 3 says "last 14 days" without saying whether that means 336 hours or calendar days. D-0003 defines five coverage tokens but not the thresholds between them. UF-10 and the C-01 body map need both, and they must match the engine.

## Decision
- **Window:** the user's current local calendar day plus the 13 days before it (14 cells in the UF-10.2 strip). A set counts if the local date of its `completed_at` falls in the window. The timezone comes from the device.
- **Coverage ratio** `r = load / target`. Steps: `coverage-0` if load = 0; `coverage-1` if 0 < r < 0.33; `coverage-2` if 0.33 ≤ r < 0.66; `coverage-3` if 0.66 ≤ r < 1; `coverage-4` if r ≥ 1.
- **Attention:** a `warn` outline whenever the engine's `needsAttention` is true (rule 5). The UI never computes attention itself.
- **Order on UF-10.1:** attention areas first, then deficit descending, then the fixed order chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves.
- **Numbers:** load shows one decimal only when it is fractional ("7.5 / 20", "8 / 20").

## Consequences
T-0101 writes the window definition into rule 3 and the step thresholds into the balance output (`coverageStep`), so the engine computes them and not the UI. T-0003 uses the thresholds for the C-01 legend.

## Revisit when
The designer or a human reviews C-01/UF-10 on a device (same trigger as D-0003).
