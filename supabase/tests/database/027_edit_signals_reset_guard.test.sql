-- T-1020 (D-0281 §4): writes to edit_signals with last_seen at or before the owner's
-- learn_reset_at are a silent no-op. AC1 no-op (no row, no error), AC2 applied otherwise,
-- AC3 the existing stale rule still holds. User A = ...0a (reset set), B = ...0b (never reset).
begin;
select plan(14);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local');
insert into public.exercises (id, name, type, level, instructions, source, license) values
  ('bench-press', 'Bench press', 'compound', 'intermediate', '{Press}', 'own', 'CC0'),
  ('cable-crunch', 'Cable crunch', 'isolation', 'beginner', '{Crunch}', 'own', 'CC0');
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4),
  ('00000000-0000-0000-0000-00000000000b', 'build_muscle', 'beginner', 3, 4);
-- A's reset epoch: 2026-11-10T12:00Z (set directly; the profiles trigger is not under test)
set local session_replication_role = replica;
update public.profiles set learn_reset_at = '2026-11-10T12:00Z'
  where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = origin;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC1: insert at, and before, the reset is a no-op ------------------------------------------------
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          2, '2026-11-01T09:00Z', '2026-11-09T09:00Z')$$, 'T-1020 AC1 an insert before the reset raises no error');
select is((select count(*)::int from public.edit_signals), 0, 'T-1020 AC1 an insert before the reset stores no row');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          2, '2026-11-01T09:00Z', '2026-11-10T12:00Z')$$, 'T-1020 AC1 an insert exactly at the reset raises no error');
select is((select count(*)::int from public.edit_signals), 0, 'T-1020 AC1 an insert exactly at the reset stores no row');
select is_empty($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          2, '2026-11-01T09:00Z', '2026-11-09T09:00Z') returning id$$,
  'T-1020 AC1 a no-op insert returns no row');
select lives_ok($$insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          2, '2026-11-01T09:00Z', '2026-11-05T09:00Z')
  on conflict (user_id, device_id, key) do update set count = excluded.count, last_seen = excluded.last_seen$$,
  'T-1020 AC1 a stale upsert raises no error');
select is((select count(*)::int from public.edit_signals), 0, 'T-1020 AC1 a stale upsert stores no row');

-- AC2: after the reset, applied -----------------------------------------------------------------
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          1, '2026-11-10T12:30Z', '2026-11-10T13:00Z');
select is((select count from public.edit_signals), 1, 'T-1020 AC2 an insert after the reset is applied');

-- AC1 on update: a stale update to a surviving row is a no-op; AC3 the stale rule is unchanged
update public.edit_signals set count = 9, last_seen = '2026-11-10T12:00Z';
select is((select count from public.edit_signals), 1, 'T-1020 AC1 an update at the reset leaves the row unchanged');
update public.edit_signals set count = 9, last_seen = '2026-11-10T12:45Z';
select is((select count from public.edit_signals), 1,
  'T-1020 AC3 an update older than the stored last_seen (but after the reset) is still ignored');
update public.edit_signals set count = 3, last_seen = '2026-11-10T14:00Z';
select is((select count from public.edit_signals), 3, 'T-1020 AC2 an update after the reset and the stored last_seen is applied');

-- AC2: a user whose learn_reset_at is null is unaffected -----------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000002', 'removal:bench-press', 'removal', 'bench-press',
          1, '2020-01-01T09:00Z', '2020-01-01T09:00Z');
select is((select count(*)::int from public.edit_signals), 1, 'T-1020 AC2 with learn_reset_at null an old write is applied');
-- B is not held to A's epoch
reset role;
select is((select count(*)::int from public.edit_signals where user_id = '00000000-0000-0000-0000-00000000000a'), 1,
  'T-1020 AC2 A''s row is unaffected by B''s write');

-- AC1: Forget (rows deleted, epoch moves forward), then a stale device replays an older row -----------
reset role;
delete from public.edit_signals where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = replica;
update public.profiles set learn_reset_at = '2026-11-10T15:00Z' where user_id = '00000000-0000-0000-0000-00000000000a';
set local session_replication_role = origin;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
insert into public.edit_signals (device_id, key, kind, exercise_id, count, window_start, last_seen)
  values ('d0000000-0000-0000-0000-000000000001', 'removal:cable-crunch', 'removal', 'cable-crunch',
          3, '2026-11-10T13:00Z', '2026-11-10T14:00Z');
select is((select count(*)::int from public.edit_signals), 0,
  'T-1020 AC1 after Forget deleted the rows, a replay of the pre-reset row cannot bring it back');
reset role;

select * from finish();
rollback;
