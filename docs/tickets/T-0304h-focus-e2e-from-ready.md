---
id: T-0304h
title: UF-09 end-to-end from UF-08.4 — reload mid-rest and mid-pause (NFR-TIME-2), a 10-set offline workout that survives a closed page (NFR-OFF-2), two devices make two sessions (NFR-SYNC-4), a keyboard-only loop with focus and axe on every step (NFR-A11Y-1/6)
lane: web-feature:UF-09
screens: [UF-08.4, UF-09.1, UF-09.2, UF-09.3, UF-09.4, UF-09.5, UF-09.6, UF-09.9, UF-03.3]
decisions: [D-0045, D-0066, D-0071, D-0086, D-0091, D-0110, D-0112, D-0116, D-0118, D-0120]
deps: [T-0304d, T-0303d]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (parent AC-D7–D10, except the UF-09.8/.9 keyboard + axe rows, which are T-0304d AC-10). Split out of the parent's T-0304d row by D-0118 §1. Mostly e2e; UF-09 code changes only to fix what these rows find. Build flow: wl-build-web. About ½ day. -->

## Why
The unit tests prove each step. This ticket proves the product promise end to end in a built
browser, starting where a real workout starts, on UF-08.4 Start (T-0303d):
- a workout started and logged with no network is never lost, even when the tab is closed
  (NFR-OFF-2);
- time survives a reload (NFR-TIME-2);
- two phones make two sessions, never a merge (NFR-SYNC-4);
- the whole loop works by keyboard, with the focus on the one primary action of each step
  (principle 1, NFR-A11Y-1/6).

## Scope
- In:
  - **e2e rows** appended to `tests/e2e/uf-09-focus.spec.ts`. They start at `/` → UF-08.1 → UF-08.2
    → UF-08.4 → Start. They reuse `fixtures/uf-04-library-data.js` (`exercises`, `exerciseAreas`,
    `profile`), as `uf-08-setup.spec.ts` does, with no fixture edits.
  - **An in-spec recorder** for `sessions` and `session_sets` requests. It is registered after
    `mockSupabaseData`, so it wins (the T-0303d AC-10 pattern).
  - **UF-09 fixes.** Any fix in `features/UF-09/**` that these rows expose, with a unit test that
    pins it.
- Out:
  - New unit features.
  - Edits to `tests/e2e/fixtures/**` (T-0393 owns the `external_load` fixture fix), `features/UF-08/**`,
    `lib/**`, `tests/e2e/uf-08-setup.spec.ts` and the shell specs.
  - Any contract change.

### Edge cases that are in scope
- **Offline:**
  - start, 10 sets, a closed page, reopen, then a flush on reconnect (AC-2);
  - two offline devices (AC-3).
- **Time running out:** the reload keeps the wall-clock rest and the paused elapsed time (AC-1).
- **Zero history:** the profile fixture has no history, so the plan is the engine's zero-history
  plan, with bodyweight pre-fills per the T-0393 fixture note.
- **Returning after 10 days off:** a page closed and reopened later resumes the same step (AC-2).
  The 12 h stale rule is T-0304a's, and isn't re-tested here.

## Acceptance criteria
**Test setup.**
- Playwright, built app (`vite preview`), `test`/`expect` from `fixtures/guarded-test.js` (D-0086),
  signed in with `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData({exercises,
  exerciseAreas, profile, …})` and `mockProfilePresent`.
- A helper `startFromReady(page, budgetChip)` drives `/` → Start workout → UF-08.1 → chip → Suggest
  → UF-08.2 → Looks good → UF-08.4 → Start. It returns the `/session/<id>` id.
- Timers may be passed with `page.clock` (installed before the first `goto`) or with the step's
  own buttons (Skip rest, Save). At least one set per run goes through the **real** 5 s auto-save
  (D-0120 §9).
- **Test rules** (state.md):
  - Offline rows run after the precache settles and assert built content after any reload
    (D-0091 §1). Examples: the step heading, "Set n of N".
  - No row depends on T-0385's flush-on-enqueue being merged or not. Online asserts allow 10 s
    after the `online` event (D-0116).
  - The whole e2e suite runs in the DoD.

- **AC-1 (reload, NFR-TIME-2, parent AC-D7)**
  - **Mid-rest.** After Start (online), Skip warm-up and Done set, the auto-save gives UF-09.5. The
    test reads the rest `role="timer"` text, waits about 3 s, and reloads. After the reload, UF-09.5
    shows a remaining time equal to the pre-reload value minus the wall time that passed, ±1 s.
  - **Mid-pause.** "Pause workout" leads to UF-09.9. The test reads "Elapsed m:ss", waits about 3 s,
    and reloads. After the reload, UF-09.9 shows the same elapsed ±1 s: it doesn't grow while
    paused.
