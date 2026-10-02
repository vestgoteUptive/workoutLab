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

## Build / accept log
Archived in `docs/tickets/log/T-0419.md` (D-0157).
