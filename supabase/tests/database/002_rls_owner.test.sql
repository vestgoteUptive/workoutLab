-- T-0100a RLS tests (NFR-PRIV-3): AC4 [a] owner isolation, AC5 anon sees nothing owned,
-- AC7 no cross-user attach (D-0020). T-0100b: AC4 [b] for routines, routine_items, plan_checkins.
-- T-0535 (D-0199 §4): excluded_exercises joins every block (019 covers it in depth).
-- User A = ...0a, user B = ...0b. A owns 1 row per table, B owns none.
begin;
select plan(60);

-- Fixture (as postgres) -------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0');
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4);
insert into public.area_targets (user_id, area_id, sets_per_14d) values
  ('00000000-0000-0000-0000-00000000000a', 'back', 20);
insert into public.sessions (id, user_id, started_at, time_budget_min) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '2026-09-20T09:30Z', 45),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '2026-09-21T09:30Z', 45);
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-00000000000a', 'back-squat', 0, 8, '2026-09-20T10:00Z', '2026-09-20T10:00Z');
insert into public.routines (id, user_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Lower A');
insert into public.routine_items (routine_id, user_id, position, exercise_id, sets, reps_min, reps_max) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 0, 'back-squat', 3, 6, 8);
insert into public.plan_checkins (user_id, period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at) values
  ('00000000-0000-0000-0000-00000000000a', 3, 4, 3, 3, 4, 2, 3, '2026-09-27T07:00Z');
insert into public.excluded_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'back-squat');
-- sessions has 2 rows for A; S_A2 has no sets (AC7).

-- AC4: B sees, changes and deletes nothing of A's ------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.profiles), 0, 'B selects 0 profiles');
select is((select count(*)::int from public.area_targets), 0, 'B selects 0 area_targets');
select is((select count(*)::int from public.sessions), 0, 'B selects 0 sessions');
select is((select count(*)::int from public.session_sets), 0, 'B selects 0 session_sets');
select is((select count(*)::int from public.routines), 0, 'B selects 0 routines');
select is((select count(*)::int from public.routine_items), 0, 'B selects 0 routine_items');
select is((select count(*)::int from public.plan_checkins), 0, 'B selects 0 plan_checkins');
select is((select count(*)::int from public.excluded_exercises), 0, 'B selects 0 excluded_exercises');

