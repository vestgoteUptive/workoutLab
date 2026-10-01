-- T-0223 (UF-11.1): one-period check-ins (D-0061 §2, D-0070 §6, D-0094). Rule 9 now proposes after
-- one ended 14-day period, so period 0 (the first period after onboarding) can carry a proposal,
-- and a one-period evaluation has no earlier period to put in completed_prev.
-- Forward-only: 20260928090000_data_model_v1b.sql is not edited. The default constraint names
-- from that migration are kept.
alter table public.plan_checkins drop constraint plan_checkins_period_index_check;
alter table public.plan_checkins
  add constraint plan_checkins_period_index_check check (period_index >= 0);

-- plan_checkins_completed_prev_check (completed_prev >= 0) stays: a null passes it.
alter table public.plan_checkins alter column completed_prev drop not null;
