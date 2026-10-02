---
id: T-0304f
title: UF-09.1 Get ready + UF-09.5 Rest + UF-09.6 Next exercise — the 5 s countdown with Start now / Skip warm-up, the rest ring from engine constants with −15/+15/Skip, warn at 10 s, the chrome announcer, the 60 s set-up countdown with I'm ready and the next-seam position
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.5, UF-09.6]
decisions: [D-0066, D-0071, D-0086, D-0091, D-0103, D-0111, D-0114, D-0115, D-0118]
deps: [T-0304b]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (parent AC-B1 and AC-B7). Split out of the parent's T-0304b row by D-0118 §1. Build flow: wl-build-web. About ⅓–½ day. Becomes ready when T-0304b is done. -->

## Why
These are the three countdown screens of the set loop. Principle 1 says each shows one thing: get
ready, rest, or set up for the next exercise. Each moves on by itself, so the user can stay on the
bench without touching the phone. The rest lengths come from the engine's constants (D-0066 §7,
principle 3), never from literals. The countdowns are the T-0304a wall-clock timers (NFR-TIME-1).
The "10 seconds" and "Go" announcements reach screen readers through one live region in the chrome,
because the rest view unmounts at the very moment "Go" is due (D-0118 §10, NFR-A11Y-4).

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **The UF-09.1 view:** "Get ready", the countdown, the first item's name, "Start now", and
    "Skip warm-up" (shown only with a warm-up).
  - **The UF-09.5 view:**
    - the ring with `role="timer"` m:ss, and "GO" at 0;
    - the "Next" line from `nextSetPrefill` (T-0304b);
    - "−15 s", "+15 s" and "Skip rest";
    - the warn state at ≤ 10 s.
  - **The UF-09.6 view:**
    - the next item's name;
    - the `itemSummary` and `formatKg` detail as siblings (D-0118 §11);
    - the cue;
    - "I'm ready", the 60 s countdown, and `nextSeamActions` through T-0304e's `orderActions`.
  - **The chrome announcer** (D-0118 §10).
  - **Strings and e2e.** Strings go in `flows/uf-09.ts`. The T-0304a e2e row's UF-09.1 button count
    is updated in `tests/e2e/uf-09-focus.spec.ts`, and one e2e row is appended.
- Out:
  - Sound and voice cues (T-0304g).
  - The time check at the item boundary (T-0304d).
  - Swap itself (T-0306b).
  - Edits to `lib/offline/**`, `lib/format/**`, `lib/i18n/workout.ts`, `en.ts`, `components/**`,
    `tests/e2e/fixtures/**` and the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the countdowns read only the focus state and the cached library. Nothing waits on the
  network (AC-5 e2e is offline).
- **Time running out:** −15 s shortens a rest, floored at 0. Skip ends it. UF-09.6 auto-advances
  after 60 s (AC-3, AC-4).
- **Zero history:** for a `null` pre-fill weight, the UF-09.5 "Next" line reads "Set weight", and
  UF-09.6 shows no kg element (AC-3, AC-4).
- **Returning after 10 days off:** the pre-fill values render as returned (AC-3).
- **Reload:** a rest restored 90 s in shows 0:30. That is T-0304a AC-4, which must stay green with
  the real view.

## Acceptance criteria
**Test setup.**
- As T-0304b: P1, the L1 library, `locale="en-GB"`, and the mocked `loadExerciseDetail`.
- Fake timers and a mocked `Date.now` are used.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms.
  - **AC-2 and AC-3 must fail on unfixed code.** The build log records the planted faults turning
    them red:
    - an announcer inside the rest view (so "Go" is never in the DOM after the transition);
    - a warn threshold of `< 10`.

