---
id: T-0304b
title: UF-09.3 Current set + UF-09.4 Confirm — Done set writes first through the hook, a persisted 5 s wall-clock auto-save with AUTOSAVE_CANCEL, steppers and RIR, Save → editSet only on a change, in-session pre-fill and the back-off set, weights through formatKg/formatDecimal
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4]
decisions: [D-0015, D-0026, D-0040, D-0057, D-0062, D-0066, D-0071, D-0086, D-0091, D-0103, D-0111, D-0114, D-0115, D-0118]
deps: [T-0304e]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md. The parent's T-0304b row is split by D-0118 §1: this ticket keeps UF-09.3/.4 (parent AC-B2–B6, B8); UF-09.1/.5/.6 (B1, B7) move to T-0304f. Build flow: wl-build-web. About ½ day. Becomes ready when T-0304e is done. -->

## Why
UF-09.3 and UF-09.4 are where every hard set is born, so they carry three principles at once:
- **Principle 1:** the screen shows one set and one big button.
- **Principle 3 ("pre-fill, don't ask"):** the weight and reps come from the engine's `prefill`, so
  the normal path is a single tap on **Done set**.
- **NFR-OFF-2:** the set reaches IndexedDB before the UI moves on.

The 5 s auto-save on UF-09.4 must survive a locked phone or a reload (NFR-TIME-1). It is therefore a
persisted wall-clock timer in the focus state, not a `setTimeout` (D-0118 §2).

## Scope
- In (all in `apps/web/src/features/UF-09/` unless named):
  - **The UF-09.3 view.** It replaces the T-0304a placeholder. It shows the name, the set line, the
    load line and the cue (D-0118 §8–§9), plus Done set. Done set calls `useFocusSession().recordSet`
    (D-0066 §3, D-0071 §5).
  - **The UF-09.4 view.** It shows the reps and weight steppers, the weight text input, the RIR
    radio group, the auto-save line and Save (D-0118 §3–§6).
  - **`machine.ts`:**
    - `AUTOSAVE_S`;
    - the `confirm` timer on `SET_RECORDED`;
    - the `AUTOSAVE_CANCEL` event;
    - the host expiry `confirm → SAVED` (D-0118 §2).
  - **Pure helpers:** `nextSetPrefill` (D-0118 §7) and `weight-input.ts` (parse, D-0118 §6).
  - **Props.** `SessionHost` gains `locale?: string` (D-0118 §6).
  - **`formatDecimal(value, locale?)`** in `apps/web/src/lib/format/number.ts`, with its tests
    (D-0118 §6).
  - **Strings and e2e.** Strings go in `flows/uf-09.ts`. One e2e row is appended to
    `tests/e2e/uf-09-focus.spec.ts`.
- Out:
  - UF-09.1, .5 and .6 (T-0304f). UF-09.2 and .7 (T-0304c). Cues, wake lock and reduced motion
    (T-0304g). UF-09.8, .9 and End (T-0304d).
  - Plate loading (D-0066 §13).
  - Edits to `lib/offline/**`, `formatKg`, `lib/i18n/workout.ts`, `en.ts`, `routes.ts`,
    `components/**`, `tests/e2e/fixtures/**` and the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:**
  - Done set writes IndexedDB and moves on with no network (AC-3, AC-12).
  - A rejected write never moves on (AC-3).
- **Time running out:** the auto-save keeps the loop moving when the user doesn't touch the phone
  (AC-4). Nothing here interrupts a set.
- **Zero history:** a `null` pre-fill weight on a loaded lift means "ask":
  - "Set weight" on UF-09.3;
  - an empty field and no auto-save on UF-09.4 (AC-7).
- **Returning after 10 days off:** a `reentry` or `hold_after_break` pre-fill renders exactly as the
  engine gave it, with no extra copy here (AC-1). A reload 10 s into a confirm saves once and moves
  on (AC-4).
