---
id: T-0303
title: UF-08 Session setup — time & energy with a live fit line, the suggested workout (bar, why, remove, shuffle), swap before starting, ready + start the session
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2, UF-08.3, UF-08.4]
decisions: [D-0002, D-0004, D-0017, D-0024, D-0025, D-0040, D-0045, D-0047, D-0056, D-0057, D-0059, D-0062, D-0063, D-0065, D-0067, D-0071]
deps: [T-0300, T-0203b, T-0318]
status: split   # → T-0303a–d; T-0303a becomes ready when T-0318 is done
---
<!-- Re-groomed 2026-10-02 by product-owner: child files docs/tickets/T-0303b-suggested-workout.md (D-0109: the UF-08.2 chips are 20/30/45/60/90, every re-suggest keeps the main lift, workout.ts imported only) and docs/tickets/T-0303d-ready-and-start.md (D-0110: started_at at the Start tap, id reused on retry, replace navigation). -->
<!-- Groomed 2026-09-29 by product-owner. Split into T-0303a–d (D-0065 Consequences). ACs are tagged [a]–[d]. Reconciled by triage 2026-09-29 (TR-0030, D-0071 §7): T-0303c mounts the shared SwapSheet (features/UF-05, T-0306b) instead of building a second sheet. -->

## Why
Principle 2: every workout start asks how long the user has (UF-08.1), and the time shapes selection. It isn't just a display. Principle 3: the list, its order, set counts, reps, pre-fill weights, "why" reasons, shuffles and swap rankings all come from `@workoutlab/engine` (`suggest`, `rankSwaps`, rules 7, 10, 12, 13, 14), and the UI renders them without re-sorting or recomputing. NFR-OFF-3: this works offline from the cache plus queued sets. The ticket ends by creating the `sessions` row (with `plan`) that focus mode (T-0304) runs on.

## Split (the orchestrator edits the board)
Parent `T-0303` → `split → T-0303a, T-0303b, T-0303c, T-0303d`. All four are in lane web-feature:UF-08, so they run one after another.

| Child | Scope | Deps | Status | ~Size |
|---|---|---|---|---|
| T-0303a | UF-08.1 Time & energy + setup data loading + step routing | T-0300, T-0203b, T-0318 | todo | ½ day |
| T-0303b | UF-08.2 Suggested workout (bar, why, rows, remove, shuffle, time change) | T-0303a, T-0302c (D-0106: workout.ts moved there) | todo | ½ day |
| T-0303c | UF-08.3 Swap before starting: mounts `SwapSheet` from `features/UF-05` (which calls `rankSwaps` + engine `applySwap`, D-0071 §7) | T-0303b, **T-0306b** (`SwapSheet`, which needs T-0224) | todo | ¼ day |
| T-0303d | UF-08.4 Ready + focus prefs + start the session | T-0303b | todo | ⅓ day |

T-0303d doesn't wait for T-0303c: UF-08.2 simply has no swap action until T-0303c lands (D-0065 §5). If c and d are both ready, run d first (T-0304 needs it).

## Scope
- In:
  - [a] `/session/setup` host with the `?step=` views (D-0063 §2), data loading (`loadEngineHistory`, `loadLibrary`, `loadTargets`, `loadProfile`, `refreshAll` capped at 3 s), UF-08.1: stepper, chips, "done by", finish-time input, warm-up toggle, energy, live fit line, "Suggest my workout". Close (×) → `/`.
  - [b] UF-08.2: the time-budget bar, session "why" chips, item rows (sets × reps · weight · minutes · reason), Remove (`excludeIds`), Shuffle (`shuffle + 1`), time chips that rebuild with `mainLiftId` kept, the over-budget state, "Looks good" → ready.
  - [c] UF-08.3: a "Swap {name}" button per item on UF-08.2 that opens `SwapSheet` (`{workout, itemIndex, onApply, onClose}` from `features/UF-05/index.tsx`) at `?step=swap`. `onApply(result)` makes `result` the current `Workout` and returns to UF-08.2. Close is "Keep". The chips, row copy, engine order and `applySwap` call are the sheet's (T-0306b, D-0069 §5), with one copy for every mount.
  - [d] UF-08.4: summary, the 4-step focus explainer, the 3 settings in `features/UF-08/focus-prefs.ts` (D-0063 §5), Start → `upsertSession` → `/session/<id>` (D-0065 §7).