- **AC-2 (an offline workout, NFR-OFF-2, parent AC-D8)**
  - **Offline start.** After the precache settles, the context goes offline. `startFromReady` with
    the budget chip that the builder finds gives ≥ 11 planned sets, recorded in the build log and
    asserted from the IndexedDB row's plan.
  - **Ten sets.** Skip warm-up, then 10 sets are logged through Done set followed by the auto-save
    or Save. Rests are skipped, and UF-09.6 is passed with I'm ready. A timed item is passed with
    `page.clock`.
  - **Close and reopen.** The step's `data-screen-id` and heading are noted, and the page is closed.
    A new page in the same context opens `/session/<id>` and shows the same `data-screen-id` and
    heading.
  - **IndexedDB.** `wl-offline.sets` holds exactly 10 rows for that session, with distinct
    `clientId`s, `isWarmup` false, and `setIndex`/`exerciseId` in plan order.
  - **Requests.** No `sessions` or `session_sets` request was recorded while offline.
  - **Online.** Going online (within 10 s), the recorder sees the `sessions` row for that id, then
    10 `session_sets` rows. Each has that `session_id` and a distinct `client_id`, and none is sent
    before the session.
- **AC-3 (two devices, NFR-SYNC-4, parent AC-D9)**
  - **Setup.** A second `browser.newContext()` gets the same mocks and its own
    `installSupabaseGuard(context)`.
  - **Two starts.** Both contexts go offline after their precache settles. Each runs
    `startFromReady` and logs 1 set.
  - **Online.** Both go online. Within 10 s, the two recorders together hold exactly two `sessions`
    rows, with different ids. Each context's one `session_sets` row references its own context's
    session id. Neither id appears in the other context's set rows (no merge).
  - **Requests.** Both guards report no unclaimed request.
- **AC-4 (keyboard only, focus, targets and axe, NFR-A11Y-1/2/6, parent AC-D10)**
  - **The walk.** Online, using Tab, Enter and Space only (no `click`, no `page.mouse`):
    1. Start on UF-08.4.
    2. UF-09.1: "Start now".
    3. UF-09.2: "Next move" until the warm-up ends.
    4. UF-09.6: "I'm ready".
    5. UF-09.3: Done set.
    6. UF-09.4: Save.
    7. UF-09.5: Skip rest, back to UF-09.3.
    8. Pause workout → UF-09.9 → Resume → back to the same step.
    9. Pause workout → End workout → confirm "End workout" → `[data-screen-id="UF-03.3"]`.
  - **Focus.** On each new step, `document.activeElement` is that step's primary action (D-0118,
    D-0119, D-0120): Start now, Next move, I'm ready, Done set, Save, Skip rest, Resume, and Cancel
    in the End confirm. Checked with `toBeFocused`.
  - **Targets.** Every visible button on UF-09.1, .2, .3, .4, .5, .6 and .9 is ≥ 44 × 44 px
    (bounding boxes). Done set is ≥ 200 px tall.
  - **axe** reports 0 serious or critical violations on UF-09.1, .2, .3, .4, .5, .6 and .9.
  - **The session row.** It has `ended_at` set (IndexedDB) and the original `started_at`.
- **AC-5 (one screen at a time, principle 1)** In every row above, at every assert point, `[data-
  screen-id]` has count 1, and `getByRole("navigation")` has count 0 on `/session/<id>`.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), for fixes these rows expose.
- **Listed extras:**
  - `tests/e2e/uf-09-focus.spec.ts`: append rows and in-spec helpers (D-0071 §10).
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape, for a fix that needs a string.
  - `docs/tickets/T-0304h-focus-e2e-from-ready.md`: this file, for the build and accept logs.
- Read-only imports (not grants): the existing `tests/e2e/fixtures/*` exports (`guarded-test`, `supabase-mock`, `uf-04-library-data`).

## Contract impact
None. The rows observe the `sessions` and `session_sets` requests that the T-0300c queue already
sends (D-0045 §6).

## NFRs owned
OFF-2 end-to-end (AC-2), TIME-2 end-to-end (AC-1), SYNC-4 (AC-3), A11Y-1 and A11Y-6 for UF-09
(AC-4), A11Y-2 (AC-4).

## Definition of done
Tests for every AC pass · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite, run
twice in a row with no flake) · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0304h`
and cite the screen (for example `T-0304h UF-09.3: ten offline sets survive a closed page`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** It needs T-0304d, for UF-09.9 End and its focus. It needs **T-0303d**, for UF-08.4 Start.
  It runs last in the lane (D-0118 §1).
- **Fixture note.** T-0393 (todo) makes the `uf-04-library-data` exercises bodyweight-only today, so
  these rows assert set counts and fields, not kg text. They stay valid when T-0393 adds loaded
  exercises.
- **Parallel.** It is parallel-safe by files with T-0385, which edits `uf-08-setup.spec.ts`, not
  this spec.
