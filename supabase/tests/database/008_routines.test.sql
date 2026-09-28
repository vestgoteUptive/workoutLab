-- T-0100b AC26 routines (UF-07.1, UF-08.3, D-0021): unique position, reps range, no cross-user
-- attach (composite FK, D-0020), cascade to items; server-set timestamps (D-0020).
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license, timed) values
  ('back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0', false),
  ('plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0', true);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

select lives_ok($$insert into public.routines (id, name, updated_at)
  values ('20000000-0000-0000-0000-0000000000a1', 'Lower A', '2020-01-01Z')$$, 'A creates routine R "Lower A"');
select lives_ok($$insert into public.routine_items (routine_id, position, exercise_id, sets, reps_min, reps_max, duration_s) values
  ('20000000-0000-0000-0000-0000000000a1', 0, 'back-squat', 3, 6, 8, null),
  ('20000000-0000-0000-0000-0000000000a1', 1, 'plank', 3, null, null, 45)$$, 'A adds back-squat 3x6-8 and plank 3x45 s');
select is((select updated_at from public.routines), now(), 'routines.updated_at is server-set');
select throws_ok($$insert into public.routine_items (routine_id, position, exercise_id, sets, reps_min, reps_max)
  values ('20000000-0000-0000-0000-0000000000a1', 1, 'back-squat', 3, 8, 12)$$,
  '23505', null, 'a second item at position 1 gives 23505');
select throws_ok($$insert into public.routine_items (routine_id, position, exercise_id, sets, reps_min, reps_max)
  values ('20000000-0000-0000-0000-0000000000a1', 2, 'back-squat', 3, 10, 8)$$,
  '23514', null, 'reps_min 10 > reps_max 8 gives 23514');
select is((select progression from public.routine_items where position = 0), 'double_progression',
  'progression defaults to double_progression');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok($$insert into public.routine_items (routine_id, user_id, position, exercise_id, sets, reps_min, reps_max)
  values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', 5, 'back-squat', 3, 6, 8)$$,
  '23503', null, 'B inserting an item into A''s routine gives 23503');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select results_eq($$with d as (delete from public.routines where id = '20000000-0000-0000-0000-0000000000a1' returning 1)
  select count(*)::int from d$$, $$values (1)$$, 'A deletes R');
reset role;
select is((select count(*)::int from public.routine_items where routine_id = '20000000-0000-0000-0000-0000000000a1'),
  0, 'R''s 2 items are gone');

select * from finish();
rollback;
