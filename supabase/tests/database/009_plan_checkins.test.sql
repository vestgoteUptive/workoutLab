-- T-0100b AC27 plan_checkins lifecycle (D-0018, D-0021, UF-11.1). A onboarded 2026-08-02, rhythm 3-4.
begin;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local');
insert into public.profiles (user_id, goal, level, rhythm_min, rhythm_max, onboarded_at) values
  ('00000000-0000-0000-0000-00000000000a', 'build_muscle', 'beginner', 3, 4, '2026-08-02T09:00Z');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

select lives_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at)
  values (3, 4, 3, 3, 4, 2, 3, '2026-09-27T07:00Z', null, null)$$, 'the shown proposal is stored');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (3, 4, 3, 3, 4, 2, 3, '2026-09-27T07:02Z')$$, '23505', null, 'a second row for (A, 3) gives 23505');
select lives_ok($$update public.plan_checkins set answer = 'accepted', answered_at = '2026-09-27T07:01Z'
  where period_index = 3$$, 'A accepts');
select results_eq($$select answer, answered_at from public.plan_checkins where period_index = 3$$,
  $$values ('accepted'::text, '2026-09-27T07:01Z'::timestamptz)$$, 'the answer is stored');

select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at)
  values (4, 4, 3, 3, 4, 2, 3, '2026-10-11T07:00Z', 'accepted', null)$$, '23514', null, 'accepted without answered_at gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at)
  values (4, 4, 3, 3, 4, 2, 3, '2026-10-11T07:00Z', null, '2026-10-11T07:01Z')$$, '23514', null, 'answered_at without answer gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (4, 4, 3, 3, 4, 0, 1, '2026-10-11T07:00Z')$$, '23514', null, 'proposed 0-1 gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (4, 4, 3, 3, 4, 3, 2, '2026-10-11T07:00Z')$$, '23514', null, 'proposed 3-2 gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at, answer, answered_at)
  values (4, 4, 3, 3, 4, 2, 3, '2026-10-11T07:00Z', 'maybe', '2026-10-11T07:01Z')$$, '23514', null, 'answer maybe gives 23514');
select throws_ok($$insert into public.plan_checkins (period_index, completed_prev, completed_last,
    rhythm_min_before, rhythm_max_before, proposed_min, proposed_max, proposed_at)
  values (-1, 4, 3, 3, 4, 2, 3, '2026-10-11T07:00Z')$$, '23514', null, 'period_index -1 gives 23514');
reset role;

select * from finish();
rollback;
