---
id: D-0277
title: "Learn from edits: repeated swaps (3) and removals (2) within 60 days raise one prompt each, only on UF-08.2; yes reuses favorites and excluded exercises; \"Not today\" is never counted; no engine change"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow, owner request)
area: product
builds-on: D-0191, D-0199, D-0202, D-0235, D-0274, D-0017
---
## Context
Layer 1 of the owner's request (spec `docs/specs/learn-from-edits.md`). Existing mechanisms checked first: favorites (D-0202, rule 0.2) are exactly "prefer X, tried first in every area where it has weight 1.0"; excluded exercises (D-0199, rule 0.1) are "never suggest X"; the visit's `excludeIds` and the swap pins (D-0191, D-0235) are the per-session level; `avoidAreas` is the per-visit area skip. All are already engine inputs, visible and removable in UF-11.5 and UF-11.6, and covered by export and account deletion.

## Decision
1. **Reuse, no new preference kind.** A yes to a swap prompt adds the swap-in to `favorite_exercises`; a yes to a removal prompt adds the exercise to `excluded_exercises`. The mutual-exclusion triggers apply. The engine has no change (principle 3).
2. **What counts.** A swap `(from, to)` from UF-08.3 or UF-05.1 with reason none or "discomfort"; a Remove of an exercise on UF-08.6. Never counted: swaps with reason equipment taken, variety or short on time; "Not today"; the stepper's Remove; an exercise dropped by a time change; UF-09 skip or "Do later"; area edits. One signal per pair or exercise per visit or workout.
3. **Thresholds.** 3 swap signals for the same pair, 2 removal signals for the same exercise, within 60 days. Entries older than 60 days are dropped; at most 200 entries.
4. **Ask once.** Pending at the threshold; shown next time UF-08.2 mounts; one at a time, oldest first; any answer marks it asked for good (also "No thanks"). Never in UF-09, UF-05.1 or UF-08.1, never a modal, no timeout. No prompt if the swap-in is already a favorite or the exercise already excluded.
5. **Copy.** "Prefer {name} for {Area}?" / "You've swapped {from} for it 3 times." / **Prefer it**, **No thanks**; "Stop suggesting {name}?" / "You've removed it 2 times." / **Never suggest**, **No thanks**; after yes "{name} is a favorite now. Undo" or "{name} won't be suggested. Undo". Offline: the buttons are disabled with the existing "Connect to change …" lines and the prompt stays pending.
6. **"Not today"** (UF-08.6, layer 3): one tap swaps the exercise for the engine's best "equipment taken" alternative for this visit, with Undo; writes nothing durable; never counted. In a workout, the existing swap with reason "equipment taken" does the same job and is never counted.
7. **Visible and reversible:** the lists in UF-11.6 and UF-11.5, the Undo right after yes, and the UF-11.4 "Learning from your edits" section (toggle, forget). No provenance tag in v1.
8. **Out of scope:** learning from area edits (targets adapt only through UF-11.1), pairwise ranking, cross-device counts, `rankSwaps` using favorites.

## Consequences
- Tickets T-1000..T-1006 (D-0279). No change to `docs/engine-rules.md`.
- UF-08.2's Removed line keeps its immediate "Never suggest" button; the removal prompt is the proactive second path.

## Revisit when
Prompts feel too early or too late (change 3 and 2), people want counts across devices, or a learned preference should be told apart in UF-11.6.
