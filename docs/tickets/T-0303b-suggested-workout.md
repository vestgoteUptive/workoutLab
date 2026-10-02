---
id: T-0303b
title: UF-08.2 Suggested workout — the time-budget bar, session why chips, item rows from the engine, Remove (excludeIds), Shuffle (+1), time chips that keep the main lift, the over-budget state, Looks good → ready
lane: web-feature:UF-08
screens: [UF-08.2]
decisions: [D-0002, D-0004, D-0040, D-0057, D-0065, D-0071, D-0086, D-0091, D-0103, D-0106, D-0107, D-0108, D-0109]
deps: [T-0303a, T-0302c]
status: done
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0303-session-setup.md (ACs B1–B6 there, refined by D-0109). Build flow: wl-build-web. About ½ day. Becomes ready when T-0303a and T-0302c are done. It only imports lib/i18n/workout.ts (D-0109 §7), so it may run in parallel with T-0302b and with T-0304a (no shared file). -->

## Why
Principle 3: the list, its order, set counts, reps, pre-fill weights and "why" reasons all come from `suggest()`, and UF-08.2 renders them as they are. Every action goes back through the engine: Remove, Shuffle and a time change each make one `suggest` call with new inputs (D-0065 §4). Principle 2: changing the time here rebuilds the plan around the same main lift (rule 7.2, R7-E5). Everything runs on the device, so this screen works offline exactly as online (NFR-OFF-3).

## Scope
- In:
  - **The UF-08.2 view in `features/UF-08`,** replacing the D-0107 §2 placeholder body. It keeps `data-screen-id="UF-08.2"`, the `<h1>` "Your workout", the `Workout` prop and the Back link to `?step=time`.
  - **The inputs record** in the `SessionSetup` host (D-0109 §1): `{budgetMin, warmupInBudget, energy, shuffle, mainLiftId, excludeIds}`.
  - **The time-budget bar and its text** (D-0109 §5). This includes the over-budget state, which only a swap can reach (T-0303c); here it is tested with an injected `Workout`.
  - **Session chips** through `sessionReasonChips` (D-0106 §4).
  - **Rows** (D-0109 §4): the warm-up row, then one row per item in plan order.
  - **Actions:**
    - Remove (per item) and Shuffle;
    - the time chips 20/30/45/60/90 (D-0109 §2–§3);
    - "Looks good" → `?step=ready`, with a placeholder `[data-screen-id="UF-08.4"]` until T-0303d (the D-0107 §2 pattern);
    - Back.
  - **Strings and e2e.** Strings go in `lib/i18n/flows/uf-08.ts`. e2e rows are appended to `tests/e2e/uf-08-setup.spec.ts`.
