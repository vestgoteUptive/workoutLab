---
id: TR-0003
status: resolved
raised_by: triage (spec check on the T-0100 groom)
date: 2026-09-27
---
## Conflict
The groomed spec `docs/tickets/T-0100-data-model-v1.md` makes `docs/data-model.md` v1 the contract
for "every table", but it never sets the columns of `exercises`. Two sources disagree:
- The draft contract (`docs/data-model.md`) lists `exercises: id, name, instructions[], mistakes[],
  image_url, equipment[], level, type, source, license`. No decision named in the ticket (D-0015,
  D-0017, D-0018, D-0020, D-0021) changes this line, so a builder would keep it as it is.
- D-0022 (T-0103 groom, revisit) says the T-0203 seed is a 1:1 mapping from `data/exercises`. It
  says there is **no `image_url` in v1** (the schema rejects it, D-0005). It says T-0100 "should
  give the `exercises` table columns for `cue`, `timed`, `attribution` and `source_url`". That is
  only a proposed follow-up, and D-0022 says it "doesn't change the contract".

If nothing is decided, T-0100 ships `exercises` with `image_url` and without `attribution`. Then
T-0203 cannot seed the library 1:1, and UF-04.2 cannot show the CC BY-SA attribution that D-0005
requires.

The spec matches every `decided` decision (D-0001, D-0002 screen IDs, D-0004, D-0006, D-0011,
D-0012, D-0016). This is the only conflict found.

## Options
1. Keep the draft columns (with `image_url`, without `cue`/`timed`/`attribution`/`source_url`).
   T-0203 then needs a new contract change later, and D-0022's revisit clause forces the content
   lane to rename JSON fields.
2. Name the change now. The `exercises` v1 columns follow D-0022's field names. Add `cue`,
   `timed`, `attribution` and `source_url`, and drop `image_url` until our own illustrations exist.
   This touches only the data lane (inside T-0100a) and needs no change in the content lane.
3. Keep `image_url` as an always-null column and add the four columns.

## Blocking
T-0100a (the build of `exercises`), T-0203 (seed), T-0102 (the generated `exercises` type).

## Resolution
Option 2, recorded in [D-0029](../decisions/D-0029-exercises-columns-v1.md) (`status: revisit`).
- Precedence: no principle or `decided` decision is at stake. D-0022 (newer and more specific)
  outranks the draft line. Option 2 touches only one lane (data) and nothing downstream.
  Reversing it is a one-line migration (`add column image_url text`) when own illustrations land.
- Option 3 was rejected because a column that nothing can fill ends up in the generated types
  (T-0102). D-0022's schema also rejects the field, so the column would stay null forever.
- Interim: none needed. D-0029 applies immediately to T-0100a. No human gate is crossed.
- Follow-ups: data (T-0100a: columns plus pgTAP AC), product (add the AC to the T-0100 ticket),
  backend (T-0203 seed maps the JSON 1:1 onto these columns).
