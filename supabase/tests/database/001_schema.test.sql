-- T-0100a schema tests: AC1 (contract matches migration), AC2 (areas), AC3 (RLS everywhere),
-- AC24 [a][b] (indexes), AC23 (data minimisation), D-0029 (exercises columns, TR-0003).
-- The AC1 block is generated from the column tables in docs/data-model.md (parts [a] and [b], T-0100b).
begin;
select plan(245);

-- AC1 -------------------------------------------------------------------------------------------
-- areas
select has_table('public', 'areas', 'table areas exists');
select columns_are('public', 'areas', array['id', 'sort_order'], 'areas has exactly the documented columns');
select col_type_is('public', 'areas', 'id', 'text', 'areas.id is text');
select col_not_null('public', 'areas', 'id', 'areas.id is not null');
select col_type_is('public', 'areas', 'sort_order', 'smallint', 'areas.sort_order is smallint');
select col_not_null('public', 'areas', 'sort_order', 'areas.sort_order is not null');
-- exercises
select has_table('public', 'exercises', 'table exercises exists');
select columns_are('public', 'exercises', array['id', 'name', 'type', 'level', 'equipment', 'instructions', 'mistakes', 'cue', 'timed', 'source', 'license', 'attribution', 'source_url', 'kind', 'increment_kg', 'default_duration_s', 'external_load'], 'exercises has exactly the documented columns');
select col_type_is('public', 'exercises', 'id', 'text', 'exercises.id is text');
select col_not_null('public', 'exercises', 'id', 'exercises.id is not null');
select col_type_is('public', 'exercises', 'name', 'text', 'exercises.name is text');
select col_not_null('public', 'exercises', 'name', 'exercises.name is not null');
select col_type_is('public', 'exercises', 'type', 'text', 'exercises.type is text');
select col_not_null('public', 'exercises', 'type', 'exercises.type is not null');
select col_type_is('public', 'exercises', 'level', 'text', 'exercises.level is text');
select col_not_null('public', 'exercises', 'level', 'exercises.level is not null');
select col_type_is('public', 'exercises', 'equipment', 'text[]', 'exercises.equipment is text[]');
select col_not_null('public', 'exercises', 'equipment', 'exercises.equipment is not null');
select col_type_is('public', 'exercises', 'instructions', 'text[]', 'exercises.instructions is text[]');
select col_not_null('public', 'exercises', 'instructions', 'exercises.instructions is not null');
select col_type_is('public', 'exercises', 'mistakes', 'text[]', 'exercises.mistakes is text[]');
select col_not_null('public', 'exercises', 'mistakes', 'exercises.mistakes is not null');
select col_type_is('public', 'exercises', 'cue', 'text', 'exercises.cue is text');
select col_is_null('public', 'exercises', 'cue', 'exercises.cue is nullable');
select col_type_is('public', 'exercises', 'timed', 'boolean', 'exercises.timed is boolean');
select col_not_null('public', 'exercises', 'timed', 'exercises.timed is not null');
select col_type_is('public', 'exercises', 'source', 'text', 'exercises.source is text');
select col_not_null('public', 'exercises', 'source', 'exercises.source is not null');
select col_type_is('public', 'exercises', 'license', 'text', 'exercises.license is text');
select col_not_null('public', 'exercises', 'license', 'exercises.license is not null');
select col_type_is('public', 'exercises', 'attribution', 'text', 'exercises.attribution is text');
select col_is_null('public', 'exercises', 'attribution', 'exercises.attribution is nullable');
select col_type_is('public', 'exercises', 'source_url', 'text', 'exercises.source_url is text');
select col_is_null('public', 'exercises', 'source_url', 'exercises.source_url is nullable');
select col_type_is('public', 'exercises', 'kind', 'text', 'exercises.kind is text');
select col_not_null('public', 'exercises', 'kind', 'exercises.kind is not null');
select col_type_is('public', 'exercises', 'increment_kg', 'numeric(4,2)', 'exercises.increment_kg is numeric(4,2)');
select col_not_null('public', 'exercises', 'increment_kg', 'exercises.increment_kg is not null');
select col_type_is('public', 'exercises', 'default_duration_s', 'integer', 'exercises.default_duration_s is integer');
select col_is_null('public', 'exercises', 'default_duration_s', 'exercises.default_duration_s is nullable');
select col_type_is('public', 'exercises', 'external_load', 'boolean', 'exercises.external_load is boolean');
select col_not_null('public', 'exercises', 'external_load', 'exercises.external_load is not null');
-- exercise_areas
select has_table('public', 'exercise_areas', 'table exercise_areas exists');
select columns_are('public', 'exercise_areas', array['exercise_id', 'area_id', 'weight'], 'exercise_areas has exactly the documented columns');
select col_type_is('public', 'exercise_areas', 'exercise_id', 'text', 'exercise_areas.exercise_id is text');
select col_not_null('public', 'exercise_areas', 'exercise_id', 'exercise_areas.exercise_id is not null');
select col_type_is('public', 'exercise_areas', 'area_id', 'text', 'exercise_areas.area_id is text');
select col_not_null('public', 'exercise_areas', 'area_id', 'exercise_areas.area_id is not null');
select col_type_is('public', 'exercise_areas', 'weight', 'numeric(2,1)', 'exercise_areas.weight is numeric(2,1)');
select col_not_null('public', 'exercise_areas', 'weight', 'exercise_areas.weight is not null');
-- exercise_variants
select has_table('public', 'exercise_variants', 'table exercise_variants exists');
select columns_are('public', 'exercise_variants', array['exercise_id', 'variant_id'], 'exercise_variants has exactly the documented columns');
select col_type_is('public', 'exercise_variants', 'exercise_id', 'text', 'exercise_variants.exercise_id is text');
select col_not_null('public', 'exercise_variants', 'exercise_id', 'exercise_variants.exercise_id is not null');
select col_type_is('public', 'exercise_variants', 'variant_id', 'text', 'exercise_variants.variant_id is text');
select col_not_null('public', 'exercise_variants', 'variant_id', 'exercise_variants.variant_id is not null');
-- profiles
select has_table('public', 'profiles', 'table profiles exists');
select columns_are('public', 'profiles', array['user_id', 'goal', 'level', 'rhythm_min', 'rhythm_max', 'equipment', 'priority_areas', 'onboarded_at', 'onboarding_timing_ms', 'plan_changed_at', 'created_at', 'updated_at'], 'profiles has exactly the documented columns');
select col_type_is('public', 'profiles', 'user_id', 'uuid', 'profiles.user_id is uuid');
select col_not_null('public', 'profiles', 'user_id', 'profiles.user_id is not null');
select col_type_is('public', 'profiles', 'goal', 'text', 'profiles.goal is text');
select col_not_null('public', 'profiles', 'goal', 'profiles.goal is not null');
select col_type_is('public', 'profiles', 'level', 'text', 'profiles.level is text');
select col_not_null('public', 'profiles', 'level', 'profiles.level is not null');
select col_type_is('public', 'profiles', 'rhythm_min', 'smallint', 'profiles.rhythm_min is smallint');
select col_not_null('public', 'profiles', 'rhythm_min', 'profiles.rhythm_min is not null');
select col_type_is('public', 'profiles', 'rhythm_max', 'smallint', 'profiles.rhythm_max is smallint');
select col_not_null('public', 'profiles', 'rhythm_max', 'profiles.rhythm_max is not null');
select col_type_is('public', 'profiles', 'equipment', 'text[]', 'profiles.equipment is text[]');
select col_not_null('public', 'profiles', 'equipment', 'profiles.equipment is not null');
select col_type_is('public', 'profiles', 'priority_areas', 'text[]', 'profiles.priority_areas is text[]');
select col_not_null('public', 'profiles', 'priority_areas', 'profiles.priority_areas is not null');
select col_type_is('public', 'profiles', 'onboarded_at', 'timestamp with time zone', 'profiles.onboarded_at is timestamp with time zone');
select col_not_null('public', 'profiles', 'onboarded_at', 'profiles.onboarded_at is not null');
select col_type_is('public', 'profiles', 'onboarding_timing_ms', 'integer', 'profiles.onboarding_timing_ms is integer');
select col_is_null('public', 'profiles', 'onboarding_timing_ms', 'profiles.onboarding_timing_ms is nullable');
select col_type_is('public', 'profiles', 'plan_changed_at', 'timestamp with time zone', 'profiles.plan_changed_at is timestamp with time zone');
select col_not_null('public', 'profiles', 'plan_changed_at', 'profiles.plan_changed_at is not null');
select col_type_is('public', 'profiles', 'created_at', 'timestamp with time zone', 'profiles.created_at is timestamp with time zone');
select col_not_null('public', 'profiles', 'created_at', 'profiles.created_at is not null');
select col_type_is('public', 'profiles', 'updated_at', 'timestamp with time zone', 'profiles.updated_at is timestamp with time zone');
select col_not_null('public', 'profiles', 'updated_at', 'profiles.updated_at is not null');
-- area_targets
select has_table('public', 'area_targets', 'table area_targets exists');
select columns_are('public', 'area_targets', array['user_id', 'area_id', 'sets_per_14d', 'source', 'updated_at'], 'area_targets has exactly the documented columns');
select col_type_is('public', 'area_targets', 'user_id', 'uuid', 'area_targets.user_id is uuid');
select col_not_null('public', 'area_targets', 'user_id', 'area_targets.user_id is not null');
select col_type_is('public', 'area_targets', 'area_id', 'text', 'area_targets.area_id is text');
select col_not_null('public', 'area_targets', 'area_id', 'area_targets.area_id is not null');
select col_type_is('public', 'area_targets', 'sets_per_14d', 'smallint', 'area_targets.sets_per_14d is smallint');
select col_not_null('public', 'area_targets', 'sets_per_14d', 'area_targets.sets_per_14d is not null');
select col_type_is('public', 'area_targets', 'source', 'text', 'area_targets.source is text');
select col_not_null('public', 'area_targets', 'source', 'area_targets.source is not null');
select col_type_is('public', 'area_targets', 'updated_at', 'timestamp with time zone', 'area_targets.updated_at is timestamp with time zone');
select col_not_null('public', 'area_targets', 'updated_at', 'area_targets.updated_at is not null');
-- sessions
select has_table('public', 'sessions', 'table sessions exists');
select columns_are('public', 'sessions', array['id', 'user_id', 'started_at', 'ended_at', 'time_budget_min', 'energy', 'location', 'effort_rating', 'warmup_in_budget', 'plan', 'created_at'], 'sessions has exactly the documented columns');
select col_type_is('public', 'sessions', 'id', 'uuid', 'sessions.id is uuid');
select col_not_null('public', 'sessions', 'id', 'sessions.id is not null');
select col_type_is('public', 'sessions', 'user_id', 'uuid', 'sessions.user_id is uuid');
select col_not_null('public', 'sessions', 'user_id', 'sessions.user_id is not null');
select col_type_is('public', 'sessions', 'started_at', 'timestamp with time zone', 'sessions.started_at is timestamp with time zone');
select col_not_null('public', 'sessions', 'started_at', 'sessions.started_at is not null');
select col_type_is('public', 'sessions', 'ended_at', 'timestamp with time zone', 'sessions.ended_at is timestamp with time zone');
select col_is_null('public', 'sessions', 'ended_at', 'sessions.ended_at is nullable');
select col_type_is('public', 'sessions', 'time_budget_min', 'smallint', 'sessions.time_budget_min is smallint');
select col_not_null('public', 'sessions', 'time_budget_min', 'sessions.time_budget_min is not null');
select col_type_is('public', 'sessions', 'energy', 'text', 'sessions.energy is text');
select col_not_null('public', 'sessions', 'energy', 'sessions.energy is not null');
select col_type_is('public', 'sessions', 'location', 'text', 'sessions.location is text');
select col_is_null('public', 'sessions', 'location', 'sessions.location is nullable');
select col_type_is('public', 'sessions', 'effort_rating', 'smallint', 'sessions.effort_rating is smallint');
select col_is_null('public', 'sessions', 'effort_rating', 'sessions.effort_rating is nullable');
select col_type_is('public', 'sessions', 'warmup_in_budget', 'boolean', 'sessions.warmup_in_budget is boolean');
select col_not_null('public', 'sessions', 'warmup_in_budget', 'sessions.warmup_in_budget is not null');
select col_type_is('public', 'sessions', 'plan', 'jsonb', 'sessions.plan is jsonb');
select col_is_null('public', 'sessions', 'plan', 'sessions.plan is nullable');
select col_type_is('public', 'sessions', 'created_at', 'timestamp with time zone', 'sessions.created_at is timestamp with time zone');
select col_not_null('public', 'sessions', 'created_at', 'sessions.created_at is not null');
-- session_sets
select has_table('public', 'session_sets', 'table session_sets exists');
select columns_are('public', 'session_sets', array['id', 'user_id', 'client_id', 'session_id', 'exercise_id', 'set_index', 'kind', 'reps', 'weight_kg', 'duration_s', 'rir', 'is_warmup', 'backoff', 'completed_at', 'edited_at', 'deleted_at', 'created_at'], 'session_sets has exactly the documented columns');
select col_type_is('public', 'session_sets', 'id', 'uuid', 'session_sets.id is uuid');
select col_not_null('public', 'session_sets', 'id', 'session_sets.id is not null');
select col_type_is('public', 'session_sets', 'user_id', 'uuid', 'session_sets.user_id is uuid');
select col_not_null('public', 'session_sets', 'user_id', 'session_sets.user_id is not null');
select col_type_is('public', 'session_sets', 'client_id', 'uuid', 'session_sets.client_id is uuid');
select col_not_null('public', 'session_sets', 'client_id', 'session_sets.client_id is not null');
select col_type_is('public', 'session_sets', 'session_id', 'uuid', 'session_sets.session_id is uuid');
select col_not_null('public', 'session_sets', 'session_id', 'session_sets.session_id is not null');
select col_type_is('public', 'session_sets', 'exercise_id', 'text', 'session_sets.exercise_id is text');
select col_not_null('public', 'session_sets', 'exercise_id', 'session_sets.exercise_id is not null');
select col_type_is('public', 'session_sets', 'set_index', 'smallint', 'session_sets.set_index is smallint');
select col_not_null('public', 'session_sets', 'set_index', 'session_sets.set_index is not null');
select col_type_is('public', 'session_sets', 'kind', 'text', 'session_sets.kind is text');
select col_not_null('public', 'session_sets', 'kind', 'session_sets.kind is not null');
select col_type_is('public', 'session_sets', 'reps', 'smallint', 'session_sets.reps is smallint');
select col_is_null('public', 'session_sets', 'reps', 'session_sets.reps is nullable');
select col_type_is('public', 'session_sets', 'weight_kg', 'numeric(6,2)', 'session_sets.weight_kg is numeric(6,2)');
select col_is_null('public', 'session_sets', 'weight_kg', 'session_sets.weight_kg is nullable');
select col_type_is('public', 'session_sets', 'duration_s', 'integer', 'session_sets.duration_s is integer');
select col_is_null('public', 'session_sets', 'duration_s', 'session_sets.duration_s is nullable');
select col_type_is('public', 'session_sets', 'rir', 'smallint', 'session_sets.rir is smallint');
select col_is_null('public', 'session_sets', 'rir', 'session_sets.rir is nullable');
select col_type_is('public', 'session_sets', 'is_warmup', 'boolean', 'session_sets.is_warmup is boolean');
select col_not_null('public', 'session_sets', 'is_warmup', 'session_sets.is_warmup is not null');
select col_type_is('public', 'session_sets', 'backoff', 'boolean', 'session_sets.backoff is boolean');
select col_not_null('public', 'session_sets', 'backoff', 'session_sets.backoff is not null');
select col_type_is('public', 'session_sets', 'completed_at', 'timestamp with time zone', 'session_sets.completed_at is timestamp with time zone');
select col_not_null('public', 'session_sets', 'completed_at', 'session_sets.completed_at is not null');
select col_type_is('public', 'session_sets', 'edited_at', 'timestamp with time zone', 'session_sets.edited_at is timestamp with time zone');
select col_not_null('public', 'session_sets', 'edited_at', 'session_sets.edited_at is not null');
select col_type_is('public', 'session_sets', 'deleted_at', 'timestamp with time zone', 'session_sets.deleted_at is timestamp with time zone');
select col_is_null('public', 'session_sets', 'deleted_at', 'session_sets.deleted_at is nullable');
select col_type_is('public', 'session_sets', 'created_at', 'timestamp with time zone', 'session_sets.created_at is timestamp with time zone');
select col_not_null('public', 'session_sets', 'created_at', 'session_sets.created_at is not null');
-- routines
select has_table('public', 'routines', 'table routines exists');
select columns_are('public', 'routines', array['id', 'user_id', 'name', 'created_at', 'updated_at'], 'routines has exactly the documented columns');
select col_type_is('public', 'routines', 'id', 'uuid', 'routines.id is uuid');
select col_not_null('public', 'routines', 'id', 'routines.id is not null');
select col_type_is('public', 'routines', 'user_id', 'uuid', 'routines.user_id is uuid');
select col_not_null('public', 'routines', 'user_id', 'routines.user_id is not null');
select col_type_is('public', 'routines', 'name', 'text', 'routines.name is text');
select col_not_null('public', 'routines', 'name', 'routines.name is not null');
select col_type_is('public', 'routines', 'created_at', 'timestamp with time zone', 'routines.created_at is timestamp with time zone');
select col_not_null('public', 'routines', 'created_at', 'routines.created_at is not null');
select col_type_is('public', 'routines', 'updated_at', 'timestamp with time zone', 'routines.updated_at is timestamp with time zone');
select col_not_null('public', 'routines', 'updated_at', 'routines.updated_at is not null');
-- routine_items
select has_table('public', 'routine_items', 'table routine_items exists');
select columns_are('public', 'routine_items', array['id', 'routine_id', 'user_id', 'position', 'exercise_id', 'sets', 'reps_min', 'reps_max', 'duration_s', 'progression'], 'routine_items has exactly the documented columns');
select col_type_is('public', 'routine_items', 'id', 'uuid', 'routine_items.id is uuid');
select col_not_null('public', 'routine_items', 'id', 'routine_items.id is not null');
select col_type_is('public', 'routine_items', 'routine_id', 'uuid', 'routine_items.routine_id is uuid');
select col_not_null('public', 'routine_items', 'routine_id', 'routine_items.routine_id is not null');
select col_type_is('public', 'routine_items', 'user_id', 'uuid', 'routine_items.user_id is uuid');
select col_not_null('public', 'routine_items', 'user_id', 'routine_items.user_id is not null');
select col_type_is('public', 'routine_items', 'position', 'smallint', 'routine_items.position is smallint');
select col_not_null('public', 'routine_items', 'position', 'routine_items.position is not null');
select col_type_is('public', 'routine_items', 'exercise_id', 'text', 'routine_items.exercise_id is text');
select col_not_null('public', 'routine_items', 'exercise_id', 'routine_items.exercise_id is not null');
select col_type_is('public', 'routine_items', 'sets', 'smallint', 'routine_items.sets is smallint');
select col_not_null('public', 'routine_items', 'sets', 'routine_items.sets is not null');
select col_type_is('public', 'routine_items', 'reps_min', 'smallint', 'routine_items.reps_min is smallint');
select col_is_null('public', 'routine_items', 'reps_min', 'routine_items.reps_min is nullable');
select col_type_is('public', 'routine_items', 'reps_max', 'smallint', 'routine_items.reps_max is smallint');
select col_is_null('public', 'routine_items', 'reps_max', 'routine_items.reps_max is nullable');
select col_type_is('public', 'routine_items', 'duration_s', 'integer', 'routine_items.duration_s is integer');
select col_is_null('public', 'routine_items', 'duration_s', 'routine_items.duration_s is nullable');
select col_type_is('public', 'routine_items', 'progression', 'text', 'routine_items.progression is text');
select col_not_null('public', 'routine_items', 'progression', 'routine_items.progression is not null');
-- plan_checkins
select has_table('public', 'plan_checkins', 'table plan_checkins exists');
select columns_are('public', 'plan_checkins', array['id', 'user_id', 'period_index', 'completed_prev', 'completed_last', 'rhythm_min_before', 'rhythm_max_before', 'proposed_min', 'proposed_max', 'proposed_at', 'answer', 'answered_at'], 'plan_checkins has exactly the documented columns');
select col_type_is('public', 'plan_checkins', 'id', 'uuid', 'plan_checkins.id is uuid');
select col_not_null('public', 'plan_checkins', 'id', 'plan_checkins.id is not null');
select col_type_is('public', 'plan_checkins', 'user_id', 'uuid', 'plan_checkins.user_id is uuid');
select col_not_null('public', 'plan_checkins', 'user_id', 'plan_checkins.user_id is not null');
select col_type_is('public', 'plan_checkins', 'period_index', 'integer', 'plan_checkins.period_index is integer');
select col_not_null('public', 'plan_checkins', 'period_index', 'plan_checkins.period_index is not null');
select col_type_is('public', 'plan_checkins', 'completed_prev', 'integer', 'plan_checkins.completed_prev is integer');
select col_is_null('public', 'plan_checkins', 'completed_prev', 'plan_checkins.completed_prev is nullable (one-period evaluation, D-0070 §6)');
select is(pg_get_constraintdef((select oid from pg_catalog.pg_constraint
                                 where conrelid = 'public.plan_checkins'::regclass
                                   and conname = 'plan_checkins_period_index_check')),
  'CHECK ((period_index >= 0))', 'plan_checkins_period_index_check is period_index >= 0 (D-0070 §6, D-0094)');
