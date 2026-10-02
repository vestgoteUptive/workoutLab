---
id: T-0433
title: "UF-03.3 rating from the merged loadSessions view: the preselected chip and an untouched Save use the D-0148/D-0151 view, not the raw queued row; Save navigates to / only while the summary is still mounted"
lane: web-feature:UF-03
screens: [UF-03.3, UF-10.1]
decisions: [D-0153, D-0148, D-0151, D-0152, D-0142, D-0071, D-0053]
deps: [T-0420, T-0431]
status: ready
---
<!-- Written 2026-10-02 by product-owner (groom). Follow-up from the T-0420 review and accept log. Build flow: wl-build-web. About ⅓ day. Ready: T-0420 (EffortSave) and T-0431 (D-0151 cacheCurrent in loadSessions) are on main. -->

## Why
- **A newer rating gets overwritten.**
  - `loadSummary` (`features/UF-03/summary-data.ts`) preselects the chip from the raw queued row's `effort_rating`. `EffortSave` starts its state from it, so an untouched Save sends that value again.
  - Under D-0148/D-0151, `loadSessions()` is the device's view of the session, and it can hold a newer rating. Example: a flushed entry that a later refresh has marked `cacheCurrent` defers to the cached server row, which carries the rating another device saved.
  - Re-sending the raw value queues a `pending: true` row. At an equal `ended_at` that row wins again (D-0148 §3), so the other device's rating is overwritten on the server at the next flush.
- **Save after leaving.** `EffortSave` calls `navigate("/", {replace: true})` when the write resolves. If the user already followed "See balance" (or went Back) while the write was pending, they are pulled off the screen they chose.

## Scope
- In (all in `apps/web/src/features/UF-03/`):
  - `summary-data.ts` `loadSummary`: `effortRating` is `storedEffort(view.effortRating)`, where `view` is the `loadSessions()` entry with this `sessionId`. With no entry, it falls back to the raw row's `effort_rating` (D-0153 §4). Every other summary field is unchanged, and `now` stays the raw row's `ended_at` (D-0142 §4).
  - `EffortSave.tsx`:
    - **Touched.** A `touched` flag is set by a chip pick. A touched Save sends the pick, as today.
    - **Untouched.** An untouched Save sends `storedEffort(view.effortRating)` from a `loadSessions()` read at the tap, or the raw row's value with no entry. The rest is `{...row, effort_rating}` from `offlineDb().sessions.get(id)` read at the tap, as today.
    - **Navigate.** Save calls `navigate("/", {replace: true})` only while the component is still mounted (D-0153 §5).
  - Tests: a new `__tests__/summary.merged.test.tsx`. Additive helpers in `__tests__/helpers.tsx` for seeding `sessionCache` rows and queued-entry flags (`pending`, `cacheCurrent`).
- Out:
  - `lib/offline/**`, including the merge rule itself (T-0324, T-0431).
  - The summary's numbers, its `now`, and the not-on-device and still-running states (T-0419).
  - A "clear rating" control (D-0152 §4).
  - A refresh on UF-03.3 (D-0142 §4 keeps none).
  - The merged view's `endedAt` replacing the raw row's (see Notes).

### Edge cases that are in scope
- **Offline:** every read is IndexedDB (`loadSessions`, `sessions.get`), so the behaviour is the same with `navigator.onLine = false` (AC-3).
- **Another device rated it:** this is AC-1 and AC-2.
- **No cache at all** (zero history, or the session is outside the 56-day window): the queued row is the view (D-0148 §5), so today's behaviour holds. This is the pair in AC-1.
- **Leaving mid-save:** AC-4.
- **Time running out / 10 days off:** not applicable. The workout has ended, and the summary reads `ended_at`.

## Acceptance criteria
**Test setup.** As T-0420 (`summary.save.test.tsx`):
- S1 ended at 11:52:40, with the queue sets;
- `fake-indexeddb` and a signed-in `USER_A`;
- `upsertSession` is the real one wrapped in a spy, and `fetch` is a spy;
- the summary rendered through `renderSummary`.

"Marked" means the queued S1 entry is `{pending: false, finished: true, cacheCurrent: true}`, and `sessionCache` has an S1 row (same `startedAt`, `endedAt` equal to the queued `ended_at`) with `effortRating: 2`, while the queued row has `effort_rating: 4`. Under D-0151 §4, `loadSessions()` gives S1 `effortRating: 2`. The test asserts that first, as a precondition.

**Test rules.**
- Both values of every binary condition get a test.
- Negative asserts wait ≥ 50 ms (`waitReal`).
- **AC-1, AC-2 and AC-4 must fail on `main`.** The build log records each red run with its failing assertion.
- These planted faults must turn red, and the build log records them:
  - the preselect read from the raw row (AC-1);
  - the untouched value taken from mount state, not the tap-time view (AC-2 "tap-time");
  - an unconditional `navigate` (AC-4).
- `summary.save.test.tsx` stays green unedited.

