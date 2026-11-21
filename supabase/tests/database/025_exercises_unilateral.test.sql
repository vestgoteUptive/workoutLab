-- T-0972 (UF-04.2, D-0260 §3, D-0263 §3): exercises.unilateral.
-- AC1 check accepts arm/leg/side/null and rejects 'both'; AC2 seeded rows (needs supabase/seed.sql).
begin;
select plan(10);

select has_column('public', 'exercises', 'unilateral', 'exercises.unilateral exists');
select col_is_null('public', 'exercises', 'unilateral', 'unilateral is nullable');

insert into public.exercises (id, name, type, level, instructions, source, license, unilateral) values
  ('fx-u-arm', 'U arm', 'compound', 'beginner', '{x}', 'own', 'CC0', 'arm'),
  ('fx-u-leg', 'U leg', 'compound', 'beginner', '{x}', 'own', 'CC0', 'leg'),
  ('fx-u-side', 'U side', 'compound', 'beginner', '{x}', 'own', 'CC0', 'side'),
  ('fx-u-null', 'U null', 'compound', 'beginner', '{x}', 'own', 'CC0', null);

select is((select unilateral from public.exercises where id = 'fx-u-arm'), 'arm', 'insert accepts arm');
select is((select unilateral from public.exercises where id = 'fx-u-side'), 'side', 'insert accepts side');
select throws_ok(
  $$insert into public.exercises (id, name, type, level, instructions, source, license, unilateral)
    values ('fx-u-both', 'U both', 'compound', 'beginner', '{x}', 'own', 'CC0', 'both')$$,
  '23514', null, 'insert rejects both');
select lives_ok($$update public.exercises set unilateral = 'leg' where id = 'fx-u-null'$$, 'update accepts leg');
select lives_ok($$update public.exercises set unilateral = null where id = 'fx-u-leg'$$, 'update accepts null');
select throws_ok($$update public.exercises set unilateral = 'both' where id = 'fx-u-arm'$$,
  '23514', null, 'update rejects both');

-- AC2: the seed (T-0971 library JSON via gen-seed) carries the flag.
select results_eq(
  $$select id, unilateral from public.exercises
    where id in ('dumbbell-row','side-plank','single-leg-calf-raise','barbell-row') order by id$$,
  $$values ('barbell-row'::text, null::text), ('dumbbell-row', 'arm'), ('side-plank', 'side'),
    ('single-leg-calf-raise', 'leg')$$,
  'seeded rows carry arm / side / leg / null');
select is((select count(*)::int from public.exercises where id like 'fx-u-%' and unilateral is not null), 3,
  'three non-null fixture rows');

select * from finish();
rollback;
