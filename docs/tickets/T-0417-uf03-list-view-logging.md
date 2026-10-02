---
id: T-0417
title: "UF-03.1 List view logging: check → ctx.recordSet (source list), edit → editSet once on blur/Enter, uncheck → deleteSet tombstone, + Add set, pending and rejection, offline, reload; the NFR-OFF-2 List view e2e"
lane: web-feature:UF-03
screens: [UF-03.1, UF-09.9, UF-03.3]
decisions: [D-0142, D-0015, D-0045, D-0066, D-0071, D-0118, D-0086]
deps: [T-0416, T-0415, T-0420]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Second child of the T-0305a board row (D-0142 §1 §3). Build flow: wl-build-web. About ½ day. It needs T-0415 (List-view logs never move the hidden machine) and appends to the e2e file T-0420 creates. -->

## Why
- **UF-03.1:** classic logging. Each row is checked, edited or unchecked in place.
- **NFR-OFF-2:** every set is in IndexedDB before the UI shows it as done.
- **D-0015:** an uncheck is a tombstone, never a hard delete.
- **D-0071 §5:** every write goes through `ctx`, so focus mode sees the same `loggedSets` when the user goes back.

## Scope
- In (`features/UF-03`):
  - **Check** an unlogged row → `ctx.recordSet({sessionId, exerciseId: item.exerciseId, setIndex, kind, reps, weightKg, durationS, rir: null, isWarmup: false, backoff, itemIndex, source: "list"})`. `kind` is `"timed"` when `item.repsMin` is null, else `"reps"`. `backoff` is true only on the back-off row. The row shows as done only after the promise resolves.
  - **Edit** a done row's kg or reps → `ctx.editSet(clientId, {weightKg} | {reps})` once, on blur or Enter, and only when the value changed.
  - **Uncheck** → `ctx.deleteSet(clientId)`.
  - **"+ Add set"** (D-0142 §3).
  - **Fields:** a UF-03 weight parser (D-0142 §3, D-0118 §6 rules). An invalid kg disables the row's toggle (`aria-disabled`) with the polite hint "Enter a weight like {formatDecimal(82.5)}".
  - **Pending and rejection** per row.
  - **The e2e rows,** appended to `tests/e2e/uf-03-list-summary.spec.ts`.
- Out:
  - UF-03.2 rest and the Swap button (T-0418).
  - RIR in the List view (it stays `null`, D-0066 §5: RIR is optional).
  - Logging to a finished session (Phase 5).
  - Any `features/UF-09` file.

### Edge cases that are in scope
- **Offline:** check, edit and uncheck all work with `navigator.onLine = false` (AC-1, AC-2, AC-3, AC-7).
- **Time running out:** none of these writes run the time check (T-0304e forced `"next"`). Finish stays available (T-0416).
- **Zero history:** a zero-history plan has `prefill.weightKg: null` on loaded lifts, so the kg field is empty, and checking needs a weight (AC-5).
- **Reload mid-list:** the checked rows come back from the stored state and IndexedDB, not from component state (AC-6).

