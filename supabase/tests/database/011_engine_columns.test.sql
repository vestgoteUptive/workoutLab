-- T-0100b engine v1 columns (D-0024, D-0026, D-0027, D-0035), sets_per_14d > 0 (D-0034 §6) and
-- one-dimensional priority_areas (T-0100a accept follow-up).
begin;
select plan(25);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local');

-- exercises (D-0024, D-0026) --------------------------------------------------------------------------
select col_default_is('public', 'exercises', 'kind', 'exercise', 'exercises.kind defaults to exercise');
select col_default_is('public', 'exercises', 'increment_kg', '2.5', 'exercises.increment_kg defaults to 2.5');
select col_default_is('public', 'exercises', 'external_load', 'true', 'exercises.external_load defaults to true');
select lives_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, kind)
  values ('fx-arm-circles', 'Arm circles', 'isolation', 'beginner', '{Circle}', 'own', 'CC0', 'warmup')$$, 'a warm-up move is stored');
select lives_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, timed, default_duration_s, external_load)
  values ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0', true, 30, false)$$, 'a timed bodyweight exercise is stored');
select lives_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, increment_kg)
  values ('back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0', 5)$$, 'increment_kg 5 is stored');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, kind)
  values ('x-kind', 'X', 'compound', 'beginner', '{a}', 'own', 'CC0', 'cooldown')$$, '23514', null, 'kind cooldown gives 23514');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, increment_kg)
  values ('x-inc', 'X', 'compound', 'beginner', '{a}', 'own', 'CC0', 0)$$, '23514', null, 'increment_kg 0 gives 23514');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license, default_duration_s)
  values ('x-dur', 'X', 'compound', 'beginner', '{a}', 'own', 'CC0', 0)$$, '23514', null, 'default_duration_s 0 gives 23514');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- sessions (D-0024) -------------------------------------------------------------------------------------
select lives_ok($$insert into public.sessions (id, started_at, time_budget_min)
  values ('10000000-0000-0000-0000-000000000001', '2026-09-20T09:00Z', 45)$$, 'a session without a plan is stored');
select results_eq($$select warmup_in_budget, plan from public.sessions where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (true, null::jsonb)$$, 'warmup_in_budget defaults to true, plan to null');
select lives_ok($$insert into public.sessions (id, started_at, time_budget_min, warmup_in_budget, plan)
  values ('10000000-0000-0000-0000-000000000002', '2026-09-21T09:00Z', 30, false,
          '{"items":[{"exerciseId":"back-squat","sets":4}],"startDeficits":{"quads":0.6}}')$$,
  'a session with a stored plan and start deficits is stored');
select is((select (plan -> 'startDeficits' ->> 'quads')::numeric from public.sessions where id = '10000000-0000-0000-0000-000000000002'),
  0.6, 'the stored start deficit reads back');
select throws_ok($$insert into public.sessions (started_at, time_budget_min, plan) values ('2026-09-22T09:00Z', 30, '[1,2]')$$,
  '23514', null, 'a non-object plan gives 23514');

-- session_sets.backoff (D-0024) ----------------------------------------------------------------------
select lives_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, weight_kg, backoff, completed_at, edited_at)
  values ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'back-squat', 4, 8, 55, true,
          '2026-09-20T09:40Z', '2026-09-20T09:40Z')$$, 'a back-off set is stored');
select is((select backoff from public.session_sets_live where client_id = 'c0000000-0000-0000-0000-000000000001'),
  true, 'session_sets_live carries backoff');
select throws_ok($$insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, backoff, is_warmup, completed_at, edited_at)
  values ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'back-squat', 5, 8, true, true,
          '2026-09-20T09:41Z', '2026-09-20T09:41Z')$$, '23514', null, 'a warm-up back-off set gives 23514');

-- profiles.priority_areas one-dimensional; plan_changed_at is D-0027's plan_updated_at (D-0035) ----------
select lives_ok($$insert into public.profiles (goal, level, rhythm_min, rhythm_max, priority_areas)
  values ('build_muscle', 'beginner', 3, 4, '{}')$$, 'an empty priority_areas is stored');
select throws_ok($$update public.profiles set priority_areas = '{{back}}'$$, '23514', null, '2-D {{back}} gives 23514');
select throws_ok($$update public.profiles set priority_areas = '{{back,arms}}'$$, '23514', null, '2-D {{back,arms}} gives 23514');
select throws_ok($$update public.profiles set priority_areas = '{{back},{arms},{core}}'$$, '23514', null, '2-D 3x1 gives 23514');
select lives_ok($$update public.profiles set priority_areas = '{back,arms}'$$, '1-D {back,arms} still succeeds');
select hasnt_column('public', 'profiles', 'plan_updated_at', 'no separate plan_updated_at column (D-0035)');

-- area_targets.sets_per_14d > 0 (D-0034 §6) -------------------------------------------------------------
select throws_ok($$insert into public.area_targets (area_id, sets_per_14d) values ('back', 0)$$, '23514', null, 'sets_per_14d 0 gives 23514');
select throws_ok($$insert into public.area_targets (area_id, sets_per_14d) values ('back', -3)$$, '23514', null, 'sets_per_14d -3 gives 23514');
reset role;

select * from finish();
rollback;
