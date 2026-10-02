---
id: T-0304d
title: UF-09.8 Time check (rule 8 through the engine's timeCheck, the option saved as the whole item list) + UF-09.9 Paused (elapsed, left, sets, Skip to next, seams in v2 order) + End workout confirm in place → finish()
lane: web-feature:UF-09
screens: [UF-09.8, UF-09.9]
decisions: [D-0024, D-0040, D-0045, D-0047, D-0066, D-0071, D-0086, D-0091, D-0105, D-0111, D-0118, D-0120]
deps: [T-0304c]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (parent AC-D1–D6, and the UF-09.8/.9 part of D10). The parent's T-0304d row is split by D-0118 §1: the e2e that starts at UF-08.4 (D7–D10) moves to T-0304h. Build flow: wl-build-web. About ½ day, the upper end. -->

## Why
- **Principle 2:** the time budget is a first-class input. When the user falls behind, UF-09.8
  offers the engine's three answers (rule 8, D-0024): Continue, Trim, Skip next.
- **NFR-TIME-4:** the offer appears only between exercises, never mid-item.
- **Principle 3:** the engine picks what to cut, and the UI only saves its answer.
- **Principle 1:** everything that isn't the current step lives on UF-09.9 Paused (Resume, Skip to
  next, End, and the seams).
- **D-0071 §6:** End must leave the session row whole.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **The rule 8 check point.** A `resolveCheckPoint` that calls `timeCheck` once and keeps the
    result (D-0120 §3–§4). It is passed to the store by default, with T-0304e's overlay override
    kept.
  - **The UF-09.8 view:**
    - "{n} min behind";
    - "You planned to finish by {time}";
    - Continue / Trim / Skip next, each with "Done by {time}";
    - the write path for an applied option;
    - `PLAN_APPLIED` (D-0120 §1–§2).
  - **The UF-09.9 view:**
    - Elapsed, Left and Sets (D-0120 §6);
    - Resume, "Skip to next exercise" (`SKIP_ITEM`, `skippedItems`, D-0120 §7) and End workout;
    - `pauseSeamActions` through `orderActions`.
  - **The End confirm in place** → `finish()` (D-0120 §8).
  - **Restore rules.** `persist.ts` adds the D-0120 §5 rule and `skippedItems` validation. The
    T-0304e `close()` re-sync treats skipped items as complete.
  - **Props.** `SessionHost` gains `timeZone?: string` (D-0120 §2). `formatTime` takes a string
    `locale`, so when the `locale` prop is absent the host resolves the runtime default with
    `Intl.DateTimeFormat().resolvedOptions().locale` before calling it.
  - **Strings and e2e.** Strings go in `flows/uf-09.ts`. e2e rows are appended to
    `tests/e2e/uf-09-focus.spec.ts`, and the T-0304a row's UF-09.9 button count is updated.
- Out:
  - The UF-08.4-started e2e (T-0304h).
  - The browser Back button in a running state (it pauses to UF-09.9): T-0394, D-0123.
  - Swap, How to and List view (T-0306b, T-0305a). Their seam positions are tested with injected
    entries.
  - The UF-03.3 summary (T-0305b).
  - Calling `/sessions/{id}/finish` (D-0071 §8).
  - Edits to `lib/offline/**`, `lib/format/**`, `en.ts`, `components/**`, `tests/e2e/fixtures/**`
    and the shell tests.
  - Any engine change.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** an applied option is written to IndexedDB through `upsertSession`, with no network
  (AC-3, AC-10).
- **Time running out:**
  - only between exercises, only when behind (AC-2);
  - Trim / Skip next saved as the new plan (AC-3);
  - a plan with nothing left finishes (AC-3).
- **Clock skew:** `now < started_at`, or a throwing `timeCheck`, never blocks (AC-4).
- **Zero history:** rule 8 reads only `plan` and `budgetMin`. A zero-history plan (null weights)
  checks the same way (AC-1).
- **Returning after 10 days off:** a restored time check re-runs the check once, for the current
  time (AC-5).
- **Reload / kill:** a time check past the end restores as `done` (AC-5).

## Acceptance criteria
**Test setup.**
- As T-0304b, with `timeZone="UTC"` and `locale="en-GB"`.
- **P1-R8** = P1 with the R8 fixture items, copied with their `area_deficit` reasons from the
  engine's rule 8 fixture:
  - bench-press × 4 main (`costS` 720);
  - barbell-row × 3 (555);
  - leg-curl × 3 (375);
  - lateral-raise × 3 (375);
  - `startDeficits` chest .8, back .6, hamstrings .9, shoulders .5.
