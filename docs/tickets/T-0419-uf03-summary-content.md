---
id: T-0419
title: "UF-03.3 Summary content: device-side numbers through engine calls (now = ended_at), before → after, next up, See balance only for an ended session; never redirects (isn't-on-this-device and still-running states)"
lane: web-feature:UF-03
screens: [UF-03.3]
decisions: [D-0142, D-0068, D-0071, D-0013, D-0111, D-0114, D-0045]
deps: [T-0318, T-0319]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. First child of the T-0305b board row (D-0142 §1 §4). Build flow: wl-build-web. About ½ day. It needs no UF-09 code: its tests seed the IndexedDB session row and sets directly, so it can run now. Effort and Save are T-0420. -->

## Why
- **UF-03.3** is where both paths of a workout end (focus mode and the List view). It shows what the workout did to the 14-day balance (D-0068 §1).
- **Principle 3:** every number comes from an engine call or the stored row. The UI computes no PR, volume or "within budget".
- **Principle 1:** the summary is after the workout. It is the only session screen with a "See balance" link (user flows v2, the UF-10 entry), and only once the session has ended (D-0142 §4).
- **NFR-OFF-2:** it renders from the cache and the queue with no network.

## Scope
- In:
  - `features/UF-03/index.tsx`: `Summary` stays a wrapper, `<div data-screen-id="UF-03.3">` with `<h1>{en.screens.sessionSummary}</h1>`, then the content component from its own module (D-0142 §4). `Summary` may take optional `timeZone?: string` and `locale?: string` props for tests (the UF-10 pattern).
  - The content, read from `(await offlineDb().sessions.get(id))`, `loadEngineHistory()`, `loadLibrary()` and `loadTargets()`:
    - **States:** loading, "This workout isn't on this device", "This workout is still running" (D-0142 §4);
    - **Ended:** Time "{m} min" next to "{budget} min budget", Exercises, Sets, the before → after rows, "Next up", a "See balance" link to `/balance`, and `<OfflineStatus variant="text" timeZone={tz}>`.
  - **The engine calls** (D-0068 §1): `normalizeHistory`, `isHardSet`, and `balance` twice, before and after, both at `now = row.ended_at` (D-0142 §4).
  - **No mount refresh** (D-0142 §4, the D-0111 §11 exemption): it reads only IndexedDB and calls no `refresh*`, and it doesn't call `useAuth()` (the UF-09 tests render the real `Summary` with no `AuthProvider`).
  - Strings in `flows/uf-03.ts`.
- Out:
  - Effort chips and Save (T-0420).
  - The List view (T-0416–T-0418).
  - PR, volume, e1RM and streaks (D-0068 §5).
  - `POST /sessions/{id}/finish` (D-0071 §8).
  - The UF-11.1 check-in card and C-01 (principle 1, D-0070 §7).
  - Any edit to the shell tests, `app/**`, `lib/**` or `components/**`.

### Edge cases that are in scope
- **Offline:** the numbers come from the cache and the queue, the same as online (AC-7).
- **Time running out:** "{m} min" next to "{budget} min budget", with no judgement copy (AC-3). A 52-minute workout on a 45-minute budget shows both numbers and nothing else.
- **Zero history:** every row's before reads "0" (AC-4).
- **Returning after 10 days off:** an earlier session 10 days before is in the window and counts in before (AC-4). A reload 10 days after the workout shows the same numbers, because `now` is `ended_at` (AC-6).
- **Reload:** a cold `/session/S1/summary` shows the same numbers (AC-6).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library + `fake-indexeddb`, with a signed-in user stubbed through the supabase-js `localStorage` key that `currentUserId()` reads (the T-0304a way).
- Clock: tz `Europe/Stockholm`, `locale="en-GB"`, now `2026-09-27T12:00:00+02:00`. Library: engine L1. Targets: the 9 default rows.
- **S1:** `started_at` 11:00 local, `ended_at` 11:52:40 local, `time_budget_min` 45. Plan: back-squat × 4 (main, 6–8), romanian-deadlift × 3 (8–12), leg-curl × 3 (10–15). Sets in the **queue** only: back-squat 100 × 6 × 4, romanian-deadlift 80 × 8 × 3, and one back-squat set with `isWarmup: true` (40 × 10).
- **S0:** 2026-09-17 (10 days earlier), back-squat 97.5 × 8 × 4, in the cached history.
- `@workoutlab/engine` functions are the real ones, wrapped in spies (`vi.spyOn` on the module namespace). AC-4's order test uses a stubbed `balance`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms. Every AC must fail on `main` (the T-0318 stub has only the `<h1>`). The build log also records these planted faults turning their ACs red:
- counting every S1 set, not only `isHardSet` ones (AC-3: "Sets 8");
- `balance` called with `Date.now()` instead of `ended_at` (AC-6);
- a redirect to `/` for an unknown id (AC-1);
- a "See balance" link on the still-running state (AC-2).

