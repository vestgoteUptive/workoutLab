---
id: D-0279
title: "Areas first and learn from edits: phases, ticket split, serial lanes, and the grooming defaults (UF-08 folder strictly serial, engine one at a time, layer 1 after layer 3)"
status: revisit
date: 2026-11-24
by: product-owner (groom mode)
area: process
builds-on: D-0157, D-0178, D-0274, D-0275, D-0276, D-0277, D-0278
---
> **Amended in part by D-0280 and D-0281 (2026-11-24).** New tickets: T-1009 (Start folded into UF-08.2, after T-0997, before T-0998), T-1007 and T-1008 (local ledger and sync, replacing the old T-1002), T-1010 (privacy notice). T-1001 is now the table, T-1002 the export. Phase 2 rows with no deps are `ready`.

## Context
The owner chose layer 3 first, then layer 1. Tickets are split by lane to at most about half a day of agent work each (D-0157 §7).

## Decision
1. **Phase 1, layer 3:** T-0992 (product docs), T-0993 (design), T-0994 and T-0995 (engine, serial), T-0996, T-0997, T-0998 (web UF-08, strictly serial), T-0999 (e2e). **Phase 2, layer 1:** T-1000 (design), T-1001 (data), T-1002 (web-shell), T-1003 (web UF-08), T-1004 (web UF-09), T-1005 (web UF-11), T-1006 (e2e). Phase 2 rows are `todo` until T-0998 is done; ready rows are those whose deps are done.
2. **Serial lanes:** the UF-08 folder (T-0996 → T-0997 → T-0998 → T-1003) never runs in parallel; one engine worktree at a time (T-0994 → T-0995); `apps/web/src/lib/i18n/flows/uf-08.ts` is a listed extra path of the UF-08 web tickets, so they stay serial.
3. **Release:** layer 3 ships progressively on merge (D-0210 style): the area view replaces the exercise list when T-0996 merges. Because T-0996 alone leaves "Reorder", "Shuffle" and empty-mode UI unreachable, T-0996 and T-0997 must both merge before a deploy; the orchestrator holds the deploy until T-0997 is done (no human gate, `main` stays green).
4. **Acceptance:** each AC covers both values of every binary condition it names (online/offline, empty/non-empty, first/returning, learning on/off, flagged/not).
5. **`todo` vs `ready`:** T-0992, T-0993, T-0994 `ready`; the rest `todo` with deps.

## Revisit when
The deploy hold causes trouble (then ship the area view behind the existing view's removal in one merge).