- **AC-1 (UF-09.1, parent AC-B1)**
  - **With a warm-up.** P1 shows "Get ready", a `role="timer"` reading 5, then 4, 3, 2 and 1, and
    "Warm-up" as the first item.
  - **The pair, no warm-up.** With `warmup: []`, the first item reads "Bench press", and there is no
    "Skip warm-up" button.
  - **At 5 s,** the host dispatches `COUNTDOWN_END` (UF-09.2 for P1, UF-09.3 with no warm-up).
  - **"Start now"** dispatches it at once.
  - **"Skip warm-up"** dispatches `SKIP_WARMUP`, which gives UF-09.3 for bench-press set 1.
  - **Focus.** On mount, focus is on "Start now".
- **AC-2 (the announcer, NFR-A11Y-4, D-0118 §10)** The chrome has exactly one element with
  `data-field="announcer"` and `aria-live="polite"`, in every machine state.
  - **During a 120 s rest,** its text is "" at 119 … 11 s. It is "10 seconds" from the render where
    `remainingS` first is ≤ 10. It is "Go" after the expiry moves to UF-09.3, and it is still in the
    DOM there.
  - **The pair, Skip.** "Skip rest" at 50 s leaves it "". "Start now" on UF-09.1 leaves it "" too.
  - **UF-09.1 expiry.** It ends with "Go".
  - **Restore past an expiry.** A remount 600 s into a 120 s rest lands on UF-09.3 through the
    T-0304a restore expiry, and the announcer stays "" (checked after 50 ms). Neither "10 seconds"
    nor "Go" is said, because the crossing wasn't observed in this mount. The same holds for a
    restore past the UF-09.1 countdown. The pair is the live expiry above, which says "Go".
- **AC-3 (UF-09.5 Rest, parent AC-B7, D-0066 §7)**
  - **Lengths.** After saving a bench-press set, the rest starts by itself at `REST_COMPOUND_S`
    (120). After a leg-curl set it is `REST_ISOLATION_S` (60). Both are imported from
    `@workoutlab/engine`, and a source test finds no literal 120 or 60 in the rest view.
  - **Adjust.** "−15 s" ×9 from 120 reads 0:00 and then moves on. "+15 s" from 120 reads 2:15, with
    no cap.
  - **Skip.** "Skip rest" moves to the next set at once.
  - **Warn.**
    - At `remainingS` 11 the ring has `data-warn="false"`.
    - At 10 it has `data-warn="true"`.
    - The `[data-warn="true"]` rule in `uf-09.css` uses `var(--wl-color-warn)` (a source test).
  - **"GO".** With `remainingS` 0 the label reads "GO".
  - **"Next" line.**
    - After bench-press set 1 (80 × 6): "Next · set 2 of 4" and "80 kg × 6".
    - After bench-press set 4: "Next · Barbell row".
    - Before the back-off set: "Next · back-off set" and "70 kg × 6".
    - Before leg-curl set 2 with a `null` weight: "Set weight".
  - **Focus** lands on "Skip rest".
- **AC-4 (UF-09.6 Next exercise, D-0066 §10, D-0118 §11)** After the last bench-press set and its
  rest (the default check point gives `next`):
  - **Content.**
    - the heading "Barbell row";
    - an element with the text "3 × 8–12" (`itemSummary`);
    - a sibling element "60 kg";
    - the cue, when the detail has one;
    - "I'm ready" and a `role="timer"` 1:00.
  - **The pair, a null weight.** For leg-curl, there is no kg element.
  - **Countdown.** At 60 s it dispatches `READY` (UF-09.3, barbell-row set 1). "I'm ready" does that
    at once. Focus lands on "I'm ready".
  - **Seams.** With an injected `swap` entry, the actions read "I'm ready · Swap", in the T-0304e
    `orderActions` order. With the module arrays, only "I'm ready" is there.
