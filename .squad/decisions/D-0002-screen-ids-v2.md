---
id: D-0002
title: User flows v2 (Design-docs) is the only source of screen IDs
status: decided
date: 2026-09-27
by: orchestrator
area: product
---
## Context
`docs/user-flows-v1.md`, `docs/PRD.md` and the root `CLAUDE.md` use v1 IDs. `Design-docs/docs/product/user-flows.md` (v2) renumbers the flows and says it supersedes v1. The same ID means different screens in the two versions (UF-06 = Logging in v1, Progress in v2). The prototype also shows weekly sets on UF-06.1, and its set counts don't match between screens.

## Decision
- v2 is the source of truth. Tickets, commits and code use v2 IDs only.
- v1 features missing from v2 get new flows: **UF-10 Balance** (all areas vs target, area detail; was v1 UF-08) and **UF-11 Plan check-in** (adaptive targets, edit goal/rhythm/priorities; was v1 UF-09). Sign-up/login is **UF-01.5 Account** inside onboarding.
- Rolling 14 days everywhere, including UF-06.1.
- Prototype numbers are illustrative. Screens show what the engine returns.
- `docs/user-flows-v1.md` gets a banner "superseded by D-0002" and is otherwise frozen.

## Consequences
The product-owner rewrites the PRD scope table to v2 IDs (T-0001).
