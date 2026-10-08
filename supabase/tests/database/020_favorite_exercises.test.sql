-- T-0564 (UF-11.4, UF-11.6, UF-04.2, D-0202 §5, D-0020): the per-user favorites list and the
-- mutual exclusion with excluded_exercises. D1 schema objects, AC2 server-set created_at, AC3
-- isolation (B and anon), AC4 idempotent add/remove, AC5 mutual exclusion in both directions,
-- AC6 exercise cascade, AC7 auth cascade. User A = ...0a, user B = ...0b.
-- AC5 runs under RLS and once as postgres (RLS bypassed) for the triggers' user_id filter.
-- now() is constant inside this single transaction, so "the transaction's now()" is now().
begin;
select plan(45);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0'),
  ('fx-bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('fx-lateral-raise', 'Lateral raise', 'isolation', 'beginner', '{Raise}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0'),
  ('fx-deadlift', 'Deadlift', 'compound', 'intermediate', '{Pull}', 'own', 'CC0'),
  ('fx-row', 'Row', 'compound', 'intermediate', '{Row}', 'own', 'CC0');

-- D1: triggers, their functions, policies, privileges ---------------------------------------------
select has_trigger('public', 'favorite_exercises', 'favorite_exercises_before_write',
  'D1 trigger favorite_exercises_before_write exists');
select has_trigger('public', 'favorite_exercises', 'favorite_exercises_after_insert',
  'D1 trigger favorite_exercises_after_insert exists');
select has_trigger('public', 'excluded_exercises', 'excluded_exercises_after_insert',
  'D1 trigger excluded_exercises_after_insert exists');
select has_function('private', 'favorite_exercises_before_write', 'D1 the before-write function lives in schema private');
select has_function('private', 'favorite_exercises_after_insert', 'D1 the favorite after-insert function lives in schema private');
select has_function('private', 'excluded_exercises_after_insert', 'D1 the exclusion after-insert function lives in schema private');
select results_eq(
  $$select p.proname::text, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('favorite_exercises_after_insert', 'excluded_exercises_after_insert')
     order by p.proname$$,
  $$values ('excluded_exercises_after_insert'::text, false), ('favorite_exercises_after_insert'::text, false)$$,
  'D1 both mutual-exclusion functions are security invoker (RLS applies)');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'favorite_exercises'
     and roles = '{authenticated}'
     and coalesce(qual, with_check) like '%auth.uid()%' and coalesce(qual, with_check) ~ '\muser_id\M'
     and (cmd <> 'UPDATE' or with_check like '%auth.uid()%')),
  4, 'D1 four owner policies for authenticated');
select results_eq(
  $$select cmd::text from pg_policies where schemaname = 'public' and tablename = 'favorite_exercises' order by cmd$$,
  $$values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')$$,
  'D1 one policy per command');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'favorite_exercises' and grantee = 'anon'),
  0, 'D1 anon has no privileges on favorite_exercises');

-- AC2: created_at is server-set; user_id and created_at never change -----------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

insert into public.favorite_exercises (exercise_id, created_at) values ('fx-back-squat', '2020-01-01T00:00Z');
select is((select created_at from public.favorite_exercises where exercise_id = 'fx-back-squat'), now(),
  'AC2 a client created_at on insert is replaced by now()');
select is((select user_id from public.favorite_exercises where exercise_id = 'fx-back-squat'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'AC2 user_id defaults to auth.uid()');

update public.favorite_exercises set created_at = '2020-01-01T00:00Z' where exercise_id = 'fx-back-squat';
select is((select created_at from public.favorite_exercises where exercise_id = 'fx-back-squat'), now(),
  'AC2 an update to created_at keeps the old value');

select lives_ok($$update public.favorite_exercises set user_id = '00000000-0000-0000-0000-00000000000b'
  where exercise_id = 'fx-back-squat'$$, 'AC2 an update to user_id is not an error');
select is((select user_id from public.favorite_exercises where exercise_id = 'fx-back-squat'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'AC2 an update to user_id keeps the old value');
reset role;
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000b'),
  0, 'AC2 B owns nothing after A tried to hand its row over');

-- AC3: B can't see, add, change or remove A's rows; anon has no access ---------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.favorite_exercises), 0, 'AC3 B selects 0 rows');
select throws_ok($$insert into public.favorite_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-plank')$$,
  '42501', null, 'AC3 B inserting a row for A fails with an RLS error');
