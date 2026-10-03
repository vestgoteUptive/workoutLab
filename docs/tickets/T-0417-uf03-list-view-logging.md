---
id: T-0417
title: "UF-03.1 List view logging: check → ctx.recordSet (source list), edit → editSet once on blur/Enter, uncheck → deleteSet tombstone, the weight parser, pending and rejection, offline, reload, back to focus mode"
lane: web-feature:UF-03
screens: [UF-03.1, UF-09.9, UF-09.3]
decisions: [D-0142, D-0164, D-0015, D-0045, D-0066, D-0071, D-0118, D-0128, D-0153]
deps: [T-0416, T-0415, T-0420]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner; re-groomed 2026-10-03 against main after T-0415, T-0416 and T-0420 merged. Split by D-0164 §1: "+ Add set" is T-0457 and the List view e2e is T-0458. Build flow: wl-build-web. About ½ day. -->

## Why
- **UF-03.1:** classic logging. Each row is checked, edited or unchecked in place.
- **NFR-OFF-2:** every set is in IndexedDB before the UI shows it as done.
- **D-0015:** an uncheck is a tombstone, never a hard delete.
- **D-0071 §5:** every write goes through `ctx`, so focus mode sees the same `loggedSets` when the
  user goes back. T-0415 made List-view logs leave the hidden machine alone (`source: "list"`).

