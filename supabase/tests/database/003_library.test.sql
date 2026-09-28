-- T-0100a library tests: AC6 (public and read-only, D-0014, D-0021), AC8 (area weights).
begin;
select plan(34);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-back-squat', 'Back squat', 'compound', 'intermediate', '{Squat}', 'own', 'CC0'),
  ('fx-barbell-row', 'Barbell row', 'compound', 'intermediate', '{Row}', 'own', 'CC0'),
  ('fx-plank', 'Plank', 'isolation', 'beginner', '{Hold}', 'own', 'CC0');
insert into public.exercise_areas (exercise_id, area_id, weight) values
  ('fx-back-squat', 'quads', 1.0), ('fx-back-squat', 'glutes', 1.0),
  ('fx-back-squat', 'hamstrings', 0.5), ('fx-back-squat', 'core', 0.5);
insert into public.exercise_variants (exercise_id, variant_id) values
  ('fx-back-squat', 'fx-barbell-row'), ('fx-barbell-row', 'fx-back-squat');

-- AC6: anon reads, cannot write -----------------------------------------------------------------
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select is((select count(*)::int from public.areas), 9, 'anon reads areas');
select is((select count(*)::int from public.exercises where id = 'fx-back-squat'), 1, 'anon reads exercises');
select is((select count(*)::int from public.exercise_areas where exercise_id = 'fx-back-squat'), 4, 'anon reads exercise_areas');
select is((select count(*)::int from public.exercise_variants where exercise_id = 'fx-back-squat'), 1, 'anon reads exercise_variants');
select throws_ok($$insert into public.areas (id, sort_order) values ('neck', 10)$$, '42501', null, 'anon cannot insert areas');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license)
  values ('curl', 'Curl', 'isolation', 'beginner', '{Curl}', 'own', 'CC0')$$, '42501', null, 'anon cannot insert exercises');
select throws_ok($$insert into public.exercise_areas values ('fx-plank', 'back', 0.5)$$, '42501', null, 'anon cannot insert exercise_areas');
select throws_ok($$insert into public.exercise_variants values ('fx-plank', 'fx-back-squat')$$, '42501', null, 'anon cannot insert exercise_variants');
select throws_ok($$update public.areas set sort_order = 99 where id = 'chest'$$, '42501', null, 'anon cannot update areas');
select throws_ok($$update public.exercises set name = 'Hacked' where id = 'fx-back-squat'$$, '42501', null, 'anon cannot update exercises');
select throws_ok($$delete from public.exercise_areas where exercise_id = 'fx-back-squat'$$, '42501', null, 'anon cannot delete exercise_areas');
select throws_ok($$delete from public.exercise_variants$$, '42501', null, 'anon cannot delete exercise_variants');
reset role;

-- AC6: authenticated (A) reads, cannot write ----------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.areas), 9, 'A reads areas');
select is((select count(*)::int from public.exercises where id = 'fx-back-squat'), 1, 'A reads exercises');
select is((select count(*)::int from public.exercise_areas where exercise_id = 'fx-back-squat'), 4, 'A reads exercise_areas');
select is((select count(*)::int from public.exercise_variants where exercise_id = 'fx-back-squat'), 1, 'A reads exercise_variants');
select throws_ok($$insert into public.areas (id, sort_order) values ('neck', 10)$$, '42501', null, 'A cannot insert areas');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license)
  values ('curl', 'Curl', 'isolation', 'beginner', '{Curl}', 'own', 'CC0')$$, '42501', null, 'A cannot insert exercises');
select throws_ok($$insert into public.exercise_areas values ('fx-plank', 'back', 0.5)$$, '42501', null, 'A cannot insert exercise_areas');
select throws_ok($$insert into public.exercise_variants values ('fx-plank', 'fx-back-squat')$$, '42501', null, 'A cannot insert exercise_variants');
select throws_ok($$update public.areas set sort_order = 99 where id = 'chest'$$, '42501', null, 'A cannot update areas');
select throws_ok($$update public.exercise_areas set weight = 0.5 where exercise_id = 'fx-back-squat'$$, '42501', null, 'A cannot update exercise_areas');
select throws_ok($$delete from public.exercises where id = 'fx-plank'$$, '42501', null, 'A cannot delete exercises');
select throws_ok($$delete from public.exercise_variants$$, '42501', null, 'A cannot delete exercise_variants');
reset role;

-- AC6: data unchanged, checked as postgres ------------------------------------------------------
select results_eq('select id, sort_order::int from public.areas order by sort_order',
  $$values ('chest',1),('back',2),('shoulders',3),('arms',4),('core',5),('glutes',6),('quads',7),('hamstrings',8),('calves',9)$$,
  'areas unchanged');
select results_eq($$select id, name from public.exercises
    where id in ('fx-back-squat', 'fx-barbell-row', 'fx-plank') order by id$$,
  $$values ('fx-back-squat','Back squat'),('fx-barbell-row','Barbell row'),('fx-plank','Plank')$$, 'exercises unchanged');
select results_eq($$select area_id, weight from public.exercise_areas
    where exercise_id = 'fx-back-squat' order by area_id$$,
  $$values ('core',0.5::numeric(2,1)),('glutes',1.0),('hamstrings',0.5),('quads',1.0)$$, 'exercise_areas unchanged');
select is((select count(*)::int from public.exercise_variants
  where exercise_id in ('fx-back-squat', 'fx-barbell-row')), 2, 'exercise_variants unchanged');

-- AC6: no self-pair ------------------------------------------------------------------------------
select throws_ok($$insert into public.exercise_variants values ('fx-back-squat', 'fx-back-squat')$$,
  '23514', null, 'self-pair variant gives 23514');

-- AC8: area weights -----------------------------------------------------------------------------
select throws_ok($$insert into public.exercise_areas values ('fx-back-squat', 'back', 0.75)$$,
  '23514', null, 'weight 0.75 gives 23514');
select lives_ok($$insert into public.exercise_areas values ('fx-plank', 'core', 1.0)$$, 'weight 1.0 succeeds');
select lives_ok($$insert into public.exercise_areas values ('fx-plank', 'shoulders', 0.5)$$, 'weight 0.5 succeeds');

-- D-0021 vocabularies on exercises
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license)
  values ('x1', 'X', 'cardio', 'beginner', '{a}', 'own', 'CC0')$$, '23514', null, 'exercises.type outside vocabulary gives 23514');
select throws_ok($$insert into public.exercises (id, name, type, level, instructions, source, license)
  values ('x2', 'X', 'compound', 'expert', '{a}', 'own', 'CC0')$$, '23514', null, 'exercises.level outside vocabulary gives 23514');

select * from finish();
rollback;
