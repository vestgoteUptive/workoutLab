-- release: destructive-approved D-0202
-- T-0564 (UF-11.4, UF-11.6, UF-04.2, D-0202 §5, D-0020): the per-user favorites list, the same
-- shape as excluded_exercises (T-0535, D-0199 §4). One row per (user, exercise). created_at is
-- server-set by trigger (NFR-SYNC-3); user_id and created_at never change on update. The exercise
-- FK cascades: a favorite is a preference, not history, so it goes with its exercise.
-- Mutual exclusion (D-0202 §5, amends D-0199 §4): an insert into either list removes the same
-- (user_id, exercise_id) from the other. The header above approves exactly those two trigger
-- bodies (they contain a row delete); nothing here deletes data at release time.
-- Forward-only, additive: no existing row changes.

create table public.favorite_exercises (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint favorite_exercises_pkey primary key (user_id, exercise_id)
);
create index favorite_exercises_exercise_id_idx on public.favorite_exercises (exercise_id);

create function private.favorite_exercises_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger favorite_exercises_before_write
  before insert or update on public.favorite_exercises
  for each row execute function private.favorite_exercises_before_write();

-- Mutual exclusion. security invoker (the default, stated): RLS applies, and the row removed is
-- the caller's own (the insert policy pinned NEW.user_id to auth.uid()). A delete fires no insert
-- trigger, so there is no recursion. A duplicate insert skipped by `on conflict do nothing`
-- fires no after-insert trigger.
create function private.favorite_exercises_after_insert() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.excluded_exercises
    where user_id = new.user_id and exercise_id = new.exercise_id;
  return null;
end;
$$;

create trigger favorite_exercises_after_insert
  after insert on public.favorite_exercises
  for each row execute function private.favorite_exercises_after_insert();

create function private.excluded_exercises_after_insert() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.favorite_exercises
    where user_id = new.user_id and exercise_id = new.exercise_id;
  return null;
end;
$$;

create trigger excluded_exercises_after_insert
  after insert on public.excluded_exercises
  for each row execute function private.excluded_exercises_after_insert();

-- Privileges and RLS (D-0020, D-0030, NFR-PRIV-3): owner-only, nothing for anon.
revoke all on public.favorite_exercises from anon;
revoke truncate, references, trigger on public.favorite_exercises from authenticated;
grant select, insert, update, delete on public.favorite_exercises to authenticated;

alter table public.favorite_exercises enable row level security;

create policy favorite_exercises_select on public.favorite_exercises for select to authenticated
  using ((select auth.uid()) = user_id);
create policy favorite_exercises_insert on public.favorite_exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy favorite_exercises_update on public.favorite_exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy favorite_exercises_delete on public.favorite_exercises for delete to authenticated
  using ((select auth.uid()) = user_id);
