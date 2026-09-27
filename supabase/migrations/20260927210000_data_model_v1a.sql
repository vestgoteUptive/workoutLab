-- T-0100a: data model v1, part [a] (docs/data-model.md v1).
-- Library (areas, exercises, exercise_areas, exercise_variants), profiles, area_targets,
-- sessions, session_sets, the D-0015 set-upsert guard, session_sets_live, write-once and
-- server-set triggers, RLS. Decisions: D-0015, D-0017, D-0020, D-0021, D-0029, D-0030.
-- Part [b] (routines, routine_items, plan_checkins, analytics) is T-0100b.

-- ---------------------------------------------------------------------------------------------
-- Private schema for trigger functions (not exposed through PostgREST, D-0030).
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Library (D-0021, D-0029): readable by anon and authenticated, written only by postgres.
-- ---------------------------------------------------------------------------------------------
create table public.areas (
  id         text primary key,
  sort_order smallint not null unique
);

insert into public.areas (id, sort_order) values
  ('chest', 1), ('back', 2), ('shoulders', 3), ('arms', 4), ('core', 5),
  ('glutes', 6), ('quads', 7), ('hamstrings', 8), ('calves', 9);

create table public.exercises (
  id           text primary key,
  name         text not null,
  type         text not null check (type in ('compound', 'isolation')),
  level        text not null check (level in ('beginner', 'intermediate', 'advanced')),
  equipment    text[] not null default '{}',
  instructions text[] not null,
  mistakes     text[] not null default '{}',
  cue          text,
  timed        boolean not null default false,
  source       text not null,
  license      text not null,
  attribution  text,
  source_url   text
);

create table public.exercise_areas (
  exercise_id text not null references public.exercises (id) on delete cascade,
  area_id     text not null references public.areas (id),
  weight      numeric(2, 1) not null check (weight in (1.0, 0.5)),
  primary key (exercise_id, area_id)
);
create index exercise_areas_area_id_idx on public.exercise_areas (area_id);

create table public.exercise_variants (
  exercise_id text not null references public.exercises (id) on delete cascade,
  variant_id  text not null references public.exercises (id) on delete cascade,
  primary key (exercise_id, variant_id),
  constraint exercise_variants_not_self check (exercise_id <> variant_id)
);
create index exercise_variants_variant_id_idx on public.exercise_variants (variant_id);

-- ---------------------------------------------------------------------------------------------
-- profiles (D-0014, D-0018, D-0020, D-0021, NFR-AN-2)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal                 text not null check (goal in ('build_muscle', 'get_stronger', 'general_fitness')),
  level                text not null check (level in ('beginner', 'intermediate', 'advanced')),
  rhythm_min           smallint not null,
  rhythm_max           smallint not null,
  equipment            text[] not null default '{}',
  priority_areas       text[] not null default '{}',
  onboarded_at         timestamptz not null default now(),
  onboarding_timing_ms integer check (onboarding_timing_ms >= 0),
  plan_changed_at      timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_rhythm_range check (
    rhythm_min between 1 and 7 and rhythm_max between 1 and 7 and rhythm_min <= rhythm_max
  ),
  -- At most 3 distinct valid area ids (UF-11.3 "Pick up to 3"). The 9 area ids are fixed (D-0021).
  constraint profiles_priority_areas_valid check (
    cardinality(priority_areas) <= 3
    and priority_areas <@ array['chest','back','shoulders','arms','core','glutes','quads','hamstrings','calves']::text[]
    and (cardinality(priority_areas) < 2 or priority_areas[1] <> priority_areas[2])
    and (cardinality(priority_areas) < 3
         or (priority_areas[1] <> priority_areas[3] and priority_areas[2] <> priority_areas[3]))
  )
);

-- Write-once onboarding fields and server-set plan_changed_at / updated_at (D-0020).
create function private.profiles_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.plan_changed_at := now();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- onboarded_at is not null, so it never changes after insert.
  new.onboarded_at := old.onboarded_at;
  if old.onboarding_timing_ms is not null then
    new.onboarding_timing_ms := old.onboarding_timing_ms;
  end if;

  if (new.goal, new.rhythm_min, new.rhythm_max, new.priority_areas)
     is distinct from (old.goal, old.rhythm_min, old.rhythm_max, old.priority_areas) then
    new.plan_changed_at := now();
  else
    new.plan_changed_at := old.plan_changed_at;
  end if;

  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function private.profiles_before_write();

