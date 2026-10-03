---
id: T-0416
title: "UF-03.1 List view, read side: the how-to and list-view seams on UF-09.9, header (elapsed, Focus mode, Finish confirm), set rows from the engine pre-fill, the Previous column, collapsed items; plus the T-0360 cross-screen principle-1 render assertion"
lane: web-feature:UF-03
screens: [UF-03.1, UF-09.9, UF-03.3]
decisions: [D-0142, D-0068, D-0069, D-0071, D-0111, D-0118, D-0120, D-0045, D-0060, D-0153, D-0155]
deps: [T-0304d, T-0419, T-0318, T-0306a, T-0422, T-0433]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner; refreshed 2026-10-02 against main after T-0304d, T-0427, T-0429 and T-0431 (T-0423 merging). First child of the T-0305a board row (D-0142 §1 §3). Build flow: wl-build-web. About ½–⅔ day. It carries T-0360 (the T-0306a QA finding). T-0304d, T-0419, T-0318 and T-0306a are on main. The spec is ready, but the build waits on two in-flight tickets: T-0422 (in build; same seams.tsx, UF-09 pins and uf-09-focus.spec.ts row) and T-0433 (in QA; same lane, web-feature:UF-03, and the same __tests__/helpers.tsx). Start it from a main that has both. -->

## Why
- **UF-03.1** is classic set-table logging for users who prefer it. It is reached only from UF-09.9 Paused ("List view"), so it is an opt-in exception to focus mode. It still has no tab bar, no C-01, no Balance and no check-in (principle 1, D-0045 §4).
- **Principle 3:** the rows show the engine's pre-fill (rule 14). "Previous" is display data only (D-0068 §4).
- **T-0360:** a lint ban can't see a hard-coded `<a href="/library">`. Only a render assertion on the real session screens can, and they are built now.

## Scope
- In:
  - **`features/UF-09/seams.tsx`**, the one UF-09 source file this ticket edits (D-0071 §4). In `pauseSeamActions`:
    - `how-to`: label "How to" (`en.uf03`), `keepsClockRunning: false`. `render(ctx)` gives `<ExerciseHowTo exerciseId={current item's exerciseId} onClose={ctx.close} />` from `features/UF-04/index.tsx`.
    - `list-view`: label "List view", `keepsClockRunning: true`. `render(ctx)` gives `<ListView ctx={ctx} />` from `features/UF-03/index.tsx`.
    - Either may be `lazy()`-loaded (D-0142 §8).
  - **The UF-09 pins these entries change** (D-0142 §6, a named change listed in the build log). T-0422 will have moved them once for `swap`. This ticket moves them again, for `how-to` and `list-view` only:
    - `seams.test.tsx` AC-9: the arrays hold exactly the ids landed so far (`pauseSeamActions`: `swap`, `how-to`, `list-view`; `nextSeamActions`: `swap` only);
    - its "with the module arrays" rows, `paused.test.tsx` "the pair: with the module arrays …", and the UF-09.9 button counts (each goes up by 2). The UF-09.6 pins (`next-exercise.test.tsx`) don't change, because neither entry goes on UF-09.6;
    - the UF-09.9 count in `tests/e2e/uf-09-focus.spec.ts`'s seeded-session row: up by 2 from the value on main at build start (3 after T-0422, so 5).
  - **`ListView`**, exported from `features/UF-03/index.tsx`. It types its own `ctx` (D-0142 §5) and renders `[data-screen-id="UF-03.1"]`:
    - **Header:** "Elapsed {m:ss}" from `ctx.elapsedS`, "Focus mode" (`ctx.close()`), and "Finish" with its confirm (`ctx.finish()`).
    - **Current card** (`ctx.currentItemIndex`), expanded: the name, "Target" with `itemSummary(item)` as a sibling element (D-0114 §5), the cue (`loadExerciseDetail`, D-0118 §8), a "How to" button (`ExerciseHowTo`), and the rows (D-0142 §3). Each row has a "Previous" cell, kg and reps (or seconds) fields with the engine pre-fill, and a done toggle that shows the logged state. Clicking it to log is T-0417.
    - **Other items:** collapsed cards with "{done} / {sets} sets". At most one other card is expanded.
  - **The T-0360 assertion** (AC-8) as `features/UF-03/__tests__/principle-1.test.tsx`.
  - Strings in `flows/uf-03.ts`.
