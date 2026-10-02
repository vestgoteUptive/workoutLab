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
