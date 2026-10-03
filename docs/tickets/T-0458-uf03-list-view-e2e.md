---
id: T-0458
title: "UF-03.1 List view e2e (NFR-OFF-2): offline, a seeded running session, Pause → List view, three sets checked by keyboard, Finish → UF-03.3 → Save, the stored sets and session after a reload, axe and 44 px"
lane: web-feature:UF-03
screens: [UF-03.1, UF-09.9, UF-03.3]
decisions: [D-0164, D-0142, D-0071, D-0086, D-0155]
deps: [T-0417]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner. Split from T-0417 by D-0164 §1. It is the List view Playwright spec T-0416 deferred ("lands with logging in T-0417"). Build flow: wl-build-web. About ⅓ day. Start from a main that has T-0417. It doesn't need T-0457. -->

## Why
- **NFR-OFF-2:** a whole List-view workout works offline, and every set is in IndexedDB before
  the UI shows it as done. Only a real browser over the preview build proves the service worker,
  the real IndexedDB and the strict CSP together.
- **T-0416** covered the read side with host tests and deferred the Playwright spec to the logging
  ticket. jsdom can't check `boundingBox()` sizes or real keyboard focus order.

## Scope
- In:
  - New rows appended to `tests/e2e/uf-03-list-summary.spec.ts`, under one
    `test.describe("T-0458 UF-03.1 List view, offline (NFR-OFF-2)")`.
  - A `seedRunningSession(page)` helper **in that spec**: one `sessions` row with `ended_at: null`
    in the app's `wl-offline` database, the `uf-09-focus.spec.ts` `seedSessionRow` pattern. It
    goes next to the existing `seedEndedSession`, which doesn't change. No edit under
    `tests/e2e/fixtures/**`.
  - A fix in `features/UF-03/list-view.css` only if AC-3's size or axe row finds a real fault (the
    build log names it).
- Out:
  - "+ Add set" in the e2e (T-0457 has vitest coverage).
  - UF-03.2 rest (T-0418).
  - Any T-0420 row, or any other spec.

