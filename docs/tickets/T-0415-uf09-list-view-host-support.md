---
id: T-0415
title: "UF-09 host support for the List view: a `source: \"list\"` set never moves the focus machine, REST_END on a finished last item gives done, done waits while a keepsClockRunning overlay is open, and entering an item starts at its first free set"
lane: web-feature:UF-09
screens: [UF-09, UF-09.3, UF-09.6, UF-09.9, UF-03.1]
decisions: [D-0142, D-0153, D-0149, D-0071, D-0111, D-0118, D-0120, D-0140]
deps: [T-0304d, T-0414]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. Child of the T-0305a board row (D-0142 §1 §2). Re-checked against main after T-0304d merged (2026-10-02 groom, D-0153): AC-2 is rescoped because D-0149 §4 already ends the workout at the store level, and AC-5 adds the T-0414 review item (D-0153 §1). Build flow: wl-build-web. About ⅓ day. It is the only UF-09 change the List view needs. Ready: T-0304d and T-0414 are done. -->

## Why
- **Principle 1.** While the List view (UF-03.1) is open, it is the one task on screen. On `main`, checking the machine's current row from the List view dispatches `SET_RECORDED`, so the hidden machine goes into `confirm` with a 5 s auto-save. Checking a timed row ends the hold (`TIMED_RECORDED`). Checking the last row of the last item reaches `done`. The host then calls `finish()` at once and puts the user on UF-03.3 without a Finish tap (D-0142 Context 1–2).
- **The check point after the last item (D-0142 Context 3, D-0153 §3).** Since D-0149 §4, the store turns `betweenItems` past the end into `done`. But `REST_END` in the reducer still returns `betweenItems`, so the store calls the check point resolver for an item that doesn't exist.
- **Entering an item at a logged set (T-0414 review, D-0153 §1).** The machine keeps running under the List view, so a List-view log of item 1 set 1 during UF-09.6 leaves READY on set index 0, which is already logged.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - `session.tsx` `createFocusActions().recordSet`: `source: "list"` always dispatches `SET_LOGGED` (D-0142 §2). The in-flight dedupe key (T-0410) is unchanged.
  - `machine.ts`:
    - `REST_END` on the last item with no free set (`setAfterRest` null) gives `done` with `timer: null`. Other items keep `betweenItems` (D-0153 §3).
    - `enterItem` (READY, COUNTDOWN_END, SKIP_WARMUP) enters `firstUnloggedSet`. With no free set, it gives `done` on the last item and `betweenItems` on any other (D-0153 §1).
  - `host.tsx`: while a `keepsClockRunning: true` overlay is open, `done` keeps rendering the overlay and the `done` effect doesn't call `finish()`. A `close()` from that overlay with the state `done` leads to exactly one `finish()`. `ctx.finish()` still works from inside the overlay.
  - Doc comments that name D-0142 §2 and D-0153.
  - New tests in `__tests__/` (file names start `t0415`).
- Out:
  - The List view itself (T-0416–T-0418), the `seams.tsx` entries (T-0416, T-0422), `persist.ts` and `lib/offline/**`.
  - The `source: "focus"` path, which stays byte-for-byte the same.
  - `planReplaced` (T-0422 owns its `confirm` branch, D-0153 §2).

### Edge cases that are in scope
- **Offline:** the `SET_LOGGED` path writes through `lib/offline` exactly as before, so a List-view set is in IndexedDB before `recordSet` resolves (AC-1).
- **Time running out:** under the List view the check point stays forced to `"next"` (T-0304e AC-9). With AC-2, the last item never reaches a check point at all.
- **Reload:** every state this ticket produces passes `isValidFocusState` (AC-2, AC-4, AC-5).
- **Zero history / 10 days off:** no effect. The machine walks positions, not history.

## Acceptance criteria
**Test setup.** As T-0304e and T-0304d:
- the real `SessionHost`;
- `fake-indexeddb`;
- the real `upsertSession`/`recordSet` wrapped in spies (`__tests__/offline-spies.ts`);
- plan P1 (`__tests__/fixtures.ts`: bench-press × 4, barbell-row × 3, leg-curl × 3, plank × 2 timed);
- `locale="en-GB"` and `timeZone="UTC"`.

The List view is an **injected** seam, `{id: "list-view", keepsClockRunning: true, render: (ctx) => <Probe ctx={ctx} />}`. The probe exposes `ctx` to the test, and it is opened from UF-09.9.

