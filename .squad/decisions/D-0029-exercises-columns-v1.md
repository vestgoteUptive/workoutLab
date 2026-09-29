---
id: D-0029
title: exercises v1 columns follow D-0022 — add cue, timed, attribution, source_url; no image_url in v1
status: decided
date: 2026-09-27
by: triage (TR-0003, on T-0100)
area: data
---
## Context
TR-0003: the T-0100 spec rewrites `docs/data-model.md` to v1 but leaves the `exercises` line as it
is in the draft (`image_url` in, no attribution). D-0022 wants the T-0203 seed to map 1:1 from
`data/exercises`, forbids `image_url` in v1 (D-0005), and proposes four extra columns without
naming the contract change. This decision names it.

## Decision
- `exercises` in `docs/data-model.md` v1 has these columns:
  - `id text` PK (slug, D-0021)
  - `name text not null`
  - `type text not null` (`compound | isolation`)
  - `level text not null` (`beginner | intermediate | advanced`)
  - `equipment text[] not null default '{}'`
  - `instructions text[] not null`
  - `mistakes text[] not null default '{}'`
  - `cue text null`
  - `timed boolean not null default false` (the exercise is logged as a timed set, UF-09.7)
  - `source text not null`
  - `license text not null`
  - `attribution text null`
  - `source_url text null`
- **No `image_url` in v1.** The draft column is dropped. Our own illustrations (D-0005) bring it
  back through a new decision and a one-column migration.
- The values of `source`, `license`, `attribution`/`source_url` and the equipment vocabulary are
  validated in `@workoutlab/exercises` (D-0022), not by DB checks. This follows D-0021's reasoning
  for equipment: the content lane owns those vocabularies. The `type` and `level` checks stay as
  in D-0021.
- The content fields `areas` and `variants` map to `exercise_areas` and `exercise_variants`, as
  D-0022 says.

## Consequences
- data (T-0100a): encode this in the doc and in migration 1. pgTAP: `has_column` for `cue`,
  `timed`, `attribution` and `source_url` with the types above; `hasnt_column('exercises',
  'image_url')`; inserting with `source` or `license` null gives `23502`.
- product: the T-0100 ticket gets an AC [a] for the above.
- backend (T-0203): the seed maps the JSON fields 1:1 onto these columns.
- content (T-0103): no change. D-0022's field names already match.

## Revisit when
Our own exercise illustrations are ready (add `image_url`), or H-07 replaces the wger text
(`attribution` and `source_url` may become unused).

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
