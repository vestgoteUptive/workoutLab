---
id: T-0307
title: UF-10 Balance (all areas + area detail, full C-01) and UF-06 Progress (overview + exercise history)
lane: split → web-feature:UF-10 (T-0307a), web-feature:UF-06 (T-0307b)
screens: [UF-10.1, UF-10.2, UF-06.1, UF-06.2]
decisions: [D-0002, D-0003, D-0013, D-0027, D-0034, D-0045, D-0060, D-0061, D-0067, D-0068]
deps: [T-0300, T-0203b, T-0318, T-0319]
status: ready
---
<!-- Groomed 2026-09-29 by product-owner. Build flow: wl-build-web. Split per flow (D-0067 §1); ACs tagged [a]/[b]. -->

## Why
UF-10 is the "why" behind the body map. It shows all nine areas against target over the rolling 14 days, and each area's detail (`docs/specs/uf-10-balance.md`, D-0013, D-0027). C-01 was built in T-0300d, but it's mounted nowhere yet (T-0300d accept log). UF-06 covers consistency and exercise history. Both screens render engine output (`balance()`, `checkinSessions()`), so principle 3 is the main risk. Principle 1 also applies: neither screen is ever reachable from UF-08 or UF-09.

## Split (D-0067 §1): the orchestrator edits the board
| Child | Lane | Scope | Deps | ~Size |
|---|---|---|---|---|
| T-0307a | web-feature:UF-10 | UF-10.1 + UF-10.2, full C-01 mount, e2e keyboard check | T-0318 (T-0300d, T-0203b done) | ½ day |
| T-0307b | web-feature:UF-06 | UF-06.1 + UF-06.2, `stats.ts` | T-0318, T-0319 | ½ day |

The children don't overlap in paths and can run in parallel.

## Scope
- In:
  - [a] **Data:** `features/UF-10` computes `balance(await loadEngineHistory(), await loadTargets(), await loadLibrary(), now, tz)` on the device (D-0034 §3: the same engine offline and online). It renders from the cache first. When online, it runs `refreshAll()` and then recomputes. It doesn't call the `/balance` Edge Function.
  - [a] **UF-10.1:** the header "Last 14 days · {windowStart}–{windowEnd}" (Intl, e.g. "14–27 Sep") plus a "Plan" link to `/plan`. Then `<BodyMap variant="full">` from `components/body-map`, fed `BalanceResult.areas`. Then 9 rows in `areas` order, each with the name, `load / target` (via `formatSetCount`), a bar at `min(load/target, 1)` in `coverage-{coverageStep}`, the `warn` outline, and "Recovering". Each row links to `/balance/:area`. Also the empty state, and `<OfflineStatus variant="text">`.
  - [a] **UF-10.2:**
    - `load / target` and the deficit as a whole percent (`round(deficit × 100)`, half up).
    - The target source: "From your plan" (`default`) or "Adapted {d MMM}" (`adapted`, from `targetUpdatedAt`). `manual` shows "Set by you".
    - "Last trained …": today / yesterday / N days ago, or "Not trained yet".
    - The 14-day strip, from `days` (blank when 0).
    - The contributors in engine order: library name, `weightedSets` and `lastDate`.
    - Recovering, with "≥ 6 weighted hard sets in the last 48 h".
    - "Start workout" linking to `/session/setup`.
  - [a] Playwright `tests/e2e/balance.spec.ts`.
  - [b] **UF-06.1:** the month calendar, the Balance card linking to UF-10.1, and the recent exercises (D-0068 §5).
  - [b] **UF-06.2:** the history of one exercise in the cached window (D-0068 §5–§6).
  - [b] `features/UF-06/stats.ts` holds the pure functions.
- Out:
  - PRs, e1RM, volume, streaks and charts (D-0068 §5, Phase 5).
  - The C-01 silhouette (T-0315).
  - JSON export (T-0310).
  - Any change to `components/body-map` (web-shell). If C-01 needs a change, raise a follow-up.
  - Contracts.

### Edge cases that are in scope
- **Zero history:** UF-10 AC1. UF-06.1 shows "0 workouts this month", the Balance card at 0 and "No exercises logged yet". UF-06.2 for a never-done exercise shows "No sets in the last 8 weeks".
- **Offline:** everything renders from the cache, with queued sets included (UF-10 AC8) and no error state.
- **Returning after 10 days off:** UF-10 AC7. UF-06.1's calendar still shows the older days of the month.
- **Time running out:** not applicable. These screens are never shown in a workout (AC-A12).
- **A bad URL:** `/balance/neck` → `/balance` (shell). `/progress/<unknown>` → `/progress`.

