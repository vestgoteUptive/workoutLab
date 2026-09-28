-- T-0100b AC28 metric views against fixtures and AC29 analytics is private (D-0021, NFR-AN-2).
-- Fixtures are inserted as postgres inside the test transaction. UTC dates throughout.
begin;
select plan(19);

-- Users: P1..P6 (time to first plan, onboarded now(), so never in the day-28 cohort), U1..U3 (day 28).
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000000' || x)::uuid, 'authenticated', 'authenticated', x || '@test.local'
    from unnest(array['a1','a2','a3','a4','a5','a6','c1','c2','c3']) as x;
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0'),
  ('fx-bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('fx-barbell-row', 'Barbell row', 'compound', 'intermediate', '{Row}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0');
insert into public.exercise_areas (exercise_id, area_id, weight) values
  ('fx-back-squat', 'quads', 1.0), ('fx-back-squat', 'glutes', 1.0), ('fx-back-squat', 'hamstrings', 0.5), ('fx-back-squat', 'core', 0.5),
  ('fx-bench-press', 'chest', 1.0), ('fx-bench-press', 'shoulders', 0.5), ('fx-bench-press', 'arms', 0.5),
  ('fx-barbell-row', 'back', 1.0), ('fx-barbell-row', 'arms', 0.5),
  ('fx-plank', 'core', 1.0);

-- Zero history: no rows yet, the ratios are null and nothing raises.
select results_eq('select sessions_finished, ratio from analytics.finished_within_budget',
  $$values (0, null::numeric)$$, 'finished_within_budget.ratio is null with no qualifying sessions');
select results_eq('select checkins_shown, ratio from analytics.checkins_answered',
  $$values (0, null::numeric)$$, 'checkins_answered.ratio is null with no check-ins');
select results_eq('select users_included, mean_share from analytics.areas_on_target_day28',
  $$values (0, null::numeric)$$, 'areas_on_target_day28.mean_share is null with no cohort');

-- Time to first plan ------------------------------------------------------------------------------
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max, onboarding_timing_ms) values
  ('00000000-0000-0000-0000-0000000000a1', 'build_muscle', 'beginner', 3, 4, 30000),
  ('00000000-0000-0000-0000-0000000000a2', 'build_muscle', 'beginner', 3, 4, 40000),
  ('00000000-0000-0000-0000-0000000000a3', 'build_muscle', 'beginner', 3, 4, 45000),
  ('00000000-0000-0000-0000-0000000000a4', 'build_muscle', 'beginner', 3, 4, 50000),
  ('00000000-0000-0000-0000-0000000000a5', 'build_muscle', 'beginner', 3, 4, 70000),
  ('00000000-0000-0000-0000-0000000000a6', 'build_muscle', 'beginner', 3, 4, null);
select results_eq('select profiles_timed, p50, p90 from analytics.time_to_first_plan',
  $$values (5, 45000::double precision, 62000::double precision)$$, 'time_to_first_plan p50 = 45000, p90 = 62000');

-- Finished within budget (sessions of P1) --------------------------------------------------------
insert into public.sessions (id, user_id, started_at, ended_at, time_budget_min) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '2026-09-01T10:00Z', '2026-09-01T10:31Z', 30),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '2026-09-02T10:00Z', '2026-09-02T10:33Z', 30),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '2026-09-03T10:00Z', '2026-09-03T10:20Z', 30),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '2026-09-04T10:00Z', '2026-09-04T10:20Z', 30),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '2026-09-05T10:00Z', '2026-09-05T10:22Z', 20),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '2026-09-06T10:00Z', null, 30);
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, is_warmup, completed_at, edited_at, deleted_at)
  select '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), ('30000000-0000-0000-0000-00000000000' || s)::uuid,
         'fx-back-squat', i, 8, s = 3, '2026-09-01T10:10Z', '2026-09-01T10:10Z',
         case when s = 4 then '2026-09-04T11:00Z'::timestamptz end
    from generate_series(1, 6) as s, generate_series(0, 2) as i;