- **AC-5 (e2e, D-0086, D-0091 §1)** A row is appended to `tests/e2e/uf-09-focus.spec.ts`.
  - **Setup.** A seeded row with a plan of bench-press × 2 and a warm-up of 1 move. Offline after
    the precache settles, then a reload of `/session/<id>`.
  - **UF-09.1.** It shows "Get ready" and "Skip warm-up". Skip warm-up leads to UF-09.3.
  - **UF-09.5.** Done set, then the auto-save, leads to UF-09.5 with "Next · set 2 of 2" (built
    content). "+15 s" changes the timer text. "Skip rest" leads to UF-09.3 "Set 2 of 2".
  - **a11y.** axe on UF-09.1, .5 and .6 (reached through the seeded two-item variant) reports 0
    serious or critical violations.
  - **Updated pin.** The T-0304a row "AC-7 the chrome on a seeded session" changes its UF-09.1
    button count to the real view's: 3 with a warm-up (Pause, Start now, Skip warm-up). The build
    log notes the edit.
  - **Requests.** The guard reports no unclaimed request.
- **AC-6 (strings, exports, lint, pins)**
  - **Strings.** Every new string comes from `en.uf09`. `react/jsx-no-literals` and the D-0071 §9
    bans are green.
  - **Exports.** The export pin is unchanged.
  - **Button pins.** The T-0304a AC-7 counts become (D-0118 §12):
    - `getReady` 3 with a warm-up, 2 without;
    - `rest` 4 (Pause, −15 s, +15 s, Skip rest);
    - `next` 2 with empty seams.
  - **No tick counting.** The T-0304a AC-2 source test still passes.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows and update the UF-09.1 button count in the T-0304a row (D-0071 §10, D-0118 §12).
  - `docs/tickets/T-0304f-get-ready-rest-next.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (through `useFocusSession()`, plus `loadExerciseDetail`), `lib/format` (`formatKg`), `lib/i18n/en.ts`, `lib/i18n/workout.ts` (`itemSummary`), `@workoutlab/engine` (`REST_COMPOUND_S`, `REST_ISOLATION_S`), and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The rest lengths are the engine's constants. The countdowns are T-0304a's persisted timers.

## NFRs owned
A11Y-4 rest part (AC-2), TIME-1 view part (AC-3, AC-4), OFF-2 loop part (AC-5).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo`
and `check:size` green · contracts unchanged · commits start `T-0304f` and cite the screen (for
example `T-0304f UF-09.5: rest ring warns at 10 s`).

## Notes
- **Flow:** `wl-build-web`.
- **Order.** It comes after T-0304b, because the "Next" line uses `nextSetPrefill` and needs the real
  UF-09.3/.4 to reach a rest. It comes before T-0304c (D-0118 §1).
- **Parallel.** It is parallel-safe by files with every UF-08 ticket and T-0385.

## Build log
- **2026-10-02, frontend-dev (build).** Every AC has tests in `apps/web/src/features/UF-09/__tests__/`:
  - AC-1: `get-ready.test.tsx`.
  - AC-2: `announcer.test.tsx`.
  - AC-3: `rest.test.tsx`, plus the source checks in `countdown-sources.test.ts`.
  - AC-4: `next-exercise.test.tsx`.
  - AC-5: the rows "T-0304f AC-5 get ready, rest and next, offline" appended to `tests/e2e/uf-09-focus.spec.ts`.
  - AC-6: `exports-and-lint.test.ts` (strings, export pin) and `timer.test.ts` (the T-0304a AC-2 tick scan) are unchanged and green. `countdown-sources.test.ts` also runs the tick scan over the new views and `host.tsx`. The button pins are below.
- **What was built.**
  - `get-ready.tsx` (UF-09.1), `rest.tsx` (UF-09.5) and `next-exercise.tsx` (UF-09.6) replace the `getReady`/`rest`/`next` placeholders in `views.tsx`. `ViewProps` gains `send(event)`, which the host stamps with `Date.now()`. The rest buttons go through the hook's `adjustRest`/`skipRest`.
  - `host.tsx` holds the chrome announcer: one `aria-live="polite"` `data-field="announcer"` element rendered beside the step (not inside it), so it stays mounted across every machine state, the overlay and `done`. A per-mount `observed` record (timer key, seen > 0, seen > 10, said 10) runs in an effect after every render, before the expiry check. `fireExpired` says "Go" only when this mount saw that timer with time left. A Skip, Start now, or a new step clears the region, except right after the "Go" its own expiry set. A paused state neither observes nor speaks (D-0119 §7).
  - `use-cue.ts` holds the cached-cue hook that `current-set.tsx` had, so UF-09.3 and UF-09.6 share it.
  - The strings are added to `flows/uf-09.ts`, and the ring, announcer and layout rules to `uf-09.css`.
