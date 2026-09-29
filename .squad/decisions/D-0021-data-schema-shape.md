---
id: D-0021
title: Data model v1 shape — auth.users as users, slug ids for the library (anon-readable), fixed vocabularies, plan_checkins lifecycle, routines, private analytics schema in UTC
status: decided
date: 2026-09-27
by: product-owner (T-0100 groom)
area: data
---
## Context
Gap B3 lists what `docs/data-model.md` lacks: types, keys, indexes, RLS, variants, routines, RIR and timed sets. D-0018 names `plan_checkins` but not how rows are created. D-0014 computes the UF-01.4 plan on the device before any account exists. NFR-AN-2 wants the PRD metrics in SQL, but the server doesn't know the device timezone. This decision fills those gaps with defaults and names the matching changes to `docs/data-model.md`.

## Decision
- **Users:** no `public.users`. The draft's `users` is `auth.users`, and email lives only there (NFR-PRIV-2). `profiles.user_id` is the PK and references it.
- **Library ids:** `areas.id` and `exercises.id` are text slugs (`quads`, `back-squat`), stable across seeds and offline caches. `areas` also has `sort_order smallint` in the fixed order chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves, and its 9 rows are inserted by the migration.
- **Library access:** `areas`, `exercises`, `exercise_areas` and `exercise_variants` can be selected by `anon` and `authenticated` (the plan on UF-01.4 is built before sign-in, D-0014). Neither role can insert, update or delete them. The seed runs as `postgres`.
- **Vocabularies (check constraints):** `level in ('beginner','intermediate','advanced')` on both `profiles` and `exercises`; `goal in ('build_muscle','get_stronger','general_fitness')`; `energy in ('low','normal','high')`; `area_targets.source in ('default','adapted','manual')`; `exercises.type in ('compound','isolation')`; `session_sets.kind in ('reps','timed')`; `exercise_areas.weight in (1.0, 0.5)`. Equipment is `text[]` with no DB check in v1, because the content lane owns that vocabulary (T-0103).
- **Profile plan fields:** `rhythm_min`/`rhythm_max` between 1 and 7 with min ≤ max; `priority_areas text[]` with at most 3 distinct valid area ids; `onboarded_at timestamptz not null default now()` (period 0 anchor, D-0018; the local date comes from the device, as in D-0013); `onboarding_timing_ms integer null check (>= 0)` with no upper bound (null for returning users who skip UF-01.1–.4); `plan_changed_at timestamptz` (server-set, D-0020).
- **Variants:** `exercise_variants(exercise_id, variant_id)`, a directed pair with PK on both columns and `exercise_id <> variant_id`. The seed writes both directions.
- **Routines (UF-07):** `routines(id, user_id, name, created_at, updated_at)` and `routine_items(id, routine_id, user_id, position, exercise_id, sets, reps_min, reps_max, duration_s, progression)`, unique `(routine_id, position)`, `reps_min <= reps_max`, `progression in ('none','double_progression','linear_load')` default `'double_progression'` (T-0101 may amend this through a decision).
- **`plan_checkins` lifecycle:** the client inserts a row when a proposal is **first shown** (`answer` null), and updates it on Accept, Keep or withdrawal (UF-11.3 save). Columns: `id, user_id, period_index int >= 1` (the later of the two evaluated periods), `completed_prev, completed_last int >= 0`, `rhythm_min_before, rhythm_max_before, proposed_min, proposed_max` (1–7, min ≤ max), `proposed_at timestamptz not null`, `answer in ('accepted','kept','withdrawn') null`, `answered_at timestamptz null`, with `(answer is null) = (answered_at is null)`. Unique `(user_id, period_index)`, so a second device can't duplicate a proposal.
- **No server-side 14-day load view.** The D-0013 window uses the device's local days, so the engine computes load from `session_sets_live` on the device and in Edge Functions (which receive the timezone).
- **Metrics (NFR-AN-2):** views in a private schema `analytics`, with no `usage` grant to `anon` or `authenticated`, and not exposed through PostgREST. They use **UTC** dates, which is good enough for aggregate metrics and is not used for any product UI. "Onboarding completion" isn't computable from our tables (pre-account users leave no row), so it is measured in the first user test (T-0403), not in SQL.

## Consequences
- data (T-0100): encode all of the above in `docs/data-model.md`, the migrations and pgTAP.
- content (T-0103): slug ids, the level vocabulary, weights 1.0/0.5 only, non-null `source` and `license`, variants listed in both directions.
- product (T-0005 or the next spec touch-up): NFR-AN-2 and the PRD metric table note the UTC and user-test caveats.

## Revisit when
T-0101 defines progression rules, T-0301 finalises the UF-01.2 goal copy, or the first user test shows metric numbers that look off because of UTC dating.

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
