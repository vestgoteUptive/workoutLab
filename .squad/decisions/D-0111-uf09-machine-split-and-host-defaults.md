---
id: D-0111
title: UF-09 focus machine (T-0304a) — split off T-0304e (useFocusSession + seams), drop the T-0303d dep, host-level vs step screen ids, the reducer's signature, state and events, a store that persists synchronously, timer expiry, restore guards (other user, stale > 12 h), placeholder views
status: revisit
date: 2026-10-02
by: product-owner (groom T-0303b/T-0303d/T-0304a)
area: product
builds-on: D-0066 §1 §2 §7 §11 §12, D-0071 §4 §5 §6, D-0103, D-0108 §3
---
## Context
The T-0304 parent row for T-0304a holds the reducer, timer maths, persistence and restore, session loading, chrome, placeholder views, the full `useFocusSession()` hook (about ten methods) and `seams.tsx` with overlay and `keepsClockRunning` semantics. That is more than half a day of agent work, and web builds that run past their budget die without a result (D-0106 Context).

Grooming also found these open points:
1. **The dep on T-0303d.** T-0304a needs only a `sessions` row in IndexedDB, which a test can write with the real `upsertSession`. The focus-prefs hand-off is T-0304c's. Waiting on T-0303d puts UF-08.2 and UF-08.4 on the critical path of focus mode for no reason.
2. **Screen ids versus the shell tests.** `App.test.tsx`, `routes.phase3.render.test.tsx`, `auth-guard.test.tsx` and `profile-gate.test.tsx` all visit `/session/<id>` with no session row and read the **first** `[data-screen-id]`, expecting `"UF-09"`. Parent AC-A7 gives the step states UF-09.1–.9. If the host showed only step ids, those files would need a D-0088 grant. `profile-gate.test.tsx` is a "never two at once" file (state.md), so a grant would serialise the build against T-0301c-style tickets.
3. **How the reducer stays pure.** Rest length depends on the library `type`, and timers need "now".
4. **When "after every transition" is written.** A `useEffect` write runs after paint, so a kill between the two loses the step. A test can't see that difference unless the write happens outside React.
5. **Restore guards.** The sessions table is keyed by `id` only, so a row from another user on the same device must not load. A focus state from 10 days ago for a session that never ended would otherwise resume a "live" workout with 14 400 min elapsed.
6. **What placeholder views render** before T-0304b–d, and which timers auto-advance in T-0304a.

## Decision
1. **Split.** T-0304a becomes two children in lane `web-feature:UF-09`, which run one after the other:
   - **T-0304a, machine + host.** `machine.ts`, `timer.ts`, `persist.ts`/the store, `SessionHost` loading and its edge states, the chrome, the per-state view registry with placeholder views, timer expiry, the check-point resolver seam, and the e2e spec file. Parent ACs A1–A7.
   - **T-0304e, session hook + seams.** `useFocusSession()` (parent AC-A8, D-0071 §5), `seams.tsx` (parent AC-A9, D-0071 §4), and `done` → `finish()`.
   - Board (orchestrator): add T-0304e (deps T-0304a), and re-point T-0304b's dep from T-0304a to T-0304e. T-0304b's views write sets through the hook's `recordSet`/`editSet`, so `loggedSets` has one owner.
