---
id: T-0305
title: UF-03 List view (set table + rest, reached from Pause) and UF-03.3 workout summary
lane: split → web-feature:UF-03 (T-0305a, T-0305b)
screens: [UF-03.1, UF-03.2, UF-03.3, UF-09.9]
decisions: [D-0013, D-0015, D-0030, D-0034, D-0040, D-0045, D-0053, D-0060, D-0061, D-0066, D-0067, D-0068, D-0069, D-0071]
deps: [T-0304, T-0306a, T-0306b, T-0318]
status: split   # → T-0305a, T-0305b; neither is ready until T-0304 (all children) and T-0318 are done
---
<!-- Groomed 2026-09-29 by product-owner. Build flow: wl-build-web. Split per screen group (D-0067 §1); ACs tagged [a]/[b]. Reconciled with T-0304 by triage 2026-09-29 (TR-0030, D-0071): the list view and how-to are entries in features/UF-09/seams.tsx, session state is useFocusSession() via ctx, finish is ctx.finish(), and the summary save sends the whole row. -->

## Why
- **UF-03.1 and UF-03.2:** classic set-table logging for users who prefer it. It's reached from UF-09.9 Paused ("List view"), so it's an opt-in exception to focus mode. It still has no tab bar, no C-01, no Balance and no check-in (principle 1, D-0045 §4, D-0018).
- **UF-03.3:** the finish summary for both paths (focus mode and list view). It shows the before → after balance, the effort rating (1–5, D-0030) and what's next.
- **Offline:** NFR-OFF-2 requires the whole path to work with no network.
- **Engine values:** every number comes from the engine or the stored rows (principle 3, D-0068 §1).

## Split (D-0067 §1): the orchestrator edits the board
| Child | Scope | Deps | ~Size |
|---|---|---|---|
| T-0305a | UF-03.1 set table + UF-03.2 rest, rendered inside the UF-09 host | T-0304, T-0306a (`ExerciseHowTo`), T-0306b (`SwapSheet`), T-0318 | ½–¾ day |
| T-0305b | UF-03.3 summary at `/session/:sessionId/summary` | T-0304, T-0318 | ½ day |

Both children are in `features/UF-03`, so run a then b, or b then a. They don't run in parallel.

## Scope
- In:
  - [a] **Seams in `features/UF-09/seams.tsx`** (D-0071 §4), the only UF-09 file this ticket edits:
    - `list-view` in `pauseSeamActions`: label "List view", `keepsClockRunning: true`, `render(ctx)` → `<ListView ctx={ctx} />` from `features/UF-03/index.tsx`
    - `how-to` in `pauseSeamActions`: label "How to", `keepsClockRunning: false`, `render(ctx)` → `ExerciseHowTo` from `features/UF-04/index.tsx` for the current item
  - [a] A `ListView` rendered by the UF-09 host as that overlay. Its session state is `ctx` = `useFocusSession()` plus `close()` (D-0071 §5). `features/UF-03` never imports `features/UF-09`. It shows:
    - **header:** the elapsed time (from `started_at`, NFR-TIME-2), "Focus mode" (back to UF-09 at the current step) and "Finish"
    - **current exercise card:** the name, "target {sets} × {repsMin}–{repsMax}" or "{durationS} s", the cue, a "How to" button (`ExerciseHowTo`), a "Swap" button (`SwapSheet`), set rows (warm-up rows labelled W, then 1…N), the "Previous" column (D-0068 §4), kg/reps inputs pre-filled from `item.prefill`, a done checkbox and "+ Add set"
    - **the other items:** collapsed cards with "{done} / {sets} sets"
    - **UF-03.2:** a rest bar "Rest · m:ss left", expandable to the rest view with −15 s, +15 s and Skip, using T-0304's wall-clock rest timer
  - [a] **Logging:**
    - check → `recordSet` (a new `client_id`, `completed_at` = now)
    - editing a done row → `editSet`
    - uncheck → `deleteSet` (a tombstone, D-0015)
    - "+ Add set" appends one row with the last row's values
  - [b] **The `Summary` route:**
    - a device-side summary through engine calls (D-0068 §1)
    - effort chips 1–5 (D-0068 §3)
    - "See balance" → `/balance`
    - "Save workout" → `upsertSession({...row, ended_at, effort_rating})` with the whole stored row (D-0071 §6, never a partial row), then `/` (D-0068 §2)
    - `<OfflineStatus variant="text">`
    - the session row from `(await offlineDb().sessions.get(id)).row` and the sets from `loadEngineHistory()`
