-- T-0241 (UF-11.3, D-0230 §2/§4, D-0020, editable-level spec AC3): profiles.level is client-writable
-- and is not a plan column. A level-only owner update keeps plan_changed_at (the rule 9 check-in
-- streak); level with a plan column moves it; the vocabulary holds; only the owner can write.
-- now() is fixed inside this transaction, so "moved" is checked as "<> T0" and "= now()".
begin;
select plan(28);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');

-- Each user inserts their own profile.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '{back}');
reset role;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
insert into public.profiles (goal, level, rhythm_min, rhythm_max) values ('general_fitness', 'beginner', 2, 3);
reset role;

-- Put A's plan_changed_at and updated_at at T0 (bypassing the trigger, as the owner, in this transaction).
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T08:00Z', updated_at = '2026-08-02T08:00Z'
  where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;
select results_eq($$select level, plan_changed_at, updated_at from public.profiles
  where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('beginner'::text, '2026-08-02T08:00Z'::timestamptz, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 setup A starts at level beginner with plan_changed_at and updated_at at T0');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC1 level-only update keeps plan_changed_at ---------------------------------------------------------
select results_eq($$with u as (update public.profiles set level = 'intermediate' returning 1) select count(*)::int from u$$,
  $$values (1)$$, 'T-0241 AC1 A''s level-only update to intermediate changes 1 row');
select results_eq($$select level, plan_changed_at from public.profiles$$,
  $$values ('intermediate'::text, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC1 level reads intermediate and plan_changed_at is still T0');

-- AC5 updated_at is stamped; the trigger's other columns behave as today.
select is((select updated_at from public.profiles), now(), 'T-0241 AC5 a level-only update sets updated_at to now()');
select results_eq($$select goal, rhythm_min::int, rhythm_max::int, priority_areas from public.profiles$$,
  $$values ('build_muscle'::text, 3, 4, '{back}'::text[])$$,
  'T-0241 AC5 a level-only update leaves goal, rhythm and priority_areas alone');
select lives_ok($$update public.profiles set level = 'intermediate', onboarded_at = '2020-01-01T00:00Z',
  plan_changed_at = '2020-01-01T00:00Z', created_at = '2020-01-01T00:00Z'$$,
  'T-0241 AC5 a level update that also sends server-set columns runs');
select results_eq($$select onboarded_at <> '2020-01-01T00:00Z', created_at <> '2020-01-01T00:00Z', plan_changed_at
  from public.profiles$$,
  $$values (true, true, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC5 onboarded_at, created_at and plan_changed_at stay server-set (plan_changed_at still T0)');

select results_eq($$with u as (update public.profiles set level = 'advanced' returning 1) select count(*)::int from u$$,
  $$values (1)$$, 'T-0241 AC1 A''s level-only update to advanced changes 1 row');
select results_eq($$select level, plan_changed_at from public.profiles$$,
  $$values ('advanced'::text, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC1 level reads advanced and plan_changed_at is still T0');

select results_eq($$with u as (update public.profiles set level = 'beginner' returning 1) select count(*)::int from u$$,
  $$values (1)$$, 'T-0241 AC1 A''s level-only update back to beginner changes 1 row');
select results_eq($$select level, plan_changed_at from public.profiles$$,
  $$values ('beginner'::text, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC1 level reads beginner and plan_changed_at is still T0');

-- AC2 vocabulary -----------------------------------------------------------------------------------
select throws_ok($$update public.profiles set level = 'expert'$$, '23514', null, 'T-0241 AC2 level expert gives 23514');
select is((select level from public.profiles), 'beginner', 'T-0241 AC2 after expert the stored level is still beginner');
select throws_ok($$update public.profiles set level = 'Beginner'$$, '23514', null, 'T-0241 AC2 level Beginner (capital B) gives 23514');
select is((select level from public.profiles), 'beginner', 'T-0241 AC2 after Beginner the stored level is still beginner');
select throws_ok($$update public.profiles set level = null$$, '23502', null, 'T-0241 AC2 level null gives 23502');
select results_eq($$select level, plan_changed_at from public.profiles$$,
  $$values ('beginner'::text, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC2 after null the stored level is still beginner and plan_changed_at is still T0');
reset role;

-- AC3 owner only -----------------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
select results_eq($$with u as (update public.profiles set level = 'advanced'
  where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'T-0241 AC3 B''s update of A''s level changes 0 rows');
select results_eq($$with u as (update public.profiles set level = 'advanced' returning 1) select count(*)::int from u$$,
  $$values (1)$$, 'T-0241 AC3 B''s update of its own level changes 1 row');
reset role;

-- anon holds no privilege on profiles (revoked in data_model_v1a), so its update is refused outright
-- and changes no row.
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok($$update public.profiles set level = 'advanced'
  where user_id = '00000000-0000-0000-0000-00000000000a'$$, '42501', null,
  'T-0241 AC3 an anon update of A''s level is refused (42501) and changes 0 rows');
reset role;

-- As postgres (RLS bypassed): A's row is untouched by B and anon.
select results_eq($$select level, plan_changed_at from public.profiles
  where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('beginner'::text, '2026-08-02T08:00Z'::timestamptz)$$,
  'T-0241 AC3 A''s level and plan_changed_at are unchanged after B''s and anon''s updates');
select is((select level from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), 'advanced',
  'T-0241 AC3 B''s own row has B''s level');

-- AC4 level with a plan column moves plan_changed_at -------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select results_eq($$with u as (update public.profiles set level = 'intermediate', goal = 'get_stronger' returning 1)
  select count(*)::int from u$$, $$values (1)$$, 'T-0241 AC4 A''s level + goal update changes 1 row');
select results_eq($$select level, goal from public.profiles$$, $$values ('intermediate'::text, 'get_stronger'::text)$$,
  'T-0241 AC4 level reads intermediate and goal reads get_stronger');
select isnt((select plan_changed_at from public.profiles), '2026-08-02T08:00Z'::timestamptz,
  'T-0241 AC4 level + goal moves plan_changed_at off T0');
select is((select plan_changed_at from public.profiles), now(), 'T-0241 AC4 level + goal sets plan_changed_at to now()');
reset role;

-- Sibling: a goal-only update also moves it.
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T08:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;
set local role authenticated;
select results_eq($$with u as (update public.profiles set goal = 'build_muscle' returning 1) select count(*)::int from u$$,
  $$values (1)$$, 'T-0241 AC4 A''s goal-only update changes 1 row');
select is((select plan_changed_at from public.profiles), now(),
  'T-0241 AC4 a goal-only update moves plan_changed_at to now() (off T0)');
reset role;

select * from finish();
rollback;