-- ---------------------------------------------------------------------------------------------
-- area_targets (D-0020, D-0021)
-- ---------------------------------------------------------------------------------------------
create table public.area_targets (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id      text not null references public.areas (id),
  sets_per_14d smallint not null check (sets_per_14d > 0),
  source       text not null default 'default' check (source in ('default', 'adapted', 'manual')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, area_id)
);

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger area_targets_set_updated_at
  before insert or update on public.area_targets
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- sessions (D-0017, D-0020): id may be generated on the device.
-- ---------------------------------------------------------------------------------------------
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  time_budget_min smallint not null check (time_budget_min between 1 and 480),
  energy          text not null default 'normal' check (energy in ('low', 'normal', 'high')),
  location        text check (char_length(location) <= 32),
  effort_rating   smallint check (effort_rating between 1 and 5),
  created_at      timestamptz not null default now(),
  constraint sessions_id_user_id_key unique (id, user_id),
  constraint sessions_ended_after_started check (ended_at is null or ended_at >= started_at)
);
create index sessions_user_id_started_at_idx on public.sessions (user_id, started_at);

-- ---------------------------------------------------------------------------------------------
-- session_sets (D-0015, D-0017, D-0020, D-0021)
-- ---------------------------------------------------------------------------------------------
create table public.session_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id    uuid not null,
  session_id   uuid not null,
  exercise_id  text not null references public.exercises (id),
  set_index    smallint not null check (set_index >= 0),
  kind         text not null default 'reps' check (kind in ('reps', 'timed')),
  reps         smallint check (reps >= 0),
  weight_kg    numeric(6, 2) check (weight_kg >= 0),
  duration_s   integer check (duration_s > 0),
  rir          smallint check (rir between 0 and 5),
  is_warmup    boolean not null default false,
  completed_at timestamptz not null,
  edited_at    timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint session_sets_user_id_client_id_key unique (user_id, client_id),
  constraint session_sets_session_fk foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete cascade,
  constraint session_sets_kind_shape check (
    (kind <> 'reps' or reps is not null) and (kind <> 'timed' or duration_s is not null)
  )
);
create index session_sets_user_id_completed_at_idx on public.session_sets (user_id, completed_at);
create index session_sets_session_id_idx on public.session_sets (session_id);
create index session_sets_exercise_id_idx on public.session_sets (exercise_id);

-- D-0015 upsert guard: an equal or older edit is a no-op; completed_at is immutable.
create function private.session_sets_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.edited_at <= old.edited_at then
    return null;
  end if;
  new.id := old.id;
  new.completed_at := old.completed_at;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger session_sets_before_update
  before update on public.session_sets
  for each row execute function private.session_sets_before_update();

create view public.session_sets_live
  with (security_invoker = true)
  as select * from public.session_sets where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------------------------
-- Library: select only (D-0021).
revoke insert, update, delete, truncate, references, trigger
  on public.areas, public.exercises, public.exercise_areas, public.exercise_variants
  from anon, authenticated;
grant select
  on public.areas, public.exercises, public.exercise_areas, public.exercise_variants
  to anon, authenticated;

alter table public.areas enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_areas enable row level security;
alter table public.exercise_variants enable row level security;

create policy areas_select on public.areas for select to anon, authenticated using (true);
create policy exercises_select on public.exercises for select to anon, authenticated using (true);
create policy exercise_areas_select on public.exercise_areas for select to anon, authenticated using (true);
create policy exercise_variants_select on public.exercise_variants for select to anon, authenticated using (true);

-- User-owned tables: authenticated owner only (D-0020, NFR-PRIV-3). anon has no privileges.
revoke all on public.profiles, public.area_targets, public.sessions, public.session_sets,
  public.session_sets_live from anon;
revoke truncate, references, trigger on public.profiles, public.area_targets, public.sessions,
  public.session_sets from authenticated;
grant select, insert, update, delete
  on public.profiles, public.area_targets, public.sessions, public.session_sets to authenticated;
grant select on public.session_sets_live to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.session_sets_live from authenticated;

alter table public.profiles enable row level security;
alter table public.area_targets enable row level security;
alter table public.sessions enable row level security;
alter table public.session_sets enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy area_targets_select on public.area_targets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy area_targets_insert on public.area_targets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy area_targets_update on public.area_targets for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy area_targets_delete on public.area_targets for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy sessions_select on public.sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy sessions_insert on public.sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy sessions_update on public.sessions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_delete on public.sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy session_sets_select on public.session_sets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy session_sets_insert on public.session_sets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy session_sets_update on public.session_sets for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy session_sets_delete on public.session_sets for delete to authenticated
  using ((select auth.uid()) = user_id);
