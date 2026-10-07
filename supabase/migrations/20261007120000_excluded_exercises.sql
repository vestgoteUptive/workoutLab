-- T-0535 (UF-11.4, UF-11.5, D-0199 §4, D-0020): the per-user "never suggest" list.
-- One row per (user, exercise). created_at is server-set by trigger (NFR-SYNC-3); user_id and
-- created_at never change on update. The exercise FK cascades, unlike session_sets and
-- routine_items: an exclusion is a preference, not history, so it goes with its exercise.
-- Forward-only, additive: no existing row changes.

create table public.excluded_exercises (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint excluded_exercises_pkey primary key (user_id, exercise_id)
);
create index excluded_exercises_exercise_id_idx on public.excluded_exercises (exercise_id);

create function private.excluded_exercises_before_write() returns trigger
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

create trigger excluded_exercises_before_write
  before insert or update on public.excluded_exercises
  for each row execute function private.excluded_exercises_before_write();

-- Privileges and RLS (D-0020, D-0030, NFR-PRIV-3): owner-only, nothing for anon.
revoke all on public.excluded_exercises from anon;
revoke truncate, references, trigger on public.excluded_exercises from authenticated;
grant select, insert, update, delete on public.excluded_exercises to authenticated;

alter table public.excluded_exercises enable row level security;

create policy excluded_exercises_select on public.excluded_exercises for select to authenticated
  using ((select auth.uid()) = user_id);
create policy excluded_exercises_insert on public.excluded_exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy excluded_exercises_update on public.excluded_exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy excluded_exercises_delete on public.excluded_exercises for delete to authenticated
  using ((select auth.uid()) = user_id);
