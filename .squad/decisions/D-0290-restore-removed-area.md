---
id: D-0290
title: "Adding back an area removed in the same visit restores its removed items (rule 12.6 `ctx.restore`); falls back to the top-candidate add when they don't fit"
status: revisit
date: 2026-11-24
by: product-owner
area: engine
builds-on: D-0274, D-0275, D-0287, D-0289
---
## Context
T-0999 (areas-first e2e) found a rule/spec gap. On the default 45-min plan, Remove Hamstrings (Leg curl x 2, about 5 min), then "Add an area" Hamstrings, gives "No time left" at 40 of 45 min. Rule 12.6 `addArea` tries only the area's top candidate (Romanian deadlift, 3 sets, then 2), which costs more than the 5 min left. The spec promises "Chest removed. Add it back below." and "one tap puts it back".

## Decision
1. **Engine input, not engine memory.** `AreaEditContext` gets an optional `restore: readonly WorkoutItem[]`, the items removed with whole areas earlier in this visit. The engine stays pure and stateless; the web remembers the items and passes them in. `addArea` and `areaCandidates` both read it, so "available" and "add" always agree.
2. **Restore first.** `addArea(workout, area, ctx)` looks at the `restore` items homed in `area`. If there are any and they are all valid now, it adds exactly those items: same exercises, sets, reps, pre-fill, side flags. If not, it runs the existing rule 12.6 path unchanged (top candidate, 3 sets else 2).
3. **Valid now** means all of: every exercise is in `library` and still eligible (level, equipment, `excludeIds`); the area is not recovering or avoided; no restored exercise is already in the plan (a swap elsewhere may have taken it); the plan stays within 8 items; and the whole set fits `available`. Partial restores never happen: all or fall back. A restore that fits never returns a refusal; a fallback refuses as rule 12.6 does.
4. **Main lift.** A restored item keeps `isMain` and `mainLiftId` only when the plan has no main lift now (`mainLiftId` null and no item `isMain`). Otherwise (the main lift changed since, for example "Start with this" elsewhere) it comes back as an accessory as rule 12.8 demotes one: accessory rep slot, pre-fill re-derived, no back-off, `min(sets, 3)` sets. The fit check uses the demoted cost.
5. **Order.** After a restore the items are ordered by `orderItems` (rule 7.6), so remove then add back with nothing else changed round-trips to a deep-equal `Workout`. The fallback keeps rule 12.6's "goes last".
6. **Time changed: the web drops its memory.** A time chip (and an energy change) rebuilds the plan (spec "Edits and time"), so the remembered items were sized for another plan and are cleared. The engine still validates, so a stale list can't over-fill.
7. **Fill the rest** needs no new rule. It is `addArea` of the first available candidate, and it passes the same `restore`, so a removed area it reaches comes back as it was. The order does not prefer removed areas: "Fill the rest" fills by need (lowest projected `r`), and a removed area is not the user saying "never" (that is Never suggest or Skip today). Revisit if people feel Fill the rest undoes their Removes.
8. **Leaving the screen drops the memory.** It lives in the UF-08.2 visit state only: gone on Start, on leaving to UF-08.1 or elsewhere, on a time or energy change, and on reload. The area also leaves the memory when it re-enters the plan by any route (Add, Add exercise, Fill the rest).

## Build notes (T-1022)
- Round trip is exact only when rule 7.6 has no tie to break by position: `orderItems` ties break on item index, and a re-appended item has the last index. Fixture W round-trips deep-equal; a plan from `suggest` returns the same items, totals, `mainLiftId` and `sessionReasons` (as a set) in rule 7.6 order. If exact order matters, the web could pass the removed items' former positions (follow-up, not built).
- A restore also puts the area's `area_deficit` back into `sessionReasons` when it has fewer than 3 entries, so a round trip leaves them as they were.

## Consequences
Contract: `docs/engine-rules.md` rules 12.6 and 12.7 (new text, examples R12-E66 onward). Tickets: T-1022 (engine), T-1023 (UF-08.2 web, depends on T-1022). The spec `docs/specs/areas-first-planning.md` gains a "Remove, then add back" section. `suggest` and the openapi contract are unchanged; the vendored copy for Edge Functions is re-run.

## Revisit when
Users expect Add to give a fresh suggestion rather than their old items, or Fill the rest should skip areas the user removed.