select col_type_is('public', 'plan_checkins', 'completed_last', 'integer', 'plan_checkins.completed_last is integer');
select col_not_null('public', 'plan_checkins', 'completed_last', 'plan_checkins.completed_last is not null');
select col_type_is('public', 'plan_checkins', 'rhythm_min_before', 'smallint', 'plan_checkins.rhythm_min_before is smallint');
select col_not_null('public', 'plan_checkins', 'rhythm_min_before', 'plan_checkins.rhythm_min_before is not null');
select col_type_is('public', 'plan_checkins', 'rhythm_max_before', 'smallint', 'plan_checkins.rhythm_max_before is smallint');
select col_not_null('public', 'plan_checkins', 'rhythm_max_before', 'plan_checkins.rhythm_max_before is not null');
select col_type_is('public', 'plan_checkins', 'proposed_min', 'smallint', 'plan_checkins.proposed_min is smallint');
select col_not_null('public', 'plan_checkins', 'proposed_min', 'plan_checkins.proposed_min is not null');
select col_type_is('public', 'plan_checkins', 'proposed_max', 'smallint', 'plan_checkins.proposed_max is smallint');
select col_not_null('public', 'plan_checkins', 'proposed_max', 'plan_checkins.proposed_max is not null');
select col_type_is('public', 'plan_checkins', 'proposed_at', 'timestamp with time zone', 'plan_checkins.proposed_at is timestamp with time zone');
select col_not_null('public', 'plan_checkins', 'proposed_at', 'plan_checkins.proposed_at is not null');
select col_type_is('public', 'plan_checkins', 'answer', 'text', 'plan_checkins.answer is text');
select col_is_null('public', 'plan_checkins', 'answer', 'plan_checkins.answer is nullable');
select col_type_is('public', 'plan_checkins', 'answered_at', 'timestamp with time zone', 'plan_checkins.answered_at is timestamp with time zone');
select col_is_null('public', 'plan_checkins', 'answered_at', 'plan_checkins.answered_at is nullable');
select has_view('public', 'session_sets_live', 'view session_sets_live exists');
select has_view('analytics', 'time_to_first_plan', 'view analytics.time_to_first_plan exists');
select has_view('analytics', 'finished_within_budget', 'view analytics.finished_within_budget exists');
select has_view('analytics', 'checkins_answered', 'view analytics.checkins_answered exists');
select has_view('analytics', 'areas_on_target_day28', 'view analytics.areas_on_target_day28 exists');

