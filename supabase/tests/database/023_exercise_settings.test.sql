-- T-0951 (UF-04.2, D-0251, D-0259 §16, D-0020): a user's own weight step per exercise.
-- AC2 isolation (A vs B), AC3 anon refused, AC4 checks, AC5 server-set timestamps and fixed keys,
-- AC6 cascades, AC7 upsert on the PK, AC10 session_sets_live exposes rir.
-- User A = ...0a, user B = ...0b. now() is constant inside this transaction.
begin;
select plan(37);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('fx-leg-press', 'Leg press', 'compound', 'beginner', '{Press}', 'own', 'CC0'),
  ('fx-curl', 'Curl', 'isolation', 'beginner', '{Curl}', 'own', 'CC0');

-- Schema objects ---------------------------------------------------------------------------------
select has_trigger('public', 'exercise_settings', 'exercise_settings_before_write', 'trigger exists');
select has_function('private', 'exercise_settings_before_write', 'the trigger function lives in schema private');
select results_eq(
  $$select cmd::text from pg_policies where schemaname = 'public' and tablename = 'exercise_settings' order by cmd$$,
  $$values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')$$,
  'one policy per command');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'exercise_settings'
     and roles = '{authenticated}'
     and coalesce(qual, with_check) like '%auth.uid()%' and coalesce(qual, with_check) ~ '\muser_id\M'
     and (cmd <> 'UPDATE' or with_check like '%auth.uid()%')),
  4, 'four owner policies for authenticated');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'exercise_settings' and grantee = 'anon'),
  0, 'anon has no privileges on exercise_settings');
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.exercise_settings'::regclass and contype = 'c'),
  2, 'two check constraints (range and quarter step)');

-- AC4: the checks (as A) --------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

select throws_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 0)$$,
  '23514', null, 'AC4 0 is rejected');
select throws_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 0.1)$$,
  '23514', null, 'AC4 0.1 is rejected');
select throws_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 10.25)$$,
  '23514', null, 'AC4 10.25 is rejected');
select throws_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 11)$$,
  '23514', null, 'AC4 11 is rejected');
select throws_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 1.1)$$,
  '23514', null, 'AC4 1.1 (not a multiple of 0.25) is rejected');
select lives_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 0.25)$$,
  'AC4 0.25 is accepted');
select lives_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-leg-press', 1.25)$$,
  'AC4 1.25 is accepted');
select lives_ok($$insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-bench-press', 10)$$,
  'AC4 10 is accepted');
select is((select count(*)::int from public.exercise_settings), 3, 'AC4 exactly the three accepted rows exist');
select is((select user_id from public.exercise_settings where exercise_id = 'fx-curl'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'user_id defaults to auth.uid()');

-- AC5: server-set timestamps; user_id, exercise_id and created_at never change -------------------
reset role;
-- Age the row so "server now()" is distinguishable from the insert time.
-- (replica mode skips the write trigger, which would otherwise keep the old created_at.)
set local session_replication_role = replica;
update public.exercise_settings set created_at = '2020-01-01T00:00Z', updated_at = '2020-01-01T00:00Z'
  where exercise_id = 'fx-curl';
set local session_replication_role = origin;
set local role authenticated;
select is((select created_at from public.exercise_settings where exercise_id = 'fx-leg-press'), now(),
  'AC5 insert: created_at is now()');
select is((select updated_at from public.exercise_settings where exercise_id = 'fx-leg-press'), now(),
  'AC5 insert: updated_at is now()');
insert into public.exercise_settings (exercise_id, increment_kg, created_at, updated_at)
  values ('fx-bench-press', 10, '2001-01-01T00:00Z', '2001-01-01T00:00Z')
  on conflict (user_id, exercise_id) do nothing;
reset role;
select is((select count(*)::int from public.exercise_settings where created_at = '2001-01-01T00:00Z'), 0,
  'AC5 a client created_at on insert is never stored');
set local role authenticated;

update public.exercise_settings set increment_kg = 2.5, created_at = '2010-01-01T00:00Z',
  updated_at = '2010-01-01T00:00Z', user_id = '00000000-0000-0000-0000-00000000000b'
  where exercise_id = 'fx-curl';
select is((select created_at from public.exercise_settings where exercise_id = 'fx-curl'),
  '2020-01-01T00:00Z'::timestamptz, 'AC5 update: created_at keeps the old value');
select is((select updated_at from public.exercise_settings where exercise_id = 'fx-curl'), now(),
  'AC5 update: updated_at is the server now()');
select is((select user_id from public.exercise_settings where exercise_id = 'fx-curl'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'AC5 update: user_id keeps the old value');
select is((select increment_kg from public.exercise_settings where exercise_id = 'fx-curl'), 2.5,
  'AC5 update: the increment itself changes');
reset role;
select is((select count(*)::int from public.exercise_settings where user_id = '00000000-0000-0000-0000-00000000000b'),
  0, 'AC5 B owns nothing after A tried to hand a row over');

-- AC2: B can't see, add, change or remove A's rows; B's own row is untouched by A -----------------
insert into public.exercise_settings (user_id, exercise_id, increment_kg) values
  ('00000000-0000-0000-0000-00000000000b', 'fx-curl', 5);
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.exercise_settings), 1, 'AC2 B selects only its own row');
select throws_ok($$insert into public.exercise_settings (user_id, exercise_id, increment_kg)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-curl', 1.25)$$,
  '42501', null, 'AC2 B inserting a row for A fails with an RLS error');
select results_eq($$with u as (update public.exercise_settings set increment_kg = 7
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'AC2 B updates 0 of A''s rows');
select results_eq($$with d as (delete from public.exercise_settings
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'AC2 B deletes 0 of A''s rows');
reset role;
select is((select count(*)::int from public.exercise_settings where user_id = '00000000-0000-0000-0000-00000000000a'),
  3, 'AC2 A still has its three rows');

-- AC2 (A side): A updates and deletes only A's rows -----------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.exercise_settings), 3, 'AC2 A selects only its own three rows');
select results_eq($$with u as (update public.exercise_settings set increment_kg = 2.5 returning 1)
  select count(*)::int from u$$, $$values (3)$$, 'AC2 A updates exactly its own 3 rows');
select results_eq($$with d as (delete from public.exercise_settings where exercise_id = 'fx-curl' returning 1)
  select count(*)::int from d$$, $$values (1)$$, 'AC2 A deletes exactly its own row (B''s same-exercise row is not touched)');
reset role;
select is((select increment_kg from public.exercise_settings where user_id = '00000000-0000-0000-0000-00000000000b'),
  5.00, 'AC2 B''s row is unchanged after A updated and deleted');

-- AC3: anon is refused ----------------------------------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.exercise_settings', '42501', null, 'AC3 anon cannot select');
select throws_ok($$insert into public.exercise_settings (user_id, exercise_id, increment_kg)
  values ('00000000-0000-0000-0000-00000000000a', 'fx-curl', 1.25)$$, '42501', null, 'AC3 anon cannot insert');
select throws_ok($$update public.exercise_settings set increment_kg = 1$$, '42501', null, 'AC3 anon cannot update');
select throws_ok('delete from public.exercise_settings', '42501', null, 'AC3 anon cannot delete');
reset role;

select * from finish();
rollback;