select results_eq($$with u as (update public.favorite_exercises set created_at = now()
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'AC3 B updates 0 of A''s rows');
select results_eq($$with d as (delete from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'AC3 B deletes 0 of A''s rows');
reset role;

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.favorite_exercises', '42501', null, 'AC3 anon cannot select');
select throws_ok($$insert into public.favorite_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-plank')$$,
  '42501', null, 'AC3 anon cannot insert');
reset role;
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'AC3 A still has exactly its one row');

-- AC4: add twice and remove a missing row are both no-ops, not errors ----------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select lives_ok($$insert into public.favorite_exercises (exercise_id) values ('fx-back-squat')
  on conflict (user_id, exercise_id) do nothing$$, 'AC4 adding an existing favorite again is not an error');
select is((select count(*)::int from public.favorite_exercises where exercise_id = 'fx-back-squat'), 1,
  'AC4 there is still one row');
select results_eq($$with d as (delete from public.favorite_exercises
  where exercise_id = 'fx-lateral-raise' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'AC4 deleting a missing favorite changes 0 rows, no error');
select throws_ok($$insert into public.favorite_exercises (exercise_id) values ('fx-back-squat')$$,
  '23505', null, 'AC4 contrast: a plain duplicate insert hits the primary key');
reset role;

-- AC5 direction 1: A and B excluded back-squat; A favorites it ----------------------------------
delete from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.excluded_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-back-squat'),
  ('00000000-0000-0000-0000-00000000000b', 'fx-back-squat');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select lives_ok($$insert into public.favorite_exercises (exercise_id) values ('fx-back-squat')$$,
  'AC5 A favoriting an excluded exercise is not an error');
reset role;
select is((select count(*)::int from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-back-squat'), 1,
  'AC5 A has the back-squat favorite');
select is((select count(*)::int from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-back-squat'), 0,
  'AC5 A''s back-squat exclusion is gone');
select is((select count(*)::int from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000b' and exercise_id = 'fx-back-squat'), 1,
  'AC5 B''s back-squat exclusion is untouched');

-- AC5 direction 2: A and B favorited bench-press; A excludes it ---------------------------------
insert into public.favorite_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-bench-press'),
  ('00000000-0000-0000-0000-00000000000b', 'fx-bench-press');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select lives_ok($$insert into public.excluded_exercises (exercise_id) values ('fx-bench-press')$$,
  'AC5 A excluding a favorite is not an error');
reset role;
select is((select count(*)::int from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-bench-press'), 1,
  'AC5 A has the bench-press exclusion');
select is((select count(*)::int from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-bench-press'), 0,
  'AC5 A''s bench-press favorite is gone');
select is((select count(*)::int from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000b' and exercise_id = 'fx-bench-press'), 1,
  'AC5 B''s bench-press favorite is untouched');

-- AC5 as postgres (security review L1): RLS is bypassed, so only the triggers' `user_id =
-- new.user_id` filter keeps B's row. Under RLS (above) B's rows are hidden either way.
reset role;
select is(current_user::text, 'postgres', 'AC5 the next two inserts run as postgres (RLS bypassed)');
insert into public.excluded_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-deadlift'),
  ('00000000-0000-0000-0000-00000000000b', 'fx-deadlift');
insert into public.favorite_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-deadlift');
select is((select count(*)::int from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-deadlift'), 0,
  'AC5 postgres: A favoriting deadlift removes A''s deadlift exclusion');
select is((select count(*)::int from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000b' and exercise_id = 'fx-deadlift'), 1,
  'AC5 postgres: B''s deadlift exclusion survives A''s favorite');
insert into public.favorite_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-row'),
  ('00000000-0000-0000-0000-00000000000b', 'fx-row');
insert into public.excluded_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-row');
select is((select count(*)::int from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' and exercise_id = 'fx-row'), 0,
  'AC5 postgres: A excluding row removes A''s row favorite');
select is((select count(*)::int from public.favorite_exercises
  where user_id = '00000000-0000-0000-0000-00000000000b' and exercise_id = 'fx-row'), 1,
  'AC5 postgres: B''s row favorite survives A''s exclusion');
-- Clear this block's rows so AC6 and AC7 see the same state as before it.
delete from public.favorite_exercises where exercise_id in ('fx-deadlift', 'fx-row');
delete from public.excluded_exercises where exercise_id in ('fx-deadlift', 'fx-row');

-- AC6: deleting a library row removes the favorites of it (rolled back with the test) -----------
-- fx-back-squat has no session_sets or routine_items rows here.
delete from public.exercises where id = 'fx-back-squat';
select is((select count(*)::int from public.favorite_exercises where exercise_id = 'fx-back-squat'), 0,
  'AC6 A''s back-squat favorite is gone with the library row');
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000b'), 1,
  'AC6 B''s other favorite stays');

-- AC7: deleting the auth user removes that user's favorites only --------------------------------
insert into public.favorite_exercises (user_id, exercise_id) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-lateral-raise'),
  ('00000000-0000-0000-0000-00000000000a', 'fx-plank');
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000a'),
  2, 'AC7 A has 2 favorites before the auth delete');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'AC7 A has 0 favorites after the auth delete');
select is((select count(*)::int from public.favorite_exercises where user_id = '00000000-0000-0000-0000-00000000000b'),
  1, 'AC7 B''s favorite is unchanged');

select * from finish();
rollback;