select results_eq('select sessions_finished, sessions_within, ratio from analytics.finished_within_budget',
  $$values (3, 2, 0.667::numeric)$$, 'finished_within_budget.ratio = 0.667 (S1, S5 within; S2 over; S3, S4, S6 excluded)');

-- Check-ins answered (P1) ----------------------------------------------------------------------------
insert into public.plan_checkins (user_id, period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at) values
  ('00000000-0000-0000-0000-0000000000a1', 1, 1, 1, 3, 4, 2, 3, '2026-09-01T08:00Z', 'accepted',  '2026-09-04T08:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 2, 1, 1, 3, 4, 2, 3, '2026-09-01T08:00Z', 'kept',      '2026-09-09T08:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 3, 1, 1, 3, 4, 2, 3, '2026-09-01T08:00Z', null,        null),
  ('00000000-0000-0000-0000-0000000000a1', 4, 1, 1, 3, 4, 2, 3, '2026-09-01T08:00Z', 'kept',      '2026-09-08T08:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 5, 1, 1, 3, 4, 2, 3, '2026-09-01T08:00Z', 'withdrawn', '2026-09-03T08:00Z');
select results_eq('select checkins_shown, checkins_answered, ratio from analytics.checkins_answered',
  $$values (5, 2, 0.400::numeric)$$, 'checkins_answered.ratio = 0.400 (R1 and R4 of 5)');

-- Areas on target after 4 weeks ----------------------------------------------------------------------
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max, onboarded_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'build_muscle', 'beginner', 3, 4, '2026-08-30T08:00Z'),
  ('00000000-0000-0000-0000-0000000000c2', 'build_muscle', 'beginner', 3, 4, '2026-08-30T08:00Z'),
  ('00000000-0000-0000-0000-0000000000c3', 'build_muscle', 'beginner', 3, 4, now() - interval '5 days');
insert into public.area_targets (user_id, area_id, sets_per_14d)
  select '00000000-0000-0000-0000-0000000000c1'::uuid, id, 10 from public.areas
  union all select '00000000-0000-0000-0000-0000000000c2'::uuid, id, 1 from public.areas
  union all select '00000000-0000-0000-0000-0000000000c3'::uuid, id, 1 from public.areas;
-- U1: 4 sessions in the window (2026-09-14..27) plus one on 2026-09-13. ended_at is null, so
-- these don't change finished_within_budget.
insert into public.sessions (id, user_id, started_at, time_budget_min) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '2026-09-15T10:00Z', 45),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '2026-09-18T10:00Z', 45),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', '2026-09-21T10:00Z', 45),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c1', '2026-09-24T10:00Z', 45),
  ('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000c1', '2026-09-13T10:00Z', 45);
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, is_warmup, completed_at, edited_at, deleted_at)
  select '00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), x.sid::uuid, x.ex, i, 8, x.warm,
         x.day::timestamptz, x.day::timestamptz, x.del::timestamptz
    from (values
      ('40000000-0000-0000-0000-000000000001', 'fx-back-squat',  false, '2026-09-15T10:10Z', null),
      ('40000000-0000-0000-0000-000000000002', 'fx-back-squat',  false, '2026-09-18T10:10Z', null),
      ('40000000-0000-0000-0000-000000000003', 'fx-bench-press', false, '2026-09-21T10:10Z', null),
      ('40000000-0000-0000-0000-000000000004', 'fx-bench-press', false, '2026-09-24T10:10Z', null),
      ('40000000-0000-0000-0000-000000000001', 'fx-barbell-row', true,  '2026-09-15T10:20Z', null),
      ('40000000-0000-0000-0000-000000000002', 'fx-barbell-row', false, '2026-09-18T10:20Z', '2026-09-19T08:00Z'),
      ('40000000-0000-0000-0000-000000000005', 'fx-barbell-row', false, '2026-09-13T10:10Z', null)
    ) as x(sid, ex, warm, day, del),
    generate_series(0, 4) as i;
