---
id: T-0304a
title: UF-09 focus machine — pure focusReducer, wall-clock timer maths, a store that persists every transition synchronously, SessionHost loading + restore guards, the chrome, timer expiry, placeholder views, host-level vs step screen ids
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.2, UF-09.3, UF-09.4, UF-09.5, UF-09.6, UF-09.7, UF-09.8, UF-09.9]
decisions: [D-0002, D-0004, D-0045, D-0053, D-0062, D-0066, D-0067, D-0071, D-0086, D-0091, D-0103, D-0108, D-0111]
deps: [T-0300, T-0205, T-0318]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (ACs A1–A7 there). The parent's T-0304a row is split by D-0111 §1: this ticket keeps the machine and host, and T-0304e takes useFocusSession() + seams.tsx (parent AC-A8/A9). The T-0303d dep is dropped (D-0111 §2): rows are seeded with the real upsertSession, so this ticket can start now, in parallel with T-0303b/T-0302c. Build flow: wl-build-web. About ½ day, the upper end. -->

## Why
Principle 1: during a workout the screen shows one task. This ticket builds the frame that makes that true: one machine state on screen at a time, with only a pause button, a thin progress bar and an index around it, and everything else behind Pause. NFR-TIME-1: every timer is a wall-clock timestamp, so locking the phone or killing the tab never loses time. NFR-OFF-2: the focus state is written synchronously on every transition and restored on reopen. The machine is a pure reducer over the engine's `SessionPlan` (principle 3: the plan is the engine's; the machine only walks it). T-0304e, then T-0304b–d, build the hook, the seams and the real views on top of it.

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **`machine.ts`:** `focusReducer(state, event, ctx)`, with the D-0111 §4 state, events, timers and rest rule, and `initialFocusState(sessionId, plan, atMs)`.
  - **`timer.ts`:** `remainingS(timer, nowMs)` and `elapsedS({startedAtMs, workoutPausedMs, pausedAtMs, warmupSpentMs, warmupInBudget}, nowMs)` (D-0066 §1 §11).
  - **`persist.ts` / `store.ts`:**
    - `createFocusStore` with the synchronous write (D-0111 §6);
    - `readFocusState(sessionId, ctx)` with the D-0111 §7 validation;
    - the `wl-focus:<sessionId>` key.
  - **`SessionHost`** (replacing the T-0300a stub in `index.tsx`):
    - loads the row through `offlineDb().sessions.get(id)`, then `parseSessionPlan`, and the library through `loadLibrary()`;
    - the host-level states (D-0111 §3, §7);
    - restore;
    - timer expiry (D-0111 §8);
    - the injectable `resolveCheckPoint` (D-0111 §5, default `"next"`);
    - `<OfflineStatus variant="icon">`.
  - **The chrome** (D-0111 §10) and **a per-state view registry** with the D-0111 §9 placeholders.
  - **Strings and e2e.** Strings go in `lib/i18n/flows/uf-09.ts`. The new e2e spec is `tests/e2e/uf-09-focus.spec.ts` (T-0304b–e append).
