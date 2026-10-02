---
id: T-0435
title: "UF-09.9 End after a failed finish: a retry test (a later Trim writes and moves the machine, a second End writes ended_at), and a seam's failed ctx.finish() applies the plan write it waited for, so Continue walks the new plan"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.8, UF-09.6, UF-03.3]
decisions: [D-0153, D-0149, D-0120, D-0071, D-0111]
deps: [T-0304d]
status: ready
---
<!-- Written 2026-10-02 by product-owner (groom). Follow-up from the T-0304d re-review and accept log ("Open: T-0435"). Build flow: wl-build-web. About ¼ day. Ready: T-0304d is on main. It edits only session.tsx and adds t0435* tests. -->

## Why
- **The retry is untested (T-0304d re-review).**
  - `createFocusActions().finish()` (`features/UF-09/session.tsx`) clears `finishing` and `writes.finishing` when its write rejects. Without that, a second End would get the old rejected promise, and `createPlanApply` would treat the workout as ending and write nothing.
  - `paused.test.tsx` proves the rejection message, but no test retries. A refactor that drops either reset would stay green.
- **A failed finish leaves the store on the old plan (D-0153 §6).**
  - The path: UF-09.8 Trim is pending → Pause → a seam overlay calls `ctx.finish()`. `finish()` waits for the plan write.
  - When the plan write lands, `createPlanApply` sees `writes.finishing` and skips `applyPlan`. The row now holds the trimmed plan, but the store doesn't.
  - If the ended-row write then rejects, the workout carries on with the store walking the old plan. Resume → UF-09.8 → Continue goes through items the row no longer has, and the next check point uses the old costs (principle 2).
  - End on UF-09.9 can't reach this, because it is inert while the plan write is pending. Only a seam's `ctx.finish()` can (UF-03.1 Finish, T-0416).

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - `session.tsx`:
    - `createPlanApply` records a plan write that landed after `finish()` started, as the written row and its plan, on the shared `SessionWrites`.
    - `finish()`'s rejection path applies that recorded plan (`store.applyPlan(plan, atMs)` and `onRow(written)`) before its promise rejects, then clears the record.
    - A finish that succeeds applies nothing (the ended row stays the last write) and clears the record.
    - Doc comments citing D-0153 §6.
  - New tests: `__tests__/t0435.end-retry.test.tsx` (and `t0435*` helpers if needed), on the `end-race.test.tsx` setup.
- Out:
  - `host.tsx`, `paused.tsx`, `machine.ts`, `persist.ts`, `lib/offline/**`.
  - Any new UI, copy or retry button. "Couldn't end the workout. Try again." and the in-place confirm are unchanged.
  - `end-race.test.tsx` and `paused.test.tsx` stay unedited.

### Edge cases that are in scope
- **Offline:** every write is to IndexedDB through `upsertSession`. The failure is a rejected IndexedDB write (quota, a closed DB), simulated with `mockImplementationOnce`.
- **Time running out:** the applied plan is the engine's Trim result, so the next check point and UF-09.9's "Left" use its costs (AC-4).
- **Reload after the failure:** the stored focus state is the PLAN_APPLIED one, so a remount restores UF-09.9 paused with `resumePhase: "next"` on the trimmed plan (AC-4).
- **Zero history / 10 days off:** not applicable to the write order.

## Acceptance criteria
**Test setup.** As `end-race.test.tsx`:
- the `r8Mock` `lib/offline` spy and the `engineSpy` around the real `timeCheck`;
- the store spy and the probed views;
- R8_PLAN with `atCheck()` (UF-09.8 at 1500 s, R8-E1 behind, Trim offered);
- `holdNextUpsert()` for a held write;
- `timeZone: "UTC"` and `locale: "en-GB"`.

The "seam" is an **injected** `keepsClockRunning: false` overlay `{id: "how-to", render: (ctx) => <Probe ctx={ctx} />}` passed through `renderSession({seams: {pause: [it]}})`. Its `ctx.finish()` is the call under test.

**Test rules.**
- Both values of every binary condition get a test.
- Negative asserts wait ≥ 50 ms (`flushReal`).
- **AC-4 must fail on `main`.** Record the red run with its failing assertion.
- AC-1 to AC-3 pin behaviour that is already on `main`. Each must turn red on its planted fault, recorded in the build log and reverted:
  - no `writes.finishing = false` in `finish()`'s catch (AC-2);
  - no `finishing = null` in `finish()`'s catch (AC-1, AC-3).
- No new test sets `document.body.innerHTML` (the T-0424 AC-3 guard).

- **AC-1 (End again after a failed End)**
  - **Given** UF-09.9 paused from item 1's set (no plan write pending), and `upsertSession` rejecting once.
  - **When** End workout → End workout (the confirm), then the polite "Couldn't end the workout. Try again." shows, and End workout is clicked again.
  - **Then:**
    - `upsertSession` has 2 calls, and the second carries `ended_at` = the fake now;
    - the location is `/session/S1/summary`;
    - `wl-focus:S1` is removed;
    - the stored row equals the second call's argument.
