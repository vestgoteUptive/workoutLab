# Data model (v1)

**Status:** v1. Part [a] is migrated in `supabase/migrations/20260927210000_data_model_v1a.sql` (T-0100a). Part [b] (`routines`, `routine_items`, `plan_checkins`, schema `analytics`, the engine v1 columns) is migrated in `supabase/migrations/20260928090000_data_model_v1b.sql` (T-0100b, D-0035). `supabase/migrations/20260928120000_priority_areas_lower_bound.sql` (T-0102b, D-0037) tightens `profiles_priority_areas_valid`. `supabase/migrations/20261001090000_plan_checkins_one_period.sql` (T-0223, D-0070 §6) lets `plan_checkins` store a one-period check-in. `supabase/migrations/20261005120000_purge_auth_audit_on_user_delete.sql` (T-0503, D-0188 §1) adds the auth audit purge trigger (see "Auth schema triggers"). `supabase/migrations/20261005130000_strip_auth_profile_claims.sql` (T-0504, D-0188 §2) adds the profile-claim strip triggers and backfills existing rows (same section). `supabase/migrations/20261007120000_excluded_exercises.sql` (T-0535, D-0199 §4) adds `excluded_exercises`. `supabase/migrations/20261008120000_favorite_exercises.sql` (T-0564, D-0202 §5) adds `favorite_exercises` and the mutual-exclusion triggers on both lists. Every table below is in the database. The typed view of this schema is `packages/shared/src/database.gen.ts` (D-0037 §10, D-0043).

Decisions: D-0001 (Supabase), D-0015 (set sync), D-0017 (offline, client ids), D-0018 (check-ins), D-0020 (write rules), D-0021 (shape), D-0024 (session building), D-0026 (progression), D-0027 (check-in reset), D-0029 (`exercises` columns), D-0030 (v1a defaults), D-0034 (engine inputs), D-0035 (v1b defaults), D-0037 (`SessionPlan` v1, array lower bound), D-0044 (`external_load` = NOT `bodyweight`, seed only).

## Conventions
- **Users** are `auth.users` (D-0021). There is no `public.users`. Email lives only in `auth.users` (NFR-PRIV-2). Of the provider claims, only email and the auth keys listed under "Auth schema triggers" are kept; provider profile claims (name, avatar and the like) are stripped (NFR-PRIV-2, D-0188).
- **Ownership (D-0020).** Every user-owned table has `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`. Deleting the auth user deletes all of that user's rows (NFR-PRIV-5). The same delete also purges that user's `auth.audit_log_entries` rows, in the same transaction (see "Auth schema triggers", D-0188).
- **RLS on every public table.** User-owned tables have four policies for role `authenticated` (select, insert, update, delete), each on `(select auth.uid()) = user_id` (`using` and, for insert/update, `with check`). `anon` has no privileges on them. Library tables have one `select` policy for `anon, authenticated` with `using (true)`. Neither role can insert, update or delete them; the seed runs as `postgres` (D-0021).
- **Child rows** reference their parent with a composite FK on `(parent_id, user_id)`, so a user cannot attach a row to someone else's parent, even though FK checks bypass RLS (D-0020).
- **Offline rows (D-0017, D-0020).** `sessions.id` and `session_sets.client_id` are UUIDs generated on the device. Checks on `sessions` and `session_sets` reject only impossible values. None compare against `now()`, and none tie duration to budget.
- **Server-set columns (D-0020, NFR-SYNC-3)** are overwritten by triggers, whatever the client sends.
- **Trigger functions** live in schema `private`, which is not exposed through PostgREST and has no grants to `anon` or `authenticated` (D-0030).
- **Types:** `timestamptz` = `timestamp with time zone`. Every timestamp is UTC in the database. Local dates come from the device (D-0013).
- **No server-side 14-day load view** (D-0021). The engine computes load from `session_sets_live` on the device and in Edge Functions. The only SQL load is the aggregate metric `analytics.areas_on_target_day28`, which uses UTC dates and is not shown in any product UI (D-0021).

Column tables use `null` = `yes` (nullable) or `no` (not null).

