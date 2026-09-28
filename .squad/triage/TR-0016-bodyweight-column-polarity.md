---
id: TR-0016
status: open
raised_by: content-curator on T-0103b
date: 2026-09-28
---
## Conflict
D-0033 (content, T-0103a/b) and D-0035 (data, T-0100b) both name the DB column that will carry
the JSON library's external-load flag, and they disagree on name and polarity:
- D-0033 §3 defines the JSON field `bodyweight` (boolean): **`true`** means the row has no
  external load. Its "Consequences" section says T-0100/T-0102 add "a `bodyweight` column" and
  T-0203 seeds it, implying the same polarity carries through to the DB.
- D-0035 (`exercises` table) instead adds `external_load boolean not null default true`, where
  **`false`** means bodyweight — the opposite polarity of D-0033's field, under a different name.
  D-0035 says this naming exists specifically "to pass the AC23 [data-minimisation] guard" (the
  guard rejects any column matching `body_?weight`).

Neither decision is wrong on its own terms: D-0033 owns the content JSON shape (not a DB column,
and not subject to AC23), D-0035 owns the DB column and must satisfy AC23. But T-0203 (seed) will
need to map `bodyweight: true` (JSON) → `external_load: false` (DB) — an inverted boolean — and
neither decision states that mapping explicitly. Left unstated, a seed author could plausibly
copy the JSON boolean straight across and silently invert every row's `bodyweight` status.

## Options
1. Add one line to D-0035 (or a short new decision) naming the mapping explicitly:
   `exercises.external_load = !bodyweight` (content JSON → DB), for T-0203 to implement and test.
2. Rename the content JSON field to also read `external_load` (inverted) so the two shapes match
   byte-for-byte. This would require a T-0103 in-place edit across every library file and touches
   a shipped, tested field name for no functional gain — content's own AC3/AC5 tests don't care
   about DB column-name guards.
3. Leave it implicit and rely on T-0203's author to notice. Risk: silent data-quality bug (every
   bodyweight exercise seeded as requiring external load, or vice versa), not caught by any
   existing test in either lane.

## Blocking
Not blocking T-0103b (this ticket ships JSON only, no DB column). Blocks T-0203 (seed) and
T-0100b/T-0102 if their acceptance criteria don't already cover this mapping explicitly.

## Resolution
<filled by triage>
