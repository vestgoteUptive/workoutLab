---
id: T-0304c
title: UF-09.2 Warm-up + UF-09.7 Timed set — 40 s moves with Restart / Next move and nothing logged, one wall-clock timer for the 3 s position + the pre-fill hold, a ring-only pause, the hold auto-logged once through the hook, D-0062 §5 copy
lane: web-feature:UF-09
screens: [UF-09.2, UF-09.7]
decisions: [D-0004, D-0062, D-0066, D-0071, D-0086, D-0091, D-0111, D-0118, D-0119]
deps: [T-0304f]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (parent AC-C1–C4). The parent's T-0304c row is split by D-0118 §1: this ticket keeps the two views; wake lock, cues and reduced motion (C5–C7) move to T-0304g, which is the child that imports readFocusPrefs from T-0303d. So this ticket doesn't wait on T-0303d. Build flow: wl-build-web. About ½ day. -->

## Why
- **The warm-up** gets the user moving without counting as training. Warm-up moves never become
  sets (D-0004, D-0066 §8).
- **Timed sets** are the one place where focus mode logs a set by itself. The hold length is the
  engine's `prefill.durationS` (principle 3, D-0062). The log has to happen exactly once, even after
  a locked phone or a reload (NFR-TIME-1, NFR-OFF-2).
- **The copy** must never claim "same as last time" for a clamped hold (D-0062 §5).

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **The UF-09.2 view:** the move name, the cue, a 40 s `role="timer"`, "Restart" and "Next move".
  - **The UF-09.7 view:**
    - "Get in position" then "Hold";
    - the ring;
    - "Pause timer" / "Resume timer";
    - the kind line;
    - "Log hold" on a failed write.
  - **`machine.ts`** (D-0119 §1–§2):
    - `POSITION_S`;
    - the `timed` timer on entry;
    - `TIMER_PAUSE` / `TIMER_RESUME`;
    - `timerPausedAtMs`;
    - the `RESUME` rule for a ring paused during a workout pause.
  - **`persist.ts`.** The validation accepts a missing `timerPausedAtMs` (D-0119 §2).
  - **The host.** The timed expiry calls `useFocusSession().recordSet` once (D-0119 §3), and the
    announcer says "Done" (D-0118 §10).
  - **Strings and e2e.** Strings go in `flows/uf-09.ts`. One e2e row is appended to
    `tests/e2e/uf-09-focus.spec.ts`.
- Out:
  - `readFocusPrefs`, wake lock, cues and reduced motion (T-0304g).
  - UF-09.8 and .9 (T-0304d).
  - The T-0219 costing (landed; no UI change, D-0066 §9).
  - Edits to `lib/offline/**`, `lib/format/**`, `en.ts`, `components/**`, `tests/e2e/fixtures/**`
    and the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the hold auto-logs into IndexedDB with no network (AC-3, AC-6).
- **Time running out:** the ring pause stops only the hold. Rule 8's elapsed time keeps running
  (AC-4). The warm-up's "Next move" shortens it.
- **Zero history:** a `first_time` timed pre-fill holds its `durationS` (the engine's
  `defaultDurationS`) with no extra line (AC-5).
- **Returning after 10 days off:** `hold_after_break` and `reentry` read "Easing back in", and no
  copy claims "same as last time" (AC-5).
- **Reload / kill:**
  - A hold that ended while the phone was locked logs once, with the planned hold (AC-3).
  - A restored ring pause stays paused (AC-4).

## Acceptance criteria
**Test setup.**
- As T-0304b: P1 (the plank is item 3: prefill `durationS` 50 `add_rep`, item `durationS` 45), L1,
  the mocked `loadExerciseDetail` (wu-scap-push-up → cue "Arms straight", wu-band-pull-apart →
  `null`), and fake timers.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms.
  - **AC-3 and AC-4 must fail on unfixed code.** The build log records the planted faults turning
    them red:
    - the auto-log without its in-flight guard (two `recordSet` calls on a re-render at 0);
    - a ring pause that adds to `workoutPausedMs`.

- **AC-1 (UF-09.2 Warm-up, parent AC-C1, D-0066 §8)**
  - **Move 0.** P1 after UF-09.1 shows move 0's library name "Scap push-up", a `role="timer"` 0:40,
    and the cue "Arms straight". The pair: move 1 ("Band pull-apart", detail `null`) has no cue
    element.
  - **Auto-advance.** At 40 s it shows move 1. After move 3 it shows UF-09.6 for bench-press.
  - **Restart.** "Restart" at 25 s reads 0:40 again, from the wall clock: the persisted
    `timer.startedAtMs` is the click's `atMs`.
  - **Next move.** "Next move" advances at once.
  - **Nothing logged.** Over the whole warm-up, `recordSet` has 0 calls.
  - **Focus** lands on "Next move".
  - **Button pin.** The T-0304a AC-7 count for `warmup` becomes 3 (Pause, Restart, Next move).
- **AC-2 (UF-09.7 position + hold, parent AC-C2, D-0119 §1)** Plank set 1:
  - **Entry.** On entering `timed`, the persisted `timer` is `{startedAtMs: atMs, durationS: 53,
    pausedMs: 0}` (3 + 50).
  - **Position.** For 3 s it shows "Get in position" and 3, 2, 1.
  - **Hold.** Then it shows "Hold 0:50", counting down. This is **50**, from `prefill.durationS`, not
    `item.durationS` 45.
  - **Fallbacks.** `prefill.durationS` `null` holds `item.durationS` (45). Both `null` hold 45.