- Out:
  - `useFocusSession()` and `seams.tsx` (T-0304e).
  - `done` → `finish()` (T-0304e). Here `done` renders the host-level "UF-09" state with "Workout complete".
  - The real views for UF-09.1–.9, recording sets, auto-save, cues, wake lock and the time check (T-0304b–d).
  - The `timed` hold timer (T-0304c).
  - Reading focus prefs (T-0304c).
  - Edits to `lib/offline/**`, `routes.ts`, `en.ts`, `components/**`, `tests/e2e/fixtures/**` and the shell tests (D-0108 §2–§3, D-0111 §3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** loading is IndexedDB-only, with no network. Offline shows only the icon (AC-8). The e2e has an offline cold load (AC-13).
- **Time running out:** the machine never interrupts an item. `betweenItems` is the only check point, and `timeCheck` is reachable only through it (AC-1, AC-9). `elapsedS` excludes pauses and an off-budget warm-up, so T-0304d's rule 8 input is right (AC-2).
- **Zero history:** a plan with null pre-fill weights loads and walks like any other. The machine reads no weights (AC-1).
- **Returning after 10 days off:**
  - a focus state left for a session that has since ended is removed (AC-5);
  - an unfinished session started more than 12 h ago shows the stale state instead of resuming a "live" workout (AC-5).
- **Reload / kill:** restoring mid-rest shows the wall-clock remaining time. An expired rest advances once (AC-4).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-09/__tests__/`. Fake timers and a mocked `Date.now` are used wherever time matters.
- Session rows are written with the **real** `upsertSession` and a signed-in user stubbed through the supabase-js `localStorage` auth key that `currentUserId()` reads (D-0111 §2). `loadLibrary` is mocked with the L1 library.
- **P1** is the parent T-0304 fixture: S1, `started_at` `2026-09-27T10:00:00.000Z`, budget 45, warm-up in budget, energy normal.
  - Warm-up: the 4 `wu-*` moves at 40 s.
  - Items:
    - bench-press × 4 main (compound);
    - barbell-row × 3 (compound);
    - leg-curl × 3 (isolation, pre-fill weight null);
    - plank × 2 (timed: `repsMin` null).
- **Test rules** (state.md traps):
  - Both values of every binary condition get a test; each AC names its pair.
  - Negative asserts wait a real 50 ms macrotask (with fake timers: an advance of ≥ 50 ms plus a flush).
  - **Timing ACs must fail on unfixed code.** The build log records each planted fault turning its AC red:
    - AC-3: the write moved into a `useEffect` or `queueMicrotask`;
    - AC-4: a tick-counting countdown;
    - AC-9: an expiry dispatched twice.
  - Positive asserts on content rendered through `Shell` use `findBy…`/`waitFor` (D-0103 §1).

- **AC-1 (transitions, pure, D-0111 §4)**
  - **Pure.** `focusReducer` with deep-frozen `state`, `event` and `ctx` doesn't throw, and two calls are deep-equal.
  - **No-op events.** An event that doesn't apply to the phase (for example `REST_END` in `set`) returns the same state object (reference-equal).
  - **Table test from P1.** Each event carries `atMs`:
    - `getReady` + `COUNTDOWN_END` → `warmup` move 0, with a 40 s timer started at `atMs`.
    - `getReady` + `SKIP_WARMUP` → `set` item 0 `setIndex` 0, and `warmupSpentMs` 0.
    - `warmup` move 1 + `WARMUP_NEXT` → move 2. `WARMUP_RESTART` → the same move with `timer.startedAtMs` = the event's `atMs`.
    - `warmup` move 3 + `WARMUP_NEXT` → `next` item 0 with a 60 s timer.
    - `next` + `READY` → `set` item 0.
    - `set` + `SET_RECORDED {set}` → `confirm`, with `loggedSets` gaining that entry.
    - `confirm` + `SAVED` (bench-press `setIndex` 0) → `rest` with `durationS` 120 (`REST_COMPOUND_S`, imported). Then `REST_END` → `set` `setIndex` 1.
    - The same for leg-curl → `durationS` 60 (`REST_ISOLATION_S`).
    - An exercise missing from `ctx.library` → 120.
    - The last bench-press set saved → `rest` → `REST_END` → the store resolves `betweenItems` to `next` item 1 (AC-9).
    - Item 3 (plank) + `READY` → `timed`, not `set`.
    - P1 without the plank: the last leg-curl set + `SAVED` → `done`, with no `rest`. P1 itself: the last plank set + `TIMED_RECORDED` → `done`.
    - Pause and resume: for each of `getReady, warmup, set, confirm, rest, next, timed, timeCheck`, `PAUSE` → `paused` with `resumePhase` = that phase, then `RESUME` → that phase. `PAUSE` in `paused` or `done` is a no-op.
    - Empty plans: an empty `items` plan with no warm-up → `done` after `COUNTDOWN_END`. With a warm-up → `done` after the last `WARMUP_NEXT`.
    - Back-off: with bench-press `backoff` non-null, `setIndex` 4 follows set 3, and the `SET_RECORDED` entry for it has `backoff: true`. With `backoff: null`, set 3 is the item's last.
  - **`REST_ADJUST`.** −15 ×9 from 120 gives `remainingS` 0 (floored, never negative). +15 from 120 gives 135, with no cap.
- **AC-2 (wall-clock timer maths, NFR-TIME-1, D-0066 §1 §11)**
  - **`remainingS`.** `remainingS({startedAtMs: 0, durationS: 120, pausedMs: 0}, 90_000)` = 30, at 120 000 → 0, and at 200 000 → 0. With `pausedMs` 15 000 at 90 000 → 45.
  - **Pause accounting.** Pausing at t and resuming at t + 20 000 adds exactly 20 000 to both `timer.pausedMs` and `workoutPausedMs`.
  - **`elapsedS`.** With `started_at` S, a 120 s pause and `warmupSpentMs` 160 000:
    - warm-up off budget: `elapsedS` at S + 1 780 000 = 1500;
    - the pair, warm-up in budget: 1660.
    - While paused, it doesn't grow (equal at `pausedAtMs` + 0 and + 60 000).
  - **`warmupSpentMs`.** Enter `warmup` at 5 000, pause at 50 000, resume at 70 000, leave at 185 000 → 160 000.
  - **No tick counting.** A source test over the `.ts`/`.tsx` non-test files in `features/UF-09/**` finds no decrement or increment of a timer, remaining or seconds value.
    - It matches the code patterns: an identifier containing `remaining`, `timer`, `seconds`, `secs` or `countdown` (case-insensitive), followed by `--`, `++`, `-= 1` or `+= 1`, or preceded by `--`/`++`. It also matches a `setState(n => n - 1)`-style updater.
    - It doesn't grep a bare `--`, which would match CSS custom properties such as `var(--wl-…)` in strings or `.css` files. CSS files are out of its scope.
    - A planted `remaining--` turns it red.
    - `setInterval` appears only in the host's re-render hook.
- **AC-3 (synchronous persistence, D-0111 §6)**
  - **Written before `dispatch` returns.** Right after `store.dispatch(e)` returns, with no `await`, `act` or timer advance in between, `localStorage["wl-focus:S1"]` parses to `{version: 1, …}` deep-equal to `store.getState()`. This holds for every transition in the AC-1 table.
  - **Throwing storage.** With `setItem` throwing, `dispatch` still transitions and doesn't throw.
- **AC-4 (restore, NFR-TIME-1, D-0111 §7)**
  - **Same moment.** Unmounting and remounting `/session/S1` at the same `Date.now` renders the same phase and the same `data-screen-id`.
  - **Mid-rest.** Remounting 90 s into a 120 s rest shows `role="timer"` "0:30" (±1 s).
  - **Expired rest.** At 119 s the remount still shows `rest` with "0:01". At 600 s it shows `set` for the next set index, exactly once: the store received one `REST_END`, and there is no further transition.
  - **Paused.** A state restored in `paused` stays paused, and its `elapsedS` equals the value before the unmount.
- **AC-5 (loading edge cases, D-0111 §3 §7)**
  - **Not on this device.** "This workout isn't on this device" with a link to `/` (and no `role="alert"`) for each of:
    - `/session/nope` (no row);
    - a row whose `userId` differs from the stubbed user;
    - `row.plan` failing `parseSessionPlan`;
    - `row.plan` null;
    - IndexedDB unavailable, with no uncaught error and no unhandled rejection. Dexie captures `indexedDB` at import, and `fake-indexeddb` is loaded globally, so deleting the global in a test proves nothing. The builder simulates this by making `offlineDb()` throw, or `offlineDb().sessions.get` reject (for example `vi.spyOn` or a `vi.mock` of `lib/offline`). Both shapes give the message.
  - **The pair.** A valid row of the stubbed user starts the machine at UF-09.1.
  - **Ended.** A row with `ended_at` set shows "This workout has ended" with a link to `/`, and a stored `wl-focus:S1` is removed. With `ended_at` null, a stored state is restored.
  - **Stale.**
    - `started_at` = now − 12 h 1 min with `ended_at` null shows "This workout was started on {date}" with a link to `/`, and `wl-focus:S1` is kept.
    - At exactly now − 12 h it restores.
  - **Bad stored states start fresh.** Each of these is removed, and the machine starts at UF-09.1:
    - an invalid JSON value;
    - `version: 2`;
    - an unknown `phase`;
    - `itemIndex` 9 for a 4-item plan.
  - **The pair.** A valid one restores.
- **AC-6 (screen ids, D-0111 §3)**
  - **First commit.** With a never-resolving `sessions.get`, the synchronous assert straight after `render` finds exactly one `[data-screen-id]`, `"UF-09"`.
  - **Step ids.** Through seeded stored states, the host renders `UF-09.1 … UF-09.9` for `getReady, warmup, set, confirm, rest, next, timed, timeCheck, paused` respectively.
  - **Host-level states.** `done`, not-on-device, ended and stale render `"UF-09"`.
  - **One at a time.** At every point in these tests, `document.querySelectorAll("[data-screen-id]").length` is 1.
- **AC-7 (chrome, principle 1, D-0111 §9 §10)**
  - **Every machine state except `paused`** renders:
    - a pause button named "Pause workout" (≥ 44 × 44 px in the e2e);
    - a progress bar with 1 + N segments (`aria-hidden`; P1: 5);
    - the index.
  - **The index.** It reads "Warm-up" in `getReady`/`warmup` and "1 / 4" on bench-press. On barbell-row, segment 0 is `done`, segment 1 (bench-press) is `done`, segment 2 is `current`, and the rest are `upcoming`.
  - **Buttons.** Each non-paused placeholder state has exactly 1 button. `paused` has exactly 1 ("Resume") and no chrome.
  - **No way out.** No state renders a `navigation` role, a C-01 (lint), a `banner`, a `role="alert"`, or an `a[href]` other than the host-level states' link to `/`.
  - **Pause and Resume.** "Pause workout" in `rest` shows UF-09.9. After 60 s of fake time, "Resume" shows UF-09.5 with the same remaining time as at the pause.
- **AC-8 (offline icon, NFR-OFF-6, D-0066 §14)**
  - **Offline.** Offline, the chrome contains an element with `aria-label="Offline"`, and no text "Offline ·", no `role="alert"` and no `banner`.
  - **Online.** Online, there is no such element.
  - **No mount refresh (D-0111 §11).** Online, after the host mounts with a valid row, the `refreshAll` spy and every `refresh*` spy from `lib/offline` have 0 calls, checked after 50 ms. The machine starts without waiting for the network. Offline, the same holds.
- **AC-9 (timer expiry and the check point, D-0111 §5 §8)**
  - **Auto-advance.** With fake timers, the host dispatches exactly one end event when `remainingS` reaches 0:
    - `getReady` at 5 s → `warmup` move 0;
    - `warmup` at 40 s → the next move;
    - `rest` at 120 s → `set`;
    - `next` at 60 s → `set`.
    - At 4 999 ms `getReady` is still showing.
  - **`timed` waits.** `timed` doesn't advance after 600 s.
  - **The check point.** `betweenItems` is never rendered, and no subscriber sees it: the persisted value after the `REST_END` is `next`.
    - An injected `resolveCheckPoint` spy is called once per check point, with the state at item 0's end.
    - The spy returning `"timeCheck"` gives UF-09.8. The default gives UF-09.6.
- **AC-10 (strings, exports, lint)**
  - **Strings.** Every UF-09 string comes from `en.uf09`. `react/jsx-no-literals` is green, and `en.ts` is unchanged.
  - **Exports.** A test pins `Object.keys` of `features/UF-09/index.tsx` to `["SessionHost"]`. T-0304e adds `useFocusSession`.
  - **Import bans.** The D-0071 §9 bans are green: no `components/body-map` and no `features/UF-02|06|07|10|11`.
- **AC-11 (shell tests unchanged, D-0108 §3, D-0111 §3)**
  - **Byte-identical.** `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`.
  - **Green.** They pass in the DoD run. The relevant cases are:
    - App.test `/session/<uuid>` → "UF-09" and "hides the tab bar on /session/:id";
    - routes.phase3.render AC-3;
    - auth-guard "stays on /session/<id> with no alert";
    - profile-gate AC-8.
- **AC-12 (bundle)** `check:size` is green, with the UF-09 chunk ≤ 100 KB gzip.
- **AC-13 (e2e: not on this device, online and offline, D-0086, D-0091 §1)** The new `tests/e2e/uf-09-focus.spec.ts` imports `test`/`expect` from `fixtures/guarded-test.js`. It is signed in with `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData` and `mockProfilePresent`, with no fixture edits:
  - **Online.** `/session/<random uuid>` shows "This workout isn't on this device" (built content only the T-0304a host renders) and a link to `/`. There is no `navigation` role.
  - **Offline.** After the precache settles, offline + reload of the same URL shows the same text within 3 s.
  - **a11y.** axe reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed Supabase request.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-09-focus.spec.ts`: new, this ticket's e2e spec (D-0071 §10); T-0304b–e append later.
  - `docs/tickets/T-0304a-focus-machine.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/offline` (`offlineDb`, `loadLibrary`, `currentUserId`, `upsertSession` in tests), `lib/format`, `lib/i18n/en.ts`, `components/offline-status`, `@workoutlab/engine` (`REST_COMPOUND_S`, `REST_ISOLATION_S`), `@workoutlab/shared` (`parseSessionPlan`), and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The plan is read as `SessionPlan` v1 through `parseSessionPlan`. Nothing is written to IndexedDB or Supabase in this ticket, apart from the test seeds through the existing `upsertSession`. The focus state is device-local `localStorage` (D-0066 §2).

## NFRs owned
TIME-1 (AC-2, AC-4), OFF-2 focus-state part (AC-3, AC-4), OFF-6 UF-09 part (AC-8), A11Y-6 frame part (AC-7, AC-13).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0304a` and cite the UF-09 screen (for example `T-0304a UF-09.5: wall-clock rest survives a reload`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** This ticket is parallel-safe by files with T-0303b, T-0303d, T-0302b and T-0302c. Its file set is `features/UF-09/**`, `flows/uf-09.ts`, `tests/e2e/uf-09-focus.spec.ts` and this file, and none of them lists any of those. Verification runs are staggered: one vitest/playwright process per machine (state.md).
- **Board (orchestrator, D-0111 §1–§2):**
  - Set T-0304a's deps to T-0300, T-0205, T-0318, and its status to ready.
  - Add T-0304e (lane `web-feature:UF-09`, deps T-0304a).
  - Re-point T-0304b's dep from T-0304a to T-0304e.
- **Size.** This is the upper end of ½ day. Spend the effort on AC-1 (the table), AC-3/AC-4 (persistence and restore) and AC-9 (expiry). The placeholders are deliberately bare.

## Build log
- **2026-10-02, frontend-dev (build).** All ACs have tests in `apps/web/src/features/UF-09/__tests__/` and `tests/e2e/uf-09-focus.spec.ts`.
- **Planted faults.** Each was applied, run, and reverted:
  - AC-3: the write in `queueMicrotask` → `store.test.ts` 4 red. The write moved into a host `useEffect` → `store.test.ts` 4 red, and `host.restore` "at 600 s" red.
  - AC-4: a tick-counting countdown (`setLeft((n) => n - 1)`) → `host.restore` 3 red, and the AC-2 source test red.
  - AC-9: an expiry dispatched twice → `host.expiry` 4 red, and `host.restore` "at 600 s" red.
  - AC-5: `>=` for the 12 h bound → "exactly 12 h" red. Dropping the `userId` check → the other-user row red.
- **TR-0036 (open).** In the built app, `parseSessionPlan` (an Ajv runtime compile) is blocked by the CSP (`script-src 'self'`, no `'unsafe-eval'`). Every real row therefore reads as not on this device. The seeded-session e2e row (the AC-7 44 × 44 check) is marked `test.fail` with TR-0036 until that's fixed.
- **Defaults T-0304b–e can rely on.** All are within D-0111, with no new decision:
  - `CHECK_RESOLVED` moves `itemIndex` to the next item for both `to: "next"` and `to: "timeCheck"`. In `timeCheck`, `itemIndex` is therefore already the next item (rule 8's `nextItemIndex`). `CONTINUE` goes to `next` with a 60 s timer and the same `itemIndex`.
  - `RESUME` from a pause taken during `warmup` moves `warmupStartedAtMs` forward by the pause length. `warmupSpentMs = leave − warmupStartedAtMs` then excludes pauses. `warmupStartedAtMs` is `null` outside the warm-up, and `SKIP_WARMUP` leaves `warmupSpentMs` at 0.
  - If there is no cached library, the host runs with `ctx.library = []`. Every rest is then `REST_COMPOUND_S`, and an exercise missing from the library gets the same.
  - The reducer stamps each logged entry with `itemIndex`, `setIndex`, `exerciseId` and `backoff = setIndex >= item.sets`, whatever the event carried.
  - A fresh start writes its initial state once. A restored state isn't rewritten until its first transition.
  - Expiry is checked after every render and by an exact wall-clock `setTimeout`. Because the check also runs on the 1 s re-render, a timer that still reads more than 0 when the timeout fires (clock moved back) ends on a later tick. Both checks read `store.getState()`, so each end event is dispatched once.
  - A stored state is rejected in two cases: its phase (or, when paused, its `resumePhase`) is one of `getReady`, `warmup`, `rest` or `next` with `timer: null`; or it is paused with `resumePhase` set to `paused` or `done`.
- **Rework 2 planted faults:**
  - The expiry check limited to `[store, state]` changes (the old behaviour) → the clock-moved-back test red.
  - The timer-required validation removed → 5 stored-state rows red.
  - The reducer passing the input's `backoff` through → the back-off test red.