- Out:
  - Logging: check, edit, uncheck, "+ Add set" (T-0417).
  - UF-03.2 rest and the Swap button (T-0418).
  - The `swap` seam (T-0422).
  - Any UF-09 source file other than `seams.tsx`. Host gaps are T-0415's.
  - Reordering exercises, and editing finished sessions (Phase 5).

### Edge cases that are in scope
- **Offline:** the List view reads only IndexedDB and `ctx` (AC-9), so it renders the same with no network.
- **Time running out:** the List view never shows UF-09.8 (the T-0304e forced `"next"`). Finish is always on screen (AC-7).
- **Zero history:** every "Previous" cell reads "—" (AC-4).
- **Returning after 10 days off:** "Previous" shows the session from 10 days ago, and the kg field shows the engine's `hold_after_break` pre-fill as given (AC-3, AC-4).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb`. Clock: tz `Europe/Stockholm`, now `2026-09-27T12:00:00+02:00`. Library: engine L1.
- **S1:** started 11:00, budget 45, warm-up on. Plan: back-squat × 4 (main, 6–8, prefill 100 × 6), romanian-deadlift × 3 (8–12, prefill 80 × 8), leg-curl × 3 (10–15).
- **S0** on 2026-09-24: back-squat hard sets 97.5 × 8, 97.5 × 8, 97.5 × 7, 97.5 × 6, plus a warm-up set 40 × 10 (`isWarmup`).
- `ListView` unit tests pass a `ctx` built in the test, with spied methods (D-0071 §5). Integration tests mount the real `SessionHost` with the real `seams.tsx` (no `seams` prop).

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on T-0419's code (the arrays are empty, and there is no `ListView`). The build log records these planted faults turning their ACs red:
- `<a href="/library/back-squat">` inside the ListView card (AC-8);
- "Previous" used as the kg pre-fill (AC-3);
- the S0 warm-up set counted in Previous (AC-4).

- **AC-1 (seam entries, D-0071 §4)**
  - **The arrays.** `pauseSeamActions` contains `how-to` (`keepsClockRunning: false`) and `list-view` (`keepsClockRunning: true`).
  - **The order.** UF-09.9 with the module arrays renders, in this order: Resume · Swap · Skip to next exercise · How to · List view · End workout (`orderActions`, D-0071 §4; T-0422 is a dep, so Swap is there). When `canSkipItem` is false (paused on the last item), the order is the same without Skip.
  - **The diff.** It touches no `features/UF-09` source file other than `seams.tsx`, and in `features/UF-09/__tests__` it changes only the D-0142 §6 pins (a PR check in the build log).
  - **No import of UF-09.** `features/UF-03` has no import of `features/UF-09` (a source test over every file, including dynamic `import()`).
- **AC-2 (entry and exit, principle 1)**
  - **Entry.** Given UF-09.9 paused from back-squat set 2 (`resumePhase: "set"`, `setIndex: 1`, set index 0 logged), When "List view" is chosen, Then exactly one `[data-screen-id]` is in the DOM, it is `UF-03.1`, and the location is still `/session/S1`. The stored state has left `paused` (the machine resumed, D-0071 §4).
  - **Exit.** "Focus mode" calls `ctx.close()` and shows UF-09.3 "Set 2 of 4" for back-squat.
  - **No refresh.** The `refreshAll`/`refresh*` spies have 0 calls 50 ms after the List view mounts online (D-0111 §11).
