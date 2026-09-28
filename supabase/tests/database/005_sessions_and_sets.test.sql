-- T-0100a session and set checks (D-0020 lenient checks, UF-08.1, UF-09.4, UF-09.7):
-- AC14 offline session after 10 days off, AC15 lenient checks / time running out / zero history,
-- AC16 set shape, AC23 sessions.location length.
begin;
select plan(24);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0');

-- 10 days ago, fixed for this transaction (AC14).
create temporary table t_s1 as select now() - interval '10 days' as started_at;
grant select on t_s1 to authenticated;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC15: zero history -----------------------------------------------------------------------------
insert into public.profiles (goal, level, rhythm_min, rhythm_max) values ('build_muscle', 'beginner', 3, 4);
insert into public.area_targets (area_id, sets_per_14d) select id, 10 from public.areas;
select is((select count(*)::int from public.area_targets), 9, 'A has 9 targets');
select is((select count(*)::int from public.session_sets_live), 0, 'zero history: session_sets_live returns 0 rows');

-- AC14: offline session, 10 days off -------------------------------------------------------------
select lives_ok($$insert into public.sessions (id, started_at, time_budget_min, ended_at)
  select '10000000-0000-0000-0000-000000000001', started_at, 45, null from t_s1
  on conflict (id) do update set started_at = excluded.started_at, time_budget_min = excluded.time_budget_min,
    ended_at = excluded.ended_at$$, 'A upserts offline S1 with ended_at null');
select lives_ok($$insert into public.sessions (id, started_at, time_budget_min, ended_at)
  select '10000000-0000-0000-0000-000000000001', started_at, 45, started_at + interval '45 minutes' from t_s1
  on conflict (id) do update set started_at = excluded.started_at, time_budget_min = excluded.time_budget_min,
    ended_at = excluded.ended_at$$, 'A upserts S1 again with ended_at');
select results_eq($$select count(*)::int, max(ended_at - started_at) from public.sessions
    where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (1, interval '45 minutes')$$, 'exactly 1 S1 row with the last ended_at');
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  select ('c0000000-0000-0000-0000-00000000000' || i)::uuid, '10000000-0000-0000-0000-000000000001', 'fx-back-squat', i, 8,
         started_at + i * interval '3 minutes', started_at + i * interval '3 minutes'
    from t_s1, generate_series(1, 3) as i
  on conflict (user_id, client_id) do update set reps = excluded.reps, edited_at = excluded.edited_at$$,
  'A upserts 3 sets completed 10 days ago');
select is((select count(*)::int from public.session_sets where session_id = '10000000-0000-0000-0000-000000000001'),
  3, 'all 3 sets are stored');

-- AC15: lenient session checks -------------------------------------------------------------------
select lives_ok($$insert into public.sessions (started_at, time_budget_min) values ('2026-09-20T09:00Z', 7)$$,
  'time_budget_min 7 succeeds');
select throws_ok($$insert into public.sessions (started_at, time_budget_min) values ('2026-09-20T09:00Z', 0)$$,
  '23514', null, 'time_budget_min 0 gives 23514');
select lives_ok($$insert into public.sessions (started_at, time_budget_min, ended_at)
  values ('2026-09-20T09:00Z', 45, '2026-09-20T10:35Z')$$, 'running 95 min over a 45 min budget succeeds');
select throws_ok($$insert into public.sessions (started_at, time_budget_min, ended_at)
  values ('2026-09-20T09:00Z', 45, '2026-09-20T08:59Z')$$, '23514', null, 'ended_at before started_at gives 23514');
select throws_ok($$insert into public.sessions (started_at, time_budget_min, energy) values ('2026-09-20T09:00Z', 30, 'wired')$$,
  '23514', null, 'energy outside vocabulary gives 23514');

-- AC23: location is a short label ----------------------------------------------------------------
select lives_ok($$insert into public.sessions (started_at, time_budget_min, location)
  values ('2026-09-20T09:00Z', 30, repeat('g', 32))$$, 'a 32-char location succeeds');
select throws_ok($$insert into public.sessions (started_at, time_budget_min, location)
  values ('2026-09-20T09:00Z', 30, repeat('g', 33))$$, '23514', null, 'a 33-char location gives 23514');

-- AC16: set shape --------------------------------------------------------------------------------
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, kind, reps, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 10, 'reps', null, now(), now())$$,
  '23514', null, 'kind reps with reps null gives 23514');
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, kind, duration_s, reps, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-plank', 11, 'timed', 45, null, now(), now())$$,
  'kind timed with duration_s 45 and reps null succeeds (UF-09.7)');
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, kind, duration_s, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-plank', 12, 'timed', null, now(), now())$$,
  '23514', null, 'kind timed with duration_s null gives 23514');
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, rir, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 13, 8, 6, now(), now())$$,
  '23514', null, 'rir 6 gives 23514');
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, rir, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 14, 8, 0, now(), now())$$,
  'rir 0 succeeds (UF-09.4)');
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, rir, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 15, 8, 5, now(), now())$$,
  'rir 5 succeeds');
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, rir, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 16, 8, null, now(), now())$$,
  'rir null succeeds');
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, weight_kg, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 17, 8, -1, now(), now())$$,
  '23514', null, 'weight_kg -1 gives 23514');
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, kind, reps, completed_at, edited_at)
  values (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'fx-back-squat', 18, 'sprint', 8, now(), now())$$,
  '23514', null, 'kind sprint gives 23514');
select is((select count(*)::int from public.session_sets where set_index between 10 and 18), 4,
  'exactly the 4 valid shaped sets were stored');

reset role;
select * from finish();
rollback;
