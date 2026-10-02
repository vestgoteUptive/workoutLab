---
id: T-0416
title: "UF-03.1 List view, read side: the how-to and list-view seams on UF-09.9, header (elapsed, Focus mode, Finish confirm), set rows from the engine pre-fill, the Previous column, collapsed items; plus the T-0360 cross-screen principle-1 render assertion"
lane: web-feature:UF-03
screens: [UF-03.1, UF-09.9, UF-03.3]
decisions: [D-0142, D-0068, D-0069, D-0071, D-0111, D-0118, D-0120, D-0045, D-0060]
deps: [T-0304d, T-0419, T-0318, T-0306a]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. First child of the T-0305a board row (D-0142 §1 §3). Build flow: wl-build-web. About ½–⅔ day. It carries T-0360 (the T-0306a QA finding): the session screens now exist, so the cross-screen assertion has a real subject. Ready when T-0304d (the real UF-09.9 and its pins) and T-0419 (the built summary, for the summary half of T-0360) are done. It edits features/UF-09/seams.tsx, so it never runs in parallel with T-0422 or T-0415. -->

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
  - **The UF-09 pins these entries change** (D-0142 §6, a named change listed in the build log):
    - `seams.test.tsx` AC-9: the arrays hold exactly the ids landed so far;
    - T-0304d's "with the module arrays" row and the UF-09.9 button counts;
    - the UF-09.9 count in `tests/e2e/uf-09-focus.spec.ts`.
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
  - **The order.** UF-09.9 with the module arrays renders, in this order: Resume · (Swap, if T-0422 has landed) · Skip to next exercise · How to · List view · End workout.
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
- **Parallel:** never with T-0415 or T-0422 (shared UF-09 pins and `seams.tsx`, D-0142 §1).
