---
id: D-0226
title: "UF-09.3 Done set is the Cobalt full-width session button, at least 64 px tall (owner, 2026-10-09); supersedes D-0118's 200 px height (NFR-A11Y-2 target size still holds: ≥ 44 px, full width)"
status: accepted
date: 2026-10-09
by: owner (asked during T-0595 review)
supersedes: D-0118 (the 200 px height only)
builds-on: D-0208, D-0211
---
## Context
D-0118 / NFR-A11Y-2 made Done set 200 px tall. The Cobalt design (README, canvas "In session · set") uses the shared `.wl-button--session`: full width, at least 64 px. T-0595 AC3 followed the design, which broke the 200 px e2e pins. The owner was asked and chose the design.

## Decision
1. Done set (and Save on UF-09.4) use `.wl-button--session`: full width, `min-height` 64 px.
2. The e2e and unit pins move from ≥ 200 px to ≥ 64 px: `uf-09-focus.spec.ts` (T-0304b AC-12), `uf-09-ready.spec.ts` (T-0304h AC-2) and `current-set.test.tsx`.
3. Everything else in NFR-A11Y-2 stands: a 44 px minimum everywhere, and full width keeps the target easy to hit.

## Revisit when
Users miss the button mid-set, or the owner asks for a bigger target.
