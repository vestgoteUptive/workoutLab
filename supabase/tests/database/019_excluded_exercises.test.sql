-- T-0535 (UF-11.5, D-0199 §4, D-0020): the "never suggest" list. D1 schema objects, D2 server-set
-- created_at, D3 isolation (B and anon), D4 idempotent add/remove, D5 auth cascade, D6 exercise
-- cascade (and the asymmetry with session_sets). User A = ...0a, user B = ...0b.
-- now() is constant inside this single transaction, so "the transaction's now()" is now().
begin;
select plan(27);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('fx-lateral-raise', 'Lateral raise', 'isolation', 'beginner', '{Raise}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0');

-- D1: the trigger and its function ---------------------------------------------------------------
select has_trigger('public', 'excluded_exercises', 'excluded_exercises_before_write',
  'D1 trigger excluded_exercises_before_write exists');
select has_function('private', 'excluded_exercises_before_write', 'D1 the trigger function lives in schema private');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'excluded_exercises'
     and roles = '{authenticated}'
     and coalesce(qual, with_check) like '%auth.uid()%' and coalesce(qual, with_check) ~ '\muser_id\M'
     and (cmd <> 'UPDATE' or with_check like '%auth.uid()%')),
  4, 'D1 four owner policies for authenticated');
select results_eq(
  $$select cmd::text from pg_policies where schemaname = 'public' and tablename = 'excluded_exercises' order by cmd$$,
  $$values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')$$,
  'D1 one policy per command');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'excluded_exercises' and grantee = 'anon'),
  0, 'D1 anon has no privileges on excluded_exercises');

-- D2: created_at is server-set; user_id and created_at never change -----------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

insert into public.excluded_exercises (exercise_id, created_at) values ('fx-bench-press', '2020-01-01T00:00Z');
select is((select created_at from public.excluded_exercises where exercise_id = 'fx-bench-press'), now(),
  'D2 a client created_at on insert is replaced by now()');
select is((select user_id from public.excluded_exercises where exercise_id = 'fx-bench-press'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'D2 user_id defaults to auth.uid()');

update public.excluded_exercises set created_at = '2020-01-01T00:00Z' where exercise_id = 'fx-bench-press';
select is((select created_at from public.excluded_exercises where exercise_id = 'fx-bench-press'), now(),
  'D2 an update to created_at keeps the old value');

select lives_ok($$update public.excluded_exercises set user_id = '00000000-0000-0000-0000-00000000000b'
  where exercise_id = 'fx-bench-press'$$, 'D2 an update to user_id is not an error');
select is((select user_id from public.excluded_exercises where exercise_id = 'fx-bench-press'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'D2 an update to user_id keeps the old value');
reset role;
select is((select count(*)::int from public.excluded_exercises where user_id = '00000000-0000-0000-0000-00000000000b'),
  0, 'D2 B owns nothing after A tried to hand its row over');

-- D3: B can't see, add, change or remove A's rows; anon has no access ---------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.excluded_exercises), 0, 'D3 B selects 0 rows');
select throws_ok($$insert into public.excluded_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-plank')$$,
  '42501', null, 'D3 B inserting a row for A fails with an RLS error');
select results_eq($$with u as (update public.excluded_exercises set created_at = now()
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'D3 B updates 0 of A''s rows');
select results_eq($$with d as (delete from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'D3 B deletes 0 of A''s rows');
reset role;

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.excluded_exercises', '42501', null, 'D3 anon cannot select');
select throws_ok($$insert into public.excluded_exercises (user_id, exercise_id)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-plank')$$,
  '42501', null, 'D3 anon cannot insert');
reset role;
select is((select count(*)::int from public.excluded_exercises where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'D3 A still has exactly its one row');

-- D4: add twice and remove a missing row are both no-ops, not errors ----------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select lives_ok($$insert into public.excluded_exercises (exercise_id) values ('fx-bench-press')
  on conflict (user_id, exercise_id) do nothing$$, 'D4 adding an existing exclusion again is not an error');
select is((select count(*)::int from public.excluded_exercises where exercise_id = 'fx-bench-press'), 1,
  'D4 there is still one row');
select results_eq($$with d as (delete from public.excluded_exercises
  where exercise_id = 'fx-lateral-raise' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'D4 deleting a missing exclusion changes 0 rows, no error');
select throws_ok($$insert into public.excluded_exercises (exercise_id) values ('fx-bench-press')$$,
  '23505', null, 'D4 contrast: a plain duplicate insert hits the primary key');
insert into public.excluded_exercises (exercise_id) values ('fx-lateral-raise');
reset role;

-- D6: deleting a library row removes the exclusions of it (rolled back with the test) -----------
-- B also excludes fx-plank, which a set references: that delete is refused (asymmetry).
insert into public.excluded_exercises (user_id, exercise_id) values ('00000000-0000-0000-0000-00000000000b', 'fx-plank');
insert into public.sessions (id, user_id, started_at, time_budget_min) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '2026-09-22T09:00Z', 45);
insert into public.session_sets (user_id, client_id, session_id, exercise_id, set_index, kind, duration_s, completed_at, edited_at)
  values ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '10000000-0000-0000-0000-0000000000b1',
          'fx-plank', 0, 'timed', 45, '2026-09-22T10:00Z', '2026-09-22T10:00Z');

delete from public.exercises where id = 'fx-bench-press';
select results_eq($$select exercise_id from public.excluded_exercises
  where user_id = '00000000-0000-0000-0000-00000000000a' order by exercise_id$$,
  $$values ('fx-lateral-raise'::text)$$, 'D6 A''s bench-press exclusion is gone with the library row');
select throws_ok($$delete from public.exercises where id = 'fx-plank'$$, '23503', null,
  'D6 asymmetry: a library row with session_sets history cannot be deleted');
select is((select count(*)::int from public.excluded_exercises where exercise_id = 'fx-plank'), 1,
  'D6 B''s fx-plank exclusion stays when that delete is refused');

-- D5: deleting the auth user removes that user's exclusions only --------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.excluded_exercises where user_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'D5 A has 0 exclusions after the auth delete');
select is((select count(*)::int from public.excluded_exercises where user_id = '00000000-0000-0000-0000-00000000000b'),
  1, 'D5 B''s exclusion is unchanged');

select * from finish();
rollback;