## Auth schema triggers (D-0188)
- **`auth_users_purge_audit`** is an `after delete on auth.users for each row` trigger running `private.purge_auth_audit_for_user()` (T-0503, D-0188 §1, amends D-0135 §5). Supabase Auth's `auth.audit_log_entries` rows hold the user's email (in `payload`) and IP, and have no FK to `auth.users`, so the D-0020 cascade can't reach them. The trigger deletes every row where any of these exact matches holds (never a substring match):
  - `payload->>'actor_id' = old.id::text`;
  - `payload->'traits'->>'user_id' = old.id::text`;
  - `payload->>'actor_username' = old.email` (only when `old.email` is not null);
  - `payload->'traits'->>'user_email' = old.email` (only when `old.email` is not null).
- The function is `security invoker` with `search_path = ''`. It runs as whoever deletes the user: `supabase_auth_admin` (GoTrue, which gets usage on `private` and execute on the function) or `postgres`. `anon` and `authenticated` have no execute on it. GoTrue's own `user_deleted` entry is written in the same transaction before the row goes, so it is removed too.
- **`auth_users_strip_profile`** (`before insert or update of raw_user_meta_data on auth.users for each row`, `private.auth_users_strip_profile()`) and **`auth_identities_strip_profile`** (`before insert or update of identity_data on auth.identities for each row`, `private.auth_identities_strip_profile()`) strip provider profile claims (T-0504, D-0188 §2, NFR-PRIV-2). Both call `private.strip_profile_claims(j jsonb)` (immutable, strict, so null stays null), the only copy of the key list:
  - **Stripped:** `name`, `full_name`, `avatar_url`, `picture`, `given_name`, `family_name`, `nickname`, `preferred_username`, `custom_claims`.
  - **Kept:** `sub`, `iss`, `email`, `email_verified`, `phone_verified`, `provider_id`, and any key not on the list. `auth.identities.email` is generated from `identity_data->>'email'`, and GoTrue links identities by `provider_id` and email, so both stay.
  - The update path covers a returning Google user (GoTrue rewrites both columns on each OAuth sign-in) and `updateUser({ data })`.
- `private.strip_profile_claims_backfill()` strips rows written before the triggers existed and returns how many rows it changed (a second run returns 0). The migration calls it once. All four functions are `security invoker` with `search_path = ''`. `supabase_auth_admin` has execute on the three the triggers call; `anon` and `authenticated` have execute on none.

## Library (read-only for clients)

### areas (D-0021)
The 9 rows are inserted by the migration: chest 1, back 2, shoulders 3, arms 4, core 5, glutes 6, quads 7, hamstrings 8, calves 9.

| column | type | null | default | notes |
|---|---|---|---|---|
| id | text | no | | PK. Slug. |
| sort_order | smallint | no | | Unique. Fixed display order. |

- Indexes: PK `(id)`, unique `(sort_order)`.
- RLS: `areas_select` (select, `anon, authenticated`, `true`).

### exercises (D-0021, D-0024, D-0026, D-0029, D-0035)
Maps 1:1 from `data/exercises` (D-0022). No `image_url` in v1 (D-0029, D-0005). The values of `source`, `license`, `attribution`, `source_url` and `equipment` are validated in `@workoutlab/exercises`, not by DB checks.

| column | type | null | default | notes |
|---|---|---|---|---|
| id | text | no | | PK. Slug, e.g. `back-squat`. |
| name | text | no | | |
| type | text | no | | Check `in ('compound','isolation')`. |
| level | text | no | | Check `in ('beginner','intermediate','advanced')`. |
| equipment | text[] | no | `'{}'` | Vocabulary owned by the content lane. |
| instructions | text[] | no | | |
| mistakes | text[] | no | `'{}'` | |
| cue | text | yes | | D-0029. |
| timed | boolean | no | `false` | D-0029. Logged as a timed set (UF-09.7). |
| source | text | no | | |
| license | text | no | | |
| attribution | text | yes | | D-0029. |
| source_url | text | yes | | D-0029. |
| kind | text | no | `'exercise'` | Check `in ('exercise','warmup')`. Warm-up moves (D-0024, D-0035). |
| increment_kg | numeric(4,2) | no | `2.5` | Check `> 0`. Load step for pre-fill (D-0026). |
| default_duration_s | integer | yes | | Check `> 0`. First timed target (D-0026). |
| external_load | boolean | no | `true` | `false` = bodyweight, pre-filled weight 0 (D-0026, D-0035). Seeded as NOT bodyweight from data/exercises (D-0044). |

