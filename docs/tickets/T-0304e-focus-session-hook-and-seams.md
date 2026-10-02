---
id: T-0304e
title: UF-09 useFocusSession() + seams.tsx — the focus-session hook (sets through lib/offline, the D-0069 §5 Workout, replaceItem/finish with whole-row upserts, wall-clock rest helpers, close() re-sync), the seam registry with v2 order and keepsClockRunning, and done → finish()
lane: web-feature:UF-09
screens: [UF-09.6, UF-09.9]
decisions: [D-0002, D-0015, D-0053, D-0066, D-0067, D-0069, D-0071, D-0103, D-0108, D-0111]
deps: [T-0304a]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Split out of the parent T-0304a row by D-0111 §1 (parent docs/tickets/T-0304-focus-mode.md, ACs A8–A9 there, plus the "done" half of AC-D6). Build flow: wl-build-web. About ½ day. Becomes ready when T-0304a is done. T-0304b depends on it. -->

## Why
Focus mode shows one task at a time (principle 1), but three other flows render inside it: UF-05.1 Swap, UF-04 How to, and UF-03.1 List view. D-0071 §4–§5 give them one way in, the `seams.tsx` registry, and one way to read and write the session, `useFocusSession()`. With these, they never import UF-09 and never call `upsertSession` themselves. This ticket builds both on top of T-0304a's store, so T-0304b's set loop and the later seam tickets all write sets through one owner of `loggedSets`. Every session write sends the whole stored row (D-0071 §6), so a queued partial row can never wipe `started_at` or the budget.

## Scope
- In:
  - **`useFocusSession()`**, exported from `features/UF-09/index.tsx` with a JSDoc that lists every field. It returns:
    - `{sessionId, row, plan, workout, state, currentItemIndex, currentSetIndex, loggedSets, rest, elapsedS}`;
    - the write methods `recordSet`, `editSet`, `deleteSet`, `replaceItem`, `finish`;
    - the rest helpers `startRest`, `adjustRest`, `skipRest`;
    - the overlay controls `resume` and `close`.
  - **`features/UF-09/seams.tsx`**: `pauseSeamActions` and `nextSeamActions`, both `[]`, with the entry type `{id, label, render(ctx), keepsClockRunning}`.
  - **A pure `orderActions`** for the v2 order.
  - **The overlay mechanics** in the host: in place of the screen, with `PAUSE`/`RESUME` per `keepsClockRunning`, and the check point forced to `"next"` while a `keepsClockRunning: true` overlay is open.
  - **`done` → `finish()`** with no confirm.
  - **Strings** go in `flows/uf-09.ts`. There are no new e2e rows (AC-12).
- Out:
  - The real UF-09.6/.9 views, Skip to next, End workout and its confirm (T-0304b, T-0304d).
  - Any seam entry: `swap` is T-0306b, `how-to` and `list-view` are T-0305a.
  - The time check (T-0304d).
  - Edits to `lib/offline/**`, `features/UF-03|04|05/**`, `routes.ts`, `en.ts`, `tests/e2e/fixtures/**` and the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** every write goes to the IndexedDB queue through `lib/offline`, and `finish()` navigates after the local write, with no network (AC-5, AC-6).
