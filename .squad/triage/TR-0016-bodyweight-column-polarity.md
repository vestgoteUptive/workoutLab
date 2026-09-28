---
id: TR-0016
status: resolved
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
Resolved 2026-09-28 by triage with **option 1**, recorded in
[D-0044](../decisions/D-0044-external-load-bodyweight-mapping.md) (`decided`, supersedes nothing).

- **Mapping:** `exercises.external_load = NOT bodyweight` for every library row. All warm-ups get
  `false`.
- **Where it lives:** the flag is inverted exactly once, in the T-0203 seed. The seed writes the
  value explicitly on every row and never relies on the `default true`. The DB → engine mapper
  (`packages/shared` `toLibraryExercise`, T-0102b) is a straight rename,
  `external_load` → `externalLoad`, with no inversion. The engine (`LibraryExercise.externalLoad`,
  D-0037 §6 / D-0040 §3) and content (`bodyweight`, D-0033 §3) don't change.
- **Side point:** bodyweight rows carry no `increment_kg` in the JSON and get the DB default of
  2.5. That value means nothing, because load behaviour is decided by `externalLoad`.
- **Contract:** D-0044 §5 names a one-line note on `docs/data-model.md`'s `external_load` row.
  There is no migration.

Why: principle 2 in the README precedence. D-0033 governs the JSON contract. D-0035 is newer and
more specific for the DB column, and must pass AC23. Both are right in their own layer, so only
the mapping between them was missing. Option 1 touches the fewest lanes (backend, plus a small
data-lane test and doc line) and is the cheapest to undo. Option 2 would rename a shipped field in
every library file for no gain. Option 3 leaves a silent bug that inverts the data.

No human gate is involved (`gates.md`), so nothing was escalated.

Follow-ups:
- **backend (T-0203):** seed `external_load = !bodyweight` explicitly on every row. Add tests for
  a whole-library equality check, spot checks (`push-up` and `plank` false, `barbell-back-squat`
  true), all warm-ups false, and matching counts.
- **data (T-0102b):** add a mapper case to AC18 (`external_load: false` → `externalLoad: false`)
  and the `docs/data-model.md` note from D-0044 §5.