- **AC-2 (a Trim after a failed End writes and moves the machine)**
  - **Given** `atCheck()`, then Pause (UF-09.9 with `resumePhase: "timeCheck"`), End → End with the ended-row write rejecting once, then Cancel and Resume (back on UF-09.8 with the held check, D-0120 §4).
  - **When** Trim is clicked.
  - **Then:**
    - exactly one new `upsertSession` call carries the trimmed plan (`items[3].sets` 2, the engine's list unchanged), and its `ended_at` is null;
    - the screen is UF-09.6 for item 1 with 60 s left;
    - `session().plan` deep-equals the stored row's plan.
- **AC-3 (and a second End writes ended_at)** After AC-2: Pause → End → End.
  - The last `upsertSession` call has `ended_at` = the fake now and the trimmed plan, and the stored row deep-equals it.
  - The location is the summary, and nothing is written after the ended row (after 50 ms).
- **AC-4 (a seam's failed finish applies the plan write it waited for, D-0153 §6)**
  - **Given:**
    - `atCheck()`, Trim held (`holdNextUpsert()`), then Pause;
    - the injected seam opened from UF-09.9;
    - the probe calls `ctx.finish()` with the ended-row write rejecting once.
  - **When** the Trim write is released (it lands, and then the ended-row write rejects).
  - **Then:**
    - `ctx.finish()` rejects;
    - the stored row's `ended_at` is null and its plan is the trimmed one;
    - `session().plan` deep-equals the stored row's plan, and `session().row` deep-equals the stored row;
    - the stored `wl-focus:S1` is `{phase: "paused", resumePhase: "next", itemIndex: 1, setIndex: 0}` with the 60 s set-up starting at `pausedAtMs` (D-0149 §1).
  - **After `ctx.close()` and Resume:** UF-09.6 shows item 1 of the trimmed plan with 60 s left.
  - **Red on main:** `session().plan` is R8_PLAN, and `resumePhase` is `"timeCheck"`.
  - **Reload.** A remount (same storage and IndexedDB) restores UF-09.9 paused, with the trimmed plan as the store's plan.
  - **The pair: the finish succeeds.** The same steps with no rejection end the workout. The ended row is the last write, there is no `applyPlan` after it (store spy: no `PLAN_APPLIED` dispatched), and `end-race.test.tsx`'s hook-path row stays green unedited.
  - **The pair: the plan write rejects too.** With the Trim write rejecting and the ended-row write rejecting, nothing is applied: `session().plan` is R8_PLAN, the state is still paused with `resumePhase: "timeCheck"`, and a later Trim (after close and Resume) writes and moves the machine as in AC-2.
  - **The pair: no plan write pending.** A seam `ctx.finish()` that rejects with no plan write leaves the plan and state deep-equal to before.
- **AC-5 (unchanged surface)**
  - The `index.tsx` export pin is unchanged.
  - `FocusSession`'s members are unchanged.
  - `end-race.test.tsx`, `paused.test.tsx` and `time-check.test.tsx` pass unedited.
  - The T-0304a AC-2 tick-counting source test passes.
  - No key is added to `flows/uf-09.ts`.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0435-uf09-end-retry-and-failed-finish-plan.md`: this file, for the build and accept logs.
- Read-only imports (these are imports, not grants): `lib/offline`, `@workoutlab/engine`.

## Contract impact
None. The write order and the store update are device-local (D-0071 §6, D-0153 §6). The rows go through the existing queued upsert.

## Definition of done
- Tests for every AC pass, with the red run and planted faults recorded.
- `pnpm -w typecheck lint test --force --concurrency=1` is green.
- `pnpm --filter @workoutlab/web test:e2e` is green.
- `format:check` and `check:repo` are green.
- Contracts are unchanged.
- Commits start `T-0435` and cite the screen (for example `T-0435 UF-09.9: a failed finish applies the plan it waited for`).

## Notes
- **Flow:** `wl-build-web`.
- **Files it edits:** `session.tsx` only, plus new `t0435*` tests. If the builder finds it needs `host.tsx`, stop and wait for T-0423 to merge (see below).
- **Parallel (2026-10-02 groom):**
  - **Allowed with T-0423 and T-0424 by files.** T-0423 edits `timed-set.tsx` and maybe `host.tsx`. T-0424 edits `timed-set.test.tsx` and adds its guard. Neither edits `session.tsx`.
  - **Allowed with T-0422.** T-0422 edits `seams.tsx`, `machine.ts` `planReplaced` and the seam pins, so there is no shared file.
  - **Allowed with T-0433.** It is in the UF-03 lane.
  - **Not with T-0415.** Both edit `session.tsx`.
- **Why it matters before T-0416:** T-0416's UF-03.1 Finish calls `ctx.finish()` from a seam. This ticket makes that path safe when a UF-09.8 write is in flight.