- Out:
  - PR card, volume and e1RM (D-0068 §5).
  - `POST /sessions/{id}/finish` (D-0068 §2; the web calls no Edge Function in v1, D-0071 §8).
  - Swap entries in `seams.tsx` (T-0306b). UF-03.1's own "Swap" button mounts `SwapSheet` directly.
  - Reordering exercises in the list.
  - Editing sets of finished sessions (Phase 5).
  - C-01 on UF-03 (banned, AC-D11).
  - The UF-11.1 card (banned, D-0070 §7).
  - Contracts.

### Edge cases that are in scope
- **Offline:** all of [a] and [b] with `navigator.onLine = false`. Sets are in IndexedDB before the UI shows them checked (the `recordSet` promise resolves first). The summary is computed from cache + queue.
- **Time running out:** the list view never shows UF-09.8 (the time check stays in focus mode, between exercises). Finish is always available. The summary shows "{m} min" next to "{budget} min budget" with no judgement.
- **Zero history:** "Previous" shows "—" for every row. The summary's before is all 0.
- **Returning after 10 days off:** "Previous" shows the session from 10 days ago. The pre-fill follows the engine (`hold_after_break`), and the UI shows it as given.
- **Reload mid-list:** the checked rows come back from IndexedDB, not from component state.

## Acceptance criteria
- **Tests:** Vitest + Testing Library + `fake-indexeddb`, and Playwright where tagged **e2e**.
- **Fixtures:**
  - Clock: tz Europe/Stockholm, now `2026-09-27T12:00:00+02:00`.
  - Library: engine L1.
  - Session S1: started 11:00, budget 45, warm-up on. Plan: back-squat × 4 (main, 6–8, prefill 100 × 6), romanian-deadlift × 3 (8–12, prefill 80 × 8), leg-curl × 3 (10–15).
  - Earlier session S0 on 2026-09-24: back-squat 97.5 × 8, 97.5 × 8, 97.5 × 7, 97.5 × 6 (hard) plus 40 × 10 (warm-up).
- `ListView` tests build a `ctx` object (the `useFocusSession()` shape plus `close()`) with spied methods, so they don't depend on T-0304 internals (D-0071 §5). `Summary` tests seed the IndexedDB session row and sets. One integration test mounts the real UF-09 host with the real `seams.tsx`.

