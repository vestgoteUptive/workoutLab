---
id: D-0035
title: Data model v1b defaults — plan_changed_at is plan_updated_at, engine v1 columns (exercises.kind/increment_kg/default_duration_s/external_load, sessions.warmup_in_budget/plan, session_sets.backoff), metric view shapes
status: revisit
date: 2026-09-28
by: data-modeler (T-0100b)
area: data
---
## Context
T-0100b migrates part [b] of the v1 schema (D-0018, D-0021) and folds in the engine v1 columns that D-0024, D-0026 and D-0027 ask the data lane to add. Those decisions name the facts to store, not the columns. D-0027 asks for `profiles.plan_updated_at` "set at onboarding and on UF-11.3 Save", but T-0100a already has the server-set `profiles.plan_changed_at` (the rule 9 reset input). The AC23 data-minimisation guard rejects any column name that matches `body_?weight`, so a `bodyweight` flag can't be named that way. AC28 fixes the metric values but not the view columns.

## Decision
- **No `plan_updated_at` column.** `profiles.plan_changed_at` is D-0027's `plan_updated_at`. It is set at insert (onboarding) and whenever `goal`, `rhythm_min`, `rhythm_max` or `priority_areas` change, which covers UF-11.3 Save and check-in Accept. A Save that changes nothing leaves it unchanged. That is right for rule 9: nothing about the plan changed, so the streak shouldn't reset. The engine field `planUpdatedAt` maps to `plan_changed_at`.
- **exercises:** `kind text not null default 'exercise' check in ('exercise','warmup')` (D-0024 warm-up moves). `increment_kg numeric(4,2) not null default 2.5 check > 0` (D-0026 default in the DB, so the engine never sees null). `default_duration_s integer null check > 0` (D-0026, timed only). `external_load boolean not null default true`, where `false` means bodyweight (D-0026 "0 for bodyweight"). It is named this way to pass the AC23 guard. Warm-up moves still carry `type`; the content lane picks it.
- **sessions:** `warmup_in_budget boolean not null default true` (D-0004 default on). `plan jsonb null` with a check that it's null or a JSON object. It holds the plan built at session start, including the per-area session-start deficits that rule 8 trims by (D-0024). T-0102 owns the JSON shape (OpenAPI `SessionPlan`). The DB checks only that it's an object, so the shape can change without a migration.
- **session_sets:** `backoff boolean not null default false` with a check `not (backoff and is_warmup)`. A back-off set is a hard set. `session_sets_live` is recreated so it carries the column.
- **profiles_priority_areas_valid** also requires `array_ndims` to be null (for `{}`) or 1.
- **area_targets `sets_per_14d > 0`** (D-0034 §6) was already in migration 1 (`area_targets_sets_per_14d_check`). T-0100b adds explicit pgTAP cases (0 and −3).
- **routines, routine_items:** as D-0021, plus `sets >= 1`, `reps_min/reps_max >= 1`, `duration_s > 0`, `position >= 0`. `reps_min <= reps_max` applies only when both are set. The server sets `routines.created_at` and `updated_at`.
- **Metric views** return one row each: `time_to_first_plan(profiles_timed, p50, p90)` (double precision), `finished_within_budget(sessions_finished, sessions_within, ratio)`, `checkins_answered(checkins_shown, checkins_answered, ratio)`, `areas_on_target_day28(users_included, mean_share)`. Ratios are `numeric` rounded to 3 dp and `null` with a zero denominator. A user's day-28 share is on-target areas divided by that user's `area_targets` rows. The views run with the owner's rights, and the schema has no `usage` for `anon`/`authenticated`. Nothing grants `service_role` yet. A reporting ticket adds that grant if it needs one.

## Consequences
- T-0102: mirror the new columns in OpenAPI and `packages/shared`, and define `SessionPlan` (items + `startDeficits`) for `sessions.plan`.
- content (T-0103): map `kind`, `increment_kg`, `default_duration_s` and `external_load` from `data/exercises`. T-0203 seeds them.
- engine (T-0202): read `planUpdatedAt` from `profiles.plan_changed_at`. `docs/engine-rules.md` rule 9 names `profiles.plan_updated_at` and should say `plan_changed_at`.

## Revisit when
The engine needs to tell "Save with no change" apart from "no Save", the session plan needs server-side querying (then promote fields to columns), or the metrics need per-cohort breakdowns.
