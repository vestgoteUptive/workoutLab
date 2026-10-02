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

## Build log
- **2026-10-02, frontend-dev (build).** Every AC has tests in `apps/web/src/features/UF-09/__tests__/`:
  - AC-1 to AC-5: `time-check.test.tsx` (27). It runs the REAL engine `timeCheck` wrapped in a spy
    (`vi.mock("@workoutlab/engine")` through `r8-mock.ts`) and `upsertSession` as a spy over the
    real one. P1-R8 is in `r8-fixtures.ts` (lateral-raise added to the test library).
  - AC-2's store-level walks ("never mid-item", "never after the last item") use
    `createFocusStore` with the production `ruleEightCheckPoint`.
  - AC-6 to AC-8: `paused.test.tsx` (23), plus `resume()` from a `keepsClockRunning: false`
    overlay (the T-0304e review note).
  - Pure reducer and persist rules: `machine.t0304d.test.ts` (18). Covers `PLAN_APPLIED` (also
    paused on UF-09.8), `SKIP_ITEM` and its no-ops, `CHECK_RESOLVED` past the last item, the
    D-0120 §5 range rule, `skippedItems` validation and `canSkipItem` in the warm-up.
  - AC-9: `store.test.ts` "T-0304d AC-9". The walk asserts storage = `getState()` right after
    each of `SKIP_WARMUP`, `AUTOSAVE_CANCEL`, `SKIP_ITEM` (→ `CHECK_RESOLVED` → `timeCheck`),
    `CONTINUE`, `applyPlan` (`PLAN_APPLIED`), `TIMER_PAUSE` and `TIMER_RESUME`.
  - AC-10: the row "T-0304d AC-10 time check, pause and end, by keyboard" in
    `tests/e2e/uf-09-focus.spec.ts`. `seedSessionRow` gained a `startedAt` argument.
    `page.clock.pauseAt` freezes the clock before the session loads, so the check sees exactly
    1500 s. The clock resumes once UF-09.8 shows, because axe needs timers.
  - AC-11: `exports-and-lint.test.ts` (strings, jsx-no-literals, the bans, the export pin) and
    the `timer.test.ts` tick scan are unchanged and green.
- **What was built.**
  - **`time-check.ts`.**
    - `ruleEightCheckPoint(holder)` calls `timeCheck(buildWorkout(row, plan), {elapsedS,
      nextItemIndex: itemIndex + 1})` once and keeps the answer in a per-mount `CheckHolder`. It
      makes no call when no item follows.
    - `elapsedS` is rule 8's `max(0, floor(…))` from `timer.ts`. A throw resolves to `"next"`.
    - `plannedFinishMs` and `projectedFinishMs` follow D-0120 §2.
  - **`time-check-view.tsx` (UF-09.8).**
    - The h1 is "{n} min behind", then "You planned to finish by {time}".
    - Continue, Trim and Skip next each have their lines and "Done by {time}" as
      `aria-describedby`. Focus goes to Continue.
    - Trim shows only when `trim.items` differs (deep) from `plan.items`.
    - While a write is pending, all three options are `aria-disabled` and inert. A rejection
      shows the polite error.
  - **The write path.** `session.tsx` `createPlanApply`:
    - It reads the stored row and writes `{...row, plan: {...plan, items}}`, with `items` exactly
      as the engine returned them. One write while pending.
    - Then `store.applyPlan(plan, atMs)` (new) sets `ctx.plan` and reduces `PLAN_APPLIED`: `next`
      at the same `itemIndex`, or `done` when nothing is left, which finishes.
  - **`paused.tsx` (UF-09.9).**
    - Elapsed, Left and Sets follow D-0120 §6.
    - Resume (focused), the seams and "Skip to next exercise" (`SKIP_ITEM`) and End workout, all
      through `orderActions`.
    - End confirms in place. Focus goes to Cancel, and back to Resume after Cancel. End calls
      `finish()`, and a rejection shows the polite error.
  - **`machine.ts`.**
    - New state field `skippedItems`, and new events `PLAN_APPLIED` and `SKIP_ITEM`.
    - `firstIncompleteSet` (so the `close()` re-sync) treats skipped items as complete.
    - `CHECK_RESOLVED` past the last item goes to `done`.
  - **`persist.ts`.**
    - A `timeCheck` (or a pause on one) at `itemIndex === items.length` is valid and restores as
      `done`.
    - `skippedItems` reads `[]` when absent, and is rejected when out of range or not integers.
  - **`host.tsx`.**
    - Rule 8 is the default check point. An injected `resolveCheckPoint` still overrides it, and
      the overlay gate still forces `"next"`.
    - A `timeCheck` with no answer from this mount (a restore, or an injected check point) makes
      one fresh call. If that no longer shows, or throws, it dispatches `CONTINUE`.
    - `timeZone?` prop. `formatTime` gets `locale ?? Intl…resolvedOptions().locale` and
      `timeZone ?? Intl…resolvedOptions().timeZone`.
    - A `keepsClockRunning: false` overlay's `resume()` closes the overlay first.
  - **Strings** are added to `flows/uf-09.ts`. The plurals live in the keys.