### Edge cases that are in scope
- **Offline:** the whole flow runs with `context.setOffline(true)` after the caches fill and the
  precache settles (the T-0420 spec's order, D-0154).
- **Reload:** the stored sets and the ended session are read again after `page.reload()`.
- **Zero history, time running out, 10 days off:** covered in vitest by T-0416 and T-0417.

## Acceptance criteria
**Test setup.** The T-0420 rows' setup in the same spec: `mockSupabaseAuth`, `mockSupabaseRest`,
`mockProfilePresent`, `mockSupabaseData`, `injectSession`, `cachesFilled`, `precacheSettled`, then
offline. The plan is a seeded S1 with back-squat × 4 (prefill 100 × 6) and one more item. `test`
and `expect` come from `fixtures/guarded-test.js` (D-0086): an unclaimed Supabase request or a
console error fails the test at teardown.

**Red proof.** On `main` before T-0417, AC-1 fails at its first check (the toggle doesn't log), and
the build log records that run. The build log also records one planted fault turning AC-2 red:
the List view's check marks the row done in component state without calling `ctx.recordSet` (the
set count after the reload is 0). Plant it on a backup copy and restore it with `cp`.

- **AC-1 (offline List view logging by keyboard)** Given the seeded running S1 offline at
  `/session/S1`, When the user pauses (UF-09.9), chooses "List view", and checks back-squat rows
  1–3 by keyboard only (Tab to each toggle, then Space), Then exactly one `[data-screen-id]` is in
  the DOM and it is `UF-03.1`, and the three toggles read "Mark set 1 not done", "Mark set 2 not
  done" and "Mark set 3 not done". Row 4's reads "Mark set 4 done".
- **AC-2 (Finish, Save, reload)** Then "Finish" → "Finish" in the confirm leads to
  `[data-screen-id="UF-03.3"]` at `/session/S1/summary`. Effort 3 is picked by keyboard and "Save"
  leads to `/`. After `page.reload()`, an IndexedDB read in the page finds exactly 3 live
  (`deletedAt` null) back-squat sets for S1 with `setIndex` 0, 1 and 2, each `weightKg` 100 and
  `reps` 6. The stored session has `effort_rating` 3 and a non-null `ended_at`.
- **AC-3 (a11y in a real browser)** On UF-03.1 with the current card expanded and one row done:
  - axe reports 0 serious or critical violations;
  - every row toggle and every kg and reps field has a `boundingBox()` of at least 44 × 44 px;
  - "Focus mode" returns to a UF-09 step screen, with exactly one `[data-screen-id]`.
- **AC-4 (the guard)** The supabase guard reports no unclaimed request and no backstop hit, and
  the console guard reports no error, for every T-0458 row (the fixture's teardown assert).

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`), used only for a
  `list-view.css` fault AC-3 finds.
- **Listed extras:**
  - `tests/e2e/uf-03-list-summary.spec.ts`: append the T-0458 rows and `seedRunningSession` only
    (D-0071 §10). The T-0420 rows don't change.
  - `docs/tickets/T-0458-uf03-list-view-e2e.md`: this file, for the build and accept logs.

## Contract impact
None.

## Definition of done
Every AC passes in `uf-03-list-summary.spec.ts`, with the red run and the planted fault recorded ·
the cached gate (D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
`-w format:check` and `check-all` green · `uf-03-list-summary.spec.ts` and `uf-09-focus.spec.ts`
green 3 runs in a row (no flake) · commits start `T-0458` and cite UF-03.1.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** not with T-0417, T-0457, T-0439 or T-0418 (same lane, one UF-03 ticket at a time,
  D-0164 §1). Allowed by files with T-0394, T-0451, T-0446, T-0448, T-0454 and T-0459. T-0459
  runs the whole e2e suite, so the two share the machine's test lock, not files.
- **E2e runs:** `TMPDIR=$HOME/.cache/wl-pw-tmp` if the T-0440 preflight asks for it.

## Code review log

**2026-10-03, code-reviewer.** Approve.

- Lane/paths: diff touches exactly `apps/web/src/features/UF-03/list-view.css` (lane
  `web-feature:UF-03`), `tests/e2e/uf-03-list-summary.spec.ts` and this ticket file — the three
  paths the ticket grants. No edit under `tests/e2e/fixtures/**`. Contract impact: none, confirmed
  (no `docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md` or design-tokens touched).
- CSS fix: scoped to the single existing selector
  `.wl-uf03-list__table input[type="checkbox"]` (only one such rule in the file); `28px`→`44px`
  on width/height plus `box-sizing: border-box` (matching the sibling `input[type="text"]` rule's
  pattern). No other selector, padding or table rule changed — row/column spacing in
  `list-view.css` is untouched.
- `RUNNING_PLAN`: built as `{...PLAN, items: PLAN.items.map(...)}`, a derived copy; the diff shows
  exactly one removed line (the file-header comment, expanded) and no other edit to `PLAN`,
  `s1Sets`, or any T-0420 row/helper — additive only, confirmed by `git diff` showing no `-` lines
  inside the fixture bodies. Verified back-squat is `external_load: true` in the exercise fixture
  and `PLAN`'s own prefill is `kind: "first_time"` / `weightKg: null`, which `ListView.tsx`'s
  `blocked = !logged && (weightInvalid || countInvalid)` would indeed block (confirmed in
  `ListView.tsx:201`); `add_rep` with `weightKg: 100` is a schema-valid prefill kind
  (`packages/shared/src/session-plan.schema.gen.ts`) and avoids that block. Reasoning in the build
  log matches the code.
- AC-4: `guarded-test.ts`'s `supabaseGuard`/`consoleGuard` are `auto: true` fixtures, so
  `assertClean()` already runs at teardown for every test in the file, T-0458's two included —
  this is real coverage, not something the new rows had to add. The extra
  `expect(supabaseGuard.unclaimed()).toEqual([])` plus `expect(functionCalls).toEqual([])` in
  AC-1/AC-2 is a genuine, non-vacuous mid-test assertion (checks the list is empty before
  teardown, and that zero `/functions/v1/` calls happened) — not a duplicate of the teardown, and
  specific to this spec's offline claim.
- Reran targeted: `scripts/locked.sh heavy npx playwright test ... uf-03-list-summary.spec.ts -g
  T-0458` → 2/2 passed. Full pair `uf-03-list-summary.spec.ts uf-09-focus.spec.ts` → 16/16 passed,
  matching the logged 3-in-a-row claim. `prettier --check` on both changed files: clean.
  `633a835` (the red-proof's base commit) exists in history.
- No findings. Build log's AC→test map, red proof and planted-fault proof all check out against
  the code and current test run.

Verdict: **approve**.

## Build / accept log
Archived in `docs/tickets/log/T-0458.md` (D-0157).