- Indexes: PK `(id)`.
- RLS: `exercises_select` (select, `anon, authenticated`, `true`).

### exercise_areas (D-0021)

| column | type | null | default | notes |
|---|---|---|---|---|
| exercise_id | text | no | | FK `exercises(id)` on delete cascade. |
| area_id | text | no | | FK `areas(id)`. |
| weight | numeric(2,1) | no | | Check `in (1.0, 0.5)`. |

- Keys: PK `(exercise_id, area_id)`.
- Indexes: `exercise_areas_area_id_idx (area_id)`.
- RLS: `exercise_areas_select` (select, `anon, authenticated`, `true`).

### exercise_variants (D-0021)
A directed pair. The seed writes both directions (UF-04.3, UF-05, UF-08.3).

| column | type | null | default | notes |
|---|---|---|---|---|
| exercise_id | text | no | | FK `exercises(id)` on delete cascade. |
| variant_id | text | no | | FK `exercises(id)` on delete cascade. |

- Keys: PK `(exercise_id, variant_id)`. Check `exercise_variants_not_self`: `exercise_id <> variant_id`.
- Indexes: `exercise_variants_variant_id_idx (variant_id)`.
- RLS: `exercise_variants_select` (select, `anon, authenticated`, `true`).

## User-owned tables

### profiles (D-0014, D-0018, D-0020, D-0021, NFR-AN-2)
One row per user, written after UF-01.5 Account with the plan computed on the device (D-0014).

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | uuid | no | `auth.uid()` | PK. FK `auth.users(id)` on delete cascade. |
| goal | text | no | | Check `in ('build_muscle','get_stronger','general_fitness')`. |
| level | text | no | | Check `in ('beginner','intermediate','advanced')`. |
| rhythm_min | smallint | no | | Sessions per week. |
| rhythm_max | smallint | no | | Sessions per week. |
| equipment | text[] | no | `'{}'` | No DB check (D-0021). |
| priority_areas | text[] | no | `'{}'` | At most 3 distinct area ids (UF-11.3). |
| onboarded_at | timestamptz | no | `now()` | Period 0 anchor (D-0018). Write-once (D-0020). |
| onboarding_timing_ms | integer | yes | | Check `>= 0`, no upper bound. Null for returning users. Write-once once non-null (D-0020, NFR-AN-2). |
| plan_changed_at | timestamptz | no | `now()` | Server-set (D-0020). The rule 9 streak reset input. This is the `plan_updated_at` of D-0027 (D-0035). |
| created_at | timestamptz | no | `now()` | Server-set. |
| updated_at | timestamptz | no | `now()` | Server-set (D-0020). |

- Checks: `profiles_rhythm_range`: `rhythm_min` and `rhythm_max` between 1 and 7, `rhythm_min <= rhythm_max`. `profiles_priority_areas_valid`: one-dimensional (`array_ndims` is null or 1, T-0100b), lower bound 1 (`array_lower(priority_areas, 1)` is null or 1, so `'[2:3]={back,back}'` and `'[0:1]={back,chest}'` give `23514`; D-0037, T-0102b), `cardinality <= 3`, every element is one of the 9 area ids, no duplicates.
- Trigger `profiles_before_write` (before insert or update, `private.profiles_before_write`):
  - insert: `plan_changed_at`, `created_at` and `updated_at` := `now()`. The client's `onboarded_at` is kept (default `now()`).
  - update: `onboarded_at` keeps its old value. `onboarding_timing_ms` keeps its old value once non-null. `plan_changed_at` := `now()` when `goal`, `rhythm_min`, `rhythm_max` or `priority_areas` change, else the old value. `user_id` and `created_at` keep their old values. `updated_at` := `now()`. A client-supplied value is silently replaced, with no error, so a full-profile upsert from a second device never fails.