2. **T-0304a's deps are T-0300, T-0205 and T-0318** (all done). T-0303d is dropped (the parent T-0304's "the orchestrator may relax that dependency"). T-0304a seeds its session rows with the real `upsertSession` over `fake-indexeddb`, with a signed-in user stubbed through the supabase-js `localStorage` key that `currentUserId()` reads. T-0304a can start now. It shares no file with T-0303b, T-0302c or T-0303a.
3. **Two kinds of screen id, one on the page at a time.**
   - **Host-level states** render `data-screen-id="UF-09"`: loading (the first commit, before any IndexedDB read resolves), "This workout isn't on this device", "This workout has ended", the stale state (§7), and `done` (until T-0304e's `finish()` navigates away).
   - **Machine states** render `UF-09.1 … UF-09.9` for `getReady, warmup, set, confirm, rest, next, timed, timeCheck, paused`.
   - `betweenItems` is never rendered (§5).
   - Exactly one `[data-screen-id]` is in the DOM at any moment. The shell tests above see `"UF-09"` (the loading state, then the not-on-device state) and stay byte-identical (the D-0108 §3 approach). No host-level state uses `role="alert"` or a `banner` (the auth-guard test on `/session/<id>` asserts none).
4. **The reducer.** `focusReducer(state, event, ctx)`, where `ctx = {plan: SessionPlan, library: readonly LibraryExercise[]}`.
   - It never reads a clock: every event carries `atMs`.
   - It never mutates its inputs.
   - Rest is `REST_COMPOUND_S` for a library `type` of `compound` and `REST_ISOLATION_S` otherwise. An exercise missing from `library` gets `REST_COMPOUND_S`, the longer and safer rest.
   - **State (persisted as is):** `{version: 1, sessionId, phase, itemIndex, setIndex, warmupIndex, timer: {startedAtMs, durationS, pausedMs} | null, pausedAtMs: number | null, resumePhase: Phase | null, workoutPausedMs, warmupStartedAtMs: number | null, warmupSpentMs, loggedSets: LoggedSet[]}`. `setIndex` is 0-based. The back-off set has index `item.sets` and `backoff: true`. `LoggedSet` is D-0066 §12's `{clientId, itemIndex, setIndex, exerciseId, reps, weightKg, durationS, rir, backoff}`.
   - **Timers per phase:**
     - `getReady`: 5 s.
     - `warmup`: the move's `durationS`.
     - `rest`: by `type`, as above.
     - `next`: 60 s (D-0066 §10).
     - `set`, `confirm`, `timeCheck`, `done`: none.
     - `timed`: none in T-0304a. T-0304c adds its 3 s + hold timer.
   - **Events:** `COUNTDOWN_END`, `SKIP_WARMUP`, `WARMUP_NEXT`, `WARMUP_RESTART`, `SET_RECORDED {set}`, `SAVED {set?}`, `REST_END`, `REST_ADJUST {deltaS}`, `CHECK_RESOLVED {to: "next" | "timeCheck"}`, `CONTINUE`, `READY`, `TIMED_RECORDED {set}`, `PAUSE`, `RESUME`. T-0304b–e may add events, but never change these.
   - **Entering an item** (from `SKIP_WARMUP`, a `COUNTDOWN_END` with an empty warm-up, or `READY`) goes to `timed` when the item's `repsMin` is null, else to `set`.
   - **Warm-up time.** `warmupSpentMs` = the wall time between entering `warmup` and leaving it, minus the pauses taken during it. A skipped warm-up gives 0.
5. **The check point.** When the reducer returns `betweenItems`, the store calls an injectable `resolveCheckPoint(state, ctx, atMs) → "next" | "timeCheck"` and dispatches `CHECK_RESOLVED` in the same `dispatch` call, before subscribers are notified. The default returns `"next"`. T-0304d replaces it with the rule 8 call, and T-0304e's `keepsClockRunning` overlay forces `"next"`.
6. **A store outside React persists synchronously.** `createFocusStore({sessionId, ctx, initial, storage, resolveCheckPoint})` returns `{getState, dispatch, subscribe}`. The host reads it with `useSyncExternalStore`. `dispatch` runs the reducer, writes `storage.setItem("wl-focus:<sessionId>", JSON.stringify(state))`, and only then notifies. So the write has happened when `dispatch` returns. If `setItem` throws (quota, private mode), the transition still happens: the workout never stops for storage.
7. **Loading and restore.**
   - **Not on this device** ("This workout isn't on this device", a link to `/`). This covers:
     - no `offlineDb().sessions.get(id)` row;
     - a row whose `userId` isn't `currentUserId()`;
     - `parseSessionPlan(row.row.plan)` not ok, or ok with `plan: null`;
     - IndexedDB unavailable or the read rejecting (caught, never an uncaught error or an unhandled rejection).
   - **Ended** ("This workout has ended", a link to `/`): `row.ended_at` is set. A stored `wl-focus:<id>` is removed.
   - **Stale:** `ended_at` is null and `started_at` is more than 12 h before now. The host shows "This workout was started on {date}" (`formatTime`/`localDate` in the device locale and tz) with a link to `/`, and starts no machine. The stored focus state is kept, so nothing is lost. Exactly 12 h still restores.
   - **Restore:** a stored value with `version: 1`, a matching `sessionId`, a known `phase`, and `itemIndex`/`setIndex`/`warmupIndex` in range for the current plan is restored. Anything else is removed, and the machine starts at `getReady` item 0.
   - **On mount after a restore,** an expired timer fires its expiry event once (§8). Restoring 10 min after a 120 s rest started lands on `set` for the next set. It never chains further: `set` has no timer.
8. **Timer expiry in T-0304a.** The host re-renders on a 1 s `setInterval`, and the interval only triggers renders. When `remainingS` reaches 0, it dispatches the phase's end event once:
   - `getReady` → `COUNTDOWN_END`;
   - `warmup` → `WARMUP_NEXT`;
   - `rest` → `REST_END`;
   - `next` → `READY`.

   `timed` has no auto-end until T-0304c, because its end writes a set. Nothing counts ticks (NFR-TIME-1).
9. **Placeholder views (T-0304a).** Each machine state renders an `<h1>` from `en.uf09` and, for a phase with a timer, an element with `role="timer"` showing `m:ss` of `remainingS`. They render no action buttons, except `paused`, which renders one button, "Resume". T-0304b–d replace them and own their buttons. With the chrome's "Pause workout", every non-paused machine state has exactly one button.
10. **Chrome copy.** The index reads "Warm-up" in `getReady` and `warmup`, and "{itemIndex + 1} / {N}" otherwise. The progress bar has 1 + N segments (warm-up + one per item, `aria-hidden`), each with `data-state` = `done` | `current` | `upcoming`. The warm-up segment is `done` once `phase` has left `getReady`/`warmup`. With an empty `plan.warmup`, the warm-up segment is still drawn and is `done`.

## Consequences
- T-0304a encodes §2–§10. T-0304e encodes parent AC-A8/A9 and `done` → `finish()`, on top of §4–§6.
- T-0304b–d build on the event list in §4 and the store in §6, and replace the §9 placeholders.
- T-0306b and T-0305a still list `features/UF-09/seams.tsx` as their one UF-09 grant. It now comes from T-0304e, not T-0304a. Their board deps (T-0304d, T-0304) are unchanged. The orchestrator may move them to T-0304e, because their tests build `ctx` directly (D-0071 §5).
- The parent T-0304 table gains T-0304e.

## Revisit when
- Real sessions run past 12 h (very unlikely), or users ask to resume yesterday's unfinished workout. Then the stale state gets a "Resume anyway" action.
- A corrupt or out-of-range focus state shows up in real use. Then re-sync from `loggedSets` (T-0304e's `close()` logic) instead of starting at `getReady`.
- Unknown-type exercises appear in the library. Then pick the rest from the exercise's areas instead.