- **Planted faults.** Each one was applied, run, and reverted:
  - AC-2: the announcer moved inside the rest view, so it is gone after the transition → 19 of 20 `announcer.test.tsx` cases red, including the live 120 s rest at `expect(announced()).toBe("Go")` ("expected null to be 'Go'").
  - AC-3: the warn threshold changed to `remaining < REST_WARN_S` → "at remainingS 11 the ring has data-warn=false; at 10 it is true" red.
- **Pins updated, not dropped (D-0118 §12).**
  - `host.chrome.test.tsx` AC-7: `getReady` is `["Pause workout", "Start now", "Skip warm-up"]` (P1, with a warm-up), `rest` is `["Pause workout", "−15 s", "+15 s", "Skip rest"]`, and `next` is `["Pause workout", "I'm ready"]`. A new case pins `getReady` without a warm-up at `["Pause workout", "Start now"]`.
  - `seams.test.tsx` (T-0304e): UF-09.6 with the module arrays is now `["Pause workout", "I'm ready"]`, and with the injected swap it is `["Pause workout", "I'm ready", "Swap"]`.
  - `host.expiry.test.tsx` (T-0304a AC-9): the UF-09.1 timer at 4 999 ms reads `"1"`, not `"0:01"`. The built view counts bare seconds 5 → 1, as AC-1 asks.
  - `tests/e2e/uf-09-focus.spec.ts`, row "AC-7 the chrome on a seeded session": the UF-09.1 button count is 3 (Pause, Start now, Skip warm-up), not 1.
- **Defaults (within D-0118, no new decision).**
  - **"0:00" and "GO".** The rest `role="timer"` always reads m:ss, so it reads 0:00 at 0. A sibling label `data-field="go"` reads "GO" at 0, inside the ring. In the host, a rest at 0 ends in the same act, so the AC-3 "−15 s ×9" test records the frames with a `MutationObserver`. It sees "0:00" and "GO", the stored remaining steps 105 … 15, 0 (the 9th press is floored, so it writes nothing), and then UF-09.3 with one `REST_END`. The "GO" pair is also rendered directly with `remainingS` 0 and 1.
  - **"10 seconds" stays** in the region from the crossing until the next announcement or the next step. It is never re-set, so it is said once. A `+15 s` after the crossing doesn't say it again: the key is the timer's start, which an adjust keeps.
  - **A rest that reaches 0 through −15 s** ends by expiry, so it says "Go".
  - **The Next line** on UF-09.5 shows a load line only for a reps set of the same item: kg × reps, "Set weight" + reps for a `null` weight, or reps for bodyweight. Before another item it shows only "Next · {name}". A timed set shows no load line (T-0304c owns the timed copy).
  - **UF-09.6 kg.** There is no kg element (and no "·") for a `null` pre-fill weight, and none for a bodyweight lift (`externalLoad: false`).
  - **e2e names.** The e2e library mock is empty, so names fall back to the exercise id ("Next · barbell-row"). Each AC-5 row removes the stored `wl-focus:<id>` before the offline reload, so UF-09.1 starts afresh and isn't expired by the precache wait.
- **Runs.** These were all green: `pnpm --filter @workoutlab/web typecheck lint test` (135 files, 2032 tests); `test:e2e uf-09-focus uf-08-setup` (23 passed); `-w format:check`; `check:repo`.

## Accept log

### QA 2026-10-02: done
- AC-1 to AC-6 are each proven with both values of every binary condition.
- 9 planted faults; 8 went red. The 9th (the `saidTen` guard removed) is harmless: setting the same text again re-announces nothing.
- `pnpm -w typecheck lint test --force --concurrency=1` 19/19 and the whole e2e suite 86/86, under the lock.
- Break-it probes passed: reload mid-rest, Pause/Resume, +15 s after the 10 s crossing, −15 s ×9, and rest expiry under the List-view overlay. Console clean.

