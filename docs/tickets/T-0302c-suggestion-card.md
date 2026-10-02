---
id: T-0302c
title: UF-02.1 suggestion card — the 45-min on-device suggest() preview (rows, chips, +N more, See all, empty plan, skeleton) and the shared lib/i18n/workout.ts formatters
lane: web-feature:UF-02
screens: [UF-02.1]
decisions: [D-0063, D-0065, D-0071, D-0086, D-0091, D-0095, D-0103, D-0106, D-0108]
deps: [T-0302a]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Split out of T-0302a by D-0106 (parent docs/tickets/T-0302-today-and-preview.md, ACs A4, A7 card part, A8 suggest part, A9). Build flow: wl-build-web. About ⅓–½ day. Becomes ready when T-0302a is done. Runs in parallel with T-0303a, but never with T-0302b or T-0303b, which also list lib/i18n/workout.ts (D-0071 §1, D-0108). -->

## Why
UF-02.1 previews the next workout before the user has said how long they have. So the preview is labelled with its assumption, "Suggested for 45 min", and Start still goes through UF-08.1 (D-0065 §1, principle 2). The list, order, sets, reps and reasons are the engine's `suggest()` output, rendered as it is (principle 3). The words for those reasons live in one shared module, `lib/i18n/workout.ts`, which UF-02.2, UF-08.2 and UF-09 reuse (D-0071 §1, D-0106).