-- The three barbell-row groups get 5 more sets each (10 per group; squat and bench have 2 x 5).
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, is_warmup, completed_at, edited_at, deleted_at)
  select '00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), x.sid::uuid, x.ex, i, 8, x.warm,
         x.day::timestamptz, x.day::timestamptz, x.del::timestamptz
    from (values
      ('40000000-0000-0000-0000-000000000001', 'fx-barbell-row', true,  '2026-09-15T10:20Z', null),
      ('40000000-0000-0000-0000-000000000002', 'fx-barbell-row', false, '2026-09-18T10:20Z', '2026-09-19T08:00Z'),
      ('40000000-0000-0000-0000-000000000005', 'fx-barbell-row', false, '2026-09-13T10:10Z', null)
    ) as x(sid, ex, warm, day, del),
    generate_series(5, 9) as i;
-- U2: 3 completed sessions only. U3: 4 completed sessions but day 28 not reached.
insert into public.sessions (id, user_id, started_at, time_budget_min)
  select ('50000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000000c2'::uuid, '2026-09-14T10:00Z'::timestamptz + n * interval '1 day', 45
    from generate_series(1, 3) as n
  union all
  select ('60000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000000c3'::uuid, now() - interval '4 days' + n * interval '1 hour', 45
    from generate_series(1, 4) as n;
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  select s.user_id, gen_random_uuid(), s.id, 'fx-barbell-row', 0, 8, s.started_at, s.started_at
    from public.sessions s
   where s.user_id in ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');

select results_eq($$select
    count(*) filter (where not is_warmup and deleted_at is null and exercise_id = 'fx-back-squat')::int,
    count(*) filter (where not is_warmup and deleted_at is null and exercise_id = 'fx-bench-press')::int,
    count(*) filter (where is_warmup and exercise_id = 'fx-barbell-row')::int,
    count(*) filter (where deleted_at is not null)::int,
    count(*) filter (where completed_at < '2026-09-14Z')::int
  from public.session_sets where user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values (10, 10, 10, 10, 10)$$, 'U1 fixture: 10 of each set group');
select results_eq('select users_included, mean_share from analytics.areas_on_target_day28',
  $$values (1, 0.333::numeric)$$, 'areas_on_target_day28.mean_share = 0.333 (quads, glutes, chest; U2, U3 excluded)');
select results_eq('select sessions_finished, ratio from analytics.finished_within_budget',
  $$values (3, 0.667::numeric)$$, 'unfinished day-28 sessions leave finished_within_budget unchanged');

-- AC29: analytics is private -----------------------------------------------------------------------
select is(has_schema_privilege('anon', 'analytics', 'usage'), false, 'anon has no usage on analytics');
select is(has_schema_privilege('authenticated', 'analytics', 'usage'), false, 'authenticated has no usage on analytics');

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select * from analytics.time_to_first_plan', '42501', null, 'anon cannot select time_to_first_plan');
select throws_ok('select * from analytics.finished_within_budget', '42501', null, 'anon cannot select finished_within_budget');
select throws_ok('select * from analytics.checkins_answered', '42501', null, 'anon cannot select checkins_answered');
select throws_ok('select * from analytics.areas_on_target_day28', '42501', null, 'anon cannot select areas_on_target_day28');
reset role;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;
select throws_ok('select * from analytics.time_to_first_plan', '42501', null, 'A cannot select time_to_first_plan');
select throws_ok('select * from analytics.finished_within_budget', '42501', null, 'A cannot select finished_within_budget');
select throws_ok('select * from analytics.checkins_answered', '42501', null, 'A cannot select checkins_answered');
select throws_ok('select * from analytics.areas_on_target_day28', '42501', null, 'A cannot select areas_on_target_day28');
reset role;

select * from finish();
rollback;