- Out:
  - Swap (T-0303c); no swap button is rendered.
  - UF-08.4's body (T-0303d).
  - Edits to `lib/i18n/workout.ts` (D-0109 §7: imported only).
  - Keeping adjustments across Back (D-0109 §1).
  - A stepper on UF-08.2 (D-0109 §3).
  - "Skip it today" / "Always use this" (D-0065 §5).
  - Edits to `routes.ts`, `en.ts`, `components/**`, `lib/**` (other than `flows/uf-08.ts`), `tests/e2e/fixtures/**` and the shell tests (D-0108 §2–§3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** every action is a local `suggest` call with no fetch (AC-9). The e2e covers an offline cold start → Suggest → Remove (AC-12).
- **Time running out:** the 20-min chip keeps the main lift (R7-E5, AC-6). Removing down to an empty plan shows "Nothing fits in N min", and "Looks good" stays enabled (AC-3). The over-budget text and colour come only from the engine's `availableS`, tested on both sides of the boundary (AC-7).
- **Zero history:** a `first_time` null weight renders no weight, and a bodyweight exercise reads "Bodyweight" (AC-2).
- **Returning after 10 days off:** a `hold_after_break` pre-fill renders as returned ("100 kg"), and `recovering_skipped` renders as the chip "Quads recovering, skipped" (AC-2, AC-4).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library in `apps/web/src/features/UF-08/__tests__/`, reusing T-0303a's F-web fixtures (F-tz, F-targets, F-profile, the L1 + `wu-*` web library copy). `lib/offline` loaders are mocked.
- The real `@workoutlab/engine` is used, with `suggest` wrapped by a spy where a count is asserted.
- **W-R7E4** is the `api/openapi.yaml` Workout example: budget 30, warm-up in budget, bench-press × 4 (720), inverted-row × 3 (555), leg-extension × 2 (270); `itemsTotalS` 1545, `totalS` 1725, `unusedS` 75.
- **Test rules** (state.md traps):
  - Both values of every binary condition get a test; each AC names its pair.
  - Negative asserts wait a real 50 ms macrotask.
  - Positive asserts on content rendered through `Shell` use `findBy…`/`waitFor` (D-0103 §1).

- **AC-1 (hand-off in, D-0107 §2, D-0109 §1)**
  - **No extra call.** After "Suggest my workout" on UF-08.1, UF-08.2 renders the `Workout` the UF-08.1 spy last returned (reference-equal), and the spy count is unchanged after 50 ms.
  - **One screen.** Exactly one `[data-screen-id]` is present, `UF-08.2`, with the `<h1>` "Your workout".
- **AC-2 (rows render the engine, principle 3, D-0109 §4)**
  - **Order and detail.** Given W-R7E4 with zero history, the rows read in plan order:
    - "Bench press", "4 × 6–8 · 12 min", reason "Main lift · Chest 100 % below target";
    - "Inverted row", "3 × 8–12 · Bodyweight · 10 min";
    - "Leg extension", "2 × 10–15 · 5 min".
  - **Weight pairs.**
    - bench-press `prefill.weightKg` 80 → "4 × 6–8 · 80 kg · 12 min";
    - 77.5 → "77.5 kg";
    - null → no weight part.
    - A `hold_after_break` pre-fill of 100 kg renders "100 kg".
    - An `externalLoad: false` exercise with weight 0 reads "Bodyweight", and an `externalLoad: true` one with weight 0 reads "0 kg".
  - **Back-off.** `item.backoff {weightKg: 70, reps: 6}` adds "+ 1 back-off 70 × 6". `{weightKg: null, reps: 6}` adds "+ 1 back-off set". `backoff: null` adds no back-off line.
  - **Timed.** A timed item `{sets: 3, durationS: 45, costS: 330}` reads "3 × 45 s · Bodyweight · 6 min" (plank is `externalLoad: false`).
  - **No sorting.** A fixture with the items reversed renders them reversed.
  - **Reason element.** An item whose `itemReasonLine` is "" has no reason element. One with a reason has one.
- **AC-3 (warm-up row and empty plan)**
  - **Warm-up row.** "Warm-up", "Wu scap push up, Wu band pull apart, Wu bodyweight squat, Wu arm circle" (the F-web library `name`s of R7-E10's moves, in plan order; the fixture derives names from ids), "3 min". It has no button. With `plan.warmup` `[]`, there is no warm-up row.
  - **Empty plan.** With `plan.items` `[]` the screen reads "Nothing fits in 30 min" and "Looks good" is enabled. With items present, that text is absent.
- **AC-4 (session chips, D-0106 §4)**
  - **W-R7E4.** It renders the chips "Chest", "Back", "Quads" in order, from `sessionReasonChips` (a spy on the module import shows one call with `workout.sessionReasons`).
  - **Recovering.** `[recovering_skipped {quads}]` renders "Quads recovering, skipped".
  - **More than three.** 4 reasons render 3 chips.
  - **None.** `[]` renders no chip list element.
- **AC-5 (Remove and Shuffle go through the engine, D-0065 §4, D-0109 §2)** Starting from the real 30-min zero-history `Workout`:
  - **Remove an accessory.** "Remove Inverted row" makes exactly one `suggest` call with `{budgetMin: 30, warmupInBudget: true, energy: "normal", shuffle: 0, mainLiftId: "bench-press", pinnedIds: [], excludeIds: ["inverted-row"]}`. The screen renders that call's return, which is deep-equal to a direct `suggest` call with the same arguments. No row reads "Inverted row".
  - **A second Remove** appends to `excludeIds` (two ids, in tap order).
  - **Remove the main lift** ("Remove Bench press") passes `mainLiftId: null` and `excludeIds` containing "bench-press". The pair: an accessory Remove passes `mainLiftId: "bench-press"`.
  - **Shuffle** passes `shuffle` 1, then 2, then 3 on three taps. It keeps the current `excludeIds` and `mainLiftId` = the current plan's.
  - **Shuffle across other actions.** A Remove or a time chip between two Shuffles doesn't reset the count (1, chip, then 2).
  - **One call each.** Every action makes exactly one `suggest` call (the spy count rises by exactly 1 per tap, and by 0 more after 50 ms).
- **AC-6 (time chips keep the main lift, R7-E5, D-0109 §3)**
  - **The group.** A group named "Time" holds the chips 20/30/45/60/90. At 30, exactly the 30 chip has `aria-pressed="true"`. When `budgetMin` is 50 (set on UF-08.1), no chip is pressed.
  - **R7-E5.** From the 30-min zero-history plan, chip 20 makes one call with `budgetMin: 20` and `mainLiftId: "bench-press"`. The rows read "Bench press" "4 × 6–8 · …" then "Straight arm pulldown" "2 × 10–15 · …".
  - **Re-press.** Re-pressing the active chip makes no call (after 50 ms).
  - **Shared budget.** After chip 20, Back shows UF-08.1 at 20 min.
- **AC-7 (bar, D-0109 §5)**
  - **Warm-up in budget.** Given W-R7E4, the bar is `aria-hidden="true"` and has, in order: a warm-up segment (`flex-grow` 180), 3 item segments (720, 555, 270) and an unused segment (75). The text reads "About 29 of 30 min".
  - **Warm-up off.** Given W-R7E4 with `warmupInBudget: false` and `unusedS` 255, there is no warm-up segment, the unused segment is 255, and the text reads "About 26 of 30 min + warm-up".
  - **No unused time.** `unusedS` 0 gives no unused segment.
  - **Over budget.** Given items with `itemsTotalS` 1830 at budget 30, warm-up in budget (`availableS` 1620), and `totalS` 2010, the text reads "34 min, 4 over". The item segments' computed style uses `var(--wl-color-warn)`.
    - With the warm-up off (`availableS` 1800, `itemsTotalS` 1830), it reads "31 min, 1 over + warm-up".
  - **The boundary.** `itemsTotalS` = `availableS` exactly (1620) is within budget: "About …" text and no warn colour on any segment. 1621 is over.
  - **Live region.** The text element has `aria-live="polite"`.
- **AC-8 (hand-off out and Back, D-0107 §1)**
  - **Looks good.** "Looks good" does a PUSH to `?step=ready`. It renders the T-0303b placeholder `[data-screen-id="UF-08.4"]`, whose `workout` prop is reference-equal to the current UF-08.2 `Workout`, including after a Remove.
  - **Back.** Back goes to `?step=time` with 30 min, Low and warm-up off still selected, and without a remount (the T-0303a mount-counter probe).
  - **Back, then Suggest** hands over UF-08.1's `Workout` again. Its first Shuffle passes `shuffle: 1` and `excludeIds: []` (D-0109 §1: adjustments discarded).
  - **Cold load.** A cold load of `?step=suggested` still shows UF-08.1 (T-0303a AC-1 holds).
  - **No swap yet.** No button whose name starts with "Swap" is in the DOM.
- **AC-9 (offline = online, NFR-OFF-3, D-0071 §8)**
  - **Same result both ways.** The same sequence (Remove inverted-row, Shuffle, chip 45) gives deep-equal rendered rows and `Workout`s with `navigator.onLine` true and false.
  - **No server calls.** A fetch spy sees no request at all during the UF-08.2 actions, online or offline.
- **AC-10 (a11y, NFR-A11Y-1/2)**
  - **Names and size.** Remove buttons are named "Remove {name}" ("Remove Bench press") and measure ≥ 44 × 44 px in the e2e. Shuffle, the 5 chips, "Looks good" and Back are each ≥ 44 × 44 px.
  - **Focus after Remove (D-0109 §6):**
    - Removing row 1 of 3 leaves focus on the Remove button of the new row 1.
    - Removing the last row moves focus to the new last row's Remove button.
    - Removing the only row moves it to "Looks good".
  - **Focus after Shuffle** stays on Shuffle.
- **AC-11 (strings, exports, lint)**
  - **Strings.** Every UF-08.2 string comes from `en.uf08` or `lib/i18n/workout.ts`. `react/jsx-no-literals` is green, and `en.ts` and `workout.ts` are unchanged (`git diff main...HEAD` lists neither).
  - **Exports.** The T-0303a export pin (`["SessionSetup"]`) still holds.
  - **Import bans.** The D-0071 §9 bans are green.
- **AC-12 (e2e: online, offline and a11y, D-0086, D-0091 §1, D-0108)** Rows appended to `tests/e2e/uf-08-setup.spec.ts`. They reuse T-0303a's in-spec seed (full-equipment profile, uf-04 library data, 9 targets, no sets), with no fixture edits:
  - **Online.** UF-08.1 → chip 30 → Suggest → UF-08.2.
    - The number of item rows equals the n in the recorded fit line.
    - The first row's detail matches `/^[1-4] × (\d+(–\d+)?|\d+ s)( · (Bodyweight|[\d.]+ kg))? · \d+ min$/`.
    - "Remove {second row name}" removes that name from the list.
    - Chip 20 → the first row's name is unchanged (the main lift kept).
  - **Offline.** After the precache settles, go offline and reload `/session/setup`. Then UF-08.1 → Suggest → UF-08.2 shows rows whose texts equal the recorded online ones for the same inputs. Remove works offline.
  - **a11y.**
    - axe on UF-08.2 reports 0 serious or critical violations.
    - The size checks of AC-10 pass.
    - The flow Suggest → Remove → Shuffle → Looks good works by keyboard only.
  - **Requests.** The guard reports no unclaimed Supabase request.
- **AC-13 (shell tests unchanged, D-0108 §3)** `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`, and those pass in the DoD run.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-08.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-08-setup.spec.ts`: append rows to T-0303a's spec (D-0071 §10).
  - `docs/tickets/T-0303b-suggested-workout.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/i18n/workout.ts` (D-0109 §7), `lib/offline`, `lib/format`, `lib/i18n/en.ts`, `components/offline-status`, `@workoutlab/engine` (`suggest`, `availableS`, `WARMUP_COST_S`), `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The screen calls the engine `suggest` and `availableS` and renders the `Workout` (`api/openapi.yaml` shape). Nothing is written to Supabase or IndexedDB.

## NFRs owned
OFF-3 for UF-08.2 (AC-9, AC-12), A11Y-1/2/6 on UF-08.2 (AC-10, AC-12).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0303b` and cite UF-08.2 (for example `T-0303b UF-08.2: Remove re-suggests with excludeIds`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** This ticket is parallel-safe by files with T-0302b and T-0304a. It shares no file with them, because it doesn't list `workout.ts` (D-0109 §7). It must not run with T-0303c or T-0303d, which are the same lane. Verification runs are staggered: one vitest/playwright process per machine (state.md).
- **Size.** About ½ day. Most of the effort is AC-5/AC-6 (the inputs record) and AC-7 (the bar); the rows are mostly formatter calls.
- **Timing ACs.** The "no extra call" asserts (AC-1, AC-5, AC-6) must fail on a planted fault: a `useEffect` that re-suggests on mount. The build log records it turning red.

## Build log (2026-10-02, frontend-dev)
- **Host.** `SessionSetup` keeps `{workout, shuffle, excludeIds}` next to the shared minutes, warm-up and energy (D-0109 §1). "Suggest my workout" freezes UF-08.1's `Workout` into that record; UF-08.1's fit-line memo only runs while UF-08.1 is on screen, so a chip on UF-08.2 is exactly one call and a later 3 s re-read cannot swap the UF-08.2 plan. Every action calls `suggest` once with `mainLiftId` = the current plan's (null only for Remove on the `isMain` item). Leaving `?step=suggested|ready` for UF-08.1 drops the record. A `suggest` rejection on UF-08.2 keeps the current plan and the record unchanged (D-0114 §6a: nothing invented).
- **View.** `Suggested.tsx` (rows, warm-up row, chips, bar, Time chips, Remove, Shuffle, Looks good), `rows.ts` (name/externalLoad lookups, `Intl.NumberFormat(locale, {maximumFractionDigits: 2})` weight), `Ready.tsx` (UF-08.4 placeholder). Bar segment `flex-grow` and the over-budget `var(--wl-color-warn)` are set on the node from a ref callback (data, not state; the "no `style=`" pin holds). `workout.ts` is imported only (`itemSummary`, `itemReasonLine`, `sessionReasonChips`, 1-arg, D-0114 §5); its outputs are joined as opaque parts through `en.uf08.rowDetail`.
- **T-0303a pin moved.** `exports-and-lint.test.ts` banned `lib/i18n/workout` imports in feature sources; this ticket must import it, so that regex dropped `workout` and a new test pins that only `Suggested.tsx` mentions it (any import form) and imports only names it exports.
- **Planted fault 1 (ticket): a re-suggest in a mount `useEffect`** in the host → 13 red: AC-1 "no extra call" (both files), frozen-after-Suggest, AC-5 (all count asserts), AC-6 chip 20 and re-press, AC-8 hand-over identity. Reverted, green.
- **Planted fault 2: UF-08.2 renders the live UF-08.1 memo** (the T-0303a code path) → "after Suggest: a changed re-read leaves the UF-08.2 plan" red at `shownWorkout() toBe handed`, plus 10 count asserts; its pair "before Suggest: a changed re-read updates the fit line" stays green. Reverted, green.
- **Runs.** `--filter @workoutlab/web test` 96 files / 1391 tests green; `typecheck`, `lint` green; `test:e2e` 71 passed (whole suite); `-w format:check` clean; `check-all.mjs` exit 0; fresh build + `check:size` exit 0. Load-only flake seen: `app/__tests__/import-bans.test.ts` "features lints clean" hits its 5 s default under a parallel full run (3.5 s isolated, 3.1 s without this ticket's test files); green isolated and on a rerun of the full suite.

## Rework 1 (code review REQUEST-CHANGES)
- **Git-diff tests removed.** The `branchDiff()` AC-11/AC-13 asserts are gone from `exports-and-lint.test.ts` (they would fail on other lanes after merge and skip without a local `main`). DoD check instead: `git diff --name-only main...HEAD` lists only `features/UF-08/**`, `lib/i18n/flows/uf-08.ts`, `tests/e2e/uf-08-setup.spec.ts` and this ticket. It lists neither `lib/i18n/en.ts` nor `lib/i18n/workout.ts`, and nothing under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`.
- **workout.ts importer pin, any form.** Every UF-08 source whose text matches `/lib\/i18n\/workout/` is collected; the list must be `["Suggested.tsx"]`, and its named imports must be workout.ts exports. Proof: a planted `features/UF-08/Other.ts` with `import * as w from "../../lib/i18n/workout.js"` turned the pin red (`['Other.ts', 'Suggested.tsx']`); so did `import type … from "../../lib/i18n/workout"` (no `.js`). Removed, green. An in-test contrast covers the namespace, type-only and re-export forms.
- **pendingFocus leak fixed (D-0109 §6).** `onRemove` now returns whether a new plan was set; a `false` clears the pending focus, and Shuffle and a time chip clear it too. New tests: view "a Remove that changes nothing leaves no focus pending for Shuffle" / "… for a later time chip", and host "a Remove whose suggest call throws keeps the plan, and a later Shuffle keeps focus on Shuffle". All 3 were red on the old code (focus moved to a Remove button), green after the fix.
- **Warn colour as a class.** `.wl-uf08__seg--warn { background-color: var(--wl-color-warn) }` in `uf-08.css`; JS writes only `flex-grow`. The AC-7 test attaches `uf-08.css` to the document (Vitest doesn't process CSS imports), and its computed-style asserts hold on both sides of the boundary.
- **Runs.** web `test` 96 files / 1394 tests green; `typecheck` and `lint` green; `test:e2e` 71 passed.

## Accept log
- 2026-10-02, product owner, branch at 5703d51 (attempt 2): **done**.
  - Review attempt 1 asked for 3 changes: the committed `git diff main...HEAD` tests, the importer pin that was too narrow, and the pendingFocus leak after a failed Remove. Rework 1 fixed all three and also moved the warn colour into a CSS class. Each fix has a test that was red on the old code.
  - QA passed AC-1..AC-13:
    - The root `--force` gate is green (web 1394 tests).
    - e2e passed 71/71, the whole suite.
    - 4 independently planted faults turned tests red: an accessory Remove passing a null `mainLiftId` (AC-5 pair), Back keeping adjustments (AC-8), a `>=` boundary (AC-7 1620/1621), and warm-up-off totals (AC-7).
    - The bar texts and the R7-E5 rows were re-derived from the engine, not copied from the build output.
    - Both planted "no extra call" faults went red (build log). This proves the timing asserts in AC-1, AC-5 and AC-6.
  - AC-11 and AC-13 (`git diff main...HEAD` lists): these are checked at DoD, not as committed tests (review attempt 1). The build log records the diff result: only `features/UF-08/**`, `flows/uf-08.ts`, `tests/e2e/uf-08-setup.spec.ts` and this ticket, with nothing under `app/**`, `tests/e2e/fixtures/**`, `en.ts` or `workout.ts`.
  - AC-9 and AC-12 (offline): the vitest online/offline deep-equal and fetch-spy asserts pass. The e2e offline row passes. QA's real-browser keyboard probe found online == offline across 5 snapshots, with 0 errors.
  - Principles hold:
    - 2: the time chips re-suggest around the kept main lift, and the budget is shared with UF-08.1.
    - 3: every action is one `suggest()` call, the engine output is rendered unsorted, and the over-budget state comes only from `availableS`.
    - 1 and 5: not touched.
    - Contracts are unchanged.
  - Follow-ups (already filed):
    - T-0393: the e2e fixture has `external_load` false everywhere, so the e2e never renders a kg weight.
    - T-0391: switch weight formatting to `formatKg` once T-0388 lands.
