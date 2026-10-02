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
    - the exercise name as the heading ("Hold name" in the user-flows table), with the D-0118 §8
      fallback;
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
  - **Heading.** The `<h1>` is "Plank" in both the position and the hold phase. The pair: with plank
    missing from the library, it is "plank" (D-0118 §8).
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

- **From T-0304e review (2026-10-02):** D-0119 §3 shows the timed auto-log calling `recordSet({sessionId, exerciseId, setIndex, …})` without `itemIndex`, but `FocusSetInput` requires it — pass `state.itemIndex`.

## Build log
- **2026-10-02, frontend-dev (build).** Every AC has tests in `apps/web/src/features/UF-09/__tests__/`:
  - AC-1: `warmup.test.tsx` (11).
  - AC-2: `machine.timed.test.ts` (entry timer on READY, SKIP_WARMUP, an empty-warm-up COUNTDOWN_END, REST_END, a set → timed swap and RESYNC; the hold's fallbacks), plus `timed-set.test.tsx` "AC-2" (3, 2, 1 → "Hold 0:50" counting down, the h1 "Plank" / "plank", 50 not 45, the three fallbacks through the view).
  - AC-3: `timed-set.test.tsx` "AC-3" (at 0, last set → done, pending, restore 10 min later, already logged, another exercise's entry, rejection + Log hold, a second rejection), and `machine.timed.test.ts` "HOLD_ALREADY_LOGGED".
  - AC-4: `machine.timed.test.ts` "AC-4" (the ring pause, workout pause, both, the RESUME pair, the no-ops, no pause at 0, stored states), and `timed-set.test.tsx` "AC-4" (the same through the host, with `elapsedS` from the hook, restore while ring-paused, the 2-button pin).
  - AC-5: `timed-set.test.tsx` "AC-5" ("Hold 2:00" with no kind line; "Easing back in" for `hold_after_break` and `reentry`; none for `add_rep`, `first_time` and `increase`; for all 8 kinds, no UF-09.6 or UF-09.7 text matches `/same|last time|as before/i`, with a live-regex check).
  - AC-6: the row "T-0304c AC-6 warm-up and a timed set, offline" appended to `tests/e2e/uf-09-focus.spec.ts`.
  - AC-7: `exports-and-lint.test.ts` (strings, jsx-no-literals, D-0071 §9 bans, export pin) and `timer.test.ts` (the T-0304a AC-2 tick scan) are unchanged and green over the new files.
- **What was built.**
  - **Views.** `warmup.tsx` (UF-09.2) and `timed-set.tsx` (UF-09.7) replace the `warmup`/`timed` placeholders in `views.tsx`. `ring.tsx` is the shared display-only ring. `ViewProps` gains two optional props, `holdFailed` and `onLogHold`, so the views rendered on their own in older tests need no change.
  - **`machine.ts`.**
    - New exports: `POSITION_S = 3`, `DEFAULT_HOLD_S = 45`, `holdSeconds(item)` and `timedRemainingS(state, now)`.
    - Every way into `timed` gets `{startedAtMs: atMs, durationS: 3 + hold, pausedMs: 0}`.
    - New state field `timerPausedAtMs`. New events `TIMER_PAUSE`, `TIMER_RESUME` and `HOLD_ALREADY_LOGGED` (D-0150 §2).
    - `RESUME` skips `timer.pausedMs` while the ring is paused.
    - A wrapper around the switch drops `timerPausedAtMs` when the state leaves `timed` or gets a new timer.
  - **`persist.ts`.** `timed` is a timer phase, so a stored `timed` with `timer: null` is invalid (D-0119 §1). A missing `timerPausedAtMs` reads as `null`, and any other non-number is rejected.
  - **`host.tsx`.**
    - `fireExpired` routes `timed` to `autoLogHold`. That function runs once per timer key per mount (the `holdTried` ref is the in-flight guard), never while ring-paused, and never for a position that already has a logged set of this exercise. For that case it dispatches `HOLD_ALREADY_LOGGED`.
    - `logHold` calls the hook's `recordSet` with `itemIndex: state.itemIndex` (the T-0304e review note), `kind: "timed"` and `durationS: holdSeconds(item)`.
    - On success it announces "Done", but only after a crossing this mount saw. On rejection the view shows the polite error and "Log hold".
    - The exact-moment timeout also covers a running `timed`.
    - The T-0410 hook dedupe (`source:itemIndex:setIndex:exerciseId`) is unchanged, and the auto-log uses the default `"focus"` source.
  - **Strings** are added to `flows/uf-09.ts`.
- **Planted faults.** Each one was applied, run against `timed-set.test.tsx` + `machine.timed.test.ts`, and reverted:
  - **AC-3, the auto-log without its in-flight guard** (`if (holdTried.current === key) return;` removed) → 4 red:
    - "at 0: exactly one recordSet…";
    - "pending: re-renders over 5 s … no second call (hook or lib/offline)";
    - "rejection: … no auto retry …";
    - "a second rejected Log hold …".
    The re-renders at 0 called the hook's `recordSet` again. The test counts calls through `session-spy.ts`, before the hook's dedupe.
  - **AC-4, a ring pause that adds to `workoutPausedMs`** (`TIMER_RESUME` also adds `heldFor` to it) → 3 red:
    - "TIMER_PAUSE at 30 s left … only timer.pausedMs grows";
    - "Pause timer … elapsedS +20 …";
    - "both pauses … the time left is the ring-pause value".
  - **AC-4, the time counted twice** (`RESUME` without the ring-held check) → 2 red: both "both pauses" cases.
- **Pins and seeds updated, not dropped (D-0118 §12, D-0119 Consequences).**
  - **The D-0119 hand-off.** `host.expiry.test.tsx`'s T-0304a AC-9 "timed doesn't advance after 600 s" is replaced in place by "timed: after 600 s, no end event, exactly one TIMED_RECORDED, then UF-09.5".
  - **Button pins.** `host.chrome.test.tsx` AC-7: `warmup` is `["Pause workout", "Restart", "Next move"]` and `timed` is `["Pause workout", "Pause timer"]`. `timed` joins the phases that show a `role="timer"`.
  - **Seeds.** A stored `timed` now needs its timer (D-0119 §1), so the `timed` seeds in these files gain `timer: {startedAtMs: NOW, durationS: 53, pausedMs: 0}`: `host.chrome.test.tsx`, `host.load.test.tsx` (AC-6 screen ids), `announcer.test.tsx` (AC-2), `session.writes.test.tsx` (2 cases) and `session.finish.test.tsx` (2 cases). No assertion changed.
- **Defaults (D-0150, `status: revisit`).**
  - **The AC-6 hold is 15 s, not 5 s.** `PrefillResult.durationS` is 15..120 in the contract, and a 5 s plan renders the D-0138 unreadable state. The row uses `page.clock`.
  - **An already-logged hold moves on.** It goes to rest or done through `HOLD_ALREADY_LOGGED`, with no second entry, instead of staying at 0:00.
  - **The auto-log guard matches `exerciseId` too** (T-0410).
  - **The swap and RESYNC timer rules** follow D-0150 §4. There is no ring pause at 0.
  - **UF-09.7 has two lines.** The static target reads "Hold {m:ss}". The phase label ("Get in position" / "Hold") and the `role="timer"` countdown sit in the ring.
- **Runs** (every test command under `flock /tmp/workoutlab-tests.lock`):
  - `pnpm --filter @workoutlab/web typecheck`: green.
  - `pnpm -w typecheck lint test --force --concurrency=1 --continue`: 18/19 tasks green, web 148 files and 2346 tests. The one failure is `@workoutlab/engine#test`: `rule-12-apply-swap.test.ts` AC14 and `t0204-traceability.test.ts` AC25. Both compare `docs/engine-rules.md` with `main`, and `main` changed rule 12's signature line (`tz, now` → `now, tz`, T-0212, D-0130) after this branch was cut. This branch doesn't touch that file. It passes once the branch has `main`'s copy.
  - `test:repo-checks`: 146 pass.
  - `pnpm --filter @workoutlab/web test:e2e`: the whole suite, 100/100, including the new row.
  - `-w format:check`, `check:repo` (check-all), and `check:size` (after a build with the e2e mock env): all green.