- **AC-1 (never redirects; the shell surface stays, D-0142 §4)**
  - **Unknown id.** Given no `sessions` row for `S9`, When `/session/S9/summary` mounts, Then exactly one `[data-screen-id="UF-03.3"]` shows the `<h1>` "Workout summary" and "This workout isn't on this device" with a link to `/`. After 50 ms the location is still `/session/S9/summary`. There is no `role="alert"`, no `banner` and no `a[href^="/balance"]`.
  - **Other user / unreadable / IndexedDB rejecting.** A row with another `userId`, a row whose plan fails `parseSessionPlan`, and `offlineDb().sessions.get` rejecting each give the same state, with no uncaught error and no unhandled rejection (a `process.on("unhandledRejection")` probe).
  - **Loading.** The first commit (before any IndexedDB read resolves) is the wrapper with the `<h1>` only.
  - **Shell tests unchanged.** `app/__tests__/routes.phase3.render.test.tsx`, `auth-guard.phase3.test.tsx`, `profile-gate.test.tsx` (AC-8), `features/UF-10/__tests__/never-in-workout.test.tsx` and `tests/e2e/shell.spec.ts` (AC-6) pass with no edit (the build log lists the run).
- **AC-2 (still running, D-0142 §4)** Given S1 with `ended_at: null`, the summary shows "This workout is still running" and a link "Back to workout" with `href="/session/S1"`. There is no Time, Sets or before → after row, no `a[href^="/balance"]`, and no `upsertSession` call (spy, 50 ms). The pair is AC-3 (S1 ended).
- **AC-3 (numbers from engine calls, D-0068 §1)** With S1 ended at 11:52:40, the summary shows:
  - Time "52 min" (floor of 52 min 40 s) next to "45 min budget";
  - Exercises "2" (back-squat and romanian-deadlift);
  - Sets "7" (the `isWarmup` set doesn't count);
  - spies show `normalizeHistory` and `isHardSet` called. The text contains no "over", "under" or "within" judgement.
  - **The pair.** With `ended_at` 11:44:59 it reads "44 min".
- **AC-4 (before → after, D-0068 §1, D-0013)**
  - **Order and format (stub).** With `balance` stubbed to return, on its first call (before), loads quads 2, glutes 1, hamstrings 0, chest 3, and on its second call (after), `areas` in the order hamstrings, quads, chest, glutes with loads hamstrings 3, quads 6, chest 3, glutes 3.5 and targets 16, 20, 18, 20, the rows read exactly, in this order: "Hamstrings 0 → 3 / 16", "Quads 2 → 6 / 20", "Glutes 1 → 3.5 / 20". Chest (unchanged) isn't listed. Numbers use `formatSetCount` (D-0013).
  - **The calls.** The first `balance` call's history has no set with `sessionId` "S1". The second has every S1 set that `normalizeHistory` keeps. Both get `now` = S1's `ended_at` and tz `Europe/Stockholm`.
  - **Real engine.** Through the real `balance`, the listed rows are exactly the areas whose load changed, in `after.areas` order. Quads is listed and chest isn't. S0 (10 days earlier, in the window) makes quads' before non-zero.
  - **Zero history.** With S0 removed, every listed row's before reads "0".
- **AC-5 (next up, D-0068 §1)** With a stubbed after whose `areas` start calves (`coverageStep` 0), chest (0), back (4), it reads "Next up: Calves, Chest". When every step is 4, it reads "Every area is on target". The pair with one area below 4 reads "Next up: {that area}".
- **AC-6 (now = ended_at: reload gives the same numbers, D-0142 §4)** A cold remount of `/session/S1/summary` with the same IndexedDB and `Date.now` moved to `2026-10-07T12:00:00+02:00` shows exactly the same Time, Exercises, Sets, rows and "Next up" text as at 12:00 on 2026-09-27.
- **AC-7 (IndexedDB only, online and offline the same, D-0142 §4)**
  - **Online.** With `navigator.onLine = true`, the `refreshAll`/`refresh*` spies have 0 calls 50 ms after the numbers render, and the numbers equal AC-3's.
  - **Offline.** With `navigator.onLine = false`, the numbers are the same, and the `<OfflineStatus>` text is shown. The pair: online, it renders nothing.
  - **No AuthProvider.** `Summary` rendered in a `MemoryRouter` with no `AuthProvider` (the `features/UF-09/__tests__/session-helpers.tsx` shape) shows the ended S1 numbers, with no thrown error.
  - **The UF-09 suite** (which lands on the real `Summary` after `finish()`) passes with no edit, with no unhandled rejection.
  - No `fetch` to `/functions/v1/` is made in any case (spy).
- **AC-8 (See balance and nothing else out, principle 1)** The ended summary has exactly one `a[href^="/balance"]`, "See balance", with `href="/balance"`. It has no `a[href^="/library"]`, `/plan` or `/progress`, no `nav`, no `[data-component="C-01"]`, and no check-in card, even with a pending check-in proposal in the cache. `ESLint.lintText` of a `features/UF-03` file importing `features/UF-11/index.js` reports `no-restricted-imports` (the T-0318 rule).
- **AC-9 (strings, exports, a11y)** Every new string is in `en.uf03` (`react/jsx-no-literals` green). `features/UF-03/index.tsx` exports exactly `Summary` (an export-keys pin that T-0416 extends). The vitest axe helper (D-0060 §7) finds 0 violations on the ended summary and on both other states.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0419-uf03-summary-content.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (`offlineDb`, `loadEngineHistory`, `loadLibrary`, `loadTargets`, `currentUserId`, `lastSyncedAt`), `lib/format`, `lib/i18n/en.ts`, `lib/i18n/workout.ts` (`areaName`), `components/offline-status`, `@workoutlab/engine`, `@workoutlab/shared` (`parseSessionPlan`).

## Contract impact
None. Public engine functions and the existing caches (D-0068 §1, D-0071 §8).

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (shell.spec AC-6 unchanged) · `check:size` green · contracts unchanged · commits start `T-0419` and cite the screen (for example `T-0419 UF-03.3: before → after through balance`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** it is parallel-safe with T-0421 (UF-05) and every UF-09 ticket. It is the first ticket in the UF-03 lane (D-0142 §1).

## Build log (frontend-dev, 2026-10-02)
- **Files.** `features/UF-03/index.tsx` (the wrapper: one `[data-screen-id="UF-03.3"]`, `<h1>{en.screens.sessionSummary}</h1>`, then `SummaryContent`); `SummaryContent.tsx` (the states and the ended view); `summary-data.ts` (`loadSummary`, `areaChanges`, `nextUpAreas`: IndexedDB reads plus `normalizeHistory`, `isHardSet` and two `balance` calls at `now = row.ended_at`); `summary.css` (tokens only); `lib/i18n/flows/uf-03.ts` (`en.uf03`). Tests in `features/UF-03/__tests__/`: `summary.states.test.tsx` (AC-1, AC-2, AC-9 axe), `summary.numbers.test.tsx` (AC-3..AC-6), `summary.isolation.test.tsx` (AC-7, AC-8 render), `exports-and-lint.test.ts` (AC-8 lint, AC-9 exports/strings).
- **Red on main.** With main's `index.tsx` stub (and the new modules removed) every AC has a red test: 30 of 38 fail (the 8 still green are the lint/export pins that already hold on the stub, e.g. the UF-11 import ban and "exports exactly Summary").
- **Planted faults (each applied alone to the built code, the UF-03 suite run, then reverted):**
  - counting every S1 set, not only `isHardSet` ones → AC-3 "Sets 7" red (reads 8), plus the AC-7 numbers checks;
  - `balance` called with `new Date(Date.now()).toISOString()` instead of `ended_at` (both calls, Time unchanged) → AC-6 remount red (quads' before 4 → 0 at 2026-10-07) and AC-4 "the calls" red;
  - `<Navigate to="/" replace />` on the not-on-device state → AC-1 red for the unknown id, the other user, the unreadable plan and the rejecting `sessions.get`;
  - a "See balance" link on the still-running state → AC-2 red.
- **Both values of each condition.** Known vs unknown id; own vs other `userId`; `ended_at` null vs set; 11:52:40 vs 11:44:59 (52 vs 44 min); warm-up flagged vs not (7 vs 8 sets); S0 present vs removed (quads' before 4 vs 0); next up two areas / one area / every area at step 4; online (no OfflineStatus) vs offline (text shown, same numbers).
- **Build defaults (now D-0147, from the review; see the rework below):** a `null` plan (parses `ok`) still shows the summary, because no number depends on the plan; only a plan that fails `parseSessionPlan` is "isn't on this device". When `balance` throws (no cached targets yet: `indexTargets` needs all nine), the ended summary shows Time, Exercises, Sets and See balance and omits the before → after rows and Next up. This is what the UF-09 suites hit after `finish()` (they seed no targets). A non-finite `ended_at − started_at` is "isn't on this device". The link on that state reads "Go to Today".
- **Shell tests unchanged and green.** No file under `app/**`, `lib/**` (except `flows/uf-03.ts`), `components/**`, `features/UF-09/**`, `features/UF-10/**` or `tests/e2e/**` changed. `routes.phase3.render.test.tsx`, `auth-guard.phase3.test.tsx`, `profile-gate.test.tsx` (AC-8), `features/UF-10/__tests__/never-in-workout.test.tsx` and the whole UF-09 suite pass in the full web run. `tests/e2e/shell.spec.ts` (AC-6) and `tests/e2e/uf-09-focus.spec.ts` pass.
- **Runs.** `pnpm --filter @workoutlab/web typecheck` green; `lint` green; `test` 150 files / 2339 tests green; `test:e2e shell.spec.ts uf-09-focus.spec.ts` 26/26; `pnpm -w format:check` green; `pnpm check:repo` green; `check:size` green.
- **Not in this ticket:** the summary e2e (T-0420, with Save), effort chips and Save (T-0420).

## Build log, rework attempt 2 (frontend-dev, 2026-10-02)
- **Base.** `git merge main` brought in D-0147 (the four defaults above), committed as a merge.
- **Narrowed catch (D-0147 §2).** `summary-data.ts` no longer wraps `balance` in a bare `catch {}`. `coversEveryArea(targets)` (every one of the nine `AREAS` has a cached target) decides whether the two `balance` calls run. When it's false, `changes`/`nextUp` are `null`. Any other throw from `balance` reaches the outer catch, so the screen shows "isn't on this device", never a partial summary.
- **New tests** in `__tests__/summary.defaults.test.tsx`, each paired, with an `unhandledRejection` probe:
  - 0 targets and 8 of 9 targets: Time, budget, Exercises, Sets and See balance; no rows, no Next up, no "Every area is on target", no `balance` call. The pair: 9 targets shows rows and Next up.
  - `balance` throwing once on a nine-target cache: not-on-device, no Time/Sets, no `/balance` link. The pair: the same cache without the throw shows the full summary.
  - A null plan shows the ended summary. The pair: a plan that fails `parseSessionPlan` shows not-on-device.
  - Tombstone: S1's `back-squat-3` is live in the cache and re-sent from the queue with `deletedAt` and a later `editedAt`. Sets reads 6 and the quads row is "Quads 4 → 7 / 20". The pair, without the tombstone: Sets 7, "Quads 4 → 8 / 20".
- **Planted faults (each applied alone, the UF-03 suite run, then reverted):**
  - missing targets → `return NOT_ON_DEVICE`: both missing-target cases red;
  - `nextUp` defaulting to `[]` (renders "Every area is on target" with no targets): both missing-target cases red;
  - the plan check tightened to `!entry.row.plan || …`: the null-plan test red;
  - `normalizeHistory` skipped (`history = raw`): the tombstone test red (Sets 7), plus AC-3 and AC-4 "the calls";
  - the bare `catch {}` restored around `balance`: the "not swallowed" test red, plus both missing-target cases (which now pin that `balance` isn't called).
- **Runs.** UF-03 vitest 47/47; web typecheck and lint green; web test 155 files / 2432 tests green; `-w format:check` green; `check:repo` green.

## Accept log
- 2026-10-02, product owner, branch `t/T-0419-uf03-summary-content` at 32ef1e0 (main merged in): **done**.
  - AC-1: `summary.states.test.tsx` "AC-1". The unknown id S9, another user's row, a plan that fails `parseSessionPlan`, and `sessions.get` rejecting each show one wrapper, the `<h1>`, "This workout isn't on this device" and "Go to Today" → `/`. After 50 ms the location is unchanged, with no alert, no banner, no `/balance` link and no unhandled rejection. Each has a contrast case. The loading test pins the first commit to `[H1]` only. The shell tests and the UF-10 never-in-workout test pass with no edit in the full web run, and shell.spec and uf-09-focus e2e pass 26/26. Planted `<Navigate to="/">` went red.
  - AC-2: "AC-2". With `ended_at` null, the screen shows "still running" and "Back to workout" → `/session/S1`, with no Time, Sets, Exercises or rows, no `/balance` link and no `upsertSession` after 50 ms. The pair (S1 ended) is tested. A planted See balance link went red.
  - AC-3: `summary.numbers.test.tsx` "AC-3". The screen shows "52 min", "45 min budget", Exercises 2 and Sets 7, and `isHardSet` returned false for the warm-up set. The pairs are 11:44:59 → "44 min" and the warm-up unflagged → 8. The no-judgement regex has a planted contrast. The planted fault "count every set" went red.
  - AC-4: "AC-4". With a stubbed `balance`, the rows read exactly "Hamstrings 0 → 3 / 16", "Quads 2 → 6 / 20" and "Glutes 1 → 3.5 / 20", with chest left out. On the calls: before has no S1 set, after equals the S1 sets that `normalizeHistory` keeps, and both get `ended_at` and `Europe/Stockholm`. With the real engine, the rows are the changed areas in `after.areas` order, and S0 makes quads' before 4. With zero history, every before reads 0.
  - AC-5: "AC-5". The screen reads "Next up: Calves, Chest". The pair cases read "Every area is on target" and "Next up: Back".
  - AC-6: "AC-6". A cold remount at 2026-10-07 gives an identical snapshot, and the contrast shows the device clock would change quads. The planted `Date.now()` fault went red.
  - AC-7: `summary.isolation.test.tsx` "AC-7". There are 0 `refresh*` calls online and offline, and the numbers equal AC-3's. The OfflineStatus text shows offline and is absent online. With no AuthProvider, the MemoryRouter render shows the numbers. The afterEach asserts no `/functions/v1/` fetch. The UF-09 suite passes unedited. A source scan bans `refresh*(`, `useAuth` and `functions/v1`.
  - AC-8: "AC-8". The ended summary has exactly one `/balance` link, "See balance". It has no `/library`, `/plan` or `/progress` link, no `nav`, no C-01 and no UF-11 card, even though a pending check-in is in the cache (a contrast test proves it is there). `exports-and-lint.test.ts` shows the UF-11 import reports `no-restricted-imports`, with an allowed-import contrast.
  - AC-9: `index.tsx` exports exactly `Summary`. `jsx-no-literals` is green over the feature, with a contrast that fires. Every `en.uf03` key the feature reads exists. Axe finds 0 violations in all three states.
  - D-0147 (status revisit): §1, §2 and the tombstone case are each tested with a pair in `summary.defaults.test.tsx`. Five planted faults went red. §3 (non-finite or negative duration) and §4 (copy) are decided defaults. §4 is covered by the AC-1 link assert. §3 has no direct test (follow-up below).
  - Review: approved on re-review, with all four rule-5 findings closed. Privacy: another user's row is never shown, tested both ways.
  - Principles: 1 holds (the summary is after the workout, its only exit is See balance, and it has no check-in). 3 holds: Sets and Exercises come from `isHardSet` over `normalizeHistory`, the rows and Next up from two `balance` calls at `ended_at`, and the UI derives no engine value. 2, 4 and 5 are not touched. Contracts are unchanged.
  - Follow-up (QA, UF-03 lane, low): a paired test for D-0147 §3, a non-finite `started_at` → not on this device, and a negative duration → "0 min".
