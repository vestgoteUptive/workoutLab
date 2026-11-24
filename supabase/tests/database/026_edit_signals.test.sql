-- T-1001 (UF-11.4, UF-08.2, D-0281, D-0277): edit_signals and the two profiles columns.
-- AC2 owner RLS and anon, AC3 checks, AC4 upsert and devices, AC5 stale and server-set values,
-- AC6 cascades, AC7 profile columns. (AC1 schema is in 001, AC9 lists in 002, 007 and 018.)
-- User A = ...0a, user B = ...0b. now() is constant inside this transaction.
begin;
select plan(69);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('db-bench-press', 'Dumbbell bench press', 'compound', 'beginner', '{Press}', 'own', 'CC0'),
  ('cable-crunch', 'Cable crunch', 'isolation', 'beginner', '{Crunch}', 'own', 'CC0'),
  ('fx-x', 'Unused X', 'isolation', 'beginner', '{X}', 'own', 'CC0'),
  ('fx-y', 'Unused Y', 'isolation', 'beginner', '{Y}', 'own', 'CC0');
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4),
  ('00000000-0000-0000-0000-00000000000b', 'build_muscle', 'beginner', 3, 4);

-- Schema objects -------------------------------------------------------------------------------
select has_trigger('public', 'edit_signals', 'edit_signals_before_write', 'trigger exists');
select has_function('private', 'edit_signals_before_write', 'the trigger function lives in schema private');
select results_eq(
  $$select cmd::text from pg_policies where schemaname = 'public' and tablename = 'edit_signals' order by cmd$$,
  $$values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')$$,
  'T-1001 AC2 one policy per command');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'edit_signals'
     and roles = '{authenticated}'
     and coalesce(qual, with_check) like '%auth.uid()%' and coalesce(qual, with_check) ~ '\muser_id\M'
     and (cmd <> 'UPDATE' or with_check like '%auth.uid()%')),
  4, 'T-1001 AC2 four owner policies for authenticated');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'edit_signals' and grantee = 'anon'),
  0, 'T-1001 AC2 anon has no privileges on edit_signals');
select is(
  (select relrowsecurity from pg_class where oid = 'public.edit_signals'::regclass), true,
  'T-1001 AC2 RLS is enabled on edit_signals');

-- AC3: checks (as A) ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, to_exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'swap:bench-press:db-bench-press', 'swap', 'bench-press', 'db-bench-press',
          3, '2026-11-01T09:00Z', '2026-11-05T09:00Z')$$, 'T-1001 AC3 a swap with both ids is accepted');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          2, '2026-11-01T09:00Z', '2026-11-05T09:00Z')$$, 'T-1001 AC3 a removal with no to_exercise_id is accepted');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000002', 'removal:cable-crunch', 'removal', 'cable-crunch',
          999, '2026-11-01T09:00Z', '2026-11-05T09:00Z')$$, 'T-1001 AC3 count 999 is accepted');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen, asked_at)
  values ('d0000000-0000-0000-0000-000000000003', 'removal:cable-crunch', 'removal', 'cable-crunch',
          0, '2026-11-01T09:00Z', '2026-11-05T09:00Z', '2026-11-05T10:00Z')$$, 'T-1001 AC3 count 0 with asked_at is accepted');

select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'swap:bench-press:', 'swap', 'bench-press', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 a swap without to_exercise_id is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, to_exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:bench-press', 'removal', 'bench-press', 'db-bench-press', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 a removal with to_exercise_id is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, to_exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'swap:bench-press:bench-press', 'swap', 'bench-press', 'bench-press', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 a swap with equal ids is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, to_exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'swap:db-bench-press:bench-press', 'swap', 'bench-press', 'db-bench-press', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 a swap key that does not match the ids is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:bench-press', 'removal', 'cable-crunch', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 a removal key that does not match the exercise is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'other:cable-crunch', 'other', 'cable-crunch', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 kind other is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:cable-crunch', 'removal', 'cable-crunch', -1, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 count -1 is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:cable-crunch', 'removal', 'cable-crunch', 1000, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 count 1000 is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:cable-crunch', 'removal', 'cable-crunch', 0, '2026-11-01Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 count 0 without asked_at is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:cable-crunch', 'removal', 'cable-crunch', 1, '2026-11-02Z', '2026-11-01Z')$$,
  '23514', null, 'T-1001 AC3 last_seen before window_start is rejected');
select throws_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000009', 'removal:nope', 'removal', 'nope', 1, '2026-11-01Z', '2026-11-01Z')$$,
  '23503', null, 'T-1001 AC3 an unknown exercise id is rejected');
select is((select count(*)::int from public.edit_signals), 4, 'T-1001 AC3 exactly the four accepted rows exist');
select is((select user_id from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000003'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'T-1001 AC2 user_id defaults to auth.uid()');

-- AC2: B sees, changes and removes nothing of A's; A cannot hand a row to B ----------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.edit_signals), 0, 'T-1001 AC2 B selects 0 of A''s rows');
select throws_ok($$insert into public.edit_signals (user_id, device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('00000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000b1', 'removal:fx-x', 'removal', 'fx-x',
          1, '2026-11-01Z', '2026-11-01Z')$$,
  '42501', null, 'T-1001 AC2 B inserting a row for A fails with an RLS error');
select results_eq($$with u as (update public.edit_signals set count = 7 returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'T-1001 AC2 B updates 0 of A''s rows');
select results_eq($$with d as (delete from public.edit_signals returning 1) select count(*)::int from d$$,
  $$values (0)$$, 'T-1001 AC2 B deletes 0 of A''s rows');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-0000000000b1', 'removal:cable-crunch', 'removal', 'cable-crunch', 5, '2026-11-01Z', '2026-11-02Z')$$,
  'T-1001 AC2 B inserts its own row for the same key');
select is((select count(*)::int from public.edit_signals), 1, 'T-1001 AC2 B selects only its own row');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.edit_signals), 4, 'T-1001 AC2 A selects only its own four rows');
select results_eq($$with u as (update public.edit_signals set count = count returning 1) select count(*)::int from u$$,
  $$values (4)$$, 'T-1001 AC2 A updates exactly its own 4 rows');
reset role;
select is((select count from public.edit_signals where device_id = 'd0000000-0000-0000-0000-0000000000b1'), 5,
  'T-1001 AC2 B''s row is unchanged');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select results_eq($$with d as (delete from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000003' returning 1)
  select count(*)::int from d$$, $$values (1)$$, 'T-1001 AC2 A deletes its own row');
reset role;
select is((select count(*)::int from public.edit_signals where user_id = '00000000-0000-0000-0000-00000000000b'), 1,
  'T-1001 AC2 B''s row is still there after A deleted');

-- AC2: anon is refused (42501) --------------------------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select count(*) from public.edit_signals', '42501', null, 'T-1001 AC2 anon cannot select');
select throws_ok($$insert into public.edit_signals (user_id, device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('00000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000c1', 'removal:fx-x', 'removal', 'fx-x',
          1, '2026-11-01Z', '2026-11-01Z')$$, '42501', null, 'T-1001 AC2 anon cannot insert');
select throws_ok($$update public.edit_signals set count = 1$$, '42501', null, 'T-1001 AC2 anon cannot update');
select throws_ok('delete from public.edit_signals', '42501', null, 'T-1001 AC2 anon cannot delete');
reset role;

-- AC4: upsert is idempotent, devices are separate (as A) -----------------------------------------
delete from public.edit_signals;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:fx-x', 'removal', 'fx-x', 2, '2026-11-01T09:00Z', '2026-11-02T09:00Z')
  on conflict (user_id, device_id, key) do update set count = excluded.count, window_start = excluded.window_start,
    last_seen = excluded.last_seen, asked_at = excluded.asked_at;
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:fx-x', 'removal', 'fx-x', 2, '2026-11-01T09:00Z', '2026-11-02T09:00Z')
  on conflict (user_id, device_id, key) do update set count = excluded.count, window_start = excluded.window_start,
    last_seen = excluded.last_seen, asked_at = excluded.asked_at;
select is((select count(*)::int from public.edit_signals), 1, 'T-1001 AC4 the same payload twice leaves one row');
select is((select count from public.edit_signals), 2, 'T-1001 AC4 the row holds 2');
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:fx-x', 'removal', 'fx-x', 3, '2026-11-01T09:00Z', '2026-11-03T09:00Z')
  on conflict (user_id, device_id, key) do update set count = excluded.count, window_start = excluded.window_start,
    last_seen = excluded.last_seen, asked_at = excluded.asked_at;
select is((select count(*)::int from public.edit_signals), 1, 'T-1001 AC4 count 2 then 3 is still one row');
select is((select count from public.edit_signals), 3, 'T-1001 AC4 the row holds 3');
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000002', 'removal:fx-x', 'removal', 'fx-x', 1, '2026-11-02T09:00Z', '2026-11-02T09:00Z')
  on conflict (user_id, device_id, key) do update set count = excluded.count;
select is((select count(*)::int from public.edit_signals where key = 'removal:fx-x'), 2,
  'T-1001 AC4 two device ids for the same key give two rows');
select is((select sum(count)::int from public.edit_signals where key = 'removal:fx-x'), 4,
  'T-1001 AC4 the total for the key is the sum of the rows');

-- AC5: stale and server-set values ----------------------------------------------------------------
reset role;
-- Age the row so "server now()" is distinguishable (replica mode skips the write trigger).
set local session_replication_role = replica;
update public.edit_signals set created_at = '2020-01-01T00:00Z', updated_at = '2020-01-01T00:00Z'
  where device_id = 'd0000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;

select is((select updated_at from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000002'), now(),
  'T-1001 AC5 insert: updated_at is the server now()');
select is((select created_at from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000002'), now(),
  'T-1001 AC5 insert: created_at is the server now()');
-- stored last_seen is 2026-11-03T09:00Z
update public.edit_signals set count = 99, last_seen = '2026-11-02T09:00Z'
  where device_id = 'd0000000-0000-0000-0000-000000000001';
select is((select count from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'), 3,
  'T-1001 AC5 a write with an older last_seen leaves the count unchanged');
select is((select last_seen from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'),
  '2026-11-03T09:00Z'::timestamptz, 'T-1001 AC5 a stale write leaves last_seen unchanged');
select is((select updated_at from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'),
  '2020-01-01T00:00Z'::timestamptz, 'T-1001 AC5 a stale write leaves updated_at unchanged');
update public.edit_signals set count = 4, last_seen = '2026-11-03T09:00Z', asked_at = '2026-11-03T10:00Z'
  where device_id = 'd0000000-0000-0000-0000-000000000001';
select is((select count from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'), 4,
  'T-1001 AC5 a write with an equal last_seen is applied');
select is((select asked_at from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'),
  '2026-11-03T10:00Z'::timestamptz, 'T-1001 AC5 an asked_at set with an equal last_seen is applied');
update public.edit_signals set count = 5, last_seen = '2026-11-04T09:00Z'
  where device_id = 'd0000000-0000-0000-0000-000000000001';
select is((select count from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'), 5,
  'T-1001 AC5 a write with a later last_seen is applied');
select is((select updated_at from public.edit_signals where device_id = 'd0000000-0000-0000-0000-000000000001'), now(),
  'T-1001 AC5 an applied update sets updated_at to the server now()');
-- client-supplied identity and timestamps are ignored on update
update public.edit_signals set key = 'swap:bench-press:db-bench-press', kind = 'swap', exercise_id = 'bench-press',
    to_exercise_id = 'db-bench-press', device_id = 'd0000000-0000-0000-0000-0000000000ff',
    user_id = '00000000-0000-0000-0000-00000000000b', created_at = '2010-01-01T00:00Z', updated_at = '2010-01-01T00:00Z',
    last_seen = '2026-11-05T09:00Z'
  where device_id = 'd0000000-0000-0000-0000-000000000001';
select results_eq(
  $$select key, kind, exercise_id, to_exercise_id, device_id, user_id, created_at, updated_at
      from public.edit_signals where key = 'removal:fx-x' and last_seen = '2026-11-05T09:00Z'$$,
  $$values ('removal:fx-x'::text, 'removal'::text, 'fx-x'::text, null::text,
            'd0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid,
            '2020-01-01T00:00Z'::timestamptz, now())$$,
  'T-1001 AC5 key, kind, ids, device, user and created_at are kept and updated_at is now()');

-- AC6: exercise cascade, both columns ---------------------------------------------------------------
reset role;
delete from public.edit_signals;
insert into public.edit_signals (user_id, device_id, key, kind, exercise_id, to_exercise_id, count, window_start, last_seen) values
  ('00000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'removal:fx-x', 'removal', 'fx-x', null, 2, '2026-11-01Z', '2026-11-02Z'),
  ('00000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000001', 'swap:fx-y:fx-x', 'swap', 'fx-y', 'fx-x', 3, '2026-11-01Z', '2026-11-02Z'),
  ('00000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-0000000000b1', 'removal:fx-y', 'removal', 'fx-y', null, 1, '2026-11-01Z', '2026-11-02Z');
delete from public.exercises where id = 'fx-x';
select is((select count(*)::int from public.edit_signals where 'fx-x' in (exercise_id, to_exercise_id)), 0,
  'T-1001 AC6 deleting exercise X deletes the row naming it as exercise_id and the row naming it as to_exercise_id');
select is((select count(*)::int from public.edit_signals), 1, 'T-1001 AC6 a row for another exercise stays');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from public.edit_signals), 0, 'T-1001 AC6 deleting the user deletes their rows');

-- AC7: profile columns ----------------------------------------------------------------------------------
select is((select learn_from_edits from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true,
  'T-1001 AC7 a new profile has learn_from_edits true');
select is((select learn_reset_at from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), null,
  'T-1001 AC7 a new profile has learn_reset_at null');
-- Age the profile so now() is distinguishable.
set local session_replication_role = replica;
update public.profiles set plan_changed_at = '2020-01-01T00:00Z', updated_at = '2020-01-01T00:00Z'
  where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = origin;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
update public.profiles set learn_from_edits = false;
select results_eq(
  $$select learn_from_edits, plan_changed_at, updated_at, learn_reset_at from public.profiles$$,
  $$values (false, '2020-01-01T00:00Z'::timestamptz, now(), now())$$,
  'T-1001 AC7 changing learn_from_edits alone keeps plan_changed_at, advances updated_at and sets learn_reset_at to now()');
reset role;
set local session_replication_role = replica;
update public.profiles set learn_reset_at = '2020-02-02T00:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = origin;
set local role authenticated;
update public.profiles set goal = 'get_stronger';
select results_eq(
  $$select plan_changed_at, learn_reset_at from public.profiles$$,
  $$values (now(), '2020-02-02T00:00Z'::timestamptz)$$,
  'T-1001 AC7 changing goal advances plan_changed_at and leaves learn_reset_at unchanged');
update public.profiles set learn_reset_at = '2001-01-01T00:00Z';
select is((select learn_reset_at from public.profiles), now(),
  'T-1001 AC7 a client write of learn_reset_at is replaced by now()');
reset role;
set local session_replication_role = replica;
update public.profiles set learn_reset_at = '2020-02-02T00:00Z', plan_changed_at = '2020-01-01T00:00Z'
  where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = origin;
set local role authenticated;
update public.profiles set rhythm_max = 4;
select results_eq(
  $$select learn_reset_at, plan_changed_at, learn_from_edits from public.profiles$$,
  $$values ('2020-02-02T00:00Z'::timestamptz, '2020-01-01T00:00Z'::timestamptz, false)$$,
  'T-1001 AC7 a write that changes neither leaves learn_reset_at and the flag unchanged');
update public.profiles set learn_from_edits = true;
select is((select learn_from_edits from public.profiles), true, 'T-1001 AC7 the flag can be turned back on (true value)');
select is((select learn_reset_at from public.profiles), now(), 'T-1001 AC7 turning it on moves the epoch too');

-- B cannot read or write A's values; anon has no access
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.profiles where learn_from_edits is not null), 0,
  'T-1001 AC7 B reads none of A''s profile values');
select results_eq($$with u as (update public.profiles set learn_from_edits = false,
  learn_reset_at = '2030-01-01Z' where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'T-1001 AC7 B updates 0 of A''s profile values');
reset role;
select is((select learn_from_edits from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true,
  'T-1001 AC7 A''s flag is untouched by B');
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok('select learn_from_edits, learn_reset_at from public.profiles', '42501', null,
  'T-1001 AC7 anon cannot read the profile columns');
reset role;

select * from finish();
rollback;