- Out: "Always use this in <routine>" and "Skip it today" (D-0065 §5; routines are T-0308); the swap sheet itself and the UF-05.1 mid-workout swap (T-0306b); focus mode (T-0304); the engine `applySwap` itself (T-0224, engine lane); remembering the last budget (D-0065 revisit); calling `POST /workouts/suggest` (D-0063 §3); any contract change.

### Edge cases that are in scope
- **Offline:** the whole setup runs offline from the cache and the queue. The output equals the online output for the same cache (AC-A7). Start queues the session in IndexedDB (AC-D4).
- **Time running out:** the finish-time input converts to minutes once (AC-A3). 15 minutes gives a 1-exercise plan (R7-E2, AC-A5). An empty plan is valid and can start (AC-A5, AC-D5). The over-budget bar appears only after a swap to a `fitsBudget: false` candidate (AC-B4, AC-C4).
- **Zero history:** zero-history suggestions render with `first_time` pre-fill (a null weight shows no weight, AC-B2).
- **Returning after 10 days off:** the pre-fills from rule 14 (`hold_after_break`, D-0057) render as returned, for example "100 kg" on the main lift (AC-B2). Recovering areas show as a session chip "Quads recovering, skipped" (AC-B3).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/features/UF-08/**`, with `lib/offline` loaders mocked unless stated and the `now` clock injected. **F-web**: F-tz (`now = 2026-09-27T12:00:00+02:00`, Europe/Stockholm, en-GB), F-targets, F-profile, and a web fixture copy of the L1 library + `wu-*` moves (`features/UF-08/__tests__/fixtures.ts`; content equal to `packages/engine/test/fixtures/common.ts` `LIBRARY`, asserted by a test that deep-equals the ids, types, equipment and areas). Real `@workoutlab/engine` unless a spy is named.

### T-0303a UF-08.1 Time & energy
- **AC-A1 (defaults + stepper, D-0065 §2)** `/session/setup` renders `[data-screen-id="UF-08.1"]` with 45 min, warm-up on, energy Normal. `+` → 50, `−` ×7 from 45 → 15, and `−` at 15 stays 15 (`aria-disabled`). `+` at 120 stays 120. The chips 20/30/45/60/90 set the value, and the matching chip has `aria-pressed="true"`. The stepper buttons are named "5 minutes less" / "5 minutes more" and are ≥ 44 × 44 px.
- **AC-A2 (done by)** At F-tz, 45 min reads "done by 12:45". In en-US / America/New_York with `now = 2026-09-27T12:00:00-04:00` and 90 min, it reads "done by 1:30 PM" (`formatTime`, NFR-I18N-2).
- **AC-A3 (finish time → minutes)** "Set a finish time" opens a `type="time"` input. "13:07" → 67 min. "12:00" or "11:30" → the error "Pick a time later today" and the minutes unchanged. "12:10" → 15 (clamped up, 10 < 15). "23:59" → 120 (clamped). After the conversion, the stepper moves from the converted value (67 → 72).
- **AC-A4 (energy + toggle)** Energy is a radio group Low/Normal/High, with the hint "Fewer sets, same weights." / "Your plan as written." / "Adds a back-off set to the main lift if time allows." The toggle "Warm-up counts in this time (3 min)" defaults to on (D-0004).
- **AC-A5 (live fit line from `suggest`, principle 3)** Every change calls `suggest(history, targets, profile, library, {budgetMin, warmupInBudget, energy, shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}, now, tz)` exactly once (spy) and renders its result. With F-web and zero history: 30 min → "Fits: 3 exercises, 9 sets + warm-up" (R7-E4), 15 min → "Fits: 1 exercise, 4 sets + warm-up" (R7-E2), 30 min + Low → "Fits: 3 exercises, 8 sets + warm-up" (R7-E11). Given a stubbed `suggest` returning 0 items, it reads "Nothing fits in 15 min", and "Suggest my workout" stays enabled.
- **AC-A6 (step routing, principle 2)** "Suggest my workout" goes to `?step=suggested` with the same `Workout` instance the fit line rendered (no second computation with different inputs). A cold load of `/session/setup?step=suggested`, `?step=swap` or `?step=ready` renders UF-08.1. Close (named "Close") goes to `/`. No C-02 is rendered (principle 1), and there is no C-01 import (the D-0045 §4 lint).
- **AC-A7 (offline = online, NFR-OFF-3)** Given the same cached history/library/targets/profile, the rendered fit line and the `Workout` passed on are deep-equal with `navigator.onLine` true (with `refreshAll` resolving without changing the cache) and false (`refreshAll` not called). Queued sets are included: with 6 queued hard back-squat sets at `now − 24 h` (`fake-indexeddb`, the real `loadEngineHistory`), the 30-min workout's session reasons contain `recovering_skipped` quads and glutes (R7-E3).
- **AC-A8 (refresh cap)** Online, `refreshAll` never resolving: after 3 s (fake timers) UF-08.1 renders from the cache. A rejected refresh renders from the cache with no alert. With no profile or < 9 targets, the screen shows "Connect to finish setting up your plan" and a link to `/`, and `suggest` isn't called.

### T-0303b UF-08.2 Suggested workout
- **AC-B1 (budget bar)** Given W-R7E4 (the `api/openapi.yaml` Workout example, budget 30, warm-up in budget), the bar has, in order, a warm-up segment (flex 180), 3 item segments (flex 720, 555, 270 = `costS`) and an unused segment (flex 75 = `unusedS`), with the text "About 29 of 30 min". With `warmupInBudget: false`, there is no warm-up segment and the text is "About 26 of 30 min + warm-up" (`ceil(itemsTotalS / 60)`). The bar is `aria-hidden`, and the text carries the information.
- **AC-B2 (rows render the engine, principle 3)** Rows in plan order: "Bench press", "4 × 6–8 · 12 min" (`ceil(costS / 60)`), and the reason line from `lib/i18n/workout.ts` "Main lift · Chest 100 % below target". The pre-fill weight: `80` → "· 80 kg", `null` → nothing, bodyweight → "· Bodyweight". A back-off item adds "+ 1 back-off 70 × 6" from `item.backoff`. A reversed-items fixture renders reversed (no sort in the UI). A warm-up row (the `plan.warmup` names, "3 min") has no remove or swap control.
- **AC-B3 (session chips)** `sessionReasons` render as up to 3 chips in order via `sessionReasonChips` from `lib/i18n/workout.ts`, the same function UF-02.1 uses (D-0106 §4). For example `recovering_skipped {quads}` → "Quads recovering, skipped", and `area_deficit {chest, 1}` → "Chest".
- **AC-B4 (actions go back through the engine, D-0065 §4)** Remove on "Inverted row" re-calls `suggest` with `excludeIds: ["inverted-row"]` and renders the new result. A second Remove appends to it. Remove on the main lift also sets `mainLiftId: null`. Shuffle calls `suggest` with `shuffle` 1, then 2, then 3 (never reset by a remove or a time change) and keeps `excludeIds`. The time chips 30/45/60 re-call `suggest` with the chosen `budgetMin` and `mainLiftId` = the current main lift (R7-E5: from 30 to 20 with bench-press kept gives bench-press × 4 + straight-arm-pulldown × 2). Each action makes exactly one `suggest` call. Remove and swap buttons are ≥ 44 × 44 px and named "Remove Bench press" / "Swap Bench press".
- **AC-B5 (over budget)** Given a `Workout` with `itemsTotalS` > `availableS(budgetMin, warmupInBudget)` (the engine function), Then the bar's item segments use `var(--wl-color-warn)` and the text is "{ceil(totalS/60)} min, {over} over", where over = `ceil((itemsTotalS − availableS) / 60)`. Otherwise no warn colour appears (a style test).
- **AC-B6 (hand-off)** "Looks good" goes to `?step=ready` carrying the current `Workout` plus `{budgetMin, warmupInBudget, energy}`. Back goes to `?step=time` with the setup values kept. With T-0303c not merged, no swap button is in the DOM.

### T-0303c UF-08.3 Swap before starting
The ranking, chips, row copy, empty state and dialog a11y are T-0306b's `SwapSheet` ACs (D-0071 §7: one sheet, one copy). They aren't repeated here.
- **AC-C1 (mount, D-0071 §7)** On UF-08.2 for the R12 fixture session (bench-press × 4 main, barbell-row × 3, leg-extension × 2), "Swap Barbell row" goes to `?step=swap` and renders `SwapSheet` (imported from `features/UF-05/index.tsx`, not a deep path) with `workout` = the current `Workout` (reference-equal) and `itemIndex` 1. The warm-up row has no swap button. A cold load of `?step=swap` shows UF-08.1 (AC-A6).
- **AC-C2 (apply renders the engine result)** With the real sheet and engine, picking db-row with "Short on time" and applying: UF-08.2 renders the `Workout` handed to `onApply` as is. db-row is at position 2, and its reason line is `reasonLine`'s output for `swap {short_on_time}`. The next `suggest` call (for example a Shuffle) isn't made by the apply (spy count unchanged). The later time-chip/Remove/Shuffle actions still re-run `suggest` from the setup inputs (D-0065 §4), which drops the swap, and that is expected in v1.
- **AC-C3 (keep)** Close/Escape ("Keep") returns to UF-08.2 with the `Workout` reference-unchanged and focus on the swap button that opened it.
- **AC-C4 (over budget after swap)** Given `onApply` receives a workout with `itemsTotalS` over `availableS`, UF-08.2 shows the AC-B5 over state.
- **AC-C5 (start after a swap)** After a swap, "Looks good" → Start stores `plan` = the swapped `workout.plan` (deep-equal, passes `parseSessionPlan`).

### T-0303d UF-08.4 Ready + start
- **AC-D1 (summary)** Given W-R7E4 at F-tz, the summary reads "29 min · warm-up + 3 exercises · 9 sets · done by 12:29" (m = `ceil(totalS / 60)` = 29, done by = `now + m` minutes, so the two numbers agree). The 4 explainer steps render with the copy "One thing on screen", "Tap Done after each set", "Rest counts down by itself", "Everything else is behind pause".
- **AC-D2 (focus prefs, D-0065 §6)** 3 switches (`role="switch"` or checkbox): "Sound cues", "Voice countdown 3-2-1", "Keep screen awake", all on by default. Toggling one writes `localStorage["wl-focus-prefs"]` `{version: 1, sound, voice, keepAwake}`, and a remount shows the stored values. `readFocusPrefs()` returns the defaults for a missing or invalid value. `focus-prefs.ts` exports only `readFocusPrefs`, `writeFocusPrefs` and `type FocusPrefs` (a test on the module's keys), and `features/UF-08/index.tsx` re-exports exactly these three: the hand-off T-0304c imports from `index.tsx` (D-0071 §3).
- **AC-D3 (Start writes the session first, NFR-OFF-2)** Start calls `upsertSession({id, started_at: "2026-09-27T10:00:00.000Z", ended_at: null, time_budget_min: 30, energy: "normal", warmup_in_budget: true, plan: workout.plan})` with `id` a UUID v4. `navigate("/session/<id>")` is called only after that promise resolves (a deferred promise holds navigation). A second tap while it is pending makes no second call. The stored `plan` passes `parseSessionPlan` and deep-equals `workout.plan`.
- **AC-D4 (offline + two starts, NFR-SYNC-4)** With `fake-indexeddb` and the real `upsertSession`, offline: after Start, `offlineDb().sessions.get(id)` holds the row with `pending: true`. Two Start runs (for example two devices or two setups) give two different ids and two rows.
- **AC-D5 (empty plan)** Given `plan.items` `[]`, the summary reads "warm-up only", and Start still creates the session.
- **AC-D6 (e2e happy path + a11y)** Signed in with a mocked cache: `/` → Start → UF-08.1 (45) → chip 30 → Suggest → UF-08.2 → Looks good → UF-08.4 → Start lands on `/session/<uuid>` (the UF-09 host), and IndexedDB has the session. The run works keyboard-only. axe reports 0 serious/critical on UF-08.1, .2, .4 (and .3 once T-0303c lands, which appends to the same spec).

## Paths you may change
- `apps/web/src/features/UF-08/**` (including `focus-prefs.ts`; `index.tsx` re-exports its three names, the D-0071 §3 hand-off).
- Extras (D-0071 §1, §10): `apps/web/src/lib/i18n/flows/uf-08.ts` (created empty by T-0318); `apps/web/src/lib/i18n/workout.ts` (T-0303b only, which may **add** keys and never change existing ones, and doesn't run in parallel with T-0302b/c); `tests/e2e/uf-08-setup.spec.ts` (new; the later children append).
- Read-only imports: `lib/offline`, `lib/format`, `lib/i18n/*`, `components/offline-status`, `@workoutlab/engine`, `@workoutlab/shared`, `features/UF-05/index.tsx` (`SwapSheet`, T-0303c). **Not** `components/body-map`, and not `features/UF-02|06|07|10|11` (principle 1, D-0071 §9).

## Contract impact
none. T-0303c reaches the engine `applySwap` (T-0224, a rule 12 addendum under an engine-lane decision, D-0065 §5, D-0071 §7) only through `SwapSheet` (T-0306b). This ticket doesn't change it and must not reimplement it in the UI.

## NFRs owned
OFF-3 (AC-A7), OFF-2 start part (AC-D3, AC-D4), SYNC-4 start part (AC-D4), I18N-2 (AC-A2), A11Y-1/2/6 for UF-08 (AC-A1, AC-B4, AC-C3, AC-D6).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for the child · `check:size` green · contracts unchanged · commits start with the child id and cite UF-08.n.
