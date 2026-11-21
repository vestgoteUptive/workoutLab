-- T-0951 (UF-04.2, D-0251, D-0259 §16, D-0020): a user's own weight step per exercise. Same family
-- as favorite_exercises / excluded_exercises, with updated_at and a stricter update trigger.
-- One row per (user, exercise) and only while an override exists; "use default" deletes the row.
-- The exercise FK cascades: a setting is a preference, not history.
-- Forward-only, additive: no existing row changes. session_sets_live already exposes rir (it is
-- `select *` over session_sets, which has had rir since the first migration); AC10 proves it.

create table public.exercise_settings (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id  text not null references public.exercises (id) on delete cascade,
  increment_kg numeric(4,2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint exercise_settings_pkey primary key (user_id, exercise_id),
  constraint exercise_settings_increment_range check (increment_kg between 0.25 and 10),
  constraint exercise_settings_increment_quarter check (increment_kg * 4 = round(increment_kg * 4))
);
create index exercise_settings_exercise_id_idx on public.exercise_settings (exercise_id);

create function private.exercise_settings_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.user_id := old.user_id;
    new.exercise_id := old.exercise_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger exercise_settings_before_write
  before insert or update on public.exercise_settings
  for each row execute function private.exercise_settings_before_write();

-- Privileges and RLS (D-0020, D-0030, NFR-PRIV-3): owner-only, nothing for anon.
revoke all on public.exercise_settings from anon;
revoke truncate, references, trigger on public.exercise_settings from authenticated;
grant select, insert, update, delete on public.exercise_settings to authenticated;

alter table public.exercise_settings enable row level security;

create policy exercise_settings_select on public.exercise_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy exercise_settings_insert on public.exercise_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy exercise_settings_update on public.exercise_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exercise_settings_delete on public.exercise_settings for delete to authenticated
  using ((select auth.uid()) = user_id);