- The builder adds `lateral-raise` ("Lateral raise", isolation) to the test library.
- `timeCheck` is the **real** engine function, wrapped in a spy (`vi.spyOn` on the module
  namespace, or an injected resolver dependency).
- `upsertSession` is a spy that wraps the real one.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms.
  - **AC-2 and AC-3 must fail on unfixed code.** The build log records the planted faults turning
    them red:
    - the check run on every `REST_END` (not only at `betweenItems`);
    - `items: [...doneItems, ...option.items]` (the parent's old wording, which repeats the done
      items).

- **AC-1 (R8-E1 through the engine, parent AC-D1, D-0120 §2 §4)** At the check point after item 0,
  with `now` = `started_at` + 1500 s and no pauses:
  - **The call.** `timeCheck` is called exactly once, with `(workout, {elapsedS: 1500,
    nextItemIndex: 1})`. `workout.plan` deep-equals the row's plan, and `budgetMin` is 45.
  - **The text.** UF-09.8 shows:
    - "2 min behind";
    - "You planned to finish by 10:45";
    - Continue, with "Done by 10:46" (1500 + 1305 = 2805 s);
    - Trim, with "Lateral raise 3 → 2 sets" and "Done by 10:45";
    - Skip next, with "Skip Barbell row" and "Done by 10:37".
  - **Pause.** Pause and Resume on UF-09.8 make no second call.
  - **Focus** lands on Continue.
  - **Button pin.** The T-0304a AC-7 count for `timeCheck` becomes 4 (Pause, Continue, Trim, Skip
    next).
- **AC-2 (only between exercises, only when behind, NFR-TIME-4, parent AC-D2)**
  - **Not behind.** With elapsed 1454 (R8-E3, `behindS` 59), there is no UF-09.8, and the screen is
    UF-09.6 barbell-row. `timeCheck` was called once, and it returned `show: false`.
  - **The pair.** With elapsed 1500, UF-09.8 shows (AC-1).
  - **Never mid-item.** Over a full walk of item 0 (getReady, warm-up, 4 × set/confirm/rest),
    `timeCheck` has 0 calls before the item's last `REST_END`.
  - **Never after the last item.** It has 0 calls after the last item, which goes to `done`.
  - **Overlay.** With a `keepsClockRunning: true` overlay open, there are 0 calls (the T-0304e AC-9
    override still holds).
- **AC-3 (apply an option, D-0120 §1, D-0071 §6, parent AC-D3)**
  - **Trim.**
    - `upsertSession` is called once with `{...row, plan: {...row.plan, items: result.trim.items}}`.
      `row` is the stored row: `started_at`, `time_budget_min`, `energy`, `warmup_in_budget` and
      `ended_at` are deep-equal to before.
    - The new plan has 4 items, and lateral-raise has `sets` 2.
    - After the write resolves, the screen is UF-09.6 barbell-row, and `useFocusSession().plan`
      equals the new plan.
  - **Skip next.** `items` = `result.skipNext.items` (3 items, no barbell-row), and the screen is
    UF-09.6 leg-curl.
  - **Continue.** There is no `upsertSession` call, and the screen is UF-09.6 barbell-row.
  - **Pending.** While the write is held, the three options have `aria-disabled="true"`, and a
    second click makes no second call.
  - **Rejection.** "Couldn't save the new plan. Try again." (polite), and the screen stays UF-09.8.
    Continue still works.
  - **Nothing left.** With an option whose `items.length` equals the current `itemIndex`, after the
    write the machine goes to `done` and `finish()` runs.
  - **Trim hidden.** With a synthetic plan where the not-started items are only a main lift,
    `trim.items` deep-equals `plan.items`, and there is no Trim button. The pair is AC-1.
  - **`minutesBehind`** renders only when `show` is true.
