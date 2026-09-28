-- T-0203a AC6 (D-0044 b, c): supabase/seed.sql, applied by `supabase db reset`, maps
-- external_load = NOT bodyweight correctly. Runs against the real seeded exercises table, not a
-- fixture insert, so it only passes once supabase/seed.sql has actually been loaded.
begin;
select plan(7);

select is((select external_load from public.exercises where id = 'push-up'), false,
  'push-up.external_load is false (D-0044 b)');
select is((select external_load from public.exercises where id = 'plank'), false,
  'plank.external_load is false (D-0044 b)');
select is((select external_load from public.exercises where id = 'barbell-back-squat'), true,
  'barbell-back-squat.external_load is true (D-0044 c)');

select is(
  (select count(*)::int from public.exercises where kind = 'warmup' and external_load = true),
  0,
  'no kind = warmup row has external_load = true');
select ok(
  (select count(*)::int from public.exercises where kind = 'warmup') >= 2,
  'at least 2 warm-up rows are seeded');

select is(
  (select count(*)::int
     from public.exercises e
     where e.kind = 'exercise'
       and not exists (
         select 1 from public.exercise_areas ea
         where ea.exercise_id = e.id and ea.weight = 1.0
       )),
  0,
  'every kind = exercise row has at least one exercise_areas row with weight 1.0');
select ok(
  (select count(*)::int from public.exercises where kind = 'exercise') >= 1,
  'at least 1 kind = exercise row is seeded');

select * from finish();
rollback;
