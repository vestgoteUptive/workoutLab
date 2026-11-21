-- T-0951 (UF-04.2, D-0251): AC6 cascades (exercise delete, user delete), AC7 upsert on the PK
-- (last write wins), AC10 session_sets_live returns rir (0 and null).
begin;
select plan(8);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('fx-bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('fx-curl', 'Curl', 'isolation', 'beginner', '{Curl}', 'own', 'CC0');

-- AC7: upsert twice for the same exercise (as A) --------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 1.25)
  on conflict (user_id, exercise_id) do update set increment_kg = excluded.increment_kg;
insert into public.exercise_settings (exercise_id, increment_kg) values ('fx-curl', 2.5)
  on conflict (user_id, exercise_id) do update set increment_kg = excluded.increment_kg;
select is((select count(*)::int from public.exercise_settings where exercise_id = 'fx-curl'), 1,
  'AC7 two upserts leave one row');
select is((select increment_kg from public.exercise_settings where exercise_id = 'fx-curl'), 2.5,
  'AC7 the row holds the last value, 2.5');

-- AC10: rir 0 and null through session_sets_live ----------------------------------------------------
insert into public.sessions (id, started_at, time_budget_min)
  values ('10000000-0000-0000-0000-000000000001', '2026-09-20T09:00Z', 45);
insert into public.session_sets (client_id, session_id, exercise_id, set_index, reps, weight_kg, rir, completed_at, edited_at) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'fx-bench-press', 1, 8, 60, 0,
   '2026-09-20T09:10Z', '2026-09-20T09:10Z'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'fx-bench-press', 2, 8, 60, null,
   '2026-09-20T09:15Z', '2026-09-20T09:15Z');
select is((select rir from public.session_sets_live where client_id = 'c0000000-0000-0000-0000-000000000001'),
  0::smallint, 'AC10 session_sets_live returns rir 0 as 0');
select is((select count(*)::int from public.session_sets_live
            where client_id = 'c0000000-0000-0000-0000-000000000002' and rir is null), 1,
  'AC10 session_sets_live returns a missing rir as null');
reset role;

-- AC6: exercise delete cascades to the setting; other exercises' rows stay ---------------------------
insert into public.exercise_settings (user_id, exercise_id, increment_kg) values
  ('00000000-0000-0000-0000-00000000000a', 'fx-bench-press', 5),
  ('00000000-0000-0000-0000-00000000000b', 'fx-curl', 1.25);
delete from public.session_sets;
delete from public.exercises where id = 'fx-curl';
select is((select count(*)::int from public.exercise_settings where exercise_id = 'fx-curl'), 0,
  'AC6 deleting exercise X deletes every setting for X (A and B)');
select is((select count(*)::int from public.exercise_settings where exercise_id = 'fx-bench-press'), 1,
  'AC6 settings for other exercises stay');

-- AC6: user delete cascades to the settings -----------------------------------------------------------
insert into public.exercise_settings (user_id, exercise_id, increment_kg) values
  ('00000000-0000-0000-0000-00000000000b', 'fx-bench-press', 2.5);
delete from public.sessions;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.exercise_settings where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'AC6 deleting user A deletes A''s settings');
select is((select count(*)::int from public.exercise_settings where user_id = '00000000-0000-0000-0000-00000000000b'), 1,
  'AC6 B''s setting stays');

select * from finish();
rollback;