- **AC-3 (the auto-log, D-0119 §3)**
  - **At 0.** When the hold reaches 0, `recordSet` is called exactly once (the `lib/offline` spy,
    through the hook) with `{sessionId: "S1", exerciseId: "plank", setIndex: 0, kind: "timed",
    durationS: 50, reps: null, weightKg: null, rir: null, isWarmup: false, backoff: false}`.
  - **After the write.** After it resolves, the machine is in `rest` with `REST_ISOLATION_S` (the
    plank is an isolation exercise). For the last plank set it goes to `done`.
  - **Announcer.** The announcer says "Done" (NFR-A11Y-4).
  - **Pending.** With the write held pending, re-renders over 5 s of fake time make no second call.
  - **Restore after the end.** Remounting 10 min after the hold started shows exactly one
    `recordSet`, with `durationS: 50`.
  - **The pair, already logged.** With an entry for `(3, 0)` already in `loggedSets`, the remount
    makes 0 calls.
  - **Rejection.** A rejected write shows "Couldn't save. Tap Log hold to try again." (polite, no
    `role="alert"`) and one "Log hold" button. That button calls `recordSet` again.
- **AC-4 (the ring-only pause, D-0119 §2, parent AC-C2/C3)**
  - **The button.** "Pause timer" (≥ 44 px, by CSS class) at hold 30 s left, then 20 s of fake time,
    then "Resume timer" → 30 s left. The hold ends 20 s later than it would have.
  - **Workout clock.** `workoutPausedMs` is unchanged by the ring pause, so `elapsedS` grew by 20.
  - **A workout pause during the hold** (parent AC-C3). Chrome "Pause workout" at 30 s left, 60 s of
    fake time, then Resume → 30 s left, and `workoutPausedMs` grew by 60 000.
  - **Both pauses.** A ring pause, then a workout pause of 60 s, then Resume, keeps the ring paused.
    After "Resume timer", the remaining time equals the value at the ring pause, so the time is
    counted once.
  - **Restore.** A remount while ring-paused shows "Resume timer" and the same remaining time.
  - **Old stored states.** A stored `timed` state with no `timerPausedAtMs` key restores (the pair
    of a non-number value, which is rejected).
  - **No-op.** `TIMER_PAUSE` outside `timed` returns the same state object.
  - **Button pin.** The T-0304a AC-7 count for `timed` becomes 2 (Pause workout, Pause timer).
- **AC-5 (the copy, parent AC-C4, D-0062 §5, D-0119 §4)**
  - **Hold.** A timed item with prefill `{durationS: 120, kind: "hold"}` reads "Hold 2:00", with no
    kind line.
  - **Easing back in.** `hold_after_break` and `reentry` each show "Easing back in".
  - **The pair.** `add_rep`, `first_time` and `increase` show no kind line.
  - **No claims.** For every kind, the text of UF-09.6 (T-0304f's view for a timed item) and of
    UF-09.7 doesn't match `/same|last time|as before/i`.
- **AC-6 (e2e, D-0086, D-0091 §1)** A row is appended to `tests/e2e/uf-09-focus.spec.ts`.
  - **Setup.** A seeded row with a plan of `warmup` [1 move] and `items` [one timed item: prefill
    `durationS` 5, `repsMin` `null`, 1 set]. Offline after the precache settles, then a reload.
  - **Walk.** UF-09.1 → UF-09.2 (built content: the move's heading) → Next move → UF-09.6 → I'm
    ready → UF-09.7 "Get in position" → "Hold". It may use `page.clock` (D-0120 §9).
  - **IndexedDB.** After the hold, `wl-offline.sets` holds exactly one row: `kind` "timed",
    `durationS` 5, `reps` `null`, `isWarmup` false. There is no warm-up row.
  - **a11y.** axe on UF-09.2 and UF-09.7 reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed request.
- **AC-7 (strings, exports, lint)**
  - **Strings.** Every new string comes from `en.uf09`. `react/jsx-no-literals` and the D-0071 §9
    bans are green.
  - **Exports.** The export pin is unchanged.
  - **No tick counting.** The T-0304a AC-2 source test still passes.
  - **The D-0119 hand-off.** The T-0304a AC-9 assert "`timed` doesn't advance after 600 s" is
    replaced by AC-3's auto-log. The build log notes it.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows (D-0071 §10).
  - `docs/tickets/T-0304c-warmup-and-timed.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (through `useFocusSession()`, plus `loadExerciseDetail`), `lib/i18n/en.ts`, `@workoutlab/engine` (`REST_ISOLATION_S`, `REST_COMPOUND_S`), and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The hold is written through `recordSet` (`kind: "timed"`) as D-0015 and D-0045 §6 define.
The ring pause is device-local focus state (D-0119 §2).

## NFRs owned
TIME-1 hold part (AC-2, AC-4), OFF-2 timed part (AC-3, AC-6), A11Y-4 timed part (AC-3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo`
and `check:size` green · contracts unchanged · commits start `T-0304c` and cite the screen (for
example `T-0304c UF-09.7: hold from prefill.durationS, auto-logged once`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** It needs T-0304f (UF-09.6 is how the walk reaches UF-09.7). It doesn't need T-0303d:
  the prefs moved to T-0304g (D-0118 §1).
- **Parallel.** It is parallel-safe by files with every UF-08 ticket.
