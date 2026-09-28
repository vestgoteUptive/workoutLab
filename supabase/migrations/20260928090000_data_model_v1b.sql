-- T-0100b: data model v1, part [b] (docs/data-model.md v1).
-- routines, routine_items (D-0021, UF-07.1, UF-08.3), plan_checkins (D-0018, D-0021, UF-11.1),
-- the private analytics schema (D-0021, NFR-AN-2), the engine v1 columns (D-0024, D-0026,
-- D-0027 via D-0035) and the one-dimensional priority_areas check (T-0100a accept follow-up).
-- Forward-only: part [a] is 20260927210000_data_model_v1a.sql.

-- ---------------------------------------------------------------------------------------------
-- Engine v1 columns on part [a] tables (D-0024, D-0026, D-0035)
-- ---------------------------------------------------------------------------------------------
-- exercises: warm-up moves live in the library (D-0024); increment and default duration drive
-- pre-fill (D-0026). "Bodyweight" is stored as external_load = false (D-0035, NFR-PRIV-2 name guard).
alter table public.exercises
  add column kind               text not null default 'exercise'
    constraint exercises_kind_check check (kind in ('exercise', 'warmup')),
  add column increment_kg       numeric(4, 2) not null default 2.5
    constraint exercises_increment_kg_check check (increment_kg > 0),
  add column default_duration_s integer
    constraint exercises_default_duration_s_check check (default_duration_s > 0),
  add column external_load      boolean not null default true;

-- sessions: the UF-08.1 warm-up toggle (D-0004, D-0024) and the plan built at session start,
-- including the session-start deficits rule 8 trims by (D-0024). Shape owned by T-0102 (D-0035).
alter table public.sessions
  add column warmup_in_budget boolean not null default true,
  add column plan             jsonb
    constraint sessions_plan_is_object check (plan is null or jsonb_typeof(plan) = 'object');

-- session_sets: the High-energy back-off set on the main lift (D-0024). It is a hard set.
alter table public.session_sets
  add column backoff boolean not null default false,
  add constraint session_sets_backoff_not_warmup check (not (backoff and is_warmup));

-- The live view was created with `select *`, which Postgres expands at creation time.
-- Recreate it so it carries the new column (same definition and options, D-0015, D-0020).
create or replace view public.session_sets_live
  with (security_invoker = true)
  as select * from public.session_sets where deleted_at is null;

-- profiles: reject multi-dimensional priority_areas (T-0100a accept follow-up). An empty array
-- has array_ndims null, so it stays valid.
alter table public.profiles drop constraint profiles_priority_areas_valid;
alter table public.profiles add constraint profiles_priority_areas_valid check (
  (array_ndims(priority_areas) is null or array_ndims(priority_areas) = 1)
  and cardinality(priority_areas) <= 3
  and priority_areas <@ array['chest','back','shoulders','arms','core','glutes','quads','hamstrings','calves']::text[]
  and (cardinality(priority_areas) < 2 or priority_areas[1] <> priority_areas[2])
  and (cardinality(priority_areas) < 3
       or (priority_areas[1] <> priority_areas[3] and priority_areas[2] <> priority_areas[3]))
);

-- ---------------------------------------------------------------------------------------------
-- routines, routine_items (D-0021, UF-07.1, UF-08.3)
-- ---------------------------------------------------------------------------------------------
create table public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routines_id_user_id_key unique (id, user_id)
);
create index routines_user_id_idx on public.routines (user_id);

create function private.routines_before_write() returns trigger
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
  new.updated_at := now();
  return new;
end;
$$;

create trigger routines_before_write
  before insert or update on public.routines
  for each row execute function private.routines_before_write();

create table public.routine_items (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    smallint not null check (position >= 0),
  exercise_id text not null references public.exercises (id),
  sets        smallint not null check (sets >= 1),
  reps_min    smallint check (reps_min >= 1),
  reps_max    smallint check (reps_max >= 1),
  duration_s  integer check (duration_s > 0),
  progression text not null default 'double_progression'
    check (progression in ('none', 'double_progression', 'linear_load')),
  constraint routine_items_routine_fk foreign key (routine_id, user_id)
    references public.routines (id, user_id) on delete cascade,
  constraint routine_items_routine_id_position_key unique (routine_id, position),
  constraint routine_items_reps_range check (reps_min is null or reps_max is null or reps_min <= reps_max)
);
create index routine_items_user_id_idx on public.routine_items (user_id);
create index routine_items_exercise_id_idx on public.routine_items (exercise_id);

-- ---------------------------------------------------------------------------------------------
-- plan_checkins (D-0018, D-0021, UF-11.1)
-- ---------------------------------------------------------------------------------------------
create table public.plan_checkins (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_index      integer not null check (period_index >= 1),
  completed_prev    integer not null check (completed_prev >= 0),
  completed_last    integer not null check (completed_last >= 0),
  rhythm_min_before smallint not null,
  rhythm_max_before smallint not null,
  proposed_min      smallint not null,
  proposed_max      smallint not null,
  proposed_at       timestamptz not null,
  answer            text check (answer in ('accepted', 'kept', 'withdrawn')),
  answered_at       timestamptz,
  constraint plan_checkins_user_id_period_index_key unique (user_id, period_index),
  constraint plan_checkins_rhythm_before_range check (
    rhythm_min_before between 1 and 7 and rhythm_max_before between 1 and 7
    and rhythm_min_before <= rhythm_max_before
  ),
  constraint plan_checkins_proposed_range check (
    proposed_min between 1 and 7 and proposed_max between 1 and 7 and proposed_min <= proposed_max
  ),
  constraint plan_checkins_answer_pair check ((answer is null) = (answered_at is null))
);