- **Planted faults.** Each was applied, run and reverted:
  - **AC-2, the check on every `REST_END`** (store: `if (event.type === "REST_END")` in place of
    the `betweenItems` test) → 6 red, including "never mid-item: a full walk of item 0 makes 0
    calls before its last REST_END" and the 4 Skip-to-next cases.
  - **AC-3, `items: [...doneItems, ...option.items]`** (in `createPlanApply`) → 4 red: Trim,
    Skip next, pending, nothing left.
  - **AC-4, no `floor`** (`timer.ts` `elapsedS` returns `ms / 1000`) → "a sub-second now
    (+1500.4 s) passes the integer 1500…" red. `timeCheck` threw a `RangeError`, and UF-09.8
    never showed.
  - **AC-7, the re-sync ignoring `skippedItems`** → "re-sync: after skipping item 0…" red.
- **Pins and seeds updated, not dropped (D-0118 §12).**
  - **Button pins.**
    - `host.chrome.test.tsx` AC-7: `timeCheck` is now `["Pause workout", "Continue", "Trim",
      "Skip next"]`.
    - `paused` is now 3 buttons (Resume, Skip to next exercise, End workout). A new case pins 2
      (Resume, End workout) on the last item.
    - `seams.test.tsx`: the two UF-09.9 lists gain Skip to next exercise and End workout in
      their v2 places.
    - The e2e row "AC-7 the chrome on a seeded session" now expects 2 buttons on UF-09.9 (Resume,
      End workout) for its one-item plan.
  - **Seeds.** A restored time check re-runs rule 8 (D-0120 §4), so the seeded `timeCheck` cases
    now seed a `started_at` that puts P1 60 s behind (`behindStartedAt` in `fixtures.ts`). This
    applies to `host.chrome.test.tsx`, `host.load.test.tsx` (AC-6 screen ids),
    `announcer.test.tsx` (AC-2) and `host.expiry.test.tsx` (the injected `resolveCheckPoint`
    case). In that last case the heading assert "Time check" becomes "1 min behind", the built
    view's heading. No timing or transition assertion changed.
- **Defaults (D-0149, `status: revisit`, text in the build report for the orchestrator).**
  - `PLAN_APPLIED` while paused on UF-09.8 (Pause pressed during the write) keeps the pause, with
    `resumePhase: "next"` and the set-up starting at the pause. With nothing left it goes to
    `done` and ends the pause.
  - Skip to next is hidden whenever no item follows `itemIndex`, the warm-up included. This
    matches the AC-10 pin of 2 buttons for a one-item plan.
  - An injected check point that answers `"timeCheck"` gets a fresh rule 8 call for the view.
  - `CHECK_RESOLVED` past the last item goes to `done`.
  - The UF-09.8 heading is "{n} min behind". The Trim lines read "{name} {a} → {b} sets" or
    "Drop {name}".
- **Evidence.**
  - `pnpm -w typecheck lint test --force --concurrency=1`: 19/19 tasks, web 153 files.
  - uf-09-focus + uf-08-setup e2e: 38/38. The whole web e2e suite: 101/101.
  - `format:check`, `check:repo` and `check:size` are green.
  - No contract changed.
