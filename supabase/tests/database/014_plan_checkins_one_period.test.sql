-- T-0223 AC-1, AC-2: one-period check-ins (UF-11.1, D-0070 §6, D-0094). Period 0 can propose and
-- completed_prev is null when there is no earlier period. A onboarded 2026-09-20T08:00Z, rhythm 3-4.
begin;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local');
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max, onboarded_at) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4, '2026-09-20T08:00Z');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- AC-1 --------------------------------------------------------------------------------------------
-- Zero history (R9-E8): period 0 (2026-09-20 to 10-03), 0 sessions, shown 2026-10-04.
select lives_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (0, null, 0, 3, 4, 2, 3, '2026-10-04T07:00Z')$$, 'the period-0 one-period proposal is stored');
select results_eq($$select period_index, completed_prev, completed_last from public.plan_checkins
  where period_index = 0$$,
  $$values (0, null::integer, 0)$$, 'the period-0 row reads back as (0, null, 0)');
-- Back after 10 days off (R9-E2): period 3 (2026-11-01 to 11-14), 2 sessions, shown 2026-11-15.
select lives_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (3, null, 2, 3, 4, 2, 3, '2026-11-15T07:00Z')$$, 'the period-3 one-period proposal is stored');
select results_eq($$select period_index, completed_prev, completed_last from public.plan_checkins
  where period_index = 3$$,
  $$values (3, null::integer, 2)$$, 'the period-3 row reads back as (3, null, 2)');

-- AC-2 --------------------------------------------------------------------------------------------
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (0, null, 0, 3, 4, 2, 3, '2026-10-04T07:05Z')$$, '23505', null,
  'a second row for (A, 0) gives 23505 (second device)');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (-1, null, 0, 3, 4, 2, 3, '2026-10-04T07:00Z')$$, '23514', null, 'period_index -1 gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (null, null, 0, 3, 4, 2, 3, '2026-10-04T07:00Z')$$, '23502', null, 'period_index null gives 23502');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (5, -1, 0, 3, 4, 2, 3, '2026-12-13T07:00Z')$$, '23514', null, 'completed_prev -1 gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (5, null, null, 3, 4, 2, 3, '2026-12-13T07:00Z')$$, '23502', null, 'completed_last null gives 23502');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at)
  values (5, null, 0, 3, 4, 2, 3, '2026-12-13T07:00Z', 'accepted', null)$$, '23514', null,
  'accepted without answered_at gives 23514 (plan_checkins_answer_pair)');
reset role;

select * from finish();
rollback;
