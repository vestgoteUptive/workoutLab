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

## Build log (frontend-dev, 2026-10-02)
- **Files.** `features/UF-03/summary-data.ts`: new `viewEffort(sessions, id, raw)`, which is `storedEffort` of the `loadSessions()` entry's `effortRating`, or of the raw `effort_rating` when there is no entry. `loadSummary` reads `loadSessions()` next to the history, library and targets, and uses it only for `effortRating`. `now` and the numbers are unchanged. `features/UF-03/EffortSave.tsx`: a `touched` ref set by a chip pick. An untouched Save sends `viewEffort(await loadSessions(), id, entry.row.effort_rating)`, with both read at the tap after `sessions.get(id)`. A `mounted` ref guards `navigate("/", {replace: true})` and the `failed` state. Tests: new `__tests__/summary.merged.test.tsx` (15 tests). Additive changes in `__tests__/helpers.tsx`: `seedSessionCache`, `setQueuedFlags` and a `/balance` route in `renderSummary`. Additive in `__tests__/mocks.ts`: `featureLoaderSpies`, which wraps the real `loadSessions` in a spy.
- **AC → test** (`summary.merged.test.tsx`; every test also asserts after it that no `refresh*` spy was called and the `unhandledRejection` probe is empty):
  - AC-1: "marked … 'Easy'", "the pair, unmarked … 'Hard'", "the pair, no cached row", "a later cached finish … 'Very hard'", "nothing … no chip".
  - AC-2: "marked: no pick sends … 2", "tap-time … (1)", "touched … 5", "touched back … 2 … view changed to 1", "no cached row … 3", "no entry (the fallback) … raw 3" (`loadSessions` spy `mockResolvedValueOnce([])` at the tap).
  - AC-3: "offline, marked, untouched …": `pending: true`, `finished: true`, row `{...row, effort_rating: 2}`, no `cacheCurrent` key, replace (one step back is `/`), `fetch` not called.
  - AC-4: "left through 'See balance'" (`/balance` after 50 ms, the row holds 4, one step back is the summary), "the pair: staying …" (replace to `/`), "rejected after leaving" (probe empty, `console.error` spy not called, `/balance` stays).
  - AC-5: `exports-and-lint.test.ts`, `summary.save/states/numbers.test.tsx` and `index.tsx` are unedited and green. `flows/uf-03.ts` is untouched. `grep -rnE "\brefresh[A-Z]\w*" apps/web/src/features/UF-03 | grep -v __tests__` finds nothing (exit 1).
- **Red on main** (the new test file against the unfixed `summary-data.ts`/`EffortSave.tsx`): 9 of 15 fail.
  - AC-1: marked `expected ['Hard'] to deeply equal ['Easy']`, later cached finish `['Hard']` vs `['Very hard']`, nothing `['Hard']` vs `[]`.
  - AC-2: marked `effort_rating: 4` vs expected 2; tap-time `4` vs expected 1; touched back fails on the preselect (`['Hard']` vs `['Easy']`); no entry fails because `loadSessions` is never called at the tap.
  - AC-3: the queued row has `effort_rating: 4`, expected 2.
  - AC-4: left through "See balance" `expected '/' to be '/balance'`.
  - These are green on main by design: the unmarked pair, the no-cached-row pair, touched, the no-cached-row Save, the stay-on-summary pair and rejected-after-leaving.
- **Planted faults.** Each was applied alone to the fixed code, then `summary.merged` + `summary.save` were run (34 tests) and the fault reverted:
  - F1, preselect read from the raw row (`storedEffort(row.effort_rating)`): 4 red (AC-1 marked, later cached finish, nothing; AC-2 touched back).
  - F2, the untouched value taken from mount state (`rating`): 2 red (AC-2 tap-time `4` vs 1; no entry, no tap-time read).
  - F3, unconditional `navigate`: 1 red (AC-4 left through "See balance", `'/'` vs `'/balance'`).
  - F4, `touched` ignored (always the view): 13 red (AC-2 touched and touched back, AC-4 both, and 9 in `summary.save`).
  - F5, the no-entry fallback as `null`: 1 red (AC-2 no entry).
  - F6, `setState("failed")` without the mounted guard: stays green. React 18+ doesn't warn on a set-state after unmount, so the guard only stops a render that would never show. AC-4's "rejected after leaving" pins what the user would see: no throw, no `console.error`, `/balance` stays.
- **Runs.**
  - `flock … turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: 4/4 tasks, 169 test files green.
  - `pnpm -w format:check`: green.
  - `node .github/scripts/check-all.mjs`: exit 0.
  - `pnpm --filter @workoutlab/web test:e2e uf-03`: 2/2. The whole e2e suite: 137 passed.
- **Defaults (none needed a decision).** A pick back to the preselected value counts as touched, as the ticket's "touched back" says. The tap reads `sessions.get` first and then `loadSessions`, so a gone row still fails before any view read.

## QA log (qa-tester, 2026-10-02)
- **Start.** Branch `t/T-0433-uf03-summary-rating-merged-view` at `6c00734`, `git status` clean.
- **Red on main reproduced.** The test file was run against main's `summary-data.ts` and `EffortSave.tsx`, restored afterwards from a backup copy. 9 of 15 fail, the same set and the same assertions as the build log: AC-1 marked `['Hard']` vs `['Easy']`, AC-2 marked and tap-time (the effort_rating deep-equal), AC-4 left through "See balance" `'/'` vs `'/balance'`.
- **Planted faults reproduced** against HEAD (`summary.merged` + `summary.save`, 34 tests). Each was reverted from a backup, and the tree was clean after each:
  - F1 `storedEffort(row.effort_rating)`: 4 red.
  - F2 the untouched value is `rating`: 2 red (tap-time, no entry).
  - F3 unconditional `navigate`: 1 red (AC-4 left).
- **QA fault F7** (`viewEffort` takes `sessions[0]`, not the entry with this id): all 90 UF-03 tests stayed green, because S1 was the only `loadSessions()` entry in every fixture. Added "QA: the view entry is S1's, not the first in the list". It caches a session started a day earlier with rating 1, so that session sorts first, and asserts "Easy" is preselected and the untouched Save sends 2. Green on HEAD, red under F7 (`['Very easy']` vs `['Easy']`).
- **Binary pairs.** marked/unmarked, cached row/none, view entry/none (spy), touched/untouched (plus touched back), mounted/left on resolve, and left on reject. The "mounted on reject" half is T-0420's `summary.save` failure test, unedited. Online/offline: AC-3 is offline, and the online path is the AC-2 tests plus `summary.save`.
- **AC-5.** No diff against main in `index.tsx`, `flows/`, `summary.save/states/numbers.test.tsx`, `exports-and-lint.test.ts` or the contracts. `grep -rnE "\brefresh[A-Z]\w*" apps/web/src/features/UF-03 | grep -v __tests__` finds nothing.
- **Runs.**
  - `flock … turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: 4/4 tasks, 169 files, 2670 tests green.
  - `-w format:check`: green.
  - `node .github/scripts/check-all.mjs`: exit 0.
  - `test:e2e uf-03`: 2/2, run with `TMPDIR=$HOME/.cache/wl-pw-tmp`. Earlier runs with the default TMPDIR failed with `net::ERR_INSUFFICIENT_RESOURCES` at the first `page.goto`. `offline.spec.ts` failed the same way, and so did main's UF-03 sources. Cause: /tmp is a RAM tmpfs at 80%, so these were environment false reds.