## Scope
- In:
  - **The suggestion card in `features/UF-02`.** It renders between the check-in slot and the no-workouts line / Start (T-0302a's DOM order). It contains:
    - the `suggest` call with D-0065 §1's inputs and the cached profile, `goal` included (D-0095);
    - "Suggested for 45 min" and "{n} exercises · ~{m} min";
    - up to 3 rows, then "+N more";
    - the session-reason chips;
    - "See all" → `/?view=preview`;
    - the empty plan;
    - the loading skeleton with a fixed min-height.
  - **`lib/i18n/workout.ts`** (new): the six D-0106 §4 exports, with the D-0106 §5 swap copy.
  - **Additions:** the e2e rows appended to `tests/e2e/uf-02-today.spec.ts`, and strings in `lib/i18n/flows/uf-02.ts`.
- Out:
  - UF-02.2 itself (T-0302b). Until T-0302b lands, `/?view=preview` renders UF-02.1.
  - Swap or Edit on the card.
  - Any second `suggest` input (the time is asked on UF-08.1).
  - Changes to T-0302a's frame, other than inserting the card.
  - `tests/e2e/fixtures/**` (D-0108 §2) and the shell tests (D-0108 §3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the card computes from the cache and the queue, and renders in the offline cold start (AC-9).
- **Time running out:** the card never promises a length the user hasn't chosen. It is labelled "Suggested for 45 min", and Start → UF-08.1 is unchanged (AC-2).
- **Zero history:** the card renders the engine's zero-history plan (AC-1, R7-E14 pair).
- **Returning after 10 days off:** the reason lines render `days_since {area, 12}` as "… 12 days ago" (AC-7).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library in `apps/web/src/features/UF-02/__tests__/` and `apps/web/src/lib/i18n/__tests__/workout.test.ts`. The fixtures are T-0302a's (F-tz, F-targets, L1).
- **W-R7E4** is the `Workout` example in `api/openapi.yaml`: bench-press × 4 6–8, inverted-row × 3 8–12, leg-extension × 2 10–15, `totalS` 1725, `sessionReasons` chest/back/quads.

**Test rules:**
- Both values of every binary condition are tested.
- Negative timing asserts wait a 50 ms macrotask.
- Positive asserts on lazy content wait (D-0103).

- **AC-1 (the call and the goal, D-0065 §1, D-0095)**
  - **The call.** Once per cache read, `suggest` (a spy wrapping the real function) is called with `(history, targets, profile, library, {budgetMin: 45, warmupInBudget: true, energy: "normal", shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}, now, tz)`. `profile` is reference-equal to `loadProfile()`'s value.
  - **Real engine, zero history.**
    - With goal `get_stronger`, the bench-press row reads "Bench press 4 × 3–5".
    - With `build_muscle`, it reads "Bench press 4 × 6–8".
  - **No server calls.** The fetch spy sees no `/functions/v1/` request.
- **AC-2 (card render, W-R7E4)**
  - **Header.** Given `suggest` returns W-R7E4, the card shows "Suggested for 45 min" and "3 exercises · ~29 min" (`ceil(1725 / 60)`).
  - **Rows.** In plan order: "Bench press 4 × 6–8", "Inverted row 3 × 8–12", "Leg extension 2 × 10–15". Names come from the library. A fixture with the items reversed renders them reversed.
  - **Chips.** "Chest", "Back", "Quads", from `sessionReasonChips(sessionReasons)`.
  - **Start.** T-0302a's "Start workout" is still the only primary action, and it still goes to `/session/setup`.
- **AC-3 (more than 3 items)**
  - **5 items.** Only the first 3 rows show, plus the text "+2 more".
  - **3 items.** There is no "more" text.
  - **See all.** In both cases there is a link "See all" with `href="/?view=preview"`, ≥ 44 × 44 px in e2e.
- **AC-4 (timed and empty)**
  - **Timed.** A timed item `{sets: 3, repsMin: null, repsMax: null, durationS: 45}` renders "Plank 3 × 45 s".
  - **Empty plan.** Given `plan.items` = `[]`, the card reads "Nothing suggested yet". It has no rows, no "See all" and no chips, and Start is still present and enabled.
  - **Non-empty plan.** "Nothing suggested yet" is absent.
- **AC-5 (skeleton and layout stability, NFR-PERF-1 layout part)**
  - **Before the first result.** The card region renders a skeleton (`aria-busy="true"`, no rows) with the same CSS class as the loaded card.
  - **Min-height.** A source test asserts that class has a `min-height` in `features/UF-02/*.css`, and that the skeleton and the loaded card share it.
  - **e2e.** The loaded card's `boundingBox().height` ≥ that min-height in px.
- **AC-6 (no profile, refresh)**
  - **No profile.** In T-0302a's no-profile state (no profile, or < 9 targets), there is no card and `suggest` has 0 calls. With profile + 9 targets, the card is present.
  - **Online.** After `refreshAll` resolves with new data, `suggest` runs exactly once more.
  - **Offline.** `suggest` runs exactly once (no second call after a 50 ms macrotask).
- **AC-7 (formatters, `lib/i18n/workout.ts`, D-0106 §4–§5)**
  - **Exports.** A test pins `Object.keys(module)` to `["areaName", "itemReasonLine", "itemSummary", "reasonLine", "restLabel", "sessionReasonChips"]` (sorted).
  - **`itemSummary`:**
    - `{sets: 4, repsMin: 6, repsMax: 8, durationS: null}` → "4 × 6–8";
    - `repsMin === repsMax === 5` → "4 × 5";
    - `{sets: 3, repsMin: null, repsMax: null, durationS: 45}` → "3 × 45 s".
  - **`restLabel`:** `restLabel(120)` = "2:00", `restLabel(60)` = "1:00", `restLabel(90)` = "1:30".
  - **`reasonLine`:**
    - `main_lift` → "Main lift"
    - `area_deficit {hamstrings, 0.625}` → "Hamstrings 63 % below target" (rounded half up)
    - `area_deficit {chest, 1}` → "Chest 100 % below target"
    - `days_since {quads, null}` → "Quads not trained yet"
    - `days_since {quads, 0}` → "Quads last trained today"
    - `days_since {quads, 1}` → "Quads last trained 1 day ago"
    - `days_since {quads, 12}` → "Quads last trained 12 days ago"
    - `recovering_skipped {quads}` → "Quads recovering, skipped"
    - `energy_low_trim` → "Trimmed for low energy"
    - `energy_high_backoff` → "Back-off set added"
    - `swap {null}` → "Swapped"
    - `swap {equipment_taken}` → "Swapped: equipment taken"
    - `swap {discomfort}` → "Swapped for comfort"
    - `swap {variety}` → "Swapped for variety"
    - `swap {short_on_time}` → "Swapped to save time"
    - every `prefill {kind}` → ""
  - **`itemReasonLine`:** for W-R7E4's bench-press reasons (`main_lift`, `area_deficit {chest, 1}`, `days_since {chest, null}`, `prefill {first_time}`) → "Main lift · Chest 100 % below target" (at most 2, " · "-joined, empties skipped). A list holding only `prefill` gives "".
  - **`sessionReasonChips`** (D-0106 §4): at most 3 chips, in order, empties skipped.
    - `area_deficit {chest, 1}` → "Chest", via `areaName`. W-R7E4's `sessionReasons` → `["Chest", "Back", "Quads"]`.
    - `recovering_skipped {quads}` → "Quads recovering, skipped" (its `reasonLine`).
    - A list of 4 gives 3.
    - A list of only `prefill` gives `[]`.
  - **`areaName`:** `areaName("hamstrings")` === `en.bodyMap.areas.hamstrings`.
  - **Strings.** Every string in the module is a literal in that file or in `en.bodyMap.areas`, and `react/jsx-no-literals` is green.
- **AC-8 (strings and lint)**
  - Every card string comes from `en.uf02` or `workout.ts`.
  - `en.ts` is unchanged, and `flows/uf-02.ts` keeps the D-0075 shape.
  - The T-0302a export pin (`["Today"]`) still holds.
- **AC-9 (e2e: offline card, D-0091 §1, D-0108)** Rows appended to `tests/e2e/uf-02-today.spec.ts`, reusing T-0302a's seed (relative dates, no fixture edits). Both of its exercises have `equipment: []`, matching the default `mockProfilePresent` row, so the plan is non-empty:
  - **Online.** The spec records the card's header and row texts.
  - **Offline reload.** The offline cold start shows the card with "Suggested for 45 min", and header and rows equal to the recorded online texts. There is at least one row matching `/^.+ [1-4] × (\d+(–\d+)?|\d+ s)$/`.
  - **a11y.** axe on `/` stays 0 serious or critical, and "See all" is ≥ 44 × 44 px.
  - **Bundle.** `check:size` stays green, with the UF-02 chunk ≤ 100 KB gzip.
- **AC-10 (shell tests unchanged, D-0108 §3)** As in T-0302a AC-14: no file under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts` changes, and they pass.

## Paths you may change
- `apps/web/src/features/UF-02/**` (the lane: `web-feature:UF-02`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/workout.ts`: new, the shared formatter module (D-0071 §1, D-0106 §3); this ticket creates it.
  - `apps/web/src/lib/i18n/__tests__/workout.test.ts`: new, its unit tests.
  - `apps/web/src/lib/i18n/flows/uf-02.ts`: this flow's strings file (D-0075); add keys only.
  - `tests/e2e/uf-02-today.spec.ts`: append rows to T-0302a's spec (D-0071 §10).
  - `docs/tickets/T-0302c-suggestion-card.md`: this file, for the accept log.
- Read-only imports (not grants): `components/body-map`, `components/offline-status`, `lib/offline`, `lib/format`, `lib/i18n/en.ts`, `@workoutlab/engine`, `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The card only renders the engine's `Workout` (`api/openapi.yaml`). The copy changes D-0106 makes are UI strings, not a contract.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0302c` and cite UF-02.1.

## Notes
- **Flow:** `wl-build-web`.
- **Board (orchestrator, D-0106 §6):**
  - Add this row: lane `web-feature:UF-02`, deps T-0302a, status todo.
  - Re-point T-0302b's dep from T-0302a to T-0302c.
  - Re-point T-0303b's dep from T-0302a to T-0302c.