- **Reload / kill:**
  - The auto-save countdown resumes from the wall clock (AC-4).
  - A touched confirm stays touched (AC-5).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-09/__tests__/`.
- It reuses T-0304a's P1, store, signed-in stub and L1 library, and T-0304e's hook.
- Fake timers and a mocked `Date.now` are used wherever time matters.
- `loadExerciseDetail` is mocked: bench-press → cue "Shoulder blades back", leg-curl → `null`.
- The `lib/offline` writes are spies that wrap the real ones unless stated.
- `SessionHost` gets `locale="en-GB"`. In expected strings, kg values use U+00A0 before `kg`.
- The builder adds `push-up` to the test library: bodyweight, `externalLoad: false`, compound,
  `incrementKg` 0. Item PU is push-up × 3 (8–12, prefill `{weightKg: 0, reps: 12}`).
- **Test rules** (state.md traps):
  - Both values of every binary condition get a test; each AC names its pair.
  - Negative asserts wait ≥ 50 ms (a fake-timer advance plus a flush).
  - Positive asserts on lazy content use `findBy…`/`waitFor` (D-0103 §1).
  - **Timing ACs must fail on unfixed code.** The build log records each planted fault turning its
    AC red:
    - AC-2: the saving state set after the `await`;
    - AC-4: the auto-save as a component `setTimeout(5000)`;
    - AC-4: a tick-counting countdown.
  - No committed test asserts `git diff` (state.md).

- **AC-1 (UF-09.3 renders the pre-fill, principle 3, D-0118 §8 §9)**
  - **P1 bench-press set 1** shows:
    - the heading "Bench press";
    - "Set 1 of 4";
    - "80 kg × 6";
    - the cue "Shoulder blades back".
  - **The pair, no cue.** For leg-curl (detail `null`), there is no cue element.
  - **The pair, no library entry.** With bench-press missing from the library, the heading is
    "bench-press" and the load line is unchanged.
  - **Locale pair.** With prefill 77.5 and `locale="sv-SE"`, the load line is "77,5 kg × 6".
  - **Pre-fill kinds.** A `reentry` pre-fill renders its values with no "last time" text.
  - **Done set.** It is a `button` named "Done set", the step view's primary action. Its CSS class
    sets `min-height: 200px`. The real size is checked in AC-12.
  - **Focus.** On entering UF-09.3 (from a rest end, `READY` or `SKIP_WARMUP`), Done set is
    `document.activeElement`.
  - **Rejected reads (D-0104).** These are caught, with no unhandled rejection and no
    `console.error`:
    - A rejected `loadExerciseDetail` renders no cue element, and Done set still works.
    - A rejected `loadLibrary` (so `ctx.library` is `[]`) shows the heading "bench-press" (the
      D-0118 §8 id fallback), and Done set still works.
    - The pair is the resolved case above.
- **AC-2 (Done set feedback < 100 ms, NFR-PERF-4)**
  - **Synchronous feedback.** With `recordSet` held on a deferred promise, right after
    `fireEvent.click(doneSet)`, before any `await` or timer advance, the button has
    `data-state="saving"` and `aria-busy="true"`, and the screen is still UF-09.3.
  - **The pair.** Before the click, there is no `data-state="saving"`.
  - **One write per set.** A second click while pending makes no second `recordSet` call.
  - **On resolve,** the screen becomes UF-09.4 (`findBy`).
- **AC-3 (write before moving on, NFR-OFF-2, NFR-SYNC-1, D-0118 §5)**
  - **The call.** Done set calls `recordSet` once, with `{sessionId: "S1", exerciseId:
    "bench-press", setIndex: 0, kind: "reps", reps: 6, weightKg: 80, isWarmup: false, backoff:
    false}`. It goes through the hook, which calls the `lib/offline` spy.
  - **Real queue.** After the real `recordSet` resolves, a fresh Dexie instance sees the row, with
    the `clientId` that the hook's `loggedSets` holds.
  - **Rejection.** A rejected `recordSet` keeps UF-09.3 and shows "Couldn't save. Tap Done set
    again." in an `aria-live="polite"` element. There is no `role="alert"`. The button is enabled
    again, and there is no transition after 50 ms.
  - **Retry.** Tapping again calls `recordSet` again, and on resolve the screen is UF-09.4.
- **AC-4 (the persisted auto-save, NFR-TIME-1, D-0118 §2)** Done set is tapped at `t0`.
  - **Persisted.** Right after the `recordSet` resolves, `localStorage["wl-focus:S1"]` has `phase:
    "confirm"` and `timer` `{startedAtMs: t0', durationS: 5, pausedMs: 0}`. Here `t0'` is the
    `atMs` of the `SET_RECORDED` dispatch.
  - **The countdown.** The text reads "Saving as planned in 5 s… tap anything to edit", then 4, 3,
    2 and 1 s.
  - **At 5 s.** At `t0'` + 4 999 ms it is still UF-09.4. At + 5 000 ms the screen is UF-09.5. There
    are 0 `editSet` calls, and the logged entry is unchanged.
  - **Restore, mid-countdown.** Unmounting at + 2 000 and remounting at + 3 000 shows "in 2 s".
  - **Restore, expired.** Remounting at + 10 000 shows UF-09.5 after exactly one `SAVED` (store
    spy), and there is no further transition.
  - **Pause.** Pausing at + 2 000 (chrome "Pause workout"), waiting 60 s, then Resume shows UF-09.4
    with "in 3 s".
  - **The pair.** Pause doesn't cancel: the persisted `timer` is non-null while paused.
- **AC-5 (a touch cancels, D-0118 §3)**
  - **Pointer.** A `pointerdown` on the reps "+" sets the persisted `timer` to `null`. The text
    reads "Tap save when ready.", and after 60 s of fake time it is still UF-09.4.
  - **Keyboard.** A `keydown` inside the step view cancels the same way.
  - **Reload.** A remount after a cancel shows the recorded values and "Tap save when ready.", with
    no countdown.
  - **The pair.** A `pointerdown` on the chrome's "Pause workout" doesn't cancel.
  - **Focus.** On entering UF-09.4, Save is `document.activeElement`. That programmatic focus (a
    `focus` event, with no `pointerdown` or `keydown`) doesn't cancel: the persisted `timer` is still
    non-null, and the auto-save fires at 5 s.
  - **Pause drops unsaved edits (D-0118 §3).**
    - The user touches, changes reps 6 → 5, then Pause workout → Resume.
    - UF-09.4 shows the recorded values (reps 6) and "Tap save when ready.", with no countdown,
      because the cancel was persisted.
    - Save then makes 0 `editSet` calls. The recorded set stands, so nothing wrong is logged.
  - **No-op.** `AUTOSAVE_CANCEL` in `set`, or with the timer already `null`, returns the same state
    object (a reducer test).
- **AC-6 (steppers, RIR, Save, D-0066 §4–§5, D-0118 §4 §6)** On bench-press set 1 (80 × 6):
  - **Reps.** "Fewer reps" / "More reps" step by 1 and floor at 0.
  - **Weight.** "Less weight" / "More weight" step by 2.5 (`incrementKg`) and floor at 0. On
    leg-curl they step by 5. With no library entry they step by 2.5.
  - **Typed weight.** The weight input has `inputmode="decimal"` and reads "80". Typing "77,5"
    saves 77.5, and "77.5" saves the same. "abc" gives Save `aria-disabled="true"` and the hint
    "Enter a weight like 82.5". An empty field saves `weightKg: null`.
  - **Stepping from an empty or invalid weight.** "More weight" counts from 0, so it gives the
    increment ("2.5" on bench-press, "5" on leg-curl). "Less weight" gives "0". Either one clears
    the hint and enables Save.
  - **RIR.** A radio group labelled "Reps in reserve" with None, 1–2 and 3+ maps to `rir` 0, 2 and
    3. None of them is checked at first.
  - **Save with a change.** Reps 5, weight 77.5 and 1–2 → Save calls `editSet(clientId, {reps: 5,
    weightKg: 77.5, rir: 2})` once. After it resolves, the screen is UF-09.5, and the logged entry
    has those values.
  - **The pair, save with no change.** After a touch and no change, Save makes 0 `editSet` calls
    and goes to UF-09.5.
  - **Rejection.** A rejected `editSet` keeps UF-09.4 with "Couldn't save. Tap Save again."
    (polite), and makes no transition.
- **AC-7 (ask for a null weight, bodyweight, D-0066 §4, D-0118 §2 §6)**
  - **Leg-curl set 1** (prefill `null` × 10):
    - UF-09.3 shows "Set weight" and "10 reps", and no text matching `/kg/`.
    - Done set records `weightKg: null`.
    - UF-09.4 has an empty weight input, no "Saving as planned" text, and a persisted `timer:
      null`. It is still UF-09.4 after 60 s.
    - Save with the field empty makes no `editSet` call and moves on. Typing "40" then Save calls
      `editSet` with `weightKg: 40`.
  - **The pair.** Bench-press (weight 80) gets the auto-save (AC-4).
  - **Bodyweight PU.**
    - UF-09.3 shows "12 reps", with no weight line.
    - UF-09.4 has no weight input and no weight steppers.
    - Done set records `weightKg: 0`.
    - The auto-save runs. A recorded `null` weight on a known bodyweight exercise still
      auto-saves (a reducer test).
- **AC-8 (in-session pre-fill and back-off, D-0066 §6, D-0118 §7)**
  - **Carry.** With bench-press set 1 saved as 77.5 × 5, after the rest ends (fake 120 s), UF-09.3
    for set 2 shows "Set 2 of 4" and "77.5 kg × 5". Done set records those values.
  - **Per-field fallback.** With set 1 saved with weight `null` and reps 5, set 2 shows
    "80 kg × 5".
  - **Back-off.** With `backoff: {weightKg: 70, reps: 6}`, after set 4 the screen shows "Back-off
    set" and "70 kg × 6". Done set records `setIndex: 4, backoff: true`.
    - The pair: with `backoff: null`, set 4 is the item's last.
  - **`nextSetPrefill` unit table.** It covers set 1, carry, a null fallback per field, back-off,
    and a `prefill.reps` of `null` falling back to `repsMin`.
- **AC-9 (no rest after the last set, parent AC-B8)**
  - **The last set.** In P1 without the plank, saving leg-curl set 3 leads to `done`, then the
    T-0304e `finish()`. The location becomes `/session/S1/summary`, and no UF-09.5 was ever
    rendered (a MutationObserver records the screen ids).
  - **The pair.** Saving bench-press set 4 leads to UF-09.5.
- **AC-10 (formatDecimal, D-0118 §6)** `apps/web/src/lib/format/number.test.ts` gains:
  - `formatDecimal(80, "en-GB")` = "80";
  - `formatDecimal(77.5, "en-GB")` = "77.5";
  - `formatDecimal(77.5, "sv-SE")` = "77,5";
  - `formatDecimal(2.125, "en-GB")` = "2.13";
  - `formatDecimal(1234.5, "en-GB")` = "1234.5" (no grouping).
  - The existing `formatKg` tests pass unchanged.
- **AC-11 (strings, exports, lint, pins, D-0118 §12)**
  - **Strings.** Every new string comes from `en.uf09`. `react/jsx-no-literals` is green, and
    `en.ts` is unchanged.
  - **Exports.** The export pin stays `["SessionHost", "useFocusSession"]`.
  - **Lint.** The D-0071 §9 bans are green.
  - **Button pins.** T-0304a AC-7's button count for `set` becomes exactly 2 (Pause, Done set). For
    `confirm` on bench-press it is exactly 6 (Pause, 2 reps steppers, 2 weight steppers, Save), plus
    3 radios. On PU it is 4. The other states keep their T-0304a counts. The build log lists the
    change.
  - **No tick counting.** The T-0304a AC-2 source test still passes.
- **AC-12 (e2e: one set offline, D-0086, D-0091 §1)** A row is appended to
  `tests/e2e/uf-09-focus.spec.ts`. It uses the spec's existing setup and `seedSessionRow`, with a
  plan whose `warmup` is `[]` (bench-press × 4, prefill 80 × 6).
  - **Offline load.** After the precache settles, the context goes offline, then reloads
    `/session/<id>`.
  - **UF-09.3.** After UF-09.1's 5 s, it shows the "Set 1 of 4" text (built content). Done set's
    bounding box is ≥ 200 px tall and ≥ 44 px wide (NFR-A11Y-2).
  - **UF-09.4.** Clicking Done set shows UF-09.4. After the real 5 s auto-save, it shows UF-09.5.
  - **IndexedDB.** `wl-offline.sets` (read with `page.evaluate`) holds exactly one row for that
    session, with `exerciseId` "bench-press", `setIndex` 0, `kind` "reps", `reps` 6, `weightKg` 80,
    `isWarmup` false and `backoff` false.
  - **a11y.** axe on UF-09.3 and UF-09.4 reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed Supabase request. The T-0304a rows stay green.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows to the T-0304a spec (D-0071 §10).
  - `apps/web/src/lib/format/number.ts`: add the `formatDecimal` export (D-0118 §6); `formatKg` and `formatSetCount` keep their code.
  - `apps/web/src/lib/format/number.test.ts`: add the AC-10 cases.
  - `docs/tickets/T-0304b-current-set-and-confirm.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (through `useFocusSession()`, plus `loadExerciseDetail`, `loadLibrary`), `lib/format` (`formatKg`), `lib/i18n/en.ts`, `@workoutlab/engine` (`REST_COMPOUND_S`, `REST_ISOLATION_S`), `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. Sets are written through the T-0300c queue (`recordSet`, `editSet`) exactly as D-0015 and
D-0045 §6 define, through the T-0304e hook. The new `confirm` timer and `AUTOSAVE_CANCEL` live in
the device-local focus state (D-0066 §2), amended by D-0118 §2. `formatDecimal` is a new display
helper, not a contract.

## NFRs owned
OFF-2 set part (AC-3, AC-12), PERF-4 (AC-2), A11Y-2 Done set (AC-1, AC-12), TIME-1 auto-save
(AC-4), SYNC-1 (AC-2, AC-3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo`
and `check:size` green (UF-09 chunk ≤ 100 KB gzip) · contracts unchanged · commits start `T-0304b`
and cite the screen (for example `T-0304b UF-09.4: auto-save after 5 s from the wall clock`).

## Notes
- **Flow:** `wl-build-web`.
- **Order.** The lane runs b → f → c → g → d → h (D-0118 §1). This ticket waits for T-0304e (in
  build) because Done set and Save write through its hook. It doesn't wait on any UF-08 ticket.
- **Parallel.** It is parallel-safe by files with T-0303d, T-0385 and T-0391. None of them lists
  `lib/format/number.ts`. T-0391 only imports `formatKg`. Verification runs are staggered (state.md).
- **Until T-0304f lands,** UF-09.1 and UF-09.5 are still placeholders. AC-4 and AC-8 reach the next
  set through the T-0304a expiry (`REST_END` after 120 s of fake time).

- **From T-0304e QA/accept (2026-10-02):** a double tap on Save in `set` reaches `recordSet` twice; the second call arrives in `confirm`, becomes SET_LOGGED and adds a duplicate `loggedSets` entry for the same setIndex. Guard it in the view (disable while the write is pending) and test both taps. The hook API: views write through `useFocusSession().recordSet/editSet` with `RecordSetInput & {itemIndex}`, which resolves to the stored LoggedSet.

## Build log
- **2026-10-02, frontend-dev (build).** Every AC has tests in `apps/web/src/features/UF-09/__tests__/`:
  - AC-1, AC-2, AC-3: `current-set.test.tsx`.
  - AC-4, AC-5, AC-6: `confirm-set.test.tsx`, plus the reducer cases in `machine.autosave.test.ts`.
  - AC-7, AC-8, AC-9: `set-loop.test.tsx`. The `nextSetPrefill` table and the weight parsing: `prefill.test.ts`.
  - AC-10: `apps/web/src/lib/format/number.test.ts` (the `formatKg` cases are unchanged).
  - AC-11: `exports-and-lint.test.ts` and `timer.test.ts` are unchanged and green. The button pins are below.
  - AC-12: the row "T-0304b AC-12 one set offline" appended to `tests/e2e/uf-09-focus.spec.ts`.
- **What was built.**
  - `current-set.tsx` (UF-09.3) and `confirm-set.tsx` (UF-09.4) replace the `set`/`confirm` placeholders in `views.tsx`.
  - `prefill.ts` (`nextSetPrefill`) and `weight-input.ts` (`parseWeight`, `stepWeight`) are pure helpers.
  - `machine.ts` gains `AUTOSAVE_S = 5`, the `confirm` timer on `SET_RECORDED` (`null` for a `null` weight unless the library says `externalLoad: false`), `AUTOSAVE_CANCEL`, and `isBodyweight`.
  - `host.tsx` gains `confirm → SAVED` in the expiry table and `SessionHost.locale`. Each view is keyed by `phase:itemIndex:setIndex`, so a new step starts with a fresh busy state, fresh edits and the entry focus.
  - `formatDecimal` is added to `lib/format/number.ts`, and the keys are added to `flows/uf-09.ts`.
- **Test helpers.** `set-loop-mock.ts` wraps `offline-spies.ts`. It answers `loadLibrary` with L2 (L1 + push-up) and `loadExerciseDetail` with bench-press → "Shoulder blades back", everything else → `null`. `set-loop-fixtures.ts` holds PU and the plans. `set-loop-helpers.tsx` has `findScreen`/`findEl`/`findPath`. These poll on real 10 ms macrotasks, the positive wait (D-0103 §1), because RTL's `findBy` polls with the faked `setTimeout`. Negative asserts use `flushReal` (a real 50 ms macrotask).
- **Planted faults.** Each one was applied, run, and reverted:
  - AC-2: `setSaving(true)` moved after an `await` → "synchronous: right after the click …" goes red.
  - AC-4: `confirm: "SAVED"` removed from the expiry table and replaced by a `setTimeout(5000)` in `ConfirmSet` → 3 red: "restore mid-countdown", "restore expired", "Pause at + 2 000 … in 3 s".
  - AC-4: a tick-counting countdown (`setInterval` + `setSecondsLeft((n) => n - 1)`) → 4 red: "restore mid-countdown", "Pause … in 3 s", and the T-0304a AC-2 source tests (tick scan, `setInterval` only in the re-render hook).
  - The T-0304e double-tap note: the `pending` guard removed from Done set and from Save → 3 red: both AC-2 one-write tests and "a double tap on Save with a change: one editSet".
- **Button pins updated, not dropped (D-0118 §12).** In `host.chrome.test.tsx` AC-7, the "exactly 1 button" check now uses a per-state list:
  - `set`: `["Pause workout", "Done set"]`.
  - `confirm` (barbell-row, a loaded lift): `["Pause workout", "Fewer reps", "More reps", "Less weight", "More weight", "Save"]`.
  - Every other state still expects `["Pause workout"]`.
  - `set-loop.test.tsx` pins bench-press confirm at 6 buttons + 3 radios, and PU at 4 buttons.
  - In `seams.test.tsx`, "a screen other than UF-09.6/.9 renders no seam entry" now expects `["Pause workout", "Done set"]` on UF-09.3, and also asserts that no `[data-seam-id]` is present.
- **Defaults (within D-0118, no new decision).**
  - **Done set** sends no `rir`. While the write is pending the button has `aria-disabled`, `aria-busy` and `data-state="saving"`, but never `disabled`, so focus stays on it. After a rejection all three are removed.
  - **UF-09.4 heading.** It is the exercise name (library `name`, else the id), the same as UF-09.3.
  - **Edits cancel too.** Any edit handler (stepper, typing, RIR) also dispatches `AUTOSAVE_CANCEL`, and so does Save with a change. Each is a no-op after the first. So the auto-save can't fire while `editSet` is pending.
  - **Missing increment.** A library `incrementKg` of 0 on a loaded lift steps by the 2.5 default, the same as a missing entry.
  - **"Unchanged"** compares `{reps, weightKg, rir}` with the recorded entry. 6 → 7 → 6 is no change, so there is no `editSet` call.
  - **Strings.** The steppers' visible text is `−`/`+` (allowed literals), and their names come from `aria-label` (`en.uf09`).
- **D-0127 (new, revisit; the orchestrator commits it on main).** Offline, the chrome's shell `OfflineStatus` icon (`components/**`, web-shell) has `aria-label` on a role-less span. axe reports this as `aria-prohibited-attr` (serious). The AC-12 axe helper drops exactly that rule on exactly `.wl-offline-status__icon`, and nothing else. Follow-up for web-shell: give the icon `role="img"`.
- **Diff check** (recorded here, not as a test). The working tree touches only:
  - `apps/web/src/features/UF-09/**`;
  - `apps/web/src/lib/format/number.ts` and `number.test.ts`;
  - `apps/web/src/lib/i18n/flows/uf-09.ts` (keys added);
  - `tests/e2e/uf-09-focus.spec.ts` (`seedSessionRow` gains an optional `plan` parameter that defaults to `PLAN`, and one row is appended);
  - this ticket.
  The D-0127 file isn't on this branch: `check-lane-paths` doesn't grant `.squad/decisions/**` to this lane, so the orchestrator commits it on main.
  `en.ts`, `formatKg`, `lib/offline/**`, `components/**`, `routes.ts` and `tests/e2e/fixtures/**` are unchanged.
- **Evidence.**
  - UF-09 + `lib/format` vitest: 21 files, 368 tests. The 5 new files hold 115 of them.
  - `pnpm --filter @workoutlab/web test`: 125 files, 1906 tests.
  - `pnpm --filter @workoutlab/web typecheck` and `lint`: 0.
  - e2e `uf-09-focus` + `uf-08-setup`: 20/20.
  - `-w format:check`: 0. `node .github/scripts/check-all.mjs`: 0. `check:size`: 0 (the largest lazy chunk is about 8 KB gzip).