- Indexes: PK `(user_id)`.
- RLS: `profiles_select`, `profiles_insert`, `profiles_update`, `profiles_delete` (owner, `authenticated`).

### area_targets (D-0020, D-0021, D-0034)

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| area_id | text | no | | FK `areas(id)`. |
| sets_per_14d | smallint | no | | Check `> 0` (D-0034 §6). |
| source | text | no | `'default'` | Check `in ('default','adapted','manual')`. |
| updated_at | timestamptz | no | `now()` | Server-set (D-0020, NFR-SYNC-3). |

- Keys: PK `(user_id, area_id)`.
- Trigger `area_targets_set_updated_at` (before insert or update, `private.set_updated_at`): `updated_at := now()`.
- RLS: `area_targets_select`, `area_targets_insert`, `area_targets_update`, `area_targets_delete` (owner, `authenticated`).

### sessions (D-0017, D-0020, D-0024, D-0030, D-0035)
`id` is generated on the device for offline sessions (D-0020). Upserts go through `on conflict (id)`; the last write wins (NFR-SYNC-3).

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK. Client-generated for offline rows. |
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| started_at | timestamptz | no | | |
| ended_at | timestamptz | yes | | Null while in progress. |
| time_budget_min | smallint | no | | Check `between 1 and 480` (UF-08.1). |
| energy | text | no | `'normal'` | Check `in ('low','normal','high')` (UF-08.1). |
| location | text | yes | | A label such as "gym". Check `char_length(location) <= 32` (NFR-PRIV-2). |
| effort_rating | smallint | yes | | Check `between 1 and 5` (UF-03.3, D-0030). |
| warmup_in_budget | boolean | no | `true` | UF-08.1 toggle (D-0004, D-0024). |
| plan | jsonb | yes | | The plan built at session start, with the session-start deficits rule 8 trims by (D-0024). Check `sessions_plan_is_object`: null or a JSON object. Shape: the `SessionPlan` v1 component of `api/openapi.yaml` (`version: 1`, `mainLiftId`, `warmup`, `items`, `startDeficits`; D-0035, D-0037 §7). Typed `SessionPlan \| null` in `@workoutlab/shared`; read it with `parseSessionPlan()`, which never throws. |
| created_at | timestamptz | no | `now()` | |

- Keys: PK `(id)`, unique `sessions_id_user_id_key (id, user_id)` (target of the child composite FK). Check `sessions_ended_after_started`: `ended_at is null or ended_at >= started_at`. No rule ties duration to budget (running over is valid, D-0020).
- Indexes: `sessions_user_id_started_at_idx (user_id, started_at)`.
- RLS: `sessions_select`, `sessions_insert`, `sessions_update`, `sessions_delete` (owner, `authenticated`).

### session_sets (D-0015, D-0017, D-0020, D-0021, D-0024)
One row per set, identified by `(user_id, client_id)` (D-0015). Clients write with `upsert(rows, { onConflict: 'user_id,client_id' })` after the session row has synced. A set whose session has not arrived fails the FK (`23503`) and stays queued (D-0020).

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK. Kept on update. |
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| client_id | uuid | no | | Generated on the device at "Done set" (D-0015, D-0017). |
| session_id | uuid | no | | Composite FK `(session_id, user_id)` → `sessions(id, user_id)` on delete cascade (D-0020). |
| exercise_id | text | no | | FK `exercises(id)`. |
| set_index | smallint | no | | Check `>= 0`. |
| kind | text | no | `'reps'` | Check `in ('reps','timed')` (D-0021, UF-09.7). |
| reps | smallint | yes | | Check `>= 0`. Required when `kind = 'reps'`. |
| weight_kg | numeric(6,2) | yes | | Check `>= 0`. |
| duration_s | integer | yes | | Check `> 0`. Required when `kind = 'timed'`. |
| rir | smallint | yes | | Reps in reserve. Check `between 0 and 5` (UF-09.4, D-0021). |
| is_warmup | boolean | no | `false` | A set is hard when not a warm-up (engine rules). |
| backoff | boolean | no | `false` | High-energy back-off set on the main lift (D-0024). A hard set. |
| completed_at | timestamptz | no | | Immutable (D-0015). The only date that places a set in the window. |
| edited_at | timestamptz | no | | Client edit clock (D-0015). |
| deleted_at | timestamptz | yes | | Tombstone (D-0015). |
| created_at | timestamptz | no | `now()` | Kept on update. |

