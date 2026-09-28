-- T-0102b AC19: profiles_priority_areas_valid requires array_lower(priority_areas, 1) = 1 (D-0037 §11),
-- and every earlier priority_areas case (T-0100 AC19, T-0100b one-dimensional) still holds.
begin;
select plan(18);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');

select ok(
  pg_get_constraintdef((select oid from pg_catalog.pg_constraint
                         where conrelid = 'public.profiles'::regclass
                           and conname = 'profiles_priority_areas_valid')) like '%array_lower(priority_areas, 1)%',
  'profiles_priority_areas_valid checks array_lower(priority_areas, 1)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- insert -------------------------------------------------------------------------------------------
select throws_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '[2:3]={back,back}')$$, '23514', null,
  'insert [2:3]={back,back} gives 23514');
select throws_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '[0:1]={back,chest}')$$, '23514', null,
  'insert [0:1]={back,chest} gives 23514');
select throws_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '[2:2]={back}')$$, '23514', null,
  'insert [2:2]={back} gives 23514');
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '{back,chest}')$$, 'insert {back,chest} succeeds');

-- update -------------------------------------------------------------------------------------------
select throws_ok($$update public.profiles set priority_areas = '[2:3]={back,back}'$$, '23514', null,
  'update to [2:3]={back,back} gives 23514');
select throws_ok($$update public.profiles set priority_areas = '[0:1]={back,chest}'$$, '23514', null,
  'update to [0:1]={back,chest} gives 23514');
select lives_ok($$update public.profiles set priority_areas = '{}'$$, 'update to {} succeeds');
select lives_ok($$update public.profiles set priority_areas = '[1:2]={back,chest}'$$,
  'explicit lower bound 1 [1:2]={back,chest} succeeds');

-- T-0100 AC19 cases ----------------------------------------------------------------------------------
select lives_ok($$update public.profiles set priority_areas = '{back,hamstrings,arms}'$$, '{back,hamstrings,arms} succeeds');
select throws_ok($$update public.profiles set priority_areas = '{back,hamstrings,arms,chest}'$$, '23514', null, '4 items give 23514');
select throws_ok($$update public.profiles set priority_areas = '{neck}'$$, '23514', null, '{neck} gives 23514');
select throws_ok($$update public.profiles set priority_areas = '{back,back}'$$, '23514', null, '{back,back} gives 23514');

-- T-0100b one-dimensional case -------------------------------------------------------------------------
select throws_ok($$update public.profiles set priority_areas = '{{back,arms}}'$$, '23514', null, '2-D {{back,arms}} gives 23514');

-- the stored row is the last valid value; user B cannot write A's row --------------------------------
select results_eq($$select priority_areas from public.profiles$$, $$values ('{back,hamstrings,arms}'::text[])$$,
  'A reads back the last valid priority_areas');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is_empty($$select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'B cannot read A''s profile');
select lives_ok($$update public.profiles set priority_areas = '{calves}'
  where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B''s update of A''s row runs and matches no row');

reset role;
select results_eq($$select priority_areas from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('{back,hamstrings,arms}'::text[])$$, 'A''s priority_areas are unchanged by B');

select * from finish();
rollback;