- **Time running out:** while a `keepsClockRunning: true` overlay (List view) is open, the check point never shows UF-09.8 (AC-9).
- **Zero history:** `recordSet` with `weightKg: null` is stored and listed as null (AC-3).
- **Returning after 10 days off:** nothing here reads history. `finish()` on a session restored from an earlier day still sends the whole row with its original `started_at` (AC-5).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-09/__tests__/`, using T-0304a's P1, store and signed-in stub.
- Fake timers are used wherever time matters.
- The `lib/offline` write functions are spies wrapping the real ones unless stated.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms (fake-timer advance plus a flush).
  - The "navigate only after the write" assert (AC-6) must fail on a planted fault: navigate before awaiting. The build log records it.

- **AC-1 (the hook's read fields, D-0066 §12, D-0071 §5)** Inside the host with P1, after bench-press set 1 is recorded through the hook as 80 × 6 and saved:
  - **Identity and position.** `sessionId` "S1". `row` deep-equals the stored `(await offlineDb().sessions.get("S1")).row`. `plan` deep-equals `row.plan`. `currentItemIndex` 0, `currentSetIndex` 1.
  - **`loggedSets`** = `[{clientId, itemIndex: 0, setIndex: 0, exerciseId: "bench-press", reps: 6, weightKg: 80, durationS: null, rir: null, backoff: false}]`, with `clientId` the one `recordSet` returned.
  - **`rest.remainingS`** is 120 at the rest start, and `null` outside `rest`.
  - **`elapsedS`** equals T-0304a's `elapsedS(…)` for the same instant.
  - **Outside the host,** calling the hook throws an `Error` whose message names `useFocusSession` and `SessionHost`.
- **AC-2 (the `Workout`, D-0066 §11, D-0069 §5)** For P1, `workout` is:
  - `plan` = `row.plan`, `budgetMin` 45, `warmupInBudget` true, `energy` "normal", `sessionReasons` `[]`;
  - `itemsTotalS` = Σ `costS` (1980), `totalS` 2160 (+ `WARMUP_COST_S`);
  - `unusedS` = `max(0, availableS(45, true) − 1980)`, computed with the engine's `availableS`.
  - With `warmup_in_budget` false, `unusedS` uses `availableS(45, false)`.
- **AC-3 (set writes, D-0071 §5)**
  - **`recordSet`.** `recordSet(input)` calls `lib/offline` `recordSet` once with `input` and adds the entry to `loggedSets`. With the real queue, a fresh Dexie instance sees the row.
  - **Which machine event.** After the write resolves, the hook dispatches:
    - `SET_RECORDED` when the phase is `set` and `input` is the current item's current set;
    - `TIMED_RECORDED` when the phase is `timed` and it is the current set;
    - otherwise no transition, only the `loggedSets` update. This is a List-view log out of order.
    - The pair: a log for item 2 while in `set` of item 0 leaves the phase `set`.
  - **`editSet`.** `editSet(clientId, {reps: 5})` calls `editSet` once and updates that entry.
  - **`deleteSet`.** `deleteSet(clientId)` calls `deleteSet` once and removes the entry.
  - **Rejection.** A rejected `lib/offline` call rejects from the hook and leaves `loggedSets` unchanged.
  - **The next set follows the live sets.** After set indexes 0 and 1 of bench-press are logged through the hook (as UF-03.1 does), the machine's next `set` is `setIndex` 2. After `deleteSet` of index 0 and a `close()`, it is `setIndex` 0.
  - **Null weight.** `weightKg: null` is stored and listed as null.
- **AC-4 (`replaceItem`, D-0071 §5 §6)**
  - **The call.** `replaceItem(1, item)` calls `upsertSession` exactly once with `{...row, plan: {...plan, items: [items[0], item, items[2], items[3]]}}`. `started_at`, `time_budget_min`, `energy`, `warmup_in_budget` and `ended_at` are deep-equal to before.
  - **After the write.** The hook's `plan` and the persisted focus state reflect the new item. Logged sets keep their `exerciseId`.
  - **Main lift.** `replaceItem(0, item, "push-up")` also sets `plan.mainLiftId` to `"push-up"`. Without the third argument, `mainLiftId` is unchanged.
  - **Only current or later items.** `replaceItem` on an index before `currentItemIndex` rejects with a `RangeError` and makes no write. On the current index it succeeds.
- **AC-5 (`finish()`, D-0071 §5)**
  - **The order.** `finish()` reads the stored row, calls `upsertSession({...row, ended_at: now})` (whole row, with the original `started_at`), removes `localStorage["wl-focus:S1"]`, and then calls `navigate("/session/S1/summary")`.
  - **Navigate after the write.** With `upsertSession` held on a deferred promise, there is no navigation and the focus key is still present after 50 ms.
  - **One finish.** A second `finish()` while pending makes no second write.
  - **Rejection.** A rejected write leaves the key in place, doesn't navigate, and rejects from `finish()`.
- **AC-6 (`done` → `finish()`, parent AC-D6 done part)**
  - **Done.** Reaching `done` (P1's last plank set recorded) calls `finish()` once with no confirm, and the location becomes `/session/S1/summary`, rendering `[data-screen-id="UF-03.3"]` (the T-0318 stub, found with `findBy`).
  - **The pair.** In `rest` of the last-but-one set, no write with `ended_at` happens.
- **AC-7 (rest helpers, D-0071 §5)**
  - **`startRest`.** `startRest("bench-press")` starts a 120 s wall-clock rest, and `startRest("leg-curl")` a 60 s one. `rest.remainingS` follows T-0304a's `remainingS`: 30 after 90 s.
  - **`adjustRest`.** `adjustRest(-15)` ×9 floors at 0, and `adjustRest(15)` adds 15 with no cap.
  - **`skipRest`.** `skipRest()` sets `rest` to `null`.
- **AC-8 (`close()` re-sync, D-0071 §5)** From a `keepsClockRunning: true` overlay:
  - with bench-press sets 0–3 logged and no rest running, it lands on `set` for barbell-row `setIndex` 0;
  - with a rest running, it lands on `rest` with the same remaining time;
  - with every planned set logged (including a back-off where the plan has one), it lands on `done`, which finishes (AC-6).
- **AC-9 (seams, D-0071 §4)**
  - **Empty registries.** `pauseSeamActions` and `nextSeamActions` are both `[]` (a test pins it). With them empty, no seam button is in the DOM on UF-09.6 or UF-09.9.
  - **`orderActions`.**
    - `orderActions(["resume", "skip", "end"], [{id: "list-view"}, {id: "swap"}, {id: "how-to"}, {id: "bogus"}], "pause")` → `["resume", "swap", "skip", "how-to", "list-view", "end"]`.
    - With `"next"`: `orderActions(["ready"], [{id: "swap"}], "next")` → `["ready", "swap"]`.
    - An unknown id is dropped.
  - **Injection.** `SessionHost` takes an optional `seams` prop `{pause, next}` that defaults to the module arrays. With injected `swap`, `how-to` and `list-view` entries, the UF-09.9 placeholder renders Resume · Swap · How to · List view in that order (Skip and End arrive with T-0304d at their `orderActions` positions). UF-09.6 renders the Swap entry.
  - **Overlay in place of the screen.** Activating an entry renders `render(ctx)` **in place of** the screen and its actions: the only `[data-screen-id]` is gone, there is no pause button, and the overlay is the only task. `ctx` has every `useFocusSession()` field plus `close`.
  - **`keepsClockRunning: false` from UF-09.6.** It dispatches `PAUSE`, so the 60 s countdown is unchanged after 30 s of fake time. `close()` dispatches `RESUME` and returns to UF-09.6.
  - **`keepsClockRunning: false` from UF-09.9.** It stays `paused`, and `close()` returns to `paused`.
  - **`keepsClockRunning: true` from `paused`.** It dispatches `RESUME`, and the rest timer keeps counting under the overlay (30 s less after 30 s). A check point reached while it is open resolves to `next` with 0 calls to an injected `resolveCheckPoint` spy. After `close()`, the next check point calls it once.
- **AC-10 (strings, exports, lint)**
  - **Exports.** The export pin becomes `Object.keys(index)` sorted = `["SessionHost", "useFocusSession"]`.
  - **Strings.** Every string comes from `en.uf09`. `react/jsx-no-literals` and the D-0071 §9 bans are green, and `en.ts` is unchanged.
  - **No cycles.** `seams.tsx` imports nothing from `features/UF-03|04|05` yet.
- **AC-11 (shell tests unchanged)** As T-0304a AC-11: no file under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts` changes, and they pass.
- **AC-12 (no new e2e rows)** The hook and the registry have no UI of their own beyond T-0304a's placeholders. The first e2e that drives a real session is T-0303d's Start → `/session/<id>`, and T-0304b's set loop. This ticket adds no rows to `tests/e2e/uf-09-focus.spec.ts`. The whole e2e suite still runs in the DoD (state.md: e2e for anything touching `apps/web/src/**`), and T-0304a AC-13 must stay green.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `docs/tickets/T-0304e-focus-session-hook-and-seams.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/offline` (`recordSet`, `editSet`, `deleteSet`, `upsertSession`, `offlineDb`, `loadLibrary`), `lib/format`, `lib/i18n/en.ts`, `@workoutlab/engine` (`availableS`, `WARMUP_COST_S`, `REST_COMPOUND_S`, `REST_ISOLATION_S`), `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. Sets and sessions go through the T-0300c queue as D-0015, D-0045 §6 and D-0053 §7 define, always as whole rows (D-0071 §6). The `Workout` passed to seams is the `api/openapi.yaml` shape, built the D-0069 §5 way.

## NFRs owned
OFF-2 write-path part (AC-3, AC-5), SYNC-1 (`client_id` from `recordSet`, AC-3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green (UF-09 chunk ≤ 100 KB gzip) · contracts unchanged · commits start `T-0304e` and cite UF-09.9 or UF-09.6 (for example `T-0304e UF-09.9: seam registry in v2 order`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** This ticket is in the same lane as T-0304a–d, so they run one after another (a → e → b → c → d). It is parallel-safe by files with the UF-08 and UF-02 tickets.
- **Board (orchestrator, D-0111 §1):**
  - Add this row (lane `web-feature:UF-09`, deps T-0304a, `wl-build-web`).
  - Re-point T-0304b to T-0304e.
  - Optionally re-point T-0306b/T-0305a's UF-09 dep to T-0304e (D-0111 Consequences).

## Build log
- **2026-10-02, frontend-dev (build).** All ACs have tests in `apps/web/src/features/UF-09/__tests__/`:
  - AC-1, AC-2: `session.read.test.tsx`.
  - AC-3, AC-4: `session.writes.test.tsx`.
  - AC-5, AC-6: `session.finish.test.tsx`.
  - AC-7, AC-8: `session.rest.test.tsx`.
  - AC-9: `seams.test.tsx`.
  - AC-10: `exports-and-lint.test.ts` (the pin is now `["SessionHost", "useFocusSession"]`, plus a `seams.tsx` import check).
  - The new reducer events: `machine.session.test.ts` (pure, no mutation, same object when an event doesn't apply).
- **How the tests reach the hook.** The hook is read through a probe that a mocked `views.js` renders inside every machine view (`__tests__/probe.tsx`). The writes are spies over the real `lib/offline` functions (`__tests__/offline-spies.ts`). `store-spy.ts` also keeps the created store, so a test can dispatch `SAVED`/`READY` the way T-0304b's views will. No production test hook was added.
- **Planted faults.** Each one was applied, run, and reverted:
  - AC-5/AC-6: `navigate` before `await upsertSession` in `finish()` → the held-write test ("no navigation and the key is kept after 50 ms") and the rejected-write test go red.
  - AC-9: the forced `"next"` check point removed → the "true from paused" test goes red (the `resolveCheckPoint` spy is called while List view is open).
  - AC-9: no `PAUSE` when a `keepsClockRunning: false` overlay opens on UF-09.6 → the countdown test goes red.
  - AC-8: `RESYNC` returning `state` → 4 tests red.
  - AC-3: `REST_END` back to `setIndex + 1` → "the next set is 2" goes red.
- **Diff checks** (recorded here, not as tests). `git diff --stat main...HEAD` touches only `apps/web/src/features/UF-09/**`. There are no changes under `apps/web/src/app/**`, `apps/web/src/lib/**` (so `en.ts` is unchanged), `tests/e2e/**`, `api/`, `packages/` or `docs/{data-model,engine-rules}.md`. `flows/uf-09.ts` needed no new keys: seam labels come from the seam entries.
- **One T-0304a test changed on purpose.** In `host.load.test.tsx`, "host-level: done, …", the `done` step now really finishes S1 (D-0111 §3: "until T-0304e's `finish()` navigates away"). So the stale part of that test uses its own unended session S3. Every assertion is kept.
- **Defaults that T-0304b–d and the seam tickets can rely on.** All of these are within D-0071 §4–§6 and D-0111, with no new decision.
  - **`recordSet(input)`.** The input is `RecordSetInput & {itemIndex}`, and the whole object goes to `lib/offline` `recordSet`. It resolves to the stored `LoggedSet` (`.clientId`).
    - `SET_RECORDED` is dispatched when the phase is `set` and the input is the current item and set. `TIMED_RECORDED` is dispatched for the same match in `timed`.
    - Anything else is a new `SET_LOGGED`, which updates only `loggedSets`.
  - **Edits and deletes.** `editSet` and `deleteSet` dispatch the new `SET_EDITED` and `SET_DELETED` events, in any phase.
  - **`REST_END` follows the live sets.** It goes to the first set index *after* the current one that has no live logged set, otherwise to `betweenItems`. With no out-of-order logs, this is the same as before. A set index below the current one is picked up only by `close()`.
  - **`startRest`.** It dispatches the new `REST_START`, which works only from `set`, `confirm`, `rest` and `timed`. From any other phase it returns the same state. Rest uses the library `type`, and a missing exercise gets the compound rest.
  - **`skipRest` and `adjustRest`.** `skipRest` is `REST_END`. `adjustRest` is `REST_ADJUST`. A rest that is adjusted to 0 ends at the next render (T-0304a expiry).
  - **`currentSetIndex`.** It is `state.setIndex`, except in `rest`. There it is the set the rest leads to: the item's first unlogged set after the current one, or `setsInItem` when no set is left. That is why AC-1 reads 1 after set 0 is saved.
  - **`replaceItem`.** It rejects with `RangeError` for an index below `state.itemIndex` or past the end. It writes `{...storedRow, plan}`, then calls `store.replacePlan`. The new `PLAN_REPLACED` event makes the current `set`/`timed` (or a paused `resumePhase`) follow the new item's `repsMin`. `setIndex` stays, capped at the new item's set count.
  - **`close()` (`RESYNC`).** It changes nothing when the phase is `paused`, `done`, or `rest` with a timer. A warm-up with nothing logged is kept. Otherwise it goes to the first item with an unlogged planned set (back-off included), at that set. UF-09.6 or UF-09.8 for that same item, at set 0, is kept. With every set logged it goes to `done`, which finishes. Leaving the warm-up this way records `warmupSpentMs`.
  - **`finish()`.** It reads the stored row and writes `{...row, ended_at: now}`, then removes the focus key, then navigates. While it is pending, it returns the same promise. A rejected finish can be called again.
  - **`done`.** The host calls `finish()` from an effect, and a rejection is caught. The done screen stays.
  - **Overlays.** An overlay replaces the whole host output, including the chrome, and has no `[data-screen-id]`.
    - A `keepsClockRunning: false` overlay opened from a running screen (UF-09.6) dispatches `PAUSE`, and `RESUME` on close. Opened from UF-09.9, it dispatches neither.
    - A `keepsClockRunning: true` overlay dispatches `RESUME` if the workout is paused. It forces the check point to `"next"` until close, and `close()` dispatches `RESYNC`. It doesn't return to `paused`.
  - **`Workout.totalS`.** It is `itemsTotalS + WARMUP_COST_S` for both values of `warmupInBudget`, as the engine builds it (`buildSession` and `applySwap`). An unknown `energy` reads as `"normal"`.
- **Evidence.**
  - UF-09 vitest: 14 files, 231 tests.
  - `pnpm --filter @workoutlab/web test`: 110 files, 1586 tests.
  - typecheck and lint: 0.
  - e2e: `uf-09-focus` 4/4, and the whole suite 71/71.
  - `-w format:check`: 0. `check-all.mjs`: 0.
  - `check:size` after a fresh build: 0. The UF-09 chunk is about 6.5 KB gzip.