- **AC-1 (preselect from the merged view, D-0153 §4)**
  - **Marked.** Given the marked state, when the summary mounts, then "Easy" (2) is checked and "Hard" (4) is not. Red on main: "Hard" is checked.
  - **The pair, unmarked.** The same rows with the queued entry `pending: true` (no mark) check "Hard" (4), the D-0148 §3 queued win.
  - **The pair, no cached row.** With no `sessionCache` row, the queued `effort_rating: 4` checks "Hard" (D-0148 §5).
  - **A later cached finish.** With the cached `endedAt` 10 min after the queued one and `effortRating: 5`, an unmarked `pending: true` entry checks "Very hard" (5) (D-0148 §2).
  - **Nothing.** With the view's `effortRating: null` (marked, cache null, queued 4), no chip is checked.
- **AC-2 (an untouched Save sends the view's rating, D-0153 §4)**
  - **Marked.** Given the marked state, when "Save workout" is clicked with no chip picked, then `upsertSession` is called once with `{...row, effort_rating: 2}`. `row` is deep-equal to the stored queued row (`ended_at`, `started_at`, `plan` and the rest). Red on main: `effort_rating: 4`.
  - **Tap-time.** The view changes between mount and tap: mount on the unmarked state (checks "Hard"), then the test marks the entry and writes the cache with `effortRating: 1`. An untouched Save sends `effort_rating: 1`.
  - **Touched.** In the marked state, picking "Very hard" sends `effort_rating: 5`, whatever the view says.
  - **Touched back.** Picking "Hard" and then "Easy" sends 2 as a pick, and the view read at the tap doesn't decide it. Prove it with the view changed to 1 before the tap.
  - **No cached row.** With no `sessionCache` row and the queued `effort_rating: 3`, the view is the queued row (D-0148 §5), and the untouched Save sends 3.
  - **No entry (the fallback).** With `loadSessions` spied to resolve `[]` at the tap, the untouched Save sends the raw row's value (3). The real loader can't produce this case while the queued row exists, so the spy stands in.
- **AC-3 (offline and the whole row)** With `navigator.onLine = false`, AC-2 "Marked" resolves after the IndexedDB write. The queued S1 entry is then `pending: true`, `finished: true`, `effort_rating: 2`, with no `cacheCurrent` (D-0151 §3), and the location becomes `/` (replace). No `fetch` is made.
- **AC-4 (no navigate after leaving, D-0153 §5)**
  - **Given** `upsertSession` held on a deferred promise after a Save tap.
  - **When** the user clicks "See balance" (the location becomes `/balance`) and the write is then released.
  - **Then:**
    - the location is still `/balance` after 50 ms;
    - history has no `/` entry pushed or replaced over it (one step back is the summary);
    - the queued S1 row has the saved `effort_rating`.
  - **Red on main:** the location becomes `/`.
  - **The pair.** Staying on the summary, the release leads to `/` with replace (T-0420 AC-3, unchanged).
  - **Rejected after leaving.** With the held write rejecting after the user left, nothing throws (the `unhandledRejection` probe stays empty), `console.error` has no calls (spy), and the location stays `/balance`.
- **AC-5 (unchanged surfaces)**
  - `features/UF-03/index.tsx`'s exports and `Summary` wrapper are unchanged, and `exports-and-lint.test.ts` passes unedited.
  - `summary.save.test.tsx`, `summary.states.test.tsx` and `summary.numbers.test.tsx` pass unedited.
  - No string is added to `flows/uf-03.ts`.
  - The UF-03 code calls no `refresh*` (D-0142 §4). Record a grep of `features/UF-03` in the build log.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `docs/tickets/T-0433-uf03-summary-rating-merged-view.md`: this file, for the build and accept logs.
- Read-only imports (these are imports, not grants): `lib/offline` (`loadSessions`, `offlineDb`, `upsertSession`), `lib/i18n/en.ts`.

## Contract impact
None. This is a read of the existing `loadSessions()` view and the existing queued upsert (D-0045, D-0148, D-0151).

## Definition of done
- Tests for every AC pass, with the red runs and planted faults recorded.
- `pnpm -w typecheck lint test --force --concurrency=1` is green.
- `pnpm --filter @workoutlab/web test:e2e` is green (the whole suite; `uf-03-list-summary.spec.ts` must stay green unedited).
- `format:check` and `check:repo` are green.
- Contracts are unchanged.
- Commits start `T-0433` and cite the screen (for example `T-0433 UF-03.3: preselect the rating from the merged view`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel (2026-10-02 groom):**
  - **Allowed with every UF-09 ticket** (T-0415, T-0422, T-0423, T-0424, T-0435). It shares no file with them.
  - **Not with T-0416, T-0417 or T-0418.** They are the same UF-03 lane and share `__tests__/helpers.tsx`, so run T-0433 before or after them.
  - **Allowed with T-0434** (web-shell `lib/offline`), as long as T-0434 doesn't change what `loadSessions()` returns for these fixtures.
- **Not in scope, filed as a thought:** when the merged view's `endedAt` is later than the raw row's (another device finished later), UF-03.3 still shows numbers at the raw `ended_at` and Save re-sends it. D-0148 §1 keeps the later finish on the device either way. Raise a follow-up only if it shows up in use.