- **2026-10-02, frontend-dev (rework, attempt 2): End while a plan write is pending.** QA and
  review found the same race: Trim or Skip next pending, then Pause, End and confirm, then the
  write lands. Before the fix, `createPlanApply` still ran `applyPlan` and `onRow`, so
  `wl-focus:<id>` was written back after `finish()` had removed it. The trimmed plan was written
  onto the ended row. And because the apply read the row before `finish()` did, a late upsert
  could write `ended_at` back to null.
  - **Proved on 9ee34de.** In a throwaway probe of the exact QA sequence, the `wl-focus` key was
    present again after the end, and the ended row carried lateral-raise at 2 sets.
    `end-race.test.tsx` has 2 red and 1 green (the pair) on that code.
  - **Default chosen: both sides.**
    - (a) While a plan write is pending, UF-09.9's End workout (and the confirm's End workout) is
      `aria-disabled="true"` and inert. The host passes `planWritePending` to the views.
    - (a′) `finish()` also waits for a pending plan write before it reads the row, because a
      seam's `ctx.finish()` bypasses the button. So the ended row is always the last write, and
      it carries the plan that landed before it.
    - (b) `createPlanApply` and `finish()` share a `SessionWrites` (`session.tsx`).
      `createPlanApply` writes nothing once `finish()` has started or the machine is `done`.
      When its upsert lands after that, it skips `applyPlan` and `onRow`. A failed `finish()`
      clears the flag, so End can be tried again.
  - **Tests.** `__tests__/end-race.test.tsx`:
    - the QA probe: Trim pending → Pause → End is inert (twice, with no write) → the write lands
      → the machine walks the trim, still paused → End → confirm → ended. `ended_at` is kept, no
      `wl-focus` key is left, and the ended row is the last write;
    - the hook path: `ctx.finish()` while the write is pending waits, then ends. `ended_at` is
      kept, there is no key, and nothing is written after the ended row;
    - the pair: no pending write → End → confirm ends at once.
  - **Evidence.**
    - UF-09 vitest: 666/666.
    - `pnpm -w typecheck lint test --force --concurrency=1`: 19/19.
    - uf-09-focus e2e: 10/10.
    - `format:check` and check-all are green.

## Accept log
### Accept 2026-10-02 (product-owner): done
Branch `t/T-0304d-time-check-pause-end` at 158e640 (main merged in, D-0149 on main). QA: done
(the full `-w` gate 19/19, the whole e2e 124/124 under the consoleGuard, more planted faults red,
break-it probes pass). Review 1 approved; rework 2 fixed the lost-end race; re-review approved.
- **AC-1:** `time-check.test.tsx` "AC-1 R8-E1 through the engine" runs the real `timeCheck` in a
  spy: one call with `{elapsedS: 1500, nextItemIndex: 1}` and budget 45, the exact texts and Done-by
  times, no second call on Pause/Resume, focus on Continue. The `timeCheck` button pin (4) is in
  `host.chrome.test.tsx` AC-7.
- **AC-2:** not behind (1454 s, one call, `show: false`) and the pair (1500 s); never mid-item and
  never after the last item through the production `ruleEightCheckPoint`; 0 calls with a
  `keepsClockRunning: true` overlay. The planted fault (check on every `REST_END`) turned 6 red.
- **AC-3:** Trim, Skip next and Continue write exactly what the engine returned (or nothing), as
  a whole row; pending, rejection, nothing-left → `done` + `finish()`, and Trim hidden are each
  tested with their pair. The planted fault (`[...doneItems, ...option.items]`) turned 4 red.
- **AC-4:** elapsed with the pause and the off-budget warm-up (1500, the pair 1660), planned
  finish 10:49, the sub-second `floor` (planted fault red), clock skew → 0, and a throwing check →
  UF-09.6 with no alert.
- **AC-5:** the fresh call at 1530 s, `show: false` → `CONTINUE`, past the end → `done`, and
  `items.length + 1` rejected.
- **AC-6 to AC-8:** `paused.test.tsx` covers content (23:10, Left 22 min, Sets 6 / 12, back-off
  13), stopped timers, Left 0/1 min, actions and focus, seam order with injected entries and the
  pair, no `a[href]`, every Skip origin, hidden cases, the `close()` re-sync (planted fault red)
  and its pair, old stored states, the in-place End confirm, Cancel focus, `finish()` order, the
  pending and rejection paths. `done` with no confirm stays green (T-0304e AC-6).
- **AC-9:** `store.test.ts` "T-0304d AC-9" asserts storage right after each listed event.
- **AC-10:** the e2e row "T-0304d AC-10 time check, pause and end, by keyboard" uses
  `page.clock` with `seedSessionRow(startedAt)`, checks the IndexedDB plan (lateral-raise 2 sets)
  and `ended_at`, axe 0 serious/critical on UF-09.8 and UF-09.9, and focus. The T-0304a chrome
  row's UF-09.9 count is updated to 2, and the build log records it.
- **AC-11:** `exports-and-lint.test.ts` and the `timer.test.ts` tick scan are green and unedited.
- **Rework (the lost-end race):** `end-race.test.tsx` was red on 9ee34de (the QA probe and the
  hook path) and is green with its pair. The ended row is always the last write.
- **Principles:** 1 holds (one step on screen; Skip and End live only on UF-09.9; no links out).
  2 holds (rule 8 compares against the chosen budget). 3 holds (the UI saves the engine's item
  list unchanged; no engine change). 4 and 5 are untouched. No contract changed.
- **Open:** D-0149 stays `revisit`. T-0435 (retry End after a failed finish; apply a landed plan
  if a seam's `finish()` fails) is filed as a follow-up and doesn't block this ticket, because
  the failed-finish flag reset is covered by review and the rejection path is tested.
