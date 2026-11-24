-- T-1001 (UF-11.4, UF-08.2, D-0281, D-0277, D-0020, D-0015): learn-from-edits counts that sync
-- through the account. One row per (user, device, key): a device writes only its own rows as
-- absolute upserts and the total is the sum on read, so a replay never counts twice.
-- Forward-only, additive: no existing row changes. The exercise FKs cascade (a count is a hint,
-- not history), and so does the user FK (NFR-PRIV-5).

create table public.edit_signals (
  id             uuid not null default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id      uuid not null,
  key            text not null,
  kind           text not null,
  exercise_id    text not null references public.exercises (id) on delete cascade,
  to_exercise_id text references public.exercises (id) on delete cascade,
  count          integer not null default 0,
  window_start   timestamptz not null,
  last_seen      timestamptz not null,
  asked_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint edit_signals_pkey primary key (id),
  constraint edit_signals_user_device_key_unique unique (user_id, device_id, key),
  constraint edit_signals_kind_valid check (kind in ('swap', 'removal')),
  constraint edit_signals_kind_to_exercise check ((kind = 'swap') = (to_exercise_id is not null)),
  constraint edit_signals_swap_ids_differ check (to_exercise_id is null or to_exercise_id <> exercise_id),
  constraint edit_signals_key_matches check (
    key = case kind
      when 'swap' then 'swap:' || exercise_id || ':' || coalesce(to_exercise_id, '')
      else 'removal:' || exercise_id
    end
  ),
  constraint edit_signals_count_range check (count between 0 and 999),
  constraint edit_signals_count_or_asked check (count >= 1 or asked_at is not null),
  constraint edit_signals_window_order check (last_seen >= window_start)
);
create index edit_signals_exercise_id_idx on public.edit_signals (exercise_id);
create index edit_signals_to_exercise_id_idx on public.edit_signals (to_exercise_id);

create function private.edit_signals_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

create trigger edit_signals_before_write
  before insert or update on public.edit_signals
  for each row execute function private.edit_signals_before_write();

revoke all on public.edit_signals from anon;
revoke truncate, references, trigger on public.edit_signals from authenticated;
grant select, insert, update, delete on public.edit_signals to authenticated;

alter table public.edit_signals enable row level security;

create policy edit_signals_select on public.edit_signals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy edit_signals_insert on public.edit_signals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy edit_signals_update on public.edit_signals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy edit_signals_delete on public.edit_signals for delete to authenticated
  using ((select auth.uid()) = user_id);

-- profiles: the opt-out and the reset epoch (D-0281 §4). Client-writable, neither moves
-- plan_changed_at. Existing rows get true and null.
alter table public.profiles
  add column learn_from_edits boolean not null default true,
  add column learn_reset_at timestamptz;

create or replace function private.profiles_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.plan_changed_at := now();
    new.learn_reset_at := null;
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

  -- D-0281 §4: the epoch is the server's. It moves when the flag changes or a client writes it.
  if new.learn_from_edits is distinct from old.learn_from_edits
     or new.learn_reset_at is distinct from old.learn_reset_at then
    new.learn_reset_at := now();
  end if;

  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
