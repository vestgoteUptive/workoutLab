-- T-0100a profile, target and onboarding tests (D-0014, D-0018, D-0020, D-0021, NFR-AN-2,
-- UF-01.4, UF-01.5, UF-11.3): AC17 onboarded_at write-once, AC18 onboarding timing,
-- AC19 plan fields, AC20 plan_changed_at, AC21 server-stamped targets.
begin;
select plan(38);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC18: onboarding timing ------------------------------------------------------------------------
select throws_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, onboarding_timing_ms)
  values ('build_muscle', 'beginner', 3, 4, -1)$$, '23514', null, 'onboarding_timing_ms -1 gives 23514');
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, onboarding_timing_ms)
  values ('build_muscle', 'beginner', 3, 4, null)$$, 'onboarding_timing_ms null succeeds (returning user)');
delete from public.profiles;
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, onboarding_timing_ms)
  values ('build_muscle', 'beginner', 3, 4, 5400000)$$, 'onboarding_timing_ms 5400000 succeeds (tab left open)');
delete from public.profiles;
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, onboarding_timing_ms, onboarded_at)
  values ('build_muscle', 'beginner', 3, 4, 41250, '2026-08-02T09:00Z')$$, 'onboarding_timing_ms 41250 succeeds');
select is((select onboarding_timing_ms from public.profiles), 41250, 'onboarding_timing_ms 41250 is stored');
update public.profiles set onboarding_timing_ms = 30000;
select is((select onboarding_timing_ms from public.profiles), 41250, 'onboarding_timing_ms stays 41250 after an update');

-- AC17: onboarded_at is write-once ---------------------------------------------------------------
select is((select onboarded_at from public.profiles), '2026-08-02T09:00Z'::timestamptz, 'client onboarded_at kept on insert');
update public.profiles set onboarded_at = '2026-09-01T09:00Z', rhythm_max = 5;
select results_eq('select onboarded_at, rhythm_max::int from public.profiles',
  $$values ('2026-08-02T09:00Z'::timestamptz, 5)$$, 'onboarded_at unchanged, rhythm_max updated');
-- Full-profile upsert from a second device never fails and keeps the write-once fields.
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, onboarding_timing_ms, onboarded_at)
  values ('build_muscle', 'beginner', 3, 5, 1, '2026-09-27T09:00Z')
  on conflict (user_id) do update set goal = excluded.goal, level = excluded.level, rhythm_min = excluded.rhythm_min,
    rhythm_max = excluded.rhythm_max, onboarding_timing_ms = excluded.onboarding_timing_ms,
    onboarded_at = excluded.onboarded_at$$, 'a full-profile upsert succeeds');
select results_eq('select onboarded_at, onboarding_timing_ms from public.profiles',
  $$values ('2026-08-02T09:00Z'::timestamptz, 41250)$$, 'upsert keeps onboarded_at and onboarding_timing_ms');

-- A null timing may be filled in once.
reset role;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;
insert into public.profiles (goal, level, rhythm_min, rhythm_max) values ('general_fitness', 'beginner', 2, 3);
update public.profiles set onboarding_timing_ms = 52000;
select is((select onboarding_timing_ms from public.profiles), 52000, 'a null onboarding_timing_ms can be set once');
update public.profiles set onboarding_timing_ms = 1;
select is((select onboarding_timing_ms from public.profiles), 52000, 'and then stays');