### Review 2026-10-02: approved
The timers are wall-clock from the machine. The announcer speaks only on crossings it saw, and it is idempotent under StrictMode. The rest buttons go through the hook. The CSS uses tokens only, and the i18n is clean.

### Accept 2026-10-02 (product-owner): done
- **AC-1:** passes (`get-ready.test.tsx`). The 5 → 1 bare-second countdown, the no-warm-up pair, COUNTDOWN_END to UF-09.2 or UF-09.3, Start now, Skip warm-up, and focus on mount are all covered.
- **AC-2:** passes (`announcer.test.tsx`, 11 cases). This covers the live 120 s rest ("" → "10 seconds" → "Go", still in the DOM on UF-09.3), the Skip and Start now pairs, the UF-09.1 expiry "Go", and the two restore-past-expiry cases staying "" after 50 ms. The planted fault (announcer inside the rest view) turned 19 of 20 red, as required.
- **AC-3:** passes (`rest.test.tsx`, `countdown-sources.test.ts`). The lengths are `REST_COMPOUND_S`/`REST_ISOLATION_S`, with a live source scan for literals. The other checks: −15 s ×9 shows 0:00, GO and one REST_END; +15 s gives 2:15; Skip; the warn at 11/10 with the `var(--wl-color-warn)` source test; and the four "Next" lines with focus on Skip rest. The planted `< 10` fault went red, as required.
- **AC-4:** passes (`next-exercise.test.tsx`). This covers the heading, `itemSummary`, the sibling kg and the cue (with no-cue and rejected-read pairs), the null-weight pair, READY at 60 s and on I'm ready, focus, and the seams pair.
- **AC-5:** passes. The rows "T-0304f AC-5 get ready, rest and next, offline" in `tests/e2e/uf-09-focus.spec.ts` run offline after the precache. axe gives 0 serious or critical on .1, .5 and .6, and the request guard reports nothing unclaimed. The T-0304a AC-7 e2e UF-09.1 count is updated to 3 and noted in the build log.
- **AC-6:** passes. The strings come from `en.uf09`, and lint is green. The export pin is unchanged. The button pins are `getReady` 3/2, `rest` 4 and `next` 2. The T-0304a AC-2 tick scan is still green, and it also runs over the new views.
- **Pin edits.** The `host.chrome`, `seams` and e2e button-count edits are exactly what D-0118 §12 names.
  - The `host.expiry.test.tsx` (T-0304a AC-9) edit, "0:01" → "1", falls under §12's update-not-drop intent. That pin encoded the placeholder's text format, and AC-1 (parent AC-B1) requires the bare-second format. Every timing assertion in that case is unchanged: still UF-09.1 at 4 999 ms, zero COUNTDOWN_END, then UF-09.2 with one COUNTDOWN_END at 5 s. Nothing is weakened.
  - A one-line §12 amendment that covers placeholder text-format pins is proposed as a follow-up.
- **Principles.** Every principle holds:
  - 1: each countdown view shows one task, and the announcer is a visually hidden live region, not on-screen content.
  - 2: untouched.
  - 3: the rest lengths come from the engine constants.
  - 4 and 5: unaffected.
- **Edge cases.** Offline (AC-5), time running out (−15 s floor, Skip, the 60 s auto-advance), zero history ("Set weight", no kg element) and reload (the T-0304a AC-4 restore stays green) are all covered.
- **DoD.** The full gate and the whole e2e suite are green under the lock. Contracts are unchanged. The commits cite T-0304f and the screen IDs.
- **Follow-ups:**
  - Amend D-0118 §12 so it also covers placeholder text-format pins (squad/orchestrator).
  - Add a Date-only jump case to `get-ready.test.tsx` (web-feature:UF-09, optional).
