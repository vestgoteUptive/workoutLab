---
id: TR-0030
status: resolved
raised_by: orchestrator on the Phase 3 grooms (T-0301–T-0304 vs T-0305–T-0308)
date: 2026-09-29
---
## Conflict
Two product-owners groomed Phase 3 in parallel, and neither saw the other's output. Groom A wrote D-0063 (conventions), D-0064, D-0065 and D-0066. Groom B wrote D-0067 (plumbing), D-0068, D-0069 and D-0070. Both set cross-flow conventions (strings, routes, hand-offs, seams, import bans), and their tickets name each other's seams differently:
- T-0304 said "List view" navigates to `/session/:id/list`, while T-0305a said it renders inside `/session/:id`.
- The swap is a UI `applySwap → SessionPlan` in T-0306b but an engine `applySwap → Workout` (T-0224) in T-0303c/D-0065.
- B wrote "whatever hook T-0304 exposes", while A defined `useFocusSession()`.
- T-0308c edits `Today.tsx` freely, and T-0305a/T-0306b get free grants in `features/UF-09/**`.
- There are partial `upsertSession` rows (D-0068 §2, D-0069 §6).
- There are two swap sheets with different copy (UF-08.3, UF-05.1).
- The e2e files are named differently.

## Options
1. Let one groom's decisions win wholesale (D-0063 said "D-0067 wins where they overlap").
2. Pick one convention per point in a new decision, and fix the tickets to match.

## Blocking
Every Phase 3 feature child, T-0318, T-0319, T-0224.

## Resolution
Option 2: **D-0071** (decided).
- It supersedes D-0063 §1, §2, §4, §5, §6 and D-0067 §2 (strings/routes/bans), §4, §5 in part. Notes were added to both, plus amendment notes on D-0065, D-0066, D-0068 and D-0069.
- The ticket files edited to match are T-0301, T-0302, T-0303, T-0304, T-0305, T-0306, T-0307 and T-0308.
- New ticket files: docs/tickets/T-0318-phase3-plumbing.md and docs/tickets/T-0319-offline-caches-v2.md.
- No contract change. No human gate is crossed.
- Follow-ups:
  - engine: T-0224 per D-0071 §7, with its own rule 12 addendum decision
  - product: write the T-0224 ticket file (worked examples from the former T-0306b AC-B7–B9)
  - web-shell: T-0313 extends to the D-0071 §9 patterns
  - board: the dependency and status edits returned to the orchestrator