select results_eq($$with u as (update public.profiles set rhythm_max = 7
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s profiles');
select results_eq($$with u as (update public.area_targets set sets_per_14d = 99
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s area_targets');
select results_eq($$with u as (update public.sessions set time_budget_min = 99
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s sessions');
select results_eq($$with u as (update public.session_sets set reps = 99, edited_at = '2030-01-01Z'
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s session_sets');

select results_eq($$with d as (delete from public.profiles
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s profiles');
select results_eq($$with d as (delete from public.area_targets
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s area_targets');
select results_eq($$with d as (delete from public.sessions
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s sessions');
select results_eq($$with d as (delete from public.session_sets
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s session_sets');

select throws_ok($$insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max)
  values ('00000000-0000-0000-0000-00000000000a', 'get_stronger', 'advanced', 5, 6)$$,
  '42501', null, 'B cannot insert a profile for A');
select throws_ok($$insert into public.area_targets (user_id, area_id, sets_per_14d)
  values ('00000000-0000-0000-0000-00000000000a', 'chest', 10)$$,
  '42501', null, 'B cannot insert an area_target for A');
select throws_ok($$insert into public.sessions (user_id, started_at, time_budget_min)
  values ('00000000-0000-0000-0000-00000000000a', '2026-09-22T09:00Z', 30)$$,
  '42501', null, 'B cannot insert a session for A');
select throws_ok($$insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000ff',
          '10000000-0000-0000-0000-00000000000a', 'back-squat', 1, 5, '2026-09-20T10:05Z', '2026-09-20T10:05Z')$$,
  '42501', null, 'B cannot insert a set for A');

select results_eq($$with u as (update public.routines set name = 'Hacked'
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s routines');
select results_eq($$with d as (delete from public.routines
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s routines');
select results_eq($$with u as (update public.routine_items set sets = 9
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s routine_items');
select results_eq($$with d as (delete from public.routine_items
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s routine_items');
select results_eq($$with u as (update public.plan_checkins set answer = 'kept', answered_at = '2026-09-27T08:00Z'
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s plan_checkins');
select results_eq($$with d as (delete from public.plan_checkins
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s plan_checkins');
select throws_ok($$insert into public.routines (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Mine now')$$,
  '42501', null, 'B cannot insert a routine for A');
select throws_ok($$insert into public.routine_items (routine_id, user_id, position, exercise_id, sets)
  values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 5, 'back-squat', 3)$$,
  '42501', null, 'B cannot insert a routine_item for A');
select throws_ok($$insert into public.plan_checkins (user_id, period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values ('00000000-0000-0000-0000-00000000000a', 4, 0, 0, 3, 4, 2, 3, '2026-10-11T07:00Z')$$,
  '42501', null, 'B cannot insert a plan_checkin for A');
select results_eq($$with u as (update public.excluded_exercises set created_at = '2020-01-01Z'
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'B updates 0 of A''s excluded_exercises');
select results_eq($$with d as (delete from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'B deletes 0 of A''s excluded_exercises');
select throws_ok($$insert into public.excluded_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000a', 'back-squat')$$,
  '42501', null, 'B cannot insert an excluded_exercise for A');

-- AC7: B cannot attach its own set to A's session (composite FK, D-0020).
select throws_ok($$insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  values ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-0000000000b7',
          '10000000-0000-0000-0000-0000000000a2', 'back-squat', 0, 5, '2026-09-21T10:00Z', '2026-09-21T10:00Z')$$,
  '23503', null, 'B attaching a set to A''s session fails with 23503');

reset role;
select is((select count(*)::int from public.session_sets where session_id = '10000000-0000-0000-0000-0000000000a2'),
  0, 'A''s session S_A2 still has 0 sets');
select is((select rhythm_max from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  4::smallint, 'A''s profile is unchanged');
select is((select sets_per_14d from public.area_targets where user_id = '00000000-0000-0000-0000-00000000000a'),
  20::smallint, 'A''s area_target is unchanged');
select is((select reps from public.session_sets where user_id = '00000000-0000-0000-0000-00000000000a'),
  8::smallint, 'A''s set is unchanged');
select results_eq($$select r.name, i.sets, c.answer from public.routines r
    join public.routine_items i on i.routine_id = r.id
    cross join public.plan_checkins c
  where r.user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('Lower A'::text, 3::smallint, null::text)$$, 'A''s routine, item and check-in are unchanged');

-- AC4: A sees exactly its own rows -------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'A selects 1 profile');
select is((select count(*)::int from public.area_targets), 1, 'A selects 1 area_target');
select is((select count(*)::int from public.sessions where id = '10000000-0000-0000-0000-00000000000a'), 1, 'A selects its session');
select is((select count(*)::int from public.session_sets), 1, 'A selects 1 session_set');
select is((select count(*)::int from public.routines), 1, 'A selects 1 routine');
select is((select count(*)::int from public.routine_items), 1, 'A selects 1 routine_item');
select is((select count(*)::int from public.plan_checkins), 1, 'A selects 1 plan_checkin');
select is((select count(*)::int from public.excluded_exercises), 1, 'A selects 1 excluded_exercise');
reset role;

-- AC5: anon has no access to user-owned tables -------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon cannot select profiles');
select throws_ok('select count(*) from public.area_targets', '42501', null, 'anon cannot select area_targets');
select throws_ok('select count(*) from public.sessions', '42501', null, 'anon cannot select sessions');
select throws_ok('select count(*) from public.session_sets', '42501', null, 'anon cannot select session_sets');
select throws_ok('select count(*) from public.session_sets_live', '42501', null, 'anon cannot select session_sets_live');
select throws_ok('select count(*) from public.routines', '42501', null, 'anon cannot select routines');
select throws_ok('select count(*) from public.routine_items', '42501', null, 'anon cannot select routine_items');
select throws_ok('select count(*) from public.plan_checkins', '42501', null, 'anon cannot select plan_checkins');
select throws_ok('select count(*) from public.excluded_exercises', '42501', null, 'anon cannot select excluded_exercises');
select throws_ok($$insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max)
  values ('00000000-0000-0000-0000-00000000000b', 'get_stronger', 'advanced', 5, 6)$$,
  '42501', null, 'anon cannot insert a profile');
select throws_ok($$insert into public.area_targets (user_id, area_id, sets_per_14d)
  values ('00000000-0000-0000-0000-00000000000b', 'chest', 10)$$,
  '42501', null, 'anon cannot insert an area_target');
select throws_ok($$insert into public.sessions (user_id, started_at, time_budget_min)
  values ('00000000-0000-0000-0000-00000000000b', '2026-09-22T09:00Z', 30)$$,
  '42501', null, 'anon cannot insert a session');
select throws_ok($$insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000fe',
          '10000000-0000-0000-0000-00000000000a', 'back-squat', 1, 5, '2026-09-20T10:05Z', '2026-09-20T10:05Z')$$,
  '42501', null, 'anon cannot insert a set');
select throws_ok($$insert into public.excluded_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000b', 'back-squat')$$,
  '42501', null, 'anon cannot insert an excluded_exercise');
reset role;

select * from finish();
rollback;
