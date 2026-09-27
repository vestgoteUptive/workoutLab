---
id: D-0030
title: Data model v1a defaults — effort_rating 1–5, energy default normal, required plan fields, trigger functions in schema private, anon revoked on owned tables, part [b] listed as pending in the doc
status: revisit
date: 2026-09-27
by: data-modeler (T-0100a)
area: data
---
## Context
T-0100a builds part [a] of the v1 schema. D-0020, D-0021 and D-0029 fix most of it, but some details were left open: the range of `sessions.effort_rating` (UF-03.3 names an effort rating with no scale), whether `energy` and the profile plan fields have defaults, where trigger functions live, and how the contract doc handles part [b] tables before T-0100b migrates them. The ticket asks for the contract doc to cover all tables, while the data-lane rule says the doc and the migrations must always match.

## Decision
- `sessions.effort_rating smallint null check (between 1 and 5)`. `sessions.energy text not null default 'normal'` (UF-08.1 always asks for it; the default keeps server-side inserts valid).
- `profiles.goal`, `level`, `rhythm_min` and `rhythm_max` are `not null` with **no** DB default. Only the device computes the plan (D-0014), and a DB default would hide a client bug.
- Trigger functions live in schema `private` (no grants to `anon`/`authenticated`, not exposed through PostgREST), so they never show up as RPC endpoints or in generated types.
- `anon` has no privileges on user-owned tables and on `session_sets_live` (select gives `42501`). Library tables grant only `select` to `anon`/`authenticated`. `truncate`, `references` and `trigger` are revoked from both roles everywhere.
- `session_sets` upsert guard also keeps `id` and `created_at` (plus `completed_at`, D-0020). The `profiles` trigger also keeps `user_id` and `created_at`.
- `docs/data-model.md` lists part [b] (`routines`, `routine_items`, `plan_checkins`, `analytics`) under a "pending migration (T-0100b)" heading with the D-0021 shapes. The pgTAP schema test (AC1) covers only the tables above that heading. T-0100b moves them up when it migrates them.
- The AC1 block in `supabase/tests/database/001_schema.test.sql` is generated from the column tables in the doc and uses `columns_are`, so an undocumented column fails the test.

## Consequences
- T-0100b: move the part [b] tables into the main sections, extend AC1, AC4, AC22 and AC24.
- T-0102: generated types show `effort_rating` as `number | null` and `energy` as a required string with a default.
- web-shell (T-0300): sends `goal`, `level` and rhythm on the first profile insert.

## Revisit when
The UF-03.3 spec defines the effort scale, or T-0100b lands (then the "pending" section is removed).