## Acceptance criteria
**Test setup.** T-0416's (S1, S0, L1, the clock). Unit tests pass a test-built `ctx` with deferred, spied `recordSet`/`editSet`/`deleteSet`. Integration tests use the real host and real `seams.tsx`, the real `lib/offline` over `fake-indexeddb`, and a Supabase client spy.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on T-0416's code (the toggles don't log). The build log records these planted faults turning their ACs red:
- the row checked before `recordSet` resolves (AC-1);
- `editSet` per keystroke (AC-2);
- a direct `lib/offline` `recordSet` import in `features/UF-03` (AC-4);
- "+ Add set" at index `item.sets` on an item with a back-off (AC-5).

- **AC-1 (check = recordSet, offline)** With `navigator.onLine = false`, checking back-squat row 1 calls `ctx.recordSet` once with `{sessionId: "S1", exerciseId: "back-squat", setIndex: 0, kind: "reps", reps: 6, weightKg: 100, durationS: null, rir: null, isWarmup: false, backoff: false, itemIndex: 0, source: "list"}`.
  - While the deferred promise is held, the toggle reads "Mark set 1 done" (unchecked) with `aria-busy="true"`, and a second click makes no second call.
  - After it resolves, the toggle reads "Mark set 1 not done".
  - **Integration.** A fresh Dexie instance sees the set in the queue. The stored `wl-focus:S1` has the entry in `loggedSets`.
  - **Rejection.** A rejection leaves the row unchecked with the polite text "Couldn't save. Tap again." (no `role="alert"`).
  - **Other kinds.** A timed row sends `kind: "timed"`, `durationS` from the field, and `reps: null`, `weightKg: null`. The back-off row sends `setIndex: 4` and `backoff: true`.
- **AC-2 (edit)**
  - **Changed.** Changing a done row's reps from "6" to "5" and blurring calls `ctx.editSet(clientId, {reps: 5})` once. Pressing Enter instead of blurring does the same.
  - **Per keystroke.** Typing "1", "0" into kg makes no call until blur. Then it is one call `{weightKg: 10}`.
  - **Unchanged.** Blur with an unchanged value makes no call.
  - **Rejection.** A rejected edit restores the logged value and shows "Couldn't save. Tap again.".
- **AC-3 (uncheck = tombstone, D-0015)** Unchecking a done row calls `ctx.deleteSet(clientId)` once. The row is unchecked after it resolves. In the integration test, the queued set has a non-null `deletedAt`, and the Supabase client spy shows no `.delete()` call.
- **AC-4 (every write through ctx, D-0071 §5)** A source test over every file in `features/UF-03` finds no import of `recordSet`, `editSet` or `deleteSet` from `lib/offline`. `upsertSession` is imported by exactly one module, the T-0420 summary-save module, which the test names. A planted import in the List view module turns the test red.
- **AC-5 (+ Add set, D-0142 §3)**
  - **After 4 rows.** On back-squat with rows 1–4 done (100 × 6, 100 × 6, 100 × 5, 100 × 5), "+ Add set" adds row 5, unchecked, with kg "100" and reps "5". Checking it records `setIndex: 4` and `backoff: false`.
  - **With a back-off.** On an item with `backoff` (the back-off row is index 4), the added row has index 5.
  - **Twice.** "+ Add set" twice gives indexes 4 and 5.
  - **After a reload,** a logged added set shows as row 5, done.
  - **Zero history.** With `prefill.weightKg: null`, the kg field is empty, and the toggle is `aria-disabled` with the hint until a weight is typed.
- **AC-6 (reload)** After checking back-squat rows 1–2 in the real host and remounting it (same storage and IndexedDB), then opening the List view again, rows 1–2 are done with their values, and rows 3–4 aren't.
- **AC-7 (back to focus mode)** After checking back-squat rows 1–3 in the List view, "Focus mode" shows UF-09.3 "Set 4 of 4" (D-0071 §5 re-sync). After checking all 4 and RDL row 1, it shows UF-09.3 RDL "Set 2 of 3" (the first item with an unlogged set, at its first unlogged set). Focus mode then logs the next set with `setIndex` equal to the first free position (no two live sets at one position).
- **AC-8 (e2e, NFR-OFF-2, appended to `tests/e2e/uf-03-list-summary.spec.ts`)** In the preview build, offline, with the T-0904 guard:
  - Start S1 from a seeded session row (the T-0420 seed), open Pause → List view, and check three back-squat rows by keyboard (Tab and Space).
  - Finish → confirm → `[data-screen-id="UF-03.3"]`. Pick effort 3 and Save. The location is `/`.
  - **After a reload,** IndexedDB holds 3 live sets for S1, and the session has `effort_rating` 3 and a non-null `ended_at`.
  - **axe** on UF-03.1 reports 0 serious or critical violations. Every row toggle and field is ≥ 44 × 44 px (`boundingBox()`).
  - **Requests.** The guard reports no unclaimed request.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `tests/e2e/uf-03-list-summary.spec.ts`: append rows (D-0071 §10).
  - `tests/e2e/fixtures/**`: additive exports (D-0071 §10).
  - `docs/tickets/T-0417-uf03-list-view-logging.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/format`, `lib/i18n/en.ts`, `lib/offline` (tests only, for the fresh-instance reads), the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. Sets go through the D-0015/D-0045 queue via `ctx` (D-0071 §5).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `check:size` green · contracts unchanged · commits start `T-0417` and cite the screen (for example `T-0417 UF-03.1: check records through ctx`).

## Notes
- **Flow:** `wl-build-web`.