-- ---------------------------------------------------------------------------------------------
-- Privileges and RLS for part [b] (D-0020, D-0030, NFR-PRIV-3)
-- ---------------------------------------------------------------------------------------------
revoke all on public.routines, public.routine_items, public.plan_checkins from anon;
revoke truncate, references, trigger on public.routines, public.routine_items, public.plan_checkins
  from authenticated;
grant select, insert, update, delete
  on public.routines, public.routine_items, public.plan_checkins to authenticated;

alter table public.routines enable row level security;
alter table public.routine_items enable row level security;
alter table public.plan_checkins enable row level security;

create policy routines_select on public.routines for select to authenticated
  using ((select auth.uid()) = user_id);
create policy routines_insert on public.routines for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy routines_update on public.routines for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy routines_delete on public.routines for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy routine_items_select on public.routine_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy routine_items_insert on public.routine_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy routine_items_update on public.routine_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy routine_items_delete on public.routine_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy plan_checkins_select on public.plan_checkins for select to authenticated
  using ((select auth.uid()) = user_id);
create policy plan_checkins_insert on public.plan_checkins for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy plan_checkins_update on public.plan_checkins for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy plan_checkins_delete on public.plan_checkins for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- analytics (D-0021, NFR-AN-2): private metric views over all users, UTC dates.
-- No usage for anon/authenticated and not in PostgREST's exposed schemas. The views run with
-- the owner's rights (security_invoker = false) so they aggregate across users; only roles
-- with usage on the schema (postgres, service_role by explicit grant later) can read them.
-- ---------------------------------------------------------------------------------------------
create schema analytics;
revoke all on schema analytics from public, anon, authenticated;

-- Time to first plan: onboarding_timing_ms percentiles, nulls (returning users) excluded.
create view analytics.time_to_first_plan as
select
  count(p.onboarding_timing_ms)::integer                                        as profiles_timed,
  percentile_cont(0.5) within group (order by p.onboarding_timing_ms)            as p50,
  percentile_cont(0.9) within group (order by p.onboarding_timing_ms)            as p90
from public.profiles p
where p.onboarding_timing_ms is not null;

-- Finished within budget: ended sessions with >= 1 live hard set; within when
-- ended_at - started_at <= budget + 120 s (boundary included). ratio is null with no sessions.
create view analytics.finished_within_budget as
with finished as (
  select
    extract(epoch from (s.ended_at - s.started_at)) <= s.time_budget_min * 60 + 120 as within
  from public.sessions s
  where s.ended_at is not null
    and exists (
      select 1 from public.session_sets_live l
      where l.session_id = s.id and l.user_id = s.user_id and not l.is_warmup
    )
)
select
  count(*)::integer                                                        as sessions_finished,
  (count(*) filter (where within))::integer                                as sessions_within,
  round((count(*) filter (where within))::numeric / nullif(count(*), 0), 3) as ratio
from finished;

-- Check-ins answered: accepted or kept within 7 days of proposed_at, out of every row shown.
-- withdrawn counts as shown but not answered.
create view analytics.checkins_answered as
select
  count(*)::integer                                                      as checkins_shown,
  (count(*) filter (where c.answer in ('accepted', 'kept')
                      and c.answered_at <= c.proposed_at + interval '7 days'))::integer as checkins_answered,
  round((count(*) filter (where c.answer in ('accepted', 'kept')
                            and c.answered_at <= c.proposed_at + interval '7 days'))::numeric
        / nullif(count(*), 0), 3)                                        as ratio
from public.plan_checkins c;

-- Areas on target after 4 weeks: d0 = UTC onboarding date. Users whose day 28 has passed and
-- who have >= 4 completed sessions (>= 1 live hard set, D-0018) started in d0..d0+28. Load is
-- the weighted live hard sets completed in d0+15..d0+28 (14 UTC days). An area is on target
-- when load >= sets_per_14d. mean_share averages each user's on-target share.
create view analytics.areas_on_target_day28 as
with cohort as (
  select p.user_id, (p.onboarded_at at time zone 'UTC')::date as d0
  from public.profiles p
  where (p.onboarded_at at time zone 'UTC')::date + 28 <= (now() at time zone 'UTC')::date
),
eligible as (
  select c.user_id, c.d0
  from cohort c
  where (
    select count(*) from public.sessions s
    where s.user_id = c.user_id
      and (s.started_at at time zone 'UTC')::date between c.d0 and c.d0 + 28
      and exists (
        select 1 from public.session_sets_live l
        where l.session_id = s.id and l.user_id = s.user_id and not l.is_warmup
      )
  ) >= 4
),
area_load as (
  select e.user_id, ea.area_id, sum(ea.weight) as load
  from eligible e
  join public.session_sets_live l
    on l.user_id = e.user_id and not l.is_warmup
   and (l.completed_at at time zone 'UTC')::date between e.d0 + 15 and e.d0 + 28
  join public.exercise_areas ea on ea.exercise_id = l.exercise_id
  group by e.user_id, ea.area_id
),
shares as (
  select e.user_id,
         avg(case when coalesce(al.load, 0) >= t.sets_per_14d then 1.0 else 0.0 end) as share
  from eligible e
  join public.area_targets t on t.user_id = e.user_id
  left join area_load al on al.user_id = e.user_id and al.area_id = t.area_id
  group by e.user_id
)
select
  count(*)::integer            as users_included,
  round(avg(share), 3)         as mean_share
from shares;

revoke all on all tables in schema analytics from public, anon, authenticated;