-- AC19: plan fields ------------------------------------------------------------------------------
select lives_ok($$update public.profiles set rhythm_min = 3, rhythm_max = 4$$, 'rhythm (3,4) succeeds');
select lives_ok($$update public.profiles set rhythm_min = 7, rhythm_max = 7$$, 'rhythm (7,7) succeeds');
select throws_ok($$update public.profiles set rhythm_min = 0, rhythm_max = 2$$, '23514', null, 'rhythm (0,2) gives 23514');
select throws_ok($$update public.profiles set rhythm_min = 5, rhythm_max = 4$$, '23514', null, 'rhythm (5,4) gives 23514');
select throws_ok($$update public.profiles set rhythm_min = 3, rhythm_max = 8$$, '23514', null, 'rhythm (3,8) gives 23514');
select lives_ok($$update public.profiles set priority_areas = '{back,hamstrings,arms}'$$, 'priority_areas of 3 succeeds');
select throws_ok($$update public.profiles set priority_areas = '{back,hamstrings,arms,chest}'$$, '23514', null, '4 priority areas give 23514');
select throws_ok($$update public.profiles set priority_areas = '{neck}'$$, '23514', null, 'unknown priority area gives 23514');
select throws_ok($$update public.profiles set priority_areas = '{back,back}'$$, '23514', null, 'duplicate priority areas give 23514');
select throws_ok($$update public.profiles set priority_areas = '{back,chest,back}'$$, '23514', null, 'duplicate among 3 gives 23514');
select lives_ok($$update public.profiles set goal = 'get_stronger'$$, 'goal get_stronger succeeds');
select throws_ok($$update public.profiles set goal = 'bulk'$$, '23514', null, 'goal bulk gives 23514');
reset role;

-- AC20: plan_changed_at --------------------------------------------------------------------------
-- Put A's plan_changed_at at T0 (bypassing the trigger, as the owner, inside this transaction).
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T09:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
update public.profiles set equipment = '{barbell,dumbbell}';
select is((select plan_changed_at from public.profiles), '2026-08-02T09:00Z'::timestamptz, 'equipment change keeps plan_changed_at');
update public.profiles set plan_changed_at = '2020-01-01T00:00Z';
select is((select plan_changed_at from public.profiles), '2026-08-02T09:00Z'::timestamptz, 'a client-supplied plan_changed_at is ignored');
update public.profiles set rhythm_min = 2;
select is((select plan_changed_at from public.profiles), now(), 'rhythm_min change sets plan_changed_at to now()');
reset role;
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T09:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;
set local role authenticated;
update public.profiles set goal = 'general_fitness';
select is((select plan_changed_at from public.profiles), now(), 'goal change sets plan_changed_at to now()');
reset role;
alter table public.profiles disable trigger profiles_before_write;
update public.profiles set plan_changed_at = '2026-08-02T09:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
alter table public.profiles enable trigger profiles_before_write;
set local role authenticated;
update public.profiles set priority_areas = '{calves}';
select is((select plan_changed_at from public.profiles), now(), 'priority_areas change sets plan_changed_at to now()');
update public.profiles set updated_at = '2020-01-01T00:00Z';
select is((select updated_at from public.profiles), now(), 'profiles.updated_at is server-set');

-- AC21: targets are server-stamped ---------------------------------------------------------------
insert into public.area_targets (area_id, sets_per_14d, source, updated_at) values ('back', 20, 'default', '2020-01-01T00:00Z');
select is((select updated_at from public.area_targets where area_id = 'back'), now(), 'insert stamps updated_at = now()');
update public.area_targets set sets_per_14d = 25, source = 'adapted', updated_at = '2020-01-01' where area_id = 'back';
select results_eq($$select sets_per_14d::int, source, updated_at from public.area_targets where area_id = 'back'$$,
  $$values (25, 'adapted', now())$$, 'update applies values and stamps updated_at = now()');
select throws_ok($$update public.area_targets set source = 'auto' where area_id = 'back'$$, '23514', null, 'source auto gives 23514');
select throws_ok($$update public.area_targets set sets_per_14d = 0 where area_id = 'back'$$, '23514', null, 'sets_per_14d 0 gives 23514');
select throws_ok($$insert into public.area_targets (area_id, sets_per_14d) values ('back', 12)$$, '23505', null, 'a second (A, back) row gives 23505');
select lives_ok($$insert into public.area_targets (area_id, sets_per_14d, source) values ('chest', 12, 'manual')$$, 'source manual succeeds');
reset role;

-- Final state, as postgres.
select is((select count(*)::int from public.profiles), 2, 'both profiles exist');
select is((select count(*)::int from public.area_targets), 2, 'A has 2 targets');

select * from finish();
rollback;