-- D-0029 (TR-0003): exercises columns ----------------------------------------------------------
select has_column('public', 'exercises', 'cue', 'exercises.cue exists');
select has_column('public', 'exercises', 'timed', 'exercises.timed exists');
select has_column('public', 'exercises', 'attribution', 'exercises.attribution exists');
select has_column('public', 'exercises', 'source_url', 'exercises.source_url exists');
select hasnt_column('public', 'exercises', 'image_url', 'exercises has no image_url in v1');
select col_default_is('public', 'exercises', 'timed', 'false', 'exercises.timed defaults to false');
select throws_ok(
  $$insert into public.exercises (id, name, type, level, instructions, source, license)
    values ('x-null-source', 'X', 'compound', 'beginner', '{a}', null, 'CC0')$$,
  '23502', null, 'exercises.source null gives 23502');
select throws_ok(
  $$insert into public.exercises (id, name, type, level, instructions, source, license)
    values ('x-null-license', 'X', 'compound', 'beginner', '{a}', 'own', null)$$,
  '23502', null, 'exercises.license null gives 23502');

-- AC2 -------------------------------------------------------------------------------------------
select results_eq(
  'select id from public.areas order by sort_order',
  $$values ('chest'), ('back'), ('shoulders'), ('arms'), ('core'), ('glutes'), ('quads'), ('hamstrings'), ('calves')$$,
  'areas holds the 9 areas in the fixed order');