- **AC-3 (rows and pre-fill from the engine, D-0142 §3)**
  - **Rows.** The back-squat card shows rows 1–4. Each has kg "100" and reps "6" from `item.prefill`, never from Previous. The target reads "Target" and "4 × 6–8" as two elements.
  - **No "W" row** (D-0142 §3).
  - **Back-off.** With `item.backoff = {weightKg: 90, reps: 6}`, a fifth row "Back-off" reads kg "90" and reps "6". The pair, `backoff: null`, has no such row.
  - **Logged rows.** With `ctx.loggedSets` holding back-squat set index 0 at 100 × 5, row 1 shows reps "5", and its toggle is named "Mark set 1 not done" (checked). Row 2's toggle is "Mark set 2 done" (unchecked).
  - **Other kinds.** A timed item's rows show "{prefill.durationS} s" and no kg field. A bodyweight item (`externalLoad: false`) has no kg field.
  - **Kg text.** `formatDecimal` in fields and `formatKg` in text: `locale="sv-SE"` shows "97,5" in a field.
- **AC-4 (Previous, D-0068 §4)**
  - **S0.** The Previous cells read "97.5 × 8", "97.5 × 8", "97.5 × 7" and "97.5 × 6" for rows 1–4. The S0 warm-up set isn't used.
  - **The most recent session.** With a second earlier session S00 on 2026-09-20 (back-squat 90 × 8), Previous still reads S0's sets (the most recent).
  - **A tie** on `completedAt` goes to the smaller `sessionId`.
  - **None.** With no earlier session, every row reads "—". A fifth row (back-off) with no fifth S0 set reads "—".
  - **Other kinds.** A bodyweight exercise reads "12", and a timed one "45 s".
- **AC-5 (the other items)** The RDL and leg-curl cards are collapsed and read "0 / 3 sets". With one RDL set in `ctx.loggedSets`, it reads "1 / 3 sets". Expanding RDL then leg-curl leaves only leg-curl expanded (and the current card). Each card header is a `button` with `aria-expanded`.
- **AC-6 (How to, both ways)**
  - **From UF-09.9.** "How to" opens `ExerciseHowTo`, a `role="dialog"` named "How to: Back squat", as the overlay. The machine stays `paused`: after 10 min of fake time, the stored state is deep-equal to the state before. Close returns to UF-09.9.
  - **From the List view.** The current card's "How to" opens the same dialog for its exercise. Close returns to UF-03.1 (focus back on the button).
- **AC-7 (header and Finish)**
  - **Elapsed.** With `ctx.elapsedS` 1390, the header reads "Elapsed 23:10". With 59, it reads "0:59".
  - **The confirm.** "Finish" shows "Finish workout?" with "Finish" and "Keep going", focus on "Keep going". This replaces the header actions inside the same `UF-03.1`.
  - **Keep going** closes it, with no `ctx.finish()` call.
  - **Finish** calls `ctx.finish()` once. While pending, a second tap makes no second call. A rejection shows "Couldn't finish. Try again." (polite), and the confirm stays.
  - **Integration.** In the real host, Finish leads to `[data-screen-id="UF-03.3"]` at `/session/S1/summary`, and the stored row has a non-null `ended_at`.
- **AC-8 (T-0360: the cross-screen principle-1 render assertion)** Through `<Shell>` in a `MemoryRouter`, with S1 seeded in IndexedDB, a paused focus state, and the real module arrays:
  - **Session screens.** On UF-09.9, on the List view overlay, and on the How-to overlay, the DOM has 0 `a[href^="/library"]`, 0 `a[href^="/progress"]`, 0 `a[href^="/plan"]`, 0 `a[href^="/balance"]`, no `nav`, and no `[data-component="C-01"]`.
  - **The summary.** On `/session/S1/summary` for S1 ended, there are 0 `/library`, `/progress` and `/plan` links, no `nav`, and exactly one `a[href="/balance"]` ("See balance", T-0419).
  - **Contrasts.** The same selectors find 1 link after the test plants `<a href="/library/back-squat">` inside the List view overlay. They find at least one `a[href^="/library/"]` row on `/library` with a seeded cache. So "found none" can't mean the selector never matches.