- Keys: PK `(id)`, unique `session_sets_user_id_client_id_key (user_id, client_id)`, FK `session_sets_session_fk`. Check `session_sets_kind_shape`: `kind = 'reps'` requires `reps`, `kind = 'timed'` requires `duration_s`. Check `session_sets_backoff_not_warmup`: `not (backoff and is_warmup)`.
- Indexes: `session_sets_user_id_completed_at_idx (user_id, completed_at)`, `session_sets_session_id_idx (session_id)`, `session_sets_exercise_id_idx (exercise_id)`.
- Trigger `session_sets_before_update` (before update, `private.session_sets_before_update`), the D-0015 upsert guard (D-0020): returns `NULL` (skips the update) when `new.edited_at <= old.edited_at`, so a replay or an older edit is a no-op. Otherwise it keeps `id`, `completed_at` and `created_at` from the old row. A newer edit with `deleted_at` null un-deletes a tombstone.
- RLS: `session_sets_select`, `session_sets_insert`, `session_sets_update`, `session_sets_delete` (owner, `authenticated`).

### session_sets_live (view, D-0015, D-0020)
`select * from session_sets where deleted_at is null`, recreated by T-0100b so it carries `backoff`, created `with (security_invoker = true)`, so the caller's RLS applies. Same columns as `session_sets`. `authenticated` may select; `anon` has no privileges. Engine load, balance and metric queries read from it.

### routines (D-0020, D-0021, UF-07)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK. |
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| name | text | no | | |
| created_at | timestamptz | no | `now()` | Server-set (D-0020). |
| updated_at | timestamptz | no | `now()` | Server-set (D-0020, NFR-SYNC-3). |

- Keys: PK `(id)`, unique `routines_id_user_id_key (id, user_id)` (target of the child composite FK).
- Indexes: `routines_user_id_idx (user_id)`.
- Trigger `routines_before_write` (before insert or update, `private.routines_before_write`): insert sets `created_at` and `updated_at` := `now()`; update keeps `user_id` and `created_at` and sets `updated_at` := `now()`.
- RLS: `routines_select`, `routines_insert`, `routines_update`, `routines_delete` (owner, `authenticated`).

### routine_items (D-0020, D-0021, UF-07.1, UF-08.3)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK. |
| routine_id | uuid | no | | Composite FK `(routine_id, user_id)` → `routines(id, user_id)` on delete cascade (D-0020). |
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| position | smallint | no | | Check `>= 0`. Order within the routine. |
| exercise_id | text | no | | FK `exercises(id)`. |
| sets | smallint | no | | Check `>= 1`. |
| reps_min | smallint | yes | | Check `>= 1`. |
| reps_max | smallint | yes | | Check `>= 1`. |
| duration_s | integer | yes | | Check `> 0`. For timed exercises. |
| progression | text | no | `'double_progression'` | Check `in ('none','double_progression','linear_load')` (D-0021). |

- Keys: PK `(id)`, unique `routine_items_routine_id_position_key (routine_id, position)`, FK `routine_items_routine_fk`. Check `routine_items_reps_range`: `reps_min <= reps_max` when both are set.
- Indexes: `routine_items_user_id_idx (user_id)`, `routine_items_exercise_id_idx (exercise_id)`.
- RLS: `routine_items_select`, `routine_items_insert`, `routine_items_update`, `routine_items_delete` (owner, `authenticated`).

