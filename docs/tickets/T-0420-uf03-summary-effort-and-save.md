---
id: T-0420
title: "UF-03.3 effort 1–5 and Save workout: the whole stored row with effort_rating through the offline queue, then /; no /finish call in v1; the summary e2e"
lane: web-feature:UF-03
screens: [UF-03.3]
decisions: [D-0142, D-0068, D-0071, D-0030, D-0053, D-0045, D-0086, D-0091]
deps: [T-0419, T-0324]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Second child of the T-0305b board row (D-0142 §1 §4). Build flow: wl-build-web. About ⅓–½ day. T-0324 (web-shell) fixes the loadSessions effortRating fallback that would show a cleared rating again. The board marks it as blocking T-0305b, so it blocks this save child. Ready when T-0419 and T-0324 are done. -->

## Why
- **D-0030:** the effort rating is 1–5, optional, and picked at the end.
- **D-0068 §2, D-0071 §6 §8:** Save writes through the offline queue (the durable path that already carries `ended_at`). It sends the whole stored row, never a partial row, and the web calls no Edge Function in v1.
- **NFR-OFF-2:** saving works with no network.

## Scope
- In:
  - On an ended summary (T-0419): an effort radio group with five chips, then "Save workout".
  - **Save** re-reads `(await offlineDb().sessions.get(id)).row` at the tap and calls `upsertSession({...row, effort_rating})`. Then it navigates to `/` with `replace`.
  - Pending and rejection states.
  - A stored `effort_rating` preselects its chip (D-0142 §4).
  - It creates `tests/e2e/uf-03-list-summary.spec.ts` (D-0071 §10) with the summary rows. T-0417 appends to it.
- Out:
  - `POST /sessions/{id}/finish` (D-0068 §2, D-0071 §8).
  - "Tune next week" copy (D-0068 §3).
  - Editing the sets of a finished session (Phase 5).
  - The still-running and isn't-on-this-device states (T-0419): they have no chips and no Save.

### Edge cases that are in scope
- **Offline:** Save resolves after the IndexedDB write and navigates (AC-3). The queue keeps `finished: true` (T-0300c, D-0053 §7).
- **Time running out:** none here. The workout has ended.
- **Zero history:** the chips and Save work the same (AC-1 runs on a zero-history fixture too).
- **Coming back:** reopening the summary of a saved session preselects the stored rating, and saving again sends the change (AC-5).

## Acceptance criteria
**Test setup.** T-0419's (S1 ended at 11:52:40, the queue sets, `fake-indexeddb`, a signed-in user). `upsertSession` is the real one wrapped in a spy. `fetch` is a spy.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on T-0419's code (there are no chips and no Save). The build log records these planted faults turning their ACs red:
- a partial row `upsertSession({id, ended_at, effort_rating})` (AC-2);
- `ended_at: new Date().toISOString()` at Save (AC-2);
- a chip preselected by default (AC-1).

- **AC-1 (effort chips, D-0030, D-0068 §3)** The chips are one `role="radiogroup"` named "How hard was it?", with five radios in this order: "Very easy", "Easy", "About right", "Hard", "Very hard". None is checked at first. Arrow keys move the selection (native radio behaviour). The text "tune next week" isn't in the DOM.
- **AC-2 (Save sends the whole stored row, D-0071 §6)**
  - **A pick.** Picking "Hard" then "Save workout" calls `upsertSession` exactly once with `{...row, effort_rating: 4}`. `row` is deep-equal to the stored S1 row (its `started_at`, `ended_at`, `time_budget_min`, `energy`, `warmup_in_budget` and `plan`).
  - **No pick.** Saving with none checked sends `effort_rating: null`, and everything else is the same.
  - **Fresh read.** If the stored row's `plan` changes between mount and the Save tap (the test writes it), the call carries the new `plan`.
- **AC-3 (offline save and the route, D-0068 §2)** With `navigator.onLine = false`, Save resolves after the IndexedDB write and the location becomes `/` (replace: history has no `/session/S1/summary` entry above `/`). The queued session has `finished: true` and `row.effort_rating` 4. No `fetch` to `/functions/v1/` is made at any point (spy).
- **AC-4 (pending and rejection)**
  - **Pending.** While the write is held, "Save workout" has `aria-disabled="true"`, a second click makes no second call, and the chips can't change the pending value.
  - **Rejection.** With `upsertSession` rejecting once, the polite text "Couldn't save. Try again." shows (in an `aria-live="polite"` element, no `role="alert"`), the location stays, and a second Save calls it again.
- **AC-5 (a stored rating)** With the stored S1 row's `effort_rating: 2`, "Easy" is checked on mount. Picking "Very hard" and saving sends `effort_rating: 5`. The pair, `effort_rating: null`, checks nothing.
- **AC-6 (a11y)** Every radio is ≥ 44 × 44 px (computed box in the e2e). Save is a `button`. The vitest axe helper finds 0 violations with a chip checked and while pending.
- **AC-7 (e2e, summary, NFR-OFF-2; new file `tests/e2e/uf-03-list-summary.spec.ts`)** In the preview build, with the T-0904 Supabase guard (D-0086):
  - **Seed** an ended S1 row and its sets into `wl-offline` (an in-spec seed helper, the `uf-09-focus.spec.ts` pattern), then go offline (`context.setOffline(true)`) and open `/session/S1/summary`.
  - **It shows** "52 min", "Sets 7" and "See balance".
  - Pick "About right" by keyboard (Tab to the group, arrow keys), Tab to "Save workout", and press Enter. The location is `/`.
  - **After a reload,** the IndexedDB session row has `effort_rating` 3, and `ended_at` and `started_at` are unchanged.
  - **axe** on the summary reports 0 serious or critical violations.
  - **Requests.** The guard reports no unclaimed request, and none to `/functions/v1/`.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `tests/e2e/uf-03-list-summary.spec.ts`: a new file (D-0071 §10); T-0417 appends to it.
  - `tests/e2e/fixtures/**`: additive exports for the seed (D-0071 §10).
  - `docs/tickets/T-0420-uf03-summary-effort-and-save.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (`offlineDb`, `upsertSession`), `lib/i18n/en.ts`, the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. `sessions.effort_rating` (1–5 or null) exists in `docs/data-model.md`, and the write is the existing queued upsert (D-0045, D-0053).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `check:size` green · contracts unchanged · commits start `T-0420` and cite the screen (for example `T-0420 UF-03.3: Save sends the whole row`).

## Notes
- **Flow:** `wl-build-web`.
- **Lane order (D-0142 §1):** T-0419 → T-0420 → T-0416 → T-0417 → T-0418. If T-0324 is late, the orchestrator may run T-0416 first.
