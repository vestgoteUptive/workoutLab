---
id: T-0477
title: "UF-09 host: REST_START starts a rest from getReady (UF-09.1), warmup (UF-09.2) and next (UF-09.6), so a set checked in the List view before the first focus-mode set gets a rest; leaving the warm-up records its time"
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.2, UF-09.5, UF-09.6, UF-09.3, UF-03.1]
decisions: [D-0175, D-0172, D-0142, D-0071, D-0111, D-0119, D-0153, D-0157, D-0158, D-0169]
deps: [T-0418]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner (D-0175 §1, amending D-0172 §5's scope to add `next`).
Build flow: wl-build-web. About ⅓ day. Touches features/UF-09 only. -->

## Why
**The user who opens the List view at once gets no rest.** In the List view (UF-03.1, a
`keepsClockRunning: true` overlay), checking a set calls `ctx.startRest(exerciseId)` (T-0418).
The host turns it into `REST_START`, which the machine accepts only from `set`, `confirm`, `rest`
and `timed` (`REST_STARTABLE`, `machine.ts`). The List view's own clock keeps the machine running
underneath it, so it often sits in one of these phases:
- `getReady` (UF-09.1, 5 s);
- a warm-up move (UF-09.2, 40 s each in P1, the warm-up as a whole often several minutes);
- the UF-09.6 set-up (`next`, 60 s), which the warm-up ends in.

A set checked during any of these starts no rest and shows no bar. D-0172 §5 shipped T-0418
knowingly without this. D-0175 §1 sets the rule.

## Scope
- In (`apps/web/src/features/UF-09/**`):
  - **`machine.ts`.** `REST_STARTABLE` gains `getReady`, `warmup` and `next`. The `REST_START`
    case applies D-0175 §1:
    - from `getReady`: `warmupSpentMs: 0`, `warmupStartedAtMs: null`;
    - from `warmup`: `warmupSpentMs = max(0, atMs − warmupStartedAtMs)` (when
      `warmupStartedAtMs` is non-null; otherwise `warmupSpentMs` stays as it is),
      `warmupStartedAtMs: null`;
    - from `next`: the warm-up fields are unchanged;
    - always `phase: "rest"` and `timer: timerAt(atMs, restFor(exerciseId, library))`, with
      `itemIndex`, `setIndex`, `warmupIndex`, `loggedSets` and `skippedItems` unchanged.

    Update the `REST_STARTABLE` doc comment: "around a set, or before the first set of an item
    under the List view". Remove "never mid-countdown".
  - **The existing test** `machine.session.test.ts › REST_START › from %s: the same state` loses
    `getReady`, `warmup` and `next` from its `it.each`, and gains `betweenItems`. `timeCheck`,
    `paused` and `done` stay.
  - **New tests:** reducer rows in `machine.session.test.ts` (AC-1, AC-2), a host test
    `__tests__/t0477.host.test.tsx` using T-0415's injected List view seam pattern (AC-3, AC-4),
    and a source test (AC-5).
- Out:
  - `timeCheck` (UF-09.8 must be answered, principle 2), `betweenItems`, `paused`, `done`: still
    no-ops.
  - Any `features/UF-03` file. The List view already calls `startRest` and shows the bar whenever
    `ctx.rest` is non-null (T-0418).
  - Resuming the warm-up after the rest. The warm-up ends (D-0175 §1, "Revisit when").
  - Moving `itemIndex` to the checked set's item. D-0142 §2 holds: a List-view log never moves the
    machine's position. Only the rest starts.
  - The host's overlay code (`host.tsx` `open`/`close`/`RESYNC`). `RESYNC` already keeps a running
    rest (`if (phase === "rest" && state.timer) return state`).
  - e2e specs. If `uf-03-list-summary.spec.ts` (qa) goes red because a bar now appears in the
    T-0458 flow, add a qa follow-up. Don't edit the spec (Notes).

### Edge cases that are in scope
- **Time running out:** a rest started from the warm-up records the warm-up minutes in
  `warmupSpentMs`. The UF-09.8 time check (rule 8) sees them, exactly as when list logs end the
  warm-up through `RESYNC` (AC-1).
- **The countdown underneath expires:** after `REST_START` the getReady, warm-up or set-up timer
  is gone, so `COUNTDOWN_END`/`WARMUP_NEXT`/`READY` never fire for it. Advancing past the old
  expiry leaves the rest running (AC-3).
- **Zero history:** P1 with nothing logged before the List view check. The first list log is the
  first set of the session (AC-3).
- **Offline:** no network is involved. The rest is wall-clock state in `wl-focus:<id>` and
  survives a reload offline (AC-4).
- **Returning after 10 days off:** a stored focus state restores as it is. No new rule applies.
- **The checked set is on another item:** the rest still starts, and `REST_END` goes to the first
  free set of the machine's own `itemIndex` (AC-2).

## Acceptance criteria
**Test setup.** The reducer rows use `machine.session.test.ts`'s `at(phase, over)` and `reduce`.
The host rows use T-0415's setup: the real `SessionHost`, P1, fake-indexeddb, `useFakeClock(NOW)`,
the injected `list-view` seam with `keepsClockRunning: true`, and its captured `ctx`. Each new
test title starts with `T-0477 AC-n`. Negative asserts wait with `flushReal()` (50 ms). Every AC
must fail on main's code. The build log records that red and the planted fault below.

- **AC-1 (reducer: the three new phases).**
  - From `getReady` (P1, `loggedSets` = bench set 0), `REST_START bench-press @T0` gives
    `phase: "rest"`, `timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 }`,
    `warmupSpentMs: 0`, `warmupStartedAtMs: null`, and the same `itemIndex: 0`, `setIndex: 0`,
    `loggedSets` (reference-equal) and `skippedItems`.
  - From `warmup` with `warmupStartedAtMs: T0 − 90_000`, `warmupIndex: 2`, `REST_START leg-curl @T0`
    gives `durationS: 60`, `warmupSpentMs: 90_000`, `warmupStartedAtMs: null`, `warmupIndex: 2`.
    **Pair:** with `warmupStartedAtMs: null` and `warmupSpentMs: 5_000`, `warmupSpentMs` stays
    5_000.
  - From `next` (`itemIndex: 1`, `warmupSpentMs: 120_000`, `warmupStartedAtMs: null`),
    `REST_START barbell-row @T0` gives `phase: "rest"`, `durationS: 120`, `itemIndex: 1` and the
    warm-up fields unchanged.
  - **Still no-ops** (reference-equal state): `timeCheck`, `betweenItems`, `paused`, `done`.
- **AC-2 (reducer: where the rest ends).** After AC-1's transitions, `REST_END`:
  - from the `getReady` case (bench set 0 logged) gives `phase: "set"`, `itemIndex: 0`,
    `setIndex: 1`;
  - from a `warmup` case whose only logged set is leg-curl (item 2) set 0 gives `phase: "set"`,
    `itemIndex: 0`, `setIndex: 0`;
  - from the `next` case with barbell-row (item 1) set 0 logged gives `phase: "set"`,
    `itemIndex: 1`, `setIndex: 1`;
  - from `getReady` with all four bench sets logged gives `phase: "betweenItems"`.
- **AC-3 (host: List view during the warm-up).** Given P1 seeded and a focus state on `warmup`
  (`warmupIndex: 0`, warm-up timer 40 s started at NOW, `warmupStartedAtMs: NOW`), paused, with the
  List view opened from UF-09.9, when `advance(20_000)`, then
  `ctx.recordSet({ ...benchInput(0), source: "list" })` resolves and `ctx.startRest("bench-press")`
  is called:
  - `ctx.rest.remainingS` is 120, and `storedFocus()` has `phase: "rest"`,
    `warmupSpentMs: 20_000`, `warmupStartedAtMs: null`;
  - after `advance(25_000)` (past the old 40 s move), the state is still `rest` with 95 s left,
    and no `WARMUP_NEXT` was dispatched (`dispatched` store spy);
  - `ctx.close()` shows `[data-screen-id="UF-09.5"]`;
  - after the rest runs out, UF-09.3 shows `Set 2 of 4`.

  **Pair (getReady):** the same flow opened from a pause on `getReady` (before the 5 s end)
  gives `phase: "rest"` with `warmupSpentMs: 0`. Advancing past 5 s dispatches no
  `COUNTDOWN_END` that changes the phase.

  **Contrast (main's behaviour, kept for `timeCheck`):** from a pause on `timeCheck` with the
  List view open, `startRest` leaves `ctx.rest` `null`.
- **AC-4 (reload).** Given AC-3's rest running, when the host unmounts and remounts (the same
  `wl-focus` key), then the restored state is `rest` with the same timer, and `readFocusState`
  accepts it. The same holds with `navigator.onLine` spied `false`.
- **AC-5 (only `startRest` dispatches `REST_START`).** A source test reads every non-test `.ts`
  and `.tsx` file in `features/UF-09` (comments and strings stripped). `type: "REST_START"`
  appears in `session.tsx` exactly once and in no other file except `machine.ts` (the type and
  the case). It has a CONTRAST row on an inline source string, so the scan is shown to be live.
- **AC-6 (fault proof).** The build log records:
  - AC-1's `getReady`/`warmup`/`next` rows and AC-3 red on main's code;
  - the planted fault "drop the `warmupSpentMs` update from the `warmup` branch" turning AC-1's
    warm-up row and AC-3's `warmupSpentMs: 20_000` red, restored from a `cp` backup.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane `web-feature:UF-09`): `machine.ts`,
  `__tests__/machine.session.test.ts`, `__tests__/t0477.host.test.tsx` (new), and a new source
  test file if AC-5 doesn't fit an existing one.
- `docs/tickets/T-0477-uf09-rest-start-before-first-set.md` (this file, for the build and accept
  logs).
- **Not yours:** `apps/web/src/features/UF-03/**`, `tests/e2e/**`, `docs/engine-rules.md`.

## Contract impact
None. `docs/engine-rules.md` covers the engine package, not the UF-09 focus machine. The rest
length still comes from `restFor` (`REST_COMPOUND_S`/`REST_ISOLATION_S`, unchanged).

## Definition of done
Every AC has a passing test, with the red and the planted fault recorded. While working:
`scripts/locked.sh small npx vitest run <files>`. Once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and `scripts/locked.sh heavy` on the web `test:e2e` for
`uf-09-focus.spec.ts`, `uf-09-ready.spec.ts` and `uf-03-list-summary.spec.ts`. Contracts are
unchanged. Commits start `T-0477` and cite the screens, for example
`T-0477 UF-09.2: a List-view rest from the warm-up`.

## Notes
- **Flow:** `wl-build-web`.
- **e2e watch.** The T-0458 test in `uf-03-list-summary.spec.ts` opens the List view from
  UF-09.1 and checks rows 1–3. Its `tabTo` loop and `Finish` locators don't depend on a rest bar.
  But if the rows are checked inside the getReady 5 s or a warm-up, a bar now appears where none
  did. If that test goes red, the product is right and the spec's expectation is stale. That's a
  qa follow-up, not an edit here.
- **Parallel.** No other open ticket edits `machine.ts`. UF-03 tickets (T-0478, T-0483) don't
  touch `features/UF-09`, so this can run beside them.
- **Optional follow-up (web-feature:UF-03):** a UF-03 host test that checks a row from a
  `getReady` pause through the real List view and sees the bar. T-0477's seam test already proves
  the host side.

## Build / accept log
