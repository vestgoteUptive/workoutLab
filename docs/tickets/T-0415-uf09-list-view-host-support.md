---
id: T-0415
title: "UF-09 host support for the List view: a `source: \"list\"` set never moves the focus machine, REST_END on a finished last item gives done, and done waits while a keepsClockRunning overlay is open"
lane: web-feature:UF-09
screens: [UF-09, UF-09.9, UF-03.1]
decisions: [D-0142, D-0071, D-0111, D-0118, D-0120, D-0140]
deps: [T-0304d, T-0414]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of the T-0305a board row (D-0142 §1 §2). Build flow: wl-build-web. About ¼–⅓ day. It is the only UF-09 change the List view needs. T-0305a's children have one UF-09 grant each, `seams.tsx`, so this host work has its own ticket in the UF-09 lane. Ready when T-0304d and T-0414 are done (the same machine and session files). -->

## Why
- **Principle 1.** The List view (UF-03.1) is the one task on screen while it's open. On `main`, checking the machine's current row from the List view dispatches `SET_RECORDED`, so the hidden machine goes into `confirm` with a 5 s auto-save. A timed row ends the hold (`TIMED_RECORDED`). Checking the last row of the last item reaches `done`, and the host then calls `finish()` and throws the user out to UF-03.3 five seconds later, with no Finish tap (D-0142 Context 1–2).
- **Reload safety (D-0111 §7).** A rest after a finished last item goes `betweenItems` → `next` for an item past the end, which is an out-of-range stored state, so a reload restarts at `getReady` (D-0142 Context 3).

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - `session.tsx` `createFocusActions().recordSet`: `source: "list"` always dispatches `SET_LOGGED` (D-0142 §2). The in-flight dedupe key (T-0410) is unchanged.
  - `machine.ts` `REST_END`: on the last item, with no unlogged set (`setAfterRest` null), it gives `done` with `timer: null`. Other items keep `betweenItems`.
  - `host.tsx`: while a `keepsClockRunning: true` overlay is open, `done` keeps rendering the overlay, and the `done` effect doesn't call `finish()`. `close()` from that overlay, with the state `done`, leads to one `finish()`. `ctx.finish()` still works from inside the overlay.
  - Doc comments that name D-0142 §2.
  - New tests in `__tests__/` (file names start `t0415`).
- Out:
  - The List view itself (T-0416–T-0418), `seams.tsx` entries (T-0416, T-0422), `persist.ts`, and `lib/offline/**`.
  - The `source: "focus"` path: it stays byte-for-byte the same.

### Edge cases that are in scope
- **Offline:** the `SET_LOGGED` path writes through `lib/offline` exactly as before, so a List-view set is in IndexedDB before `recordSet` resolves (AC-1).
- **Time running out:** under the List view the check point stays forced to `"next"` (T-0304e AC-9). With the AC-2 rule, the last item never reaches the check point at all.
- **Reload:** every state this ticket produces passes `isValidFocusState` (AC-2, AC-4).

## Acceptance criteria
**Test setup.** As T-0304e and T-0304d: the real `SessionHost`, `fake-indexeddb`, the real `upsertSession`/`recordSet` wrapped in spies (`__tests__/offline-spies.ts`), plan P1 (`__tests__/fixtures.ts`: bench-press × 4, barbell-row × 3, leg-curl × 3, plank × 2 timed), `locale="en-GB"`, `timeZone="UTC"`. The List view is an **injected** seam, `{id: "list-view", keepsClockRunning: true, render: (ctx) => <Probe ctx={ctx} />}`, where the probe exposes `ctx` to the test, and is opened from UF-09.9.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms (or advance fake timers by the stated time). **AC-1, AC-2 and AC-3 must fail on `main`.** The build log records the red run of each one on the unfixed code, with the failing assertion.

- **AC-1 (a List-view set never moves the machine, D-0142 §2)**
  - **Reps.** Given UF-09.9 paused from bench-press set 1 (`resumePhase: "set"`, `setIndex: 0`) and the List view open (the machine is resumed, `phase: "set"`). When the probe calls `ctx.recordSet({sessionId: "S1", exerciseId: "bench-press", setIndex: 0, kind: "reps", reps: 8, weightKg: 60, isWarmup: false, backoff: false, itemIndex: 0, source: "list"})`. Then, after it resolves, the stored `wl-focus:S1` has `phase: "set"`, `setIndex: 0` and `timer: null`, and `loggedSets` has one entry with `setIndex: 0`. After 6 s of fake time, the state is still `phase: "set"`, and no `SAVED` was dispatched (store spy).
  - **The pair.** The same call with `source` absent (the focus default) gives `phase: "confirm"` with the 5 s auto-save timer (T-0304b behaviour, unchanged).
  - **Timed.** Given the List view open on plank set 1 (`phase: "timed"`). When `recordSet({…, exerciseId: "plank", kind: "timed", durationS: 45, itemIndex: 3, setIndex: 0, source: "list"})` resolves, then `phase` is still `"timed"`. The pair, with no `source`, gives `TIMED_RECORDED` (rest, as today).
  - **Close re-syncs.** After List-view logs of bench-press sets 0 and 1, `ctx.close()` gives UF-09.3 bench-press "Set 3 of 4" (RESYNC, D-0071 §5).