### plan_checkins (D-0018, D-0021, UF-11.1)
The client inserts a row when a proposal is **first shown** (`answer` null), and updates it on Accept, Keep or withdrawal (UF-11.3 Save). The unique `(user_id, period_index)` stops a second device from duplicating a proposal (`23505`); the client then reads the existing row.

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK. |
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| period_index | integer | no | | Check `>= 0`. The evaluated (last ended) period; 0 is the first period after onboarding (D-0094). |
| completed_prev | integer | yes | | Check `>= 0`. Null for a one-period evaluation (D-0070 §6). |
| completed_last | integer | no | | Check `>= 0`. Completed sessions in the evaluated period. |
| rhythm_min_before | smallint | no | | |
| rhythm_max_before | smallint | no | | |
| proposed_min | smallint | no | | |
| proposed_max | smallint | no | | |
| proposed_at | timestamptz | no | | When the proposal was first shown. |
| answer | text | yes | | Check `in ('accepted','kept','withdrawn')`. |
| answered_at | timestamptz | yes | | The rule 9 reset input with `profiles.plan_changed_at` (D-0027). |

- Keys: PK `(id)`, unique `plan_checkins_user_id_period_index_key (user_id, period_index)`. Checks: `plan_checkins_rhythm_before_range` and `plan_checkins_proposed_range` (each bound 1–7, min ≤ max); `plan_checkins_answer_pair`: `(answer is null) = (answered_at is null)`.
- Indexes: the unique `(user_id, period_index)`.
- RLS: `plan_checkins_select`, `plan_checkins_insert`, `plan_checkins_update`, `plan_checkins_delete` (owner, `authenticated`).

### excluded_exercises (D-0020, D-0199, UF-04.2, UF-08.2, UF-08.3, UF-11.5)
The user's "never suggest" list (D-0199 §1). One row per excluded exercise; it never expires. The client passes the ids to `suggest` as `excludeIds` and to `rankSwaps`. Adding an existing row is not an error (`upsert … ignoreDuplicates`, i.e. `on conflict (user_id, exercise_id) do nothing`); deleting a missing row changes 0 rows. Not a `profiles` array, so a concurrent add from a second device is never lost (D-0199 §4). Warm-up ids are refused in the client, not here.

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| exercise_id | text | no | | FK `exercises(id)` **on delete cascade** (see below). |
| created_at | timestamptz | no | `now()` | Server-set (D-0020, NFR-SYNC-3). |

- Keys: PK `excluded_exercises_pkey (user_id, exercise_id)`. There is no `id` column; the export orders by `exercise_id` (D-0199 §5).
- Indexes: the PK; `excluded_exercises_exercise_id_idx (exercise_id)`.
- Trigger `excluded_exercises_before_write` (before insert or update, `private.excluded_exercises_before_write`): insert sets `created_at` := `now()`; update keeps `user_id` and `created_at`. A client value is ignored.
- RLS: `excluded_exercises_select`, `excluded_exercises_insert`, `excluded_exercises_update`, `excluded_exercises_delete` (owner, `authenticated`). `anon` has no privileges.
- **Cascade asymmetry (D-0199 §4).** `session_sets.exercise_id` and `routine_items.exercise_id` have no `on delete` action, so a library row with history or in a routine can't be deleted. `excluded_exercises.exercise_id` cascades: an exclusion is a preference, not history, so it goes with its exercise.
- Trigger `excluded_exercises_after_insert` (after insert, `private.excluded_exercises_after_insert`, security invoker): deletes the same `(user_id, exercise_id)` from `favorite_exercises` (D-0202 §5, mutual exclusion; see `favorite_exercises`).

### favorite_exercises (D-0020, D-0202, UF-04.2, UF-08.2, UF-11.6)
The user's favorites list (D-0202). One row per favorite exercise; it never expires. Same shape as `excluded_exercises`. The client passes the ids to `suggest` as `favoriteIds`. Adding an existing row is not an error (`on conflict (user_id, exercise_id) do nothing`); deleting a missing row changes 0 rows.

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| exercise_id | text | no | | FK `exercises(id)` **on delete cascade** (as `excluded_exercises`). |
| created_at | timestamptz | no | `now()` | Server-set (D-0020, NFR-SYNC-3). |