### T-0305a UF-03.1 / UF-03.2
- **AC-A1 (entry, principle 1)** Given UF-09.9 Paused, When "List view" is chosen, Then `[data-screen-id="UF-03.1"]` renders inside `/session/S1` (the location doesn't change). There's no `nav` landmark, no C-01 region, no `a[href^="/balance"]`, no `a[href^="/plan"]` and no check-in card. "Focus mode" returns to the UF-09 step for the current item and set.
- **AC-A2 (set rows + pre-fill from the engine)** Plan items carry no warm-up sets, so the back-squat card shows rows 1–4 (a "W" row appears only for a logged `isWarmup` set), each with kg "100" and reps "6" from `item.prefill` (not from Previous). The subtitle reads "target 4 × 6–8".
- **AC-A3 (Previous, D-0068 §4)** The Previous column reads "97.5 × 8", "97.5 × 8", "97.5 × 7", "97.5 × 6" for rows 1–4. The S0 warm-up set isn't used. With no earlier session, every row reads "—". With a bodyweight exercise it reads "12", and with a timed one "45 s".
- **AC-A4 (check = recordSet, offline)** With `navigator.onLine = false`, checking row 1 calls `recordSet({sessionId: "S1", exerciseId: "back-squat", setIndex: 0, kind: "reps", reps: 6, weightKg: 100, isWarmup: false, backoff: false})`. The row renders as done only after the promise resolves (a deferred mock proves that it's pending until then). A fresh Dexie instance sees the row.
- **AC-A5 (edit + uncheck)** Changing a done row's reps to 5 calls `editSet(clientId, {reps: 5})` once, on blur or Enter, not per keystroke. Unchecking calls `deleteSet(clientId)`, and `.delete()` is never called on Supabase (spy).
- **AC-A6 (add set)** "+ Add set" on back-squat after 4 done rows adds row 5 pre-filled with row 4's kg/reps, unchecked. Checking it records `setIndex: 4`.
- **AC-A7 (reload)** After checking rows 1–2 and remounting the host (same `fake-indexeddb`), rows 1–2 are done with their values, and rows 3–4 aren't.
- **AC-A8 (other items)** The RDL and leg-curl cards are collapsed and read "0 / 3 sets". After 1 RDL set is logged, "1 / 3 sets". Expanding one collapses the other.
- **AC-A9 (rest UF-03.2, NFR-TIME-1)** After a set is checked, the bar reads "Rest · 2:00 left" for a compound. With fake timers and a mocked `Date.now` advancing 90 s (as if backgrounded), it reads "0:30". Expanded: "+15 s" → "0:45", "−15 s" → "0:30", and Skip hides the bar. It announces through `aria-live="polite"` at 10 s and 0 (NFR-A11Y-4).
- **AC-A10 (how-to + swap seams)** "How to" opens `ExerciseHowTo` for the current exercise. "Swap" opens `SwapSheet` for the current item. After a swap, the card shows the new exercise's name with its pre-fill, and the logged rows keep the old exercise.
- **AC-A11 (finish)** "Finish" asks for confirmation ("Finish workout?", Finish / Keep going). Finish calls T-0304's end-of-session path, which stores `ended_at`, and navigates to `/session/S1/summary`.
- **AC-A12 (a11y)** Every input has a label ("Set 1 weight in kg", "Set 1 reps"), the done toggle is named "Mark set 1 done" / "Mark set 1 not done", every control is ≥ 44 × 44 px, and the vitest axe helper finds 0 violations.

### T-0305b UF-03.3 Summary
- **AC-B1 (numbers from engine calls, D-0068 §1)** S1 ended at 11:52 with 4 back-squat hard sets and 3 RDL hard sets logged. The summary shows Time "52 min" next to "45 min budget", Exercises "2" and Sets "7". Spies show `normalizeHistory` and `isHardSet` from `@workoutlab/engine` in use.
- **AC-B2 (before → after)** With an empty earlier history, the rows read, in `after.areas` order through the real engine (the untrained areas have attention and change by 0, so they aren't listed; then deficit desc), "Core 0 → 2 / 12", "Quads 0 → 4 / 20", "Glutes 0 → 5.5 / 20" and "Hamstrings 0 → 5 / 16". Only areas whose load changed are listed. A test with a stubbed `balance` (two calls, before and after) proves the rows follow the stub's order and numbers.
- **AC-B3 (next up)** With a stubbed `after.areas` whose first entries are calves (step 0), chest (step 0), back (step 4), it reads "Next up: Calves, Chest". When every step is 4, it reads "Every area is on target".
- **AC-B4 (effort 1–5, D-0030)** Five chips, "Very easy" … "Very hard", as a radio group, with none selected at first. Picking "Hard" then Save calls `upsertSession({id: "S1", ended_at: <stored ended_at>, effort_rating: 4})`. Saving with none selected sends `effort_rating: null`. The text "tune next week" isn't in the DOM.
- **AC-B5 (offline save)** With `navigator.onLine = false`, Save resolves after the IndexedDB write, navigates to `/`, and the queued session keeps `finished: true` (T-0300c). No `fetch` to `/functions/v1/sessions` is made at any time (spy).
- **AC-B6 (See balance)** "See balance" is a link to `/balance` (UF-10.1).
- **AC-B7 (never the check-in or C-01, principle 1)** With a pending check-in proposal in the cache, the summary contains no check-in card and no C-01 region. ESLint on `features/UF-03` importing `features/UF-11` reports `no-restricted-imports` (T-0318 rule).
- **AC-B8 (reload)** `/session/S1/summary` loaded cold (a remount with the same IndexedDB) shows the same numbers. An unknown session id redirects to `/`.
- **AC-B9 (e2e, NFR-OFF-2 path)** Offline in the preview build: start S1 from a seeded plan, open Pause → List view, check 3 rows, Finish, pick effort 3, Save. After a reload, IndexedDB holds 3 sets and the session has `effort_rating 3` and a non-null `ended_at`, and `/` renders. axe on the summary finds 0 serious or critical violations.

## Paths you may change
- `apps/web/src/features/UF-03/**`, `apps/web/src/lib/i18n/flows/uf-03.ts` (extra), `tests/e2e/list-view.spec.ts` (extra, new file).
- [a] In `apps/web/src/features/UF-09/**`, only the UF-09.9 "List view" action and the host's mode switch that renders `ListView` (extra, D-0067 §4). Name the files in the PR.

## Contract impact
None. Session and set writes go through the existing D-0015/D-0045 queue. The summary uses public engine functions. The defaults are in D-0068 (`revisit`).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for tagged ACs · `check:size` green · contracts unchanged · commits start `T-0305a:`/`T-0305b:` with screen IDs.