-- AC3 -------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has RLS enabled');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0, 'every public table has at least one policy');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  0, 'every public view is security_invoker');

-- AC24 [a] --------------------------------------------------------------------------------------
select has_index('public', 'session_sets', 'session_sets_user_id_completed_at_idx', array['user_id', 'completed_at'],
  'index on session_sets (user_id, completed_at)');
select has_index('public', 'sessions', 'sessions_user_id_started_at_idx', array['user_id', 'started_at'],
  'index on sessions (user_id, started_at)');
select col_is_unique('public', 'session_sets', array['user_id', 'client_id'], 'unique session_sets (user_id, client_id)');
select has_unique('public', 'session_sets', 'session_sets has a unique constraint');
select col_is_pk('public', 'area_targets', array['user_id', 'area_id'], 'area_targets PK (user_id, area_id)');
select fk_ok('public', 'session_sets', array['session_id', 'user_id'], 'public', 'sessions', array['id', 'user_id'],
  'session_sets composite FK to sessions (id, user_id)');

-- AC24 [b] -------------------------------------------------------------------------------------
select col_is_unique('public', 'plan_checkins', array['user_id', 'period_index'], 'unique plan_checkins (user_id, period_index)');
select col_is_unique('public', 'routine_items', array['routine_id', 'position'], 'unique routine_items (routine_id, position)');
select fk_ok('public', 'routine_items', array['routine_id', 'user_id'], 'public', 'routines', array['id', 'user_id'],
  'routine_items composite FK to routines (id, user_id)');
select has_index('public', 'routines', 'routines_user_id_idx', array['user_id'], 'index on routines (user_id)');
select has_index('public', 'routine_items', 'routine_items_user_id_idx', array['user_id'], 'index on routine_items (user_id)');

-- AC23 ------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.columns
    where table_schema in ('public', 'analytics')
      and column_name ~* '(dob|birth|sex|gender|body_?weight|heart|latitude|longitude|lat|lng|coord|email)'),
  0, 'no personal-data columns in public or analytics');
select col_type_is('public', 'sessions', 'location', 'text', 'sessions.location is text');

select * from finish();
rollback;