- **AC-4 (elapsed, clock skew, a throwing check, D-0120 §3, parent AC-D4)**
  - **Elapsed.** With a 120 s pause and `warmupInBudget` false with 160 s in the warm-up, at `now`
    = `started_at` + 1780 s, the `elapsedS` passed is 1500. The pair, warm-up in budget, is 1660.
  - **Planned finish.** With that pause and the off-budget warm-up, "You planned to finish by" reads
    `started_at` + 45 min + 120 s + 160 s = "10:49".
  - **Sub-second `now` (D-0066 §11's floor).** With `now` = `started_at` + 1500.4 s (no pauses),
    the `elapsedS` passed is the integer 1500, `timeCheck` doesn't throw, and UF-09.8 shows. This
    pins the `floor`: without it, `timeCheck` throws a `RangeError` on a non-integer, D-0120 §3
    resolves to `"next"`, and UF-09.8 would silently never show. The planted fault (no floor) turns
    this red, and the build log records it.
  - **Clock skew.** With `now` = `started_at` − 60 s at the check point, `elapsedS` passed is 0, and
    the screen is UF-09.6 if not behind.
  - **Throwing check.** With `timeCheck` mocked to throw a `RangeError`, the screen is UF-09.6,
    with no uncaught error and no `role="alert"`.
- **AC-5 (restore, D-0120 §4–§5)**
  - **Re-run.** Remounting in `timeCheck` (AC-1's state) 30 s later makes exactly one fresh call,
    with `{elapsedS: 1530, nextItemIndex: 1}`. While still behind, it shows UF-09.8.
  - **No longer behind.** A remount where the fresh result has `show: false` (a mocked
    `timeCheck`) dispatches `CONTINUE`, which gives UF-09.6.
  - **Past the end.** A stored `timeCheck` with `itemIndex` equal to `plan.items.length` restores to
    `done`, which finishes.
  - **The pair.** `itemIndex` = `plan.items.length + 1` is rejected and starts fresh (the D-0111 §7
    range rule).
- **AC-6 (UF-09.9 Paused, parent AC-D5, D-0120 §6)**
  - **Content.** `PAUSE` from UF-09.5 at elapsed 23:10, with 6 sets logged, shows:
    - "Paused";
    - "Elapsed 23:10";
    - "Left 22 min" (1310 s → 22);
    - "Sets 6 / 12" (P1: 4 + 3 + 3 + 2).
  - **Back-off counts.** With a bench-press back-off, the planned count is 13 (D-0105).
  - **Timers stop.** The rest remaining is unchanged after 60 s of fake time.
  - **Over budget.** Elapsed above the budget shows "Left 0 min".
  - **Actions.** Resume (primary, focused), "Skip to next exercise", "End workout".
  - **Seams.** With injected `swap`, `how-to` and `list-view` entries, the order is Resume · Swap ·
    Skip to next exercise · How to · List view · End workout. With the module arrays there is no
    Swap, How to or List view button.
  - **No way out.** There is no `a[href]` (principle 1, D-0071 §4).
  - **Button pin.** The T-0304a AC-7 count for `paused` becomes 3, or 2 when Skip is hidden.
- **AC-7 (Skip to next exercise, D-0120 §7)**
  - **From a rest.** Paused in the rest after bench-press set 2, Skip gives `skippedItems` [0], then
    the check point. `timeCheck` is called once with `nextItemIndex: 1`, and the screen is UF-09.6
    barbell-row, or UF-09.8 when behind. `loggedSets` still has 2 entries, and there is no
    `upsertSession` call.
  - **From the warm-up.** Paused in the warm-up, Skip gives UF-09.6 for item 0, with 0 `timeCheck`
    calls and `warmupSpentMs` recorded.
  - **From UF-09.6 of item 1.** Paused there, Skip marks item 1 skipped and checks for item 2.
  - **From confirm.** The recorded set stands, and there is 0 `editSet`.
  - **Hidden.** There is no Skip button when the current item is the last one, and none in a pause
    taken on UF-09.8.
  - **Re-sync.** After a skip of item 0 with 2 of 4 sets logged, T-0304e's `close()` from a
    `keepsClockRunning: true` overlay lands on item 1, not item 0.
  - **Old stored states.** A stored state with no `skippedItems` restores as `[]`. One with
    `skippedItems: [9]` on a 4-item plan is rejected.
- **AC-8 (End workout, parent AC-D6, D-0120 §8)**
  - **The confirm.** "End workout" replaces the actions with "End workout? Your sets are saved." and
    the buttons "End workout" and "Cancel". It is still the one `[data-screen-id="UF-09.9"]`, and
    focus is on Cancel.
  - **Cancel** returns to the actions, with focus on Resume.
  - **End.** "End workout" calls `useFocusSession().finish()` once. That is `upsertSession({...row,
    ended_at: now})`, then `wl-focus:S1` is removed, then the location is `/session/S1/summary`
    (`findBy` `[data-screen-id="UF-03.3"]`).
  - **Rejection.** A rejected finish shows "Couldn't end the workout. Try again." (polite), and the
    screen stays UF-09.9.
  - **`done`** finishes with no confirm (T-0304e AC-6 still green).
- **AC-9 (the persistence walk, the T-0304a QA follow-up)** T-0304a AC-3's "written before
  `dispatch` returns" walk gains these, each asserted right after `dispatch`:
  - `SKIP_WARMUP`;
  - `CHECK_RESOLVED → timeCheck`;
  - `CONTINUE`;
  - `PLAN_APPLIED`;
  - `SKIP_ITEM`;
  - and T-0304b–c's `AUTOSAVE_CANCEL`, `TIMER_PAUSE` and `TIMER_RESUME`.
- **AC-10 (e2e: time check, pause and end, D-0120 §9, D-0086, D-0091 §1)** Rows are appended to
  `tests/e2e/uf-09-focus.spec.ts`. They use the spec's `seedSessionRow`, extended in the spec with a
  `startedAt` argument. The seed is the P1-R8 items, `warmup` `[]`, and `started_at` = now − 1500 s.
  - **Clock.** Prefer `page.clock` (installed before the first `goto`), so that `elapsedS` at the
    check is fixed. With real time, a slow run grows `behindS`, and Trim can cut more sets than the
    assert expects. With real time, the plan assert must be computed from the shown option, not
    pinned.
  - **Keyboard only** (Tab / Enter / Space):
    - Skip warm-up is absent, so UF-09.1 → bench-press × 4 (Done set, Save, Skip rest) → UF-09.8;
    - UF-09.8 shows "min behind" and Trim;
    - Trim → UF-09.6.
    - The IndexedDB `wl-offline.sessions` row's plan has lateral-raise at 2 sets.
  - **Pause.** "Pause workout" → UF-09.9, with "Skip to next exercise" and "End workout". End
    workout → confirm → End workout → `[data-screen-id="UF-03.3"]`. The IndexedDB row has `ended_at`
    set, and `started_at` is unchanged.
  - **a11y.** axe on UF-09.8 and UF-09.9 reports 0 serious or critical violations.
  - **Focus.** It lands on Continue (UF-09.8) and on Resume (UF-09.9) (`toBeFocused`).
  - **Updated pin.** The T-0304a row "AC-7 the chrome on a seeded session" changes its UF-09.9
    button count to the real view's: 2 for its one-item plan (Resume, End workout). The build log
    notes the edit.
  - **Requests.** The guard reports no unclaimed request.
- **AC-11 (strings, exports, lint)**
  - **Strings.** Every new string comes from `en.uf09`, and plurals ("1 min" / "2 min", "1 set" /
    "2 sets") live in its keys. `react/jsx-no-literals` and the D-0071 §9 bans are green.
  - **Exports.** The export pin is unchanged.
  - **No tick counting.** The T-0304a AC-2 source test still passes.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows, add a `startedAt` argument to the in-spec `seedSessionRow`, and update the UF-09.9 button count in the T-0304a row (D-0071 §10, D-0118 §12).
  - `docs/tickets/T-0304d-time-check-pause-end.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (`offlineDb`, `upsertSession` through `useFocusSession()` and the time-check write), `lib/format` (`formatTime`), `lib/i18n/en.ts`, `@workoutlab/engine` (`timeCheck`, `availableS`), and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. `timeCheck` is called unchanged (`docs/engine-rules.md` rule 8). The new plan is written as
`SessionPlan` v1 through the queue, as a whole row (D-0071 §6). `skippedItems` and `PLAN_APPLIED`
are device-local focus state (D-0120 §1 §7).

## NFRs owned
TIME-2 (AC-4), TIME-4 (AC-2), A11Y-6 for UF-09.8/.9 (AC-10), OFF-2 plan-write part (AC-3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo`
and `check:size` green · contracts unchanged · commits start `T-0304d` and cite the screen (for
example `T-0304d UF-09.8: Trim saves the engine's item list`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** It needs T-0304c (the lane order, D-0118 §1). It doesn't need T-0303d or T-0304g, so if
  T-0303d is late it can run before T-0304g.
- **After this ticket,** T-0306b (Swap) and T-0305a (How to, List view) can add their seam entries.
  Their board deps are unchanged.
- **Back.** The browser Back button in a running state goes to Pause (UF-09.9) through a same-URL
  history guard. That is T-0394 (D-0123, deps T-0304d and T-0303d), not this ticket.
- **Parallel.** It is parallel-safe by files with every UF-08 ticket.

- **From T-0304e review (2026-10-02):** `store.replacePlan(plan, itemIndex)` dispatches PLAN_REPLACED, which returns the same state from `timeCheck` and when itemIndex is past the new end. The time-check apply ("Nothing left → done", and the move to UF-09.6) needs its own reducer event or a broader replacePlan. Also: `ctx.resume()` is handed to `keepsClockRunning: false` overlays; hide or document it when wiring UF-09.9's seams.
