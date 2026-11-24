-- T-1020 (D-0281 §4, T-1008 review): a stale device cannot undo Forget. Forget deletes the user's
-- edit_signals rows and moves profiles.learn_reset_at, but the last_seen stale rule has no row
-- left to compare with, so an offline device could upsert pre-reset counts as fresh rows.
-- Guard: an insert or update whose last_seen is at or before the owner's learn_reset_at is a
-- no-op. Returning null from a BEFORE row trigger skips the row: no row comes back, no error
-- (so a client does not retry forever), and in an upsert the conflict update is skipped too.
-- A null learn_reset_at (never reset, or no profile row) leaves every write as before.
-- Forward-only: only the trigger function body changes; RLS, grants and the trigger are as in
-- 20261124120000_edit_signals.sql.

create or replace function private.edit_signals_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reset_at timestamptz;
begin
  -- Runs as the caller; profiles RLS lets the owner read the own row, which is the one needed.
  select p.learn_reset_at into reset_at
    from public.profiles p
   where p.user_id = case when tg_op = 'INSERT' then new.user_id else old.user_id end;
  if reset_at is not null and new.last_seen <= reset_at then
    return null;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- A late, reordered write cannot go backwards (D-0015 for this table): keep the stored row.
  if new.last_seen < old.last_seen then
    return old;
  end if;
  new.user_id := old.user_id;
  new.device_id := old.device_id;
  new.key := old.key;
  new.kind := old.kind;
  new.exercise_id := old.exercise_id;
  new.to_exercise_id := old.to_exercise_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