## Acceptance criteria
- **Tests:** Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-10|UF-06/**/*.test.tsx`, and Playwright where tagged **e2e**.
- **Fixtures** (from `docs/specs/uf-10-balance.md`): tz Europe/Stockholm, now `2026-09-27T12:00:00+02:00`, default targets 20/16/12. back squat = quads 1, glutes 1, hamstrings .5, core .5. Romanian deadlift = hamstrings 1, glutes .5.
- "Through the engine" means the real `@workoutlab/engine` with the offline cache seeded. "Stubbed" means a fixed `BalanceResult` handed in.

### T-0307a UF-10
- **AC-A1 (zero history, spec AC1)** Given no history, When UF-10.1 renders, Then there are 9 rows reading "0 / 20" (chest, back, glutes, quads), "0 / 16" (shoulders, hamstrings) and "0 / 12" (arms, core, calves). Every bar uses `var(--wl-color-coverage-0)`. The text "Nothing logged in the last 14 days. Your first workout fills this in." and a "Start workout" link to `/session/setup` are visible.
- **AC-A2 (weighted load, spec AC2)** Through the engine: 6 hard and 2 warm-up back-squat sets on 2026-09-25 → quads "6 / 20", glutes "6 / 20", hamstrings "3 / 16", core "3 / 12".
- **AC-A3 (fractional display, spec AC3)** Through the engine: 5 hard back-squat sets on 2026-09-25 → hamstrings "2.5 / 16" and quads "5 / 20" (not "5.0").
- **AC-A4 (coverage steps, spec AC4)** Through the engine, quads loads 0, 6, 7, 14, 20 and 24 give the quads row fill `coverage-0, -1, -2, -3, -4, -4`. Load 24 reads "24 / 20" with the bar at 100 % width.
- **AC-A5 (engine order, spec AC5)** Stubbed `areas` in the order calves (attention, deficit .9), hamstrings (attention, .8), chest (.5), back (.5), shoulders, arms, core, glutes, quads (.2 each) → the rows render in exactly that order. Only calves and hamstrings have the `warn` outline. A second stub in the reverse order renders reversed, which proves the UI doesn't sort.
- **AC-A6 (window boundary, spec AC6)** Through the engine: with hard sets at 2026-09-14 23:59 and 2026-09-13 23:59 local and now 2026-09-27 12:00, only the 09-14 set counts. With the clock set to 2026-09-28 00:00:30 local and the screen remounted, neither counts. The header reads "Last 14 days · 14–27 Sep", then "15–28 Sep".
- **AC-A7 (returning after 10 days off, spec AC7)** Through the engine: the only session is 2026-09-17 with 4 hard RDL sets. On 09-27, UF-10.2 for hamstrings shows "4 / 16", "75 %" and "Last trained 10 days ago", and the strip cell for 17 Sep reads 4. On 2026-10-01, it shows "0 / 16" and every strip cell is blank.
- **AC-A8 (offline, queued sets, spec AC8)** Given `lastSyncedAt` 08:10 and `navigator.onLine = false`, with 3 queued hard RDL sets completed at 09:00, then hamstrings = cached value + 3 and glutes = cached value + 1.5. The header shows "Offline · last synced 08:10". There's no `role="alert"`, and no network call is awaited.
- **AC-A9 (contributors, spec AC9)** Through the engine: 4 RDL on 09-20 and 4 back squat on 09-25 → UF-10.2 hamstrings shows "6 / 16", "63 %" and "Last trained 2 days ago". The contributor rows read "Romanian deadlift 4 · 20 Sep", then "Back squat 2 · 25 Sep". Strip cells: 20 Sep = 4 and 25 Sep = 2.
- **AC-A10 (target source, spec AC10)** Stubbed `targetSource: adapted, targetUpdatedAt 2026-09-20T08:00:00Z` → "Adapted 20 Sep". `default` → "From your plan".
- **AC-A11 (recovering, spec AC11)** Stubbed quads `recovering: true` → the UF-10.1 quads row shows "Recovering", and UF-10.2 quads shows "Recovering" and "≥ 6 weighted hard sets in the last 48 h". With `false`, neither the tag nor the text is in the DOM.
- **AC-A12 (never in a workout, spec AC12, principle 1)** With T-0318's rule, ESLint on virtual files in `src/features/UF-09/` and `UF-08/` that import `features/UF-10` reports `no-restricted-imports`. A test renders the router at `/session/<id>` and asserts that no `a[href^="/balance"]` is in the DOM.
- **AC-A13 (UI computes nothing, spec AC13)** Stubbed quads `{load: 3, target: 20, coverageStep: 4, deficit: 0.85}` → the row shows "3 / 20" with a `coverage-4` fill, and UF-10.2 shows "85 %".
- **AC-A14 (row a11y, spec AC14)** Hamstrings `{load 6, target 16, needsAttention: true}` → the row link's accessible name is "Hamstrings, 6 of 16 hard sets, needs attention". The row's box is ≥ 44 × 44 CSS px (computed min-height).
- **AC-A15 (full C-01 mounted, T-0300d, D-0060)** UF-10.1 contains exactly one C-01 `full` region ("Body map") with 9 area buttons. Each gets `load/target/coverageStep/needsAttention` from the same `BalanceResult.areas` element as its row (the test changes one area in the stub and checks that both update). Clicking the hamstrings button lands on `/balance/hamstrings` (UF-10.2). The C-01 legend is visible.
- **AC-A16 (real keyboard, exactly once, e2e)** Given the preview build, an injected session and a mocked Supabase, When the user Tabs to the C-01 hamstrings button and presses Enter, Then the URL is `/balance/hamstrings`, and one `page.goBack()` returns to `/balance`, so exactly one history entry was pushed. The same holds for Space on the calves button: the keyup doesn't navigate again, and `goBack()` returns to `/balance`.
- **AC-A17 (axe, e2e, NFR-A11Y-1)** `@axe-core/playwright` on `/balance` (zero and mixed fixtures) and on `/balance/hamstrings` reports 0 serious or critical violations.
- **AC-A18 (renders before network)** Given a cached history and a `fetch` that never resolves, UF-10.1 shows its rows on the first render after the cache read, and the refresh isn't awaited.

### T-0307b UF-06
- **AC-B1 (calendar = completed sessions, D-0068 §5)** Now 2026-09-27. `loadSessions()` returns S1 on 09-01 (3 hard sets), S2 on 09-14 (only warm-up sets), S3 on 09-26 23:40 local (4 hard sets), and S4 on 08-31 (5 hard sets). Then the September calendar marks the 1st and the 26th only, reads "2 workouts this month", and outlines the 27th as today. Completion comes from engine `checkinSessions` (spy called once).
- **AC-B2 (Balance card)** Stubbed `balance().areas` in the order calves, hamstrings, chest, back, … → the card shows exactly 4 rows (calves, hamstrings, chest, back) with `load / target` and `coverage-{step}` bars. The card is one link to `/balance` (UF-10.1).
- **AC-B3 (recent exercises)** History: back squat on 09-20 (100 × 8, 100 × 6) and 09-25 (102.5 × 5, 100 × 8), RDL on 09-22 (80 × 10), and a push-up on 09-24 (0 × 15, bodyweight). Then the list is ordered by last date, newest first: back squat (09-25, best "102.5 kg × 5"), push-up (09-24, "15 reps"), RDL (09-22, "80 kg × 10"). Each links to `/progress/<id>`.
- **AC-B4 (best set rule)** `bestSet([{w 100, r 8}, {w 102.5, r 5}, {w 102.5, r 6}])` = 102.5 × 6. Bodyweight `[{0, 12}, {0, 15}]` = 15 reps. Timed `[{d 40}, {d 45}]` = "45 s". Tombstoned and warm-up rows are ignored (via `normalizeHistory` + `isHardSet`).
- **AC-B5 (UF-06.2)** For back squat with the AC-B3 history, `/progress/<back-squat-id>` shows the rows "Fri 25 Sep · 102.5 × 5, 100 × 8" then "Sun 20 Sep · 100 × 8, 100 × 6". The cards read Best set "102.5 × 5", Heaviest "102.5 kg" and Sessions "2". The caption is "Last 8 weeks", and the "How to" link goes to `/library/<id>`.
- **AC-B6 (window = cache)** Given a set 57 local days old in the cache fixture, UF-06.1 and UF-06.2 don't show it. (`stats.ts` takes `now, tz` and filters to the 56-day window. A source test asserts that `stats.ts` has no `Date.now`/`new Date()` without arguments.)
- **AC-B7 (zero history)** With no sessions and no history: "0 workouts this month", the Balance card rows at "0 / target", and "No exercises logged yet". `/progress/<known id with no sets>` shows "No sets in the last 8 weeks". `/progress/unknown` redirects to `/progress`.
- **AC-B8 (offline)** With `navigator.onLine = false`, UF-06.1 renders from the cache, shows `<OfflineStatus variant="text">`, and awaits no network call.
- **AC-B9 (a11y, e2e)** axe on `/progress` and `/progress/<id>` finds 0 serious or critical violations. Every link and chip is ≥ 44 × 44 px.

## Paths you may change
- [a] `apps/web/src/features/UF-10/**`, `apps/web/src/lib/i18n/flows/uf-10.ts` (extra, D-0067 §2), `tests/e2e/balance.spec.ts` (extra, qa lane: new file only, reusing `tests/e2e/fixtures`).
- [b] `apps/web/src/features/UF-06/**`, `apps/web/src/lib/i18n/flows/uf-06.ts` (extra), `tests/e2e/progress.spec.ts` (extra, new file).

## Contract impact
None. The screens read `BalanceResult`/`AreaBalance` exactly as in `api/openapi.yaml` and call the engine's public functions only. The new defaults are in D-0067/D-0068 (`revisit`).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green for the child's e2e ACs · `check:size` green (each route chunk ≤ 100 KB gzip) · contracts unchanged · commits start `T-0307a:`/`T-0307b:` and cite screen IDs (e.g. `T-0307a UF-10.1: mount full C-01`).