- Keys: PK `favorite_exercises_pkey (user_id, exercise_id)`. There is no `id` column; the export orders by `exercise_id` (D-0202 §5).
- Indexes: the PK; `favorite_exercises_exercise_id_idx (exercise_id)`.
- Trigger `favorite_exercises_before_write` (before insert or update, `private.favorite_exercises_before_write`): insert sets `created_at` := `now()`; update keeps `user_id` and `created_at`. A client value is ignored.
- Trigger `favorite_exercises_after_insert` (after insert, `private.favorite_exercises_after_insert`, security invoker): deletes the same `(user_id, exercise_id)` from `excluded_exercises`.
- RLS: `favorite_exercises_select`, `favorite_exercises_insert`, `favorite_exercises_update`, `favorite_exercises_delete` (owner, `authenticated`). `anon` has no privileges.
- **Cascade (D-0202 §5).** Like `excluded_exercises`, the exercise FK cascades: a favorite is a preference, not history, so it goes with its exercise.
- **Mutual exclusion (D-0202 §5, amends D-0199 §4).** An exercise is in at most one of the two lists: inserting into either list deletes the same pair from the other (`favorite_exercises_after_insert`, `excluded_exercises_after_insert`). Both functions are `security invoker`, so RLS applies and the deleted row is the caller's own. A delete fires no insert trigger, so there is no recursion. A duplicate insert skipped by `on conflict do nothing` fires no after-insert trigger.
- **Two-device race (D-0202 §5).** A favorite on one device and an exclusion on another, committed concurrently, can leave both rows. That is not a DB error: the engine's precedence (exclusion wins) makes it safe, and the next insert into either list removes the other row.

## Schema analytics (D-0021, NFR-AN-2)
Private: `usage` is revoked from `public`, `anon` and `authenticated` (select gives `42501`), and the schema is not in PostgREST's exposed schemas. The views run with the owner's rights (`security_invoker` off) so they aggregate over all users. Dates are **UTC**. Each view returns exactly one row. Ratios are `numeric` rounded to 3 dp and are `null` when the denominator is 0.

### analytics.time_to_first_plan
| column | type | notes |
|---|---|---|
| profiles_timed | integer | Profiles with non-null `onboarding_timing_ms`. |
| p50 | double precision | `percentile_cont(0.5)` of `onboarding_timing_ms`, nulls excluded. |
| p90 | double precision | `percentile_cont(0.9)`. |

### analytics.finished_within_budget
A session counts when `ended_at` is set and it has ≥ 1 live hard set (not warm-up, not tombstoned). It is within budget when `ended_at − started_at ≤ time_budget_min × 60 + 120 s` (boundary included).

| column | type | notes |
|---|---|---|
| sessions_finished | integer | Counted sessions. |
| sessions_within | integer | Of those, within budget. |
| ratio | numeric | `sessions_within / sessions_finished`. |

### analytics.checkins_answered
Every `plan_checkins` row counts as shown. It is answered when `answer in ('accepted','kept')` and `answered_at ≤ proposed_at + 7 days`. `withdrawn` counts as shown, not answered.

| column | type | notes |
|---|---|---|
| checkins_shown | integer | |
| checkins_answered | integer | |
| ratio | numeric | `checkins_answered / checkins_shown`. |

### analytics.areas_on_target_day28
`d0 = (onboarded_at at time zone 'UTC')::date`. A user is included when `d0 + 28 <= (now() at time zone 'UTC')::date` and they have ≥ 4 completed sessions (≥ 1 live hard set, D-0018) with UTC `started_at` dates in `d0 .. d0 + 28`. Load per area is `Σ exercise_areas.weight` over live hard sets with UTC `completed_at` dates in `d0 + 15 .. d0 + 28` (14 days, inclusive). An area is on target when load ≥ `area_targets.sets_per_14d`. A user's share is on-target areas / their `area_targets` rows.

| column | type | notes |
|---|---|---|
| users_included | integer | |
| mean_share | numeric | Mean of the users' shares. |