## Scope
- In (`apps/web/src/features/UF-03/`):
  - **`ListViewCtx`** (in `ListView.tsx`) gains `recordSet`, `editSet` and `deleteSet`, typed
    locally (D-0142 §5), and `clientId` on each `loggedSets` entry. The real `FocusSession` stays
    assignable to it. No import of `features/UF-09`.
  - **Check** an unlogged row → `ctx.recordSet({sessionId, exerciseId: item.exerciseId, setIndex,
    kind, reps, weightKg, durationS, rir: null, isWarmup: false, backoff, itemIndex, source:
    "list"})`. `kind` is `"timed"` when the row is timed (T-0416's `isTimed`), else `"reps"`.
    `backoff` is true only on the back-off row. The row shows as done only after the promise
    resolves.
  - **Edit** a done row's kg, reps or seconds → `ctx.editSet(clientId, {weightKg} | {reps} |
    {durationS})` once, on blur or Enter, and only when the parsed value changed. The fields stop
    being `readOnly`.
  - **Uncheck** → `ctx.deleteSet(clientId)`.
  - **The weight parser:** a pure UF-03 module with D-0118 §6's rules as amended by D-0128 (any
    locale's decimal digits, the Arabic decimal separator) (D-0142 §3). An invalid kg
    makes the row's toggle `aria-disabled="true"` with the polite hint "Enter a weight like
    {formatDecimal(82.5)}".
  - **Pending and rejection** per row.
  - Strings in `flows/uf-03.ts`.
- Out:
  - "+ Add set" (T-0457) and the List view e2e (T-0458).
  - UF-03.2 rest and the Swap button (T-0418).
  - RIR in the List view (it stays `null`, D-0066 §5: RIR is optional).
  - Logging to a finished session (Phase 5).
  - Any `features/UF-09` file.

### Edge cases that are in scope
- **Offline:** check, edit and uncheck all work with `navigator.onLine = false` (AC-1, AC-2,
  AC-3).
- **Time running out:** none of these writes runs the time check (T-0304e forced `"next"`). Finish
  stays available (T-0416).
- **Zero history:** loaded lifts have `prefill.weightKg: null`, so the kg field is empty and a
  check needs a weight first (AC-5).
- **Reload mid-list:** the checked rows come back from the stored state and IndexedDB, not from
  component state (AC-6).
- **Returning after 10 days off:** the kg field shows the engine's `hold_after_break` pre-fill
  (T-0416). Checking records the value in the field, not Previous (AC-1).

## Acceptance criteria
**Test setup.** T-0416's (`__tests__/list-helpers.tsx`: S1, S0, L1, tz `Europe/Stockholm`, now
`2026-09-27T12:00:00+02:00`). Unit tests pass a test-built `ctx` with deferred, spied
`recordSet`/`editSet`/`deleteSet`. Integration tests use the real `SessionHost`, the real
`seams.tsx`, the real `lib/offline` over `fake-indexeddb`, and a Supabase client spy.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
Every AC must fail on `main` (T-0416's toggles don't log): the build log records each red run.
It also records these planted faults turning their ACs red:
- the row shown checked before `recordSet` resolves (AC-1);
- `editSet` called per keystroke (AC-2);
- a direct `lib/offline` `recordSet` import in `features/UF-03` (AC-4);
- the kg check skipped, so an empty kg records `weightKg: null` on a loaded lift (AC-5).

- **AC-1 (check = recordSet, offline)** Given `navigator.onLine = false`, When back-squat row 1 is
  checked, Then `ctx.recordSet` is called once with `{sessionId: "S1", exerciseId: "back-squat",
  setIndex: 0, kind: "reps", reps: 6, weightKg: 100, durationS: null, rir: null, isWarmup: false,
  backoff: false, itemIndex: 0, source: "list"}`.
  - **Pending.** While the deferred promise is held, the toggle reads "Mark set 1 done"
    (unchecked) with `aria-busy="true"`, and a second click makes no second call.
  - **Resolved.** The toggle reads "Mark set 1 not done".
  - **Integration.** A fresh Dexie instance sees the set in the queue. The stored `wl-focus:S1`
    has the entry in `loggedSets`, and its `phase`, `itemIndex` and `setIndex` are unchanged
    (T-0415).
  - **Rejection.** A rejection leaves the row unchecked with the polite text "Couldn't save. Tap
    again." (no `role="alert"`).
  - **Other kinds.** A timed row sends `kind: "timed"`, `durationS` from the field, `reps: null`
    and `weightKg: null`. With `item.backoff = {weightKg: 90, reps: 6}`, the back-off row sends
    `setIndex: 4`, `backoff: true`, `weightKg: 90`, `reps: 6`.
  - **Typed values.** Changing row 2's kg to "102,5" under `locale="sv-SE"` before the check sends
    `weightKg: 102.5`.
- **AC-2 (edit)**
  - **Changed.** Changing a done row's reps from "6" to "5" and blurring calls
    `ctx.editSet(clientId, {reps: 5})` once. Pressing Enter instead of blurring does the same.
  - **Per keystroke.** Typing "1", "0" into kg makes no call until blur. Then it is one call,
    `{weightKg: 10}`.
  - **Unchanged.** A blur with an unchanged value makes no call.
  - **Rejection.** A rejected edit restores the logged value and shows "Couldn't save. Tap
    again.".
  - **Unlogged rows.** Editing an unlogged row's field makes no `editSet` call. The new value is
    what a later check records (AC-1 "Typed values").
- **AC-3 (uncheck = tombstone, D-0015)** Unchecking a done row calls `ctx.deleteSet(clientId)`
  once, and the row is unchecked after it resolves. While pending, the toggle has
  `aria-busy="true"` and a second click makes no second call. In the integration test, the queued
  set has a non-null `deletedAt`, and the Supabase client spy shows no `.delete()` call. A rejected
  uncheck leaves the row checked with "Couldn't save. Tap again.".
- **AC-4 (every write through ctx, D-0071 §5)** A source test over every file in `features/UF-03`
  finds no import of `recordSet`, `editSet` or `deleteSet` from `lib/offline` (static or dynamic
  `import()`). `upsertSession` is imported by exactly one module, the T-0420 summary-save module,
  which the test names. A planted import in `ListView.tsx` turns it red. The T-0416 "no import of
  `features/UF-09`" test stays green.
- **AC-5 (the weight field and zero history, D-0118 §6)**
  - **Zero history.** With back-squat `prefill.weightKg: null`, the kg field is empty and the
    toggle is `aria-disabled="true"` with the polite hint "Enter a weight like 82.5". A click
    makes no `recordSet` call. After typing "60", the hint is gone and a check records
    `weightKg: 60`.
  - **Invalid.** "abc", "-5" and "82.555" each disable the toggle with the hint. "82.5" and
    "82,5" both parse to 82.5, and "0" parses to 0 (valid, D-0118 §6). An empty field is valid only
    on a bodyweight item: on a loaded lift it disables the toggle with the same hint.
  - **Bodyweight.** A bodyweight item (`externalLoad: false`) has no kg field, its toggle is never
    disabled by the weight rule, and a check records its pre-fill weight.
  - The parser has its own unit test file over the D-0118 §6 cases.
- **AC-6 (reload)** Given back-squat rows 1–2 checked in the real host, When the host is remounted
  (same storage and IndexedDB) and the List view is opened again from UF-09.9, Then rows 1–2 are
  done with their logged values, and rows 3–4 aren't.
- **AC-7 (back to focus mode, D-0071 §5, D-0153)**
  - After checking back-squat rows 1–3 in the List view, "Focus mode" shows UF-09.3 "Set 4 of 4"
    for back-squat.
  - After checking all 4 and RDL row 1, "Focus mode" shows UF-09.3 RDL "Set 2 of 3".
  - Focus mode then logs the next set with `setIndex` equal to the first free position, so no two
    live sets share one position (read from the fresh Dexie instance).
- **AC-8 (a11y and strings)** Every new string is in `en.uf03` (`react/jsx-no-literals` green). The
  vitest axe helper finds 0 violations on UF-03.1 with one row pending and one row showing the
  weight hint. The hint is tied to its field by `aria-describedby`.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0417-uf03-list-view-logging.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/format`, `lib/i18n/en.ts`, `lib/offline` (tests only, for
  the fresh-instance reads), `features/UF-09/index.tsx` (`SessionHost`, integration tests only, as
  T-0416's host tests do).

## Contract impact
None. Sets go through the D-0015/D-0045 queue via `ctx` (D-0071 §5).

## Definition of done
Tests for every AC pass, with the red runs and planted faults recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · `check:size` green · `uf-03-list-summary.spec.ts` and `uf-09-focus.spec.ts`
green (one feature folder, so the whole e2e suite isn't needed) · contracts unchanged · commits
start `T-0417` and cite the screen (for example `T-0417 UF-03.1: check records through ctx`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:**
  - **With T-0394 and T-0451, allowed by files.** They edit UF-09 files only (`host.tsx`,
    `session.tsx`, `seams.tsx` and UF-09 tests). AC-6 and AC-7 mount the real host: rebase on
    `main` if either merges mid-build, and re-run them.
  - **With T-0448, T-0446, T-0454, T-0459, allowed by files.**
  - **Not with T-0457, T-0458, T-0439 or T-0418.** Same lane, one UF-03 ticket at a time
    (D-0164 §1).
- **E2e runs:** use `TMPDIR=$HOME/.cache/wl-pw-tmp` if the T-0440 preflight asks for it.

## Build / accept log

### Build log (frontend-dev, 2026-10-03; start: git clean, HEAD 56ab6a9)
- **Built:** `ListView.tsx` (`SetRow`: check → `ctx.recordSet` source list, edit → `ctx.editSet` once on blur/Enter, uncheck → `ctx.deleteSet`, pending/rejection per row), `weight-parse.ts` (D-0118 §6 + D-0128), strings in `flows/uf-03.ts`, css. `ListViewCtx` gains `recordSet/editSet/deleteSet` and `clientId`, typed locally. No default needed: an invalid kg on a *done* row reverts on blur and doesn't disable its uncheck (the hint/disable applies to unlogged rows).
- **AC → test:** AC-1 `list-view.logging.test.tsx` "AC-1" + `list-view.logging.host.test.tsx` "AC-1 integration" · AC-2 "AC-2 edit" · AC-3 "AC-3" + host "tombstone" (no `.delete()` through a Proxy on the client) · AC-4 `exports-and-lint.test.ts` "T-0417 AC-4" · AC-5 "AC-5" + `weight-parse.test.ts` · AC-6 host "AC-6 reload" · AC-7 host "AC-7" · AC-8 logging test "AC-8 a11y" + the existing jsx-no-literals test.
- **Red on unfixed** (HEAD `ListView.tsx`, new tests): 28 of 30 failed (logging + host files). `weight-parse` was red by missing module.
- **Planted faults (each restored from a `cp` backup):** row checked while pending → AC-1 pending test red; `editSet` per keystroke → 4 AC-2 tests red; direct `recordSet` import in `ListView.tsx` → AC-4 source test red; kg check skipped → 3 AC-5/AC-8 tests red.
- **Test bug found:** the AC-7 host test returned early because two cards both showed "Mark set 1 not done"; it now waits for the second one (was flaky 1 in 3).
- **Gate:** `-w typecheck lint test --concurrency=1` green (after one TS narrowing fix), `test:repo-checks`, `format:check`, `check-all`, `check:size` (built with dummy VITE_SUPABASE_*) green; e2e `uf-03-list-summary` + `uf-09-focus`: 12 passed.