**Test rules.**
- Both values of every binary condition get a test.
- Negative asserts wait ≥ 50 ms, or advance fake timers by the stated time.
- **AC-1, AC-2 (reducer and resolver rows), AC-3 and AC-5 must fail on `main`.** The build log records the red run of each on the unfixed code, with the failing assertion.
- No new test file sets `document.body.innerHTML` (the T-0424 AC-3 guard scans `__tests__/`). Use `cleanup()` or `unmount()`.

- **AC-1 (a List-view set never moves the machine, D-0142 §2)**
  - **Reps.**
    - Given: UF-09.9 paused from bench-press set 1 (`resumePhase: "set"`, `setIndex: 0`), and the List view open (the machine is resumed, `phase: "set"`).
    - When: the probe calls `ctx.recordSet({sessionId: "S1", exerciseId: "bench-press", setIndex: 0, kind: "reps", reps: 8, weightKg: 60, isWarmup: false, backoff: false, itemIndex: 0, source: "list"})`.
    - Then: after it resolves, the stored `wl-focus:S1` has `phase: "set"`, `setIndex: 0` and `timer: null`, and `loggedSets` has one entry with `setIndex: 0`. After 6 s of fake time the state is still `phase: "set"`, and no `SAVED` was dispatched (store spy).
  - **The pair.** The same call with `source` absent (the focus default) gives `phase: "confirm"` with the 5 s auto-save timer (T-0304b behaviour, unchanged).
  - **Timed.**
    - Given: the List view open on plank set 1 (`phase: "timed"`).
    - When: `recordSet({…, exerciseId: "plank", kind: "timed", durationS: 45, itemIndex: 3, setIndex: 0, source: "list"})` resolves.
    - Then: `phase` is still `"timed"`.
    - The pair, with no `source`, gives `TIMED_RECORDED` (rest, as today).
  - **Close re-syncs.** After List-view logs of bench-press sets 0 and 1, `ctx.close()` gives UF-09.3 bench-press "Set 3 of 4" (RESYNC, D-0071 §5).
- **AC-2 (a rest after the finished last item ends the workout, D-0153 §3)**
  - **Reducer.**
    - Given: `phase: "rest"` on item 3 (plank, the last), with both plank sets logged.
    - When: `focusReducer(state, REST_END)`.
    - Then: the result is `phase: "done"`, `timer: null`, `itemIndex: 3`, and it passes `isValidFocusState` for P1.
    - Red on main: the reducer returns `betweenItems`.
  - **No check point.** Through the store with an injected `resolveCheckPoint` spy, the same `REST_END` makes 0 resolver calls and stores `done`. Red on main: 1 call. The stored `done` is already green on main through D-0149 §4; it stays as a pin.
  - **The pair.** The same on item 0 with all 4 bench-press sets logged gives `betweenItems`, and through the store it calls the resolver once and gives `next` for item 1, as today.
  - **The pair on the last item.** `phase: "rest"` on item 3 with one plank set logged gives `timed` for set index 1, as today.