- **AC-9 (strings, exports, a11y)**
  - **Strings.** Every new string is in `en.uf03` (`react/jsx-no-literals` green).
  - **Exports.** `features/UF-03/index.tsx` exports exactly `Summary` and `ListView` (the T-0419 pin, extended).
  - **Labels.** Every field has a label ("Set 1 weight in kg", "Set 1 reps", "Set 1 seconds"), and the toggles are named as in AC-3.
  - **axe.** The vitest axe helper finds 0 violations on UF-03.1 (with one card expanded) and on the Finish confirm. The UF-09 D-0071 §9 bans and the import-ban tests stay green.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/features/UF-09/seams.tsx`: the `how-to` and `list-view` entries (D-0071 §4).
  - `apps/web/src/features/UF-09/__tests__/*.test.tsx`: the D-0142 §6 pins these entries change (the module-array contents and the UF-09.9 button counts).
  - `tests/e2e/uf-09-focus.spec.ts`: the UF-09.9 button count in its seeded-session row (D-0142 §6).
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0416-uf03-list-view-table-and-seams.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-04/index.tsx` (`ExerciseHowTo`), `lib/offline` (`loadEngineHistory`, `loadLibrary`, `loadExerciseDetail`), `lib/format`, `lib/i18n/en.ts`, `lib/i18n/workout.ts`, `@workoutlab/engine`, and `app/App.js` (`Shell`, tests only).

## Contract impact
None. The List view reads the plan and `ctx`. The defaults are D-0142 §3 (`revisit`).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite, with the updated UF-09.9 count) · `check:size` green · contracts unchanged · commits start `T-0416` and cite the screen (for example `T-0416 UF-03.1: Previous column`).

## Notes
- **Flow:** `wl-build-web`.
- **Board:** this ticket carries T-0360. The orchestrator can mark T-0360 folded into T-0416.
- **Parallel (2026-10-02 refresh):**
  - **Not with T-0433** (in QA). Same lane (`web-feature:UF-03`): both touch `features/UF-03/**`, and T-0433 adds helpers to `__tests__/helpers.tsx`. Start after T-0433 merges. The same holds for T-0439 (UF-03.3 follow-up, still `todo`): one UF-03 ticket at a time.
  - **Not with T-0422** (in build). Both edit `seams.tsx`, the UF-09 seam pins and the `uf-09-focus.spec.ts` count (D-0142 §1). Start after T-0422 merges.
  - **Not with T-0415.** Both change UF-09 test pins (D-0142 §1, D-0153). Either order works, but never both at once. T-0417 needs both.
  - **With T-0304g, allowed by files.** T-0304g edits `host.tsx`, `ring.tsx`, `rest.tsx` and `uf-09.css`, and none of this ticket's files.
  - **With T-0435 and T-0424, allowed by files.** They edit `session.tsx` and `timed-set.test.tsx`.
  - **With T-0436 (qa), not at once.** T-0436 may edit `uf-09-focus.spec.ts` to add a mock. Whichever lands second merges `main` first.
- **E2e runs:** use `TMPDIR=$HOME/.cache/wl-pw-tmp` until T-0440 lands (state.md trap).

## Build / accept log

**Build (frontend-dev, 2026-10-03).** Start: `git status` clean, HEAD 94ebcfd (main with T-0422 and T-0433).
- **Code:** `features/UF-03/ListView.tsx`, `list-data.ts`, `list-view.css`; `ListView` exported from `index.tsx`; strings in `flows/uf-03.ts`; `seams.tsx` gets `how-to` (keepsClockRunning false) and `list-view` (true), both `lazy()`. Rows read `item.prefill` / `item.backoff` and `ctx.loggedSets`; Previous is display only (`previousSets`: engine `normalizeHistory` + `isHardSet`, latest session, tie to smaller sessionId, own session excluded). The set fields and toggles are read-only (logging is T-0417).
- **D-0142 §6 named pin changes (UF-09 only):** `seams.test.tsx` AC-9 arrays (and the keepsClockRunning flags, `pauseSeamActions` swap, how-to, list-view; `nextSeamActions` swap) and its UF-09.9 module-arrays row; `paused.test.tsx` the AC-6 actions row, the AC-7 two "Skip hidden" rows, the AC-8 Cancel row, and "the pair" row (each +How to, List view); `host.chrome.test.tsx` the two paused button pins (4 → 6, 3 → 5); `tests/e2e/uf-09-focus.spec.ts` UF-09.9 button count 3 → 5. `next-exercise.test.tsx` (UF-09.6) unchanged.
- **AC → test:**
  - AC-1 → `list-view.host.test.tsx` (order, without Skip, keepsClockRunning flags), `seams.test.tsx`/`paused.test.tsx` pins, `exports-and-lint.test.ts` (no UF-09 import, static or dynamic, with contrast). The "diff touches only seams.tsx" PR check: `git diff --stat main -- apps/web/src/features/UF-09` lists `seams.tsx` plus the pin tests above only.
  - AC-2 → `list-view.host.test.tsx` (entry: one screen id UF-03.1, location S1, stored phase left paused; exit: UF-09.3 "Set 2 of 4"; time check never shown), `list-view.test.tsx` + host (0 refresh calls after 50 ms).
  - AC-3 → `list-view.test.tsx` AC-3 (7 tests: rows from prefill, Target pair, no W, back-off and its pair, logged rows, timed and bodyweight, sv-SE "97,5", cue).
  - AC-4 → `list-view.test.tsx` AC-4 (S0 + warm-up, most recent, tie, none and back-off "—", own session, bodyweight "12", timed "45 s").
  - AC-5 → `list-view.test.tsx` AC-5 (0 / 3, 1 / 3, at most one expanded, aria-expanded).
  - AC-6 → `list-view.host.test.tsx` (from UF-09.9: dialog name, state deep-equal after 10 min, Close returns; leg-curl case), `list-view.test.tsx` (from the List view, focus back on the button).
  - AC-7 → `list-view.test.tsx` (elapsed 23:10 / 0:59, Focus mode, confirm + Keep going, single call while pending, rejection polite and retry), `list-view.host.test.tsx` (Finish → UF-03.3 at `/session/S1/summary`, `ended_at` set).
  - AC-8 → `principle-1.test.tsx` (Shell: UF-09.9, List view, How-to; summary one `/balance` link; planted-link contrast; `/library` row contrast).
  - AC-9 → `exports-and-lint.test.ts` (exports, jsx-no-literals, en.uf03 keys, no hex), `list-view.test.tsx` (labels, axe on the expanded card and on the Finish confirm).
- **Red on unfixed (HEAD seams.tsx + index.tsx, no ListView):** 20 tests red over `list-view.host`, `principle-1` (2), `exports-and-lint` (1), `seams.test` (2), `paused.test` (5). The `list-view.test.tsx` ACs need the new `ListView`, so they are red on T-0419's code by construction.
- **Planted faults (backup copies in scratch, restored with `cp`):**
  - `<a href="/library/back-squat">` in the card → `principle-1.test.tsx` 2 red (AC-8).
  - Previous used as the kg pre-fill → `list-view.test.tsx` 1 red (AC-3).
  - S0 warm-up counted in Previous (no `isHardSet`) → `list-view.test.tsx` 3 red (AC-4).
- **Not added:** a Playwright happy-path spec for the List view (the logging path is T-0417; the read side is covered by the host tests). Follow-up for QA if wanted.
- **T-0415 note (orchestrator):** the List view reads only `ctx` and renders over any machine state; a unit test covers a ctx whose current item is past the plan (host `betweenItems` still shows its loading body ahead of the overlay, as on main; host.tsx untouched).
- **Gate (D-0158):** `-w typecheck lint test --concurrency=1` 19/19 (web 2890 tests), `test:repo-checks` 0 fail, `format:check`, `check-all` green. Whole web e2e (the seam pins touch `uf-09-focus.spec.ts`): 165 passed with `TMPDIR=$HOME/.cache/wl-pw-tmp`. First gate runs were red on a deep UF-09 import in my test helper (D-0071 §3) and on `host.chrome` pins and literal-assert placeholders; fixed, not weakened.
