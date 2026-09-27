-- T-0100a RLS tests (NFR-PRIV-3): AC4 [a] owner isolation, AC5 anon sees nothing owned,
-- AC7 no cross-user attach (D-0020).
-- User A = ...0a, user B = ...0b. A owns 1 row per table, B owns none.
begin;
select plan(34);

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
-- sessions has 2 rows for A; S_A2 has no sets (AC7).

-- AC4: B sees, changes and deletes nothing of A's ------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.profiles), 0, 'B selects 0 profiles');
select is((select count(*)::int from public.area_targets), 0, 'B selects 0 area_targets');
select is((select count(*)::int from public.sessions), 0, 'B selects 0 sessions');
select is((select count(*)::int from public.session_sets), 0, 'B selects 0 session_sets');

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

-- AC4: A sees exactly its own rows -------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'A selects 1 profile');
select is((select count(*)::int from public.area_targets), 1, 'A selects 1 area_target');
select is((select count(*)::int from public.sessions where id = '10000000-0000-0000-0000-00000000000a'), 1, 'A selects its session');
select is((select count(*)::int from public.session_sets), 1, 'A selects 1 session_set');
reset role;

-- AC5: anon has no access to user-owned tables -------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon cannot select profiles');
select throws_ok('select count(*) from public.area_targets', '42501', null, 'anon cannot select area_targets');
select throws_ok('select count(*) from public.sessions', '42501', null, 'anon cannot select sessions');
select throws_ok('select count(*) from public.session_sets', '42501', null, 'anon cannot select session_sets');
select throws_ok('select count(*) from public.session_sets_live', '42501', null, 'anon cannot select session_sets_live');
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
reset role;

select * from finish();
rollback;
