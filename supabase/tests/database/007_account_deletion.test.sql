-- T-0100a AC22 [a] account deletion cascades (NFR-PRIV-5). A owns a profile, 9 area_targets,
-- 2 sessions and 6 session_sets (1 tombstoned); [b] 1 routine with 2 items and 1 plan_checkins row
-- (T-0100b). B owns 1 row in each table.
begin;
select plan(11);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0');

insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4),
  ('00000000-0000-0000-0000-00000000000b', 'build_muscle', 'beginner', 3, 4);
insert into public.area_targets (user_id, area_id, sets_per_14d)
  select '00000000-0000-0000-0000-00000000000a', id, 10 from public.areas;
insert into public.area_targets (user_id, area_id, sets_per_14d) values
  ('00000000-0000-0000-0000-00000000000b', 'back', 10);
insert into public.sessions (id, user_id, started_at, time_budget_min) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '2026-09-20T09:00Z', 45),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '2026-09-22T09:00Z', 45),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '2026-09-22T09:00Z', 45);
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at, deleted_at)
  select '00000000-0000-0000-0000-00000000000a', gen_random_uuid(),
         case when i <= 3 then '10000000-0000-0000-0000-0000000000a1'::uuid else '10000000-0000-0000-0000-0000000000a2'::uuid end,
         'fx-back-squat', i, 8, '2026-09-20T10:00Z', '2026-09-20T10:00Z',
         case when i = 6 then '2026-09-23T10:00Z'::timestamptz end
    from generate_series(1, 6) as i;
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, reps, completed_at, edited_at)
  values ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '10000000-0000-0000-0000-0000000000b1',
          'fx-back-squat', 0, 8, '2026-09-22T10:00Z', '2026-09-22T10:00Z');

insert into public.routines (id, user_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Lower A'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Upper B');
insert into public.routine_items (routine_id, user_id, position, exercise_id, sets, reps_min, reps_max, duration_s) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 0, 'fx-back-squat', 3, 6, 8, null),
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 1, 'fx-plank', 3, null, null, 45),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 0, 'fx-plank', 3, null, null, 45);
insert into public.plan_checkins (user_id, period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at) values
  ('00000000-0000-0000-0000-00000000000a', 3, 4, 3, 3, 4, 2, 3, '2026-09-27T07:00Z'),
  ('00000000-0000-0000-0000-00000000000b', 2, 1, 1, 3, 4, 2, 3, '2026-09-27T07:00Z');

select results_eq($$select
    (select count(*)::int from public.routines where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.routine_items where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.plan_checkins where user_id = '00000000-0000-0000-0000-00000000000a')$$,
  $$values (1, 2, 1)$$, 'A''s [b] fixture is in place');
select results_eq($$select
    (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.area_targets where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.sessions where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.session_sets where user_id = '00000000-0000-0000-0000-00000000000a')$$,
  $$values (1, 9, 2, 6)$$, 'A''s fixture is in place');

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'A has 0 profiles');
select is((select count(*)::int from public.area_targets where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'A has 0 area_targets');
select is((select count(*)::int from public.sessions where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'A has 0 sessions');
select is((select count(*)::int from public.session_sets where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'A has 0 session_sets (incl. the tombstone)');
select results_eq($$select
    (select count(*)::int from public.routines where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.routine_items where user_id = '00000000-0000-0000-0000-00000000000a'),
    (select count(*)::int from public.plan_checkins where user_id = '00000000-0000-0000-0000-00000000000a')$$,
  $$values (0, 0, 0)$$, 'A has 0 routines, routine_items and plan_checkins');
select results_eq($$select
    (select count(*)::int from public.routines where user_id = '00000000-0000-0000-0000-00000000000b'),
    (select count(*)::int from public.routine_items where user_id = '00000000-0000-0000-0000-00000000000b'),
    (select count(*)::int from public.plan_checkins where user_id = '00000000-0000-0000-0000-00000000000b')$$,
  $$values (1, 1, 1)$$, 'B''s [b] counts are unchanged');
select is(
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'user_id'
      and exists (select 1 from information_schema.tables t
                   where t.table_schema = 'public' and t.table_name = c.table_name and t.table_type = 'BASE TABLE')
      and (select count(*) from pg_constraint k
            where k.conrelid = format('%I.%I', c.table_schema, c.table_name)::regclass and k.contype = 'f'
              and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c') = 0),
  0, 'every public table with user_id cascades from auth.users');
select results_eq($$select
    (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'),
    (select count(*)::int from public.area_targets where user_id = '00000000-0000-0000-0000-00000000000b'),
    (select count(*)::int from public.sessions where user_id = '00000000-0000-0000-0000-00000000000b'),
    (select count(*)::int from public.session_sets where user_id = '00000000-0000-0000-0000-00000000000b')$$,
  $$values (1, 1, 1, 1)$$, 'B''s counts are unchanged');
select is((select count(*)::int from public.session_sets_live where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'B''s live set remains');

select * from finish();
rollback;