- **AC-2 (a rest after the finished last item ends the workout, D-0142 §2)**
  - **Reducer.** Given `phase: "rest"` on item 3 (plank, the last), with both plank sets logged, When `REST_END`, Then the state is `phase: "done"`, `timer: null`, `itemIndex: 3`. The result passes `isValidFocusState` for P1.
  - **The pair.** The same on item 0 with all 4 bench-press sets logged gives `betweenItems` (and the store's check point then gives `next` for item 1, as today).
  - **The pair on the last item.** `phase: "rest"` on item 3 with one plank set logged gives `timed` for set index 1, as today.
- **AC-3 (done waits under a List-view overlay, D-0142 §2)**
  - **Given** a seeded focus state paused on plank set 1 (`itemIndex: 3`, `setIndex: 0`, `resumePhase: "timed"`) with all 10 sets of items 0–2 in `loggedSets`, the List view opened from UF-09.9, both plank sets then logged through `ctx.recordSet({…, source: "list"})`, and a rest started with `ctx.startRest("plank")`. **When** the rest runs out (fake time past `restFor("plank")`: `REST_COMPOUND_S` or `REST_ISOLATION_S` by plank's library `type`), **Then** the store state is `done`, the probe is still on screen (exactly one overlay, no `[data-screen-id="UF-09"]` "done" host-level view), there is no `upsertSession` call with a non-null `ended_at` (after 50 ms), `wl-focus:S1` is still stored, and the location is `/session/S1`.
  - **Then close.** `ctx.close()` makes exactly one `finish()` write (`upsertSession({...row, ended_at})`), removes `wl-focus:S1`, and the location becomes `/session/S1/summary`.
  - **Or finish from the overlay.** In the same `done` state, the probe's `ctx.finish()` makes one write and navigates. A second `ctx.finish()` while the first is pending makes no second write.
  - **The pair.** With no overlay open, `done` finishes at once (T-0304e AC-6 stays green, unchanged).
  - **A `keepsClockRunning: false` overlay** (an injected how-to probe) opened from UF-09.9 never sees `done` this way, because the machine stays `paused`. A test pins that the paused state is unchanged after 10 min of fake time.
- **AC-4 (reload under the List view)** Remounting the host (same storage and IndexedDB) after AC-1's list log restores the stored state as it was (`phase: "set"`, `setIndex: 0`, `loggedSets` length 1). Remounting after AC-2's `done` finishes once (the existing `done` restore path). No stored state from this ticket is rejected by `persist.ts` (both values: a valid and a deliberately out-of-range one).
- **AC-5 (unchanged surface)** The `index.tsx` export pin is unchanged. `FocusSetInput` is unchanged. The T-0304a AC-2 tick-counting source test still passes. The full UF-09 suite is green with no test edited, other than new `t0415*` files.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0415-uf09-list-view-host-support.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline`, `@workoutlab/engine`, `lib/i18n/en.ts`.

## Contract impact
None. `SET_LOGGED`, `REST_END` and the overlay rule are device-local focus-state behaviour (D-0142 §2). The sets go through the D-0015/D-0045 queue as before.

## Definition of done
Tests for every AC pass, with the red runs recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green · `check:size` green · contracts unchanged · commits start `T-0415` and cite the screen (for example `T-0415 UF-09: List-view logs never move the machine`).

## Notes
- **Flow:** `wl-build-web`.
- **Why it waits for T-0304d and T-0414:** both change `machine.ts` and `host.tsx`. The UF-09 lane runs one ticket at a time.
- **Parallel:** it shares no file with T-0419–T-0421. It may not run in parallel with T-0416 or T-0422, because they edit `seams.tsx` and UF-09 test pins (D-0142 §1).

- **From T-0414 review (2026-10-02):** READY/next can enter `set` at setIndex 0 even when a List-view log already filled that position. Pick the first free set there, with a test.
