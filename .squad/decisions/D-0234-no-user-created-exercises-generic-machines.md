---
id: D-0234
title: "No user-created exercises; gym-brand machines are covered by 13 generic machine rows with original text and no brand names or brand field; library size cap raised to 120 (T-0691)"
status: decided
date: 2026-11-10
by: human (product owner), written up by product-owner
area: product
builds-on: D-0021, D-0022, D-0029, D-0033, D-0061 §3, D-0192
---
## Context
The human (2026-11-10, translated from Swedish): "My gym has Cybex machines. Add the missing exercises. But we will NOT let users create exercises themselves."

The library (`data/exercises/library/*.json` → `supabase/seed.sql`) is global, slug-keyed and anon-readable (D-0021), in the D-0022 format with the D-0029 columns. It has 95 rows; 8 are `machine` rows (chest press, shoulder press, tricep extension, lying leg curl, leg extension, leg press, seated and standing calf raise). A typical selectorized line from one brand also has incline press, pec fly / rear delt, lateral raise, row, lat pulldown, arm curl, ab crunch, back extension, rotary torso, seated leg curl, hip abduction, hip adduction and glute stations. Other brands sell the same stations under other names. The orchestrator proposed generic rows; the human accepted.

## Decision
1. **No user-created exercises.** Users can't create, edit or import exercises. The library stays curated, global and read-only (D-0021 slug ids, D-0022 format and validation in `data/exercises`, D-0029 columns). Every row goes through the content lane and its tests. A user who misses an exercise reports it; it is added to the library for everyone. No schema, RLS or UI for private exercises.
2. **Brand machines become generic machine rows.**
   - Names and text are generic: equipment is the vocabulary item `"machine"`. No brand or model names (Cybex, Technogym, Life Fitness, Matrix, Hammer Strength or others) in any id, name, step, cue or mistake. Brand-specific rows would duplicate the generic ones and be wrong at other gyms.
   - All text is our own: `source: "workoutlab"`, `license: "LicenseRef-workoutLab"`, no `source_url`. Nothing is copied from a manufacturer's placards, manuals, site or images (D-0192 applies the same rule to ExerciseDB).
   - No alias, brand or model field and no search by brand. **Revisit trigger:** users ask to search by brand or station name.
   - Most machines are `level: "beginner"` (guided path). Machine rows use `increment_kg: 5`, like the 8 existing machine rows.
3. **The missing set is 13 rows (T-0691):** incline machine press, machine chest fly, machine rear delt fly, machine lateral raise, machine row, machine lat pulldown, machine bicep curl, machine ab crunch, machine back extension, machine torso rotation, seated leg curl (machine), hip abduction (machine), glute kickback (machine). Ids, areas and variants are in T-0691.
   - **Machine row and machine lat pulldown stay separate from the cable rows** (`seated-cable-row`, `lat-pulldown`). The engine can tell them apart: (a) progression and pre-fill (rule 14) are per exercise id, and a plate-loaded or selectorized machine and a cable stack don't share loads, so one id would give wrong pre-fills; (b) their equipment differs (`machine` vs `cable`), so the D-0061 §3 custom equipment list can include one without the other, and `equipment_taken` (rule 12) offers the machine when the cable station is busy; (c) the machine row is chest-supported, so it doesn't load the lower back the way the cable row does.
   - **Seated leg curl stays separate from `leg-curl-machine` (lying)** for the same per-id progression reason (a). The existing row keeps its id and name.
   - **Hip adduction is left out.** The 9 areas have no adductor area. Counting it as quads or glutes would add hard sets to an area it barely trains and skew the 14-day balance. A row with only 0.5 weights would never be a rule 7.2 candidate. Revisit if an adductor or "inner thigh" area is ever added.
   - No row is added for stations that already exist: chest press, shoulder press, arm (tricep) extension, leg press, leg extension, lying leg curl, calf raises.
4. **Library size bound.** The T-0103 AC10 bound (72 ≤ N ≤ 96 files) was a sizing estimate. The offline gzip budget (AC15, NFR-OFF-1, ≤ 40 960 bytes; 10 874 bytes at 95 rows) is the real limit. The bound becomes **72 ≤ N ≤ 120**, and the exact-count pin in `coverage.test.ts` (95) becomes 108. Both test edits cite this decision. Neither weakens a test: AC15 is unchanged.

## Consequences
- T-0691 (content lane) adds the 13 rows and updates `variants` on the existing rows they pair with (variants are listed in both directions, D-0022). `supabase/seed.sql` is regenerated with `node supabase/scripts/gen-seed.mjs`, never edited by hand.
- **Contracts unchanged.** No `docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md` or token change. `"machine"` is already in the equipment vocabulary and the full-gym profile. The engine fixtures in `docs/engine-rules.md` use their own fixture library, so no rule example changes.
- Web and engine tests that read the real library may see new candidates. Any expected value that changes is updated with a note naming this decision and the row that caused it, never loosened.
- If an existing station name is unclear next to a new row (e.g. "Leg curl (machine)" next to "Seated leg curl (machine)"), renaming it is a separate content ticket.