- **AC-3 (done waits under a List-view overlay, D-0142 §2)**
  - **Given:**
    - a seeded focus state paused on plank set 1 (`itemIndex: 3`, `setIndex: 0`, `resumePhase: "timed"`), with all 10 sets of items 0–2 in `loggedSets`;
    - the List view opened from UF-09.9;
    - both plank sets then logged through `ctx.recordSet({…, source: "list"})`;
    - a rest started with `ctx.startRest("plank")`.
  - **When** the rest runs out (fake time past `restFor("plank")`: `REST_COMPOUND_S` or `REST_ISOLATION_S` by plank's library `type`).
  - **Then:**
    - the store state is `done`;
    - the probe is still on screen (exactly one overlay, and no host-level "done" view in `[data-screen-id="UF-09"]`);
    - there is no `upsertSession` call with a non-null `ended_at` (after 50 ms);
    - `wl-focus:S1` is still stored;
    - the location is `/session/S1`.
  - **Then close.** `ctx.close()` makes exactly one `finish()` write (`upsertSession({...row, ended_at})`), removes `wl-focus:S1`, and the location becomes `/session/S1/summary`. After 50 ms more there is no second write.
  - **Or finish from the overlay.** In the same `done` state, the probe's `ctx.finish()` makes one write and navigates. A second `ctx.finish()` while the first is pending makes no second write.
  - **The pair.** With no overlay open, `done` finishes at once (T-0304e AC-6 stays green, unchanged).
  - **A `keepsClockRunning: false` overlay** (an injected how-to probe) opened from UF-09.9 never reaches `done` this way, because the machine stays `paused`. A test pins that the paused state is unchanged after 10 min of fake time.
- **AC-4 (reload under the List view)**
  - Remounting the host (same storage and IndexedDB) after AC-1's list log restores the stored state as it was (`phase: "set"`, `setIndex: 0`, `loggedSets` length 1).
  - Remounting after AC-3's `done` (overlay not restored) finishes once, through the existing `done` restore path.
  - `persist.ts` rejects no stored state from this ticket. Test both values: a valid state and a deliberately out-of-range one.
- **AC-5 (entering an item starts at its first free set, D-0153 §1)**
  - **Reducer, reps.** Given `phase: "next"` on item 1 (barbell-row) with `(1, 0)` logged, `READY` gives `phase: "set"`, `setIndex: 1`. Red on main: `setIndex: 0`.
  - **Reducer, timed.** Given `phase: "next"` on item 3 (plank) with `(3, 0)` logged, `READY` gives `phase: "timed"`, `setIndex: 1`, and a fresh position timer at `atMs`.
  - **The pair.** With nothing logged on item 1, `READY` gives `setIndex: 0`. This is reference behaviour for the focus path, and the existing UF-09.6 tests stay green unedited.
  - **No free set.** Given `next` on item 1 with all three barbell-row positions logged, `READY` gives `betweenItems`, and through the store it reaches `next` for item 2. Given `next` on item 3 with both plank positions logged, `READY` gives `done`.
  - **COUNTDOWN_END / SKIP_WARMUP** on a plan with no warm-up and `(0, 0)` logged enter bench-press `setIndex: 1`.
  - **Host.** With all 4 bench-press sets logged and the List view open on UF-09.6 for item 1 (opened from a pause taken there), a list log of barbell-row set 1, then the 60 s set-up running out, then `ctx.close()`, shows UF-09.3 "Set 2 of 3". The next Done set records `setIndex: 1`, and no two live sets share an `(itemIndex, setIndex)`.
  - Every state above passes `isValidFocusState`.
- **AC-6 (unchanged surface)**
  - The `index.tsx` export pin is unchanged.
  - `FocusSetInput` is unchanged.
  - The T-0304a AC-2 tick-counting source test still passes.
  - The full UF-09 suite is green with no existing test edited, other than new `t0415*` files.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0415-uf09-list-view-host-support.md`: this file, for the build and accept logs.
- Read-only imports (these are imports, not grants): `lib/offline`, `@workoutlab/engine`, `lib/i18n/en.ts`.

## Contract impact
None. `SET_LOGGED`, `REST_END`, `enterItem` and the overlay rule are device-local focus-state behaviour (D-0142 §2, D-0153). The sets go through the D-0015/D-0045 queue as before.

## Definition of done
- Tests for every AC pass, with the red runs recorded.
- `pnpm -w typecheck lint test --force --concurrency=1` is green.
- `pnpm --filter @workoutlab/web test:e2e` is green.
- `check:size` is green.
- Contracts are unchanged.
- Commits start `T-0415` and cite the screen (for example `T-0415 UF-09: List-view logs never move the machine`).

## Notes
- **Flow:** `wl-build-web`.
- **Files it edits:** `session.tsx` (`recordSet`), `machine.ts` (`REST_END`, `enterItem`), `host.tsx` (the `done` branch and effect, `close()`), plus new `t0415*` tests.
- **Parallel (2026-10-02 groom):**
  - **Not with T-0423.** T-0423 may edit `host.tsx`. Start T-0415 after T-0423 merges.
  - **With T-0424, allowed.** T-0424 only edits `timed-set.test.tsx` and adds its guard file. The shared rule is that no `document.body.innerHTML =` appears in a UF-09 test.
  - **Not with T-0422.** It edits `machine.ts` (`planReplaced`) and the UF-09 test pins (D-0142 §1, D-0153 §2).
  - **Not with T-0416.** It edits `seams.tsx` and the UF-09 test pins.
  - **Not with T-0435.** Both edit `session.tsx`.
  - **Not with T-0394.** Both edit `host.tsx`.
  - **With T-0433, allowed.** It is in the UF-03 lane and shares no file.
- **From T-0414 review (2026-10-02):** READY/next could enter `set` at set index 0 even when a List-view log had already filled that position. This is now AC-5 (D-0153 §1).
