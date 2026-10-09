---
id: D-0218
title: "Data model: profiles.bar_kg (numeric(5,2), default 20, 0–50) and profiles.plates_kg (numeric(5,2)[], default {25,20,15,10,5,2.5,1.25}, ≤ 12 distinct sizes > 0 and ≤ 50, pairs unlimited) for UF-09.3 plate loading; synced and exported with the profile, edited on UF-11.4"
status: accepted
date: 2026-10-09
by: product-owner (spec, proposed for the data lane; T-0631 makes the change)
area: data
amends: D-0066
builds-on: D-0020, D-0021, D-0136, D-0201, D-0217
---
## Context
D-0217 promotes plate loading on UF-09.3 ("Each side 25 + 15 kg"). Working out the plates needs the bar weight and the plate sizes the user has. `profiles` has neither (it has `equipment text[]`, which only says a barbell is available), and nothing on the device stores them. D-0066 §13 named this as the reason plate loading was out of v1.

Options considered:
- **Device-local settings** (like the D-0170 focus prefs): no contract change, but sign-out clears the app's stored keys (UF-11.4), a second device starts over, and export wouldn't include them.
- **Profile columns:** synced, exported with the profile row, survive sign-out, and follow the D-0020 write rules already in place. Chosen.

## Decision
1. **Two new `profiles` columns** (migration, `docs/data-model.md`, `packages/shared/src/database.gen.ts`):

   | column | type | null | default | notes |
   |---|---|---|---|---|
   | bar_kg | numeric(5,2) | no | `20` | Check `profiles_bar_kg_range`: `bar_kg between 0 and 50`. UF-09.3 plate loading (D-0217). |
   | plates_kg | numeric(5,2)[] | no | `'{25,20,15,10,5,2.5,1.25}'` | Check `profiles_plates_kg_valid`: one-dimensional, lower bound 1, `cardinality <= 12`, every element `> 0` and `<= 50`, no duplicates. Plate sizes the user has; pairs are unlimited. Empty = bar only. |

2. **Write rules:** client-writable through the existing `profiles_update` policy. Neither column changes `plan_changed_at` (only goal, rhythm and priority areas do, D-0020). `profiles_before_write` is otherwise unchanged; an upsert that omits the columns keeps their values.
3. **Existing rows** get the defaults (non-destructive `add column … default`). The migration needs no destructive-approved header (D-0201).
4. **Shared mapper:** `packages/shared` gains `toBarbell(row): { barKg: number; platesKg: number[] }` (sizes sorted largest first, numbers not strings). `toEngineProfile` and `EngineProfile` are unchanged: the engine never reads these columns.
5. **Export:** the UF-11.4 export already writes the whole profile row, so the two columns are exported with no export-code change; T-0631 adds a test that proves it.
6. **No API change:** no Edge Function reads or writes them. `api/openapi.yaml` is unchanged.

## Consequences
- T-0631 (data) makes the change; T-0632 (web-shell) caches the values with the profile; T-0633 (UF-11) edits them on UF-11.4; T-0634 (UF-09) shows the line.
- The e2e Supabase mock's profile row gains the two columns (T-0631).
- Release is automatic on merge (D-0201).

## Revisit when
- Users want a count per plate size (a home gym with one pair of 25s), or more than one bar (EZ bar, trap bar).
- lb support is added (H-38): the columns stay kg and the display converts.

Approved by the owner as a contract change, 2026-10-09.