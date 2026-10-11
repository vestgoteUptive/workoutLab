-- T-0631 (UF-09.3, UF-11.4, D-0218): profiles.bar_kg and profiles.plates_kg.
-- AC1 defaults (new and pre-existing rows), AC2 bar range, AC3 plate checks, AC4 write rules
-- (plan_changed_at kept, RLS, upsert that omits the columns).
begin;
select plan(42);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@test.local');

-- AC1 pre-existing row: put the table back to its pre-migration shape inside this transaction,
-- insert C's row, then re-apply the migration's column add. The row must read the defaults.
-- The two checks are saved from the catalogue and restored as they are, so the rest of this file
-- tests the migration's own check text, not a copy.
create temp table saved_checks on commit drop as
  select conname, pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
   where conrelid = 'public.profiles'::regclass and conname in ('profiles_bar_kg_range', 'profiles_plates_kg_valid');
select is((select count(*)::int from saved_checks), 2, 'both checks were saved');
alter table public.profiles drop constraint profiles_plates_kg_valid, drop constraint profiles_bar_kg_range,
  drop column plates_kg, drop column bar_kg;
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max)
  values ('00000000-0000-0000-0000-00000000000c', 'get_stronger', 'advanced', 2, 3);
alter table public.profiles
  add column bar_kg numeric(5,2) not null default 20,
  add column plates_kg numeric(5,2)[] not null default '{25,20,15,10,5,2.5,1.25}';
select is((select bar_kg from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'),
  20.00::numeric, 'AC1 a pre-existing row reads bar_kg 20 after the column add');
select is((select plates_kg from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'),
  '{25,20,15,10,5,2.5,1.25}'::numeric[], 'AC1 a pre-existing row reads the default plates after the column add');
do $$
declare r record;
begin
  for r in select conname, def from saved_checks loop
    execute format('alter table public.profiles add constraint %I %s', r.conname, r.def);
  end loop;
end $$;
delete from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c';

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC1 new row: inserted without the columns --------------------------------------------------------
insert into public.profiles (goal, level, rhythm_min, rhythm_max) values ('build_muscle', 'beginner', 3, 4);
select is((select bar_kg from public.profiles), 20.00::numeric, 'AC1 a new row reads bar_kg 20');
select is((select plates_kg from public.profiles), '{25,20,15,10,5,2.5,1.25}'::numeric[],
  'AC1 a new row reads plates_kg {25,20,15,10,5,2.5,1.25}');

-- AC2 bar range ------------------------------------------------------------------------------------
select lives_ok($$update public.profiles set bar_kg = 0$$, 'AC2 bar_kg 0 succeeds');
select lives_ok($$update public.profiles set bar_kg = 15$$, 'AC2 bar_kg 15 succeeds');
select lives_ok($$update public.profiles set bar_kg = 50$$, 'AC2 bar_kg 50 succeeds');
select lives_ok($$update public.profiles set bar_kg = 20$$, 'AC2 bar_kg 20 succeeds');
select throws_ok($$update public.profiles set bar_kg = -0.01$$, '23514', null, 'AC2 bar_kg -0.01 gives 23514');
select throws_ok($$update public.profiles set bar_kg = 50.01$$, '23514', null, 'AC2 bar_kg 50.01 gives 23514');
select throws_ok($$update public.profiles set bar_kg = null$$, '23502', null, 'AC2 bar_kg null gives 23502');
select throws_ok($$insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max, bar_kg)
  values ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4, 50.01)
  on conflict (user_id) do nothing$$, '23514', null, 'AC2 an insert with bar_kg 50.01 gives 23514');
select is((select bar_kg from public.profiles), 20.00::numeric, 'AC2 the last valid bar_kg (20) is stored');

-- AC3 plate checks ---------------------------------------------------------------------------------
select lives_ok($$update public.profiles set plates_kg = '{}'$$, 'AC3 {} (bar only) succeeds');
select lives_ok($$update public.profiles set plates_kg = '{20,10,0.5}'$$, 'AC3 {20,10,0.5} succeeds');
select lives_ok($$update public.profiles set plates_kg = '{1,2,3,4,5,6,7,8,9,10,11,12}'$$, 'AC3 12 distinct sizes succeed');
select lives_ok($$update public.profiles set plates_kg = '{50,0.01}'$$, 'AC3 the edges {50,0.01} succeed');
select throws_ok($$update public.profiles set plates_kg = '{0}'$$, '23514', null, 'AC3 {0} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{-5}'$$, '23514', null, 'AC3 {-5} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{51}'$$, '23514', null, 'AC3 {51} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{20,20}'$$, '23514', null, 'AC3 duplicate {20,20} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{20,10,20.00}'$$, '23514', null, 'AC3 duplicate {20,10,20.00} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{1,2,3,4,5,6,7,8,9,10,11,12,13}'$$, '23514', null,
  'AC3 13 distinct sizes give 23514');
select throws_ok($$update public.profiles set plates_kg = '{{20},{10}}'$$, '23514', null, 'AC3 two-dimensional {{20},{10}} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '[0:1]={20,10}'$$, '23514', null, 'AC3 lower bound 0 [0:1]={20,10} gives 23514');
select throws_ok($$update public.profiles set plates_kg = '{20,NULL}'$$, '23514', null, 'AC3 a null element gives 23514');
select throws_ok($$update public.profiles set plates_kg = null$$, '23502', null, 'AC3 plates_kg null gives 23502');
select is((select plates_kg from public.profiles), '{50,0.01}'::numeric[], 'AC3 the last valid plates_kg is stored');
reset role;

-- AC4 write rules ----------------------------------------------------------------------------------
-- Put A's plan_changed_at at T (bypassing the trigger, as the owner, inside this transaction).
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T09:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select lives_ok($$update public.profiles set bar_kg = 15, plates_kg = '{25,15,5}'$$,
  'AC4 the owner updates only bar_kg and plates_kg');
select results_eq($$select bar_kg, plates_kg, plan_changed_at from public.profiles$$,
  $$values (15.00::numeric, '{25,15,5}'::numeric[], '2026-08-02T09:00Z'::timestamptz)$$,
  'AC4 the new values are stored and plan_changed_at is still T');
-- An upsert that omits both columns keeps their stored values.
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max)
  values ('build_muscle', 'beginner', 3, 4)
  on conflict (user_id) do update set goal = excluded.goal, level = excluded.level,
    rhythm_min = excluded.rhythm_min, rhythm_max = excluded.rhythm_max$$,
  'AC4 a full-profile upsert without bar_kg/plates_kg succeeds');
select results_eq($$select bar_kg, plates_kg, plan_changed_at from public.profiles$$,
  $$values (15.00::numeric, '{25,15,5}'::numeric[], '2026-08-02T09:00Z'::timestamptz)$$,
  'AC4 the upsert keeps bar_kg, plates_kg and plan_changed_at');

-- B: cannot read or write A's row.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is_empty($$select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'AC4 B cannot read A''s profile');
select lives_ok($$update public.profiles set bar_kg = 0, plates_kg = '{}'
  where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'AC4 B''s update of A''s row runs');
select lives_ok($$insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max)
  values ('00000000-0000-0000-0000-00000000000b', 'general_fitness', 'beginner', 2, 3)$$, 'B inserts its own profile');
select lives_ok($$update public.profiles set bar_kg = 10, plates_kg = '{10}'$$, 'B updates its own bar_kg and plates_kg');
reset role;

-- As postgres (RLS bypassed): A's row is unchanged by B; B's row has B's values.
select results_eq($$select bar_kg, plates_kg from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (15.00::numeric, '{25,15,5}'::numeric[])$$, 'AC4 B''s update affected 0 of A''s rows');
select results_eq($$select bar_kg, plates_kg from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (10.00::numeric, '{10}'::numeric[])$$, 'B''s own row has B''s values');
select is((select count(*)::int from public.profiles), 2, 'A and B each have one profile');

-- The helper is callable by authenticated (the check runs as the writer) and not by anon.
select ok(has_function_privilege('authenticated', 'private.numeric_array_distinct(numeric[])', 'execute'),
  'authenticated may execute private.numeric_array_distinct');
select ok(not has_function_privilege('anon', 'private.numeric_array_distinct(numeric[])', 'execute'),
  'anon may not execute private.numeric_array_distinct');

select * from finish();
rollback;
