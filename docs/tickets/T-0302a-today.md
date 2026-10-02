---
id: T-0302a
title: UF-02.1 Today frame — header and date, compact C-01 as one link to /balance from the on-device balance(), the attention line, the check-in slot, zero-history and no-profile states, Start → UF-08.1, offline cold start
lane: web-feature:UF-02
screens: [UF-02.1]
decisions: [D-0002, D-0003, D-0045, D-0060, D-0063, D-0065, D-0071, D-0086, D-0091, D-0103, D-0104, D-0106, D-0108]
deps: [T-0300, T-0203b, T-0318]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0302-today-and-preview.md, re-split by D-0106: the suggestion card and lib/i18n/workout.ts move to T-0302c. Build flow: wl-build-web. About ½ day. Runs in parallel with T-0303a (D-0108: no shared file). -->

## Why
UF-02.1 is the daily entry point (PRD). It shows what's under target in the rolling 14 days, and a Start button that always goes through the time question on UF-08.1 (principle 2). The numbers come only from `balance()` in `@workoutlab/engine` on the device, over the `lib/offline` cache plus the queue (principle 3, D-0071 §8). The compact C-01 is fed only from `BalanceResult.areas` and is one link to `/balance` (D-0045 §4, D-0060). The screen must cold-start offline (NFR-OFF-1). This ticket builds the frame: everything on UF-02.1 except the 45-min suggestion card, which is T-0302c.

## Scope
- In:
  - `features/UF-02/Today.tsx`, replacing the T-0300a stub in `features/UF-02/index.tsx`. `index.tsx` exports exactly `Today`.
  - A data hook in `features/UF-02/`, following the `features/UF-10/use-balance.ts` pattern but written in UF-02, because UF-02 can't deep-import UF-10:
    - a cache read through `loadEngineHistory`, `loadTargets`, `loadLibrary`, `loadProfile` and `lastSyncedAt`;
    - `balance(history, targets, library, now, tz)` once per cache read;
    - when online, one `refreshAll(now, tz)` per mount, capped at 3 s, then a recompute.
  - Header: `<h1>` = `en.screens.today`, a date line in the device locale and tz, and `<OfflineStatus variant="text">`.
  - The compact `<BodyMap>` from `components/body-map`.
  - The attention line.
  - `features/UF-02/slots.tsx` (D-0071 §4), rendered in its D-0071 §4 position.
  - "No workouts yet. Start your first one." and "Nothing logged in the last 14 days. Start a workout to pick up again." (AC-7 says which line shows when).
  - The no-profile state.
  - The primary Start link → `/session/setup`.
  - The e2e spec `tests/e2e/uf-02-today.spec.ts` (new; T-0302c and T-0302b append).
  - Strings in `lib/i18n/flows/uf-02.ts`.
- Out:
  - The suggestion card, any `suggest()` call, "See all", and `lib/i18n/workout.ts` (T-0302c, D-0106).
  - UF-02.2 (T-0302b).
  - UF-11.1 content (T-0308c fills the slot).
  - Split names, greeting, week counter, "This week"/"Latest PR" (D-0065 §1).
  - Any change to C-01, `lib/offline`, `routes.ts`, `en.ts`, `tests/e2e/fixtures/**` (D-0108 §2) or the shell tests (D-0108 §3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** a cold start offline renders from IndexedDB with "Offline · last synced HH:MM" (AC-9, AC-11). Queued sets count (AC-3). Start still works, because UF-08 is offline-capable.
- **Time running out:** Start is always one tap to UF-08.1 and never starts a session itself (AC-6).
- **Zero history:** the tiles read 0 / target, and "No workouts yet" shows. Rule 5 gives no attention areas here (R5-E4) (AC-7).
- **Only older sets** (a history, but nothing in the window): the "Nothing logged in the last 14 days" line shows, so the screen is never blank above Start (AC-7).
- **Returning after 10 days off:** the R5-E1 history gives "Needs attention: Chest, Back, Shoulders +6 more" (AC-4).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library in `apps/web/src/features/UF-02/__tests__/`. `lib/offline` loaders are mocked unless an AC says "real", in which case it uses `fake-indexeddb`, already global in `vitest.setup.ts`.
- `now`, `locale` and `timeZone` are injected props on `Today`. They pass through to the date line, `balance(…, tz)`, `OfflineStatus` (`locale`, `timeZone`) and `refreshAll(now, tz)`.
- **The defaults must not depend on `navigator` beyond `onLine`.** `auth-guard.test.tsx` stubs `navigator` as `{onLine}` only.
  - `now` defaults to `new Date()`.
  - `timeZone` defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `locale` defaults to `"en-GB"`, the `OfflineStatus` default. It may read `navigator.language` only behind a `typeof navigator.language === "string"` guard, and never reads `navigator.languages`.
  - A test renders `Today` with `navigator` stubbed as `{onLine: true}` and asserts no throw and the en-GB date line.
- Fixtures:
  - **F-tz**: `now = 2026-09-27T12:00:00+02:00`, `Europe/Stockholm`, en-GB.
  - **F-targets**: `docs/engine-rules.md` §0.
- The library is the L1 table, as a web fixture copy in `features/UF-02/__tests__/fixtures.ts`.

**Test rules** (state.md traps):
- **Both values of every binary condition get a test.** Each AC names its pair.
- **Waiting for a negative.** A negative timing assert waits a real 50 ms macrotask (`await new Promise(r => setTimeout(r, 50))`), never a microtask flush.
- **Timing ACs must fail on unfixed code.** The build log records a planted fault that turns the test red.
- **Positive asserts on lazy content wait.** This covers anything rendered through `Shell` or the lazy slot: use `findBy…` or `waitFor` (D-0103 §1).

- **AC-1 (frame and date, first commit)**
  - With every loader a never-resolving promise, the synchronous assert straight after `render`:
    - finds `[data-screen-id="UF-02.1"]` as the only `[data-screen-id]`;
    - finds an `<h1>` with the text `en.screens.today`;
    - finds the date line equal to `new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Stockholm"}).format(now)`, which contains "Sunday" and "27 September".
  - The other side of the tz boundary: `now = 2026-09-27T22:30:00Z` (00:30 on Monday in Stockholm) gives a line containing "Monday" and "28 September".
- **AC-2 (C-01 compact, D-0045 §4, D-0060, principle 3)**
  - **Props.** Given a `BalanceResult` (loaders mocked, `balance` spied), `<BodyMap variant="compact">` receives `areas` reference-equal to `result.areas` and `loading` false.
  - **Links.** UF-02.1 has exactly one link with the accessible name `en.bodyMap.compactLink` and `href="/balance"`. No element inside it is focusable on its own.
  - **Navigation.** Clicking it in a `MemoryRouter` with a location probe lands on `/balance`.
  - **Source test.** `features/UF-02/**`, excluding `__tests__`, contains no `coverageStep` or `needsAttention` computation: no `load /`, `/ target` or `deficit >` arithmetic. `needsAttention` may only be read, as a property.
- **AC-3 (real balance with queued sets, principle 3, NFR-OFF-3)**
  - **Setup.** The real `@workoutlab/engine` and the real `loadEngineHistory`. Given 4 cached hard romanian-deadlift sets on 2026-09-20 and 3 queued ones on 2026-09-26, written through `recordSet` with the `lib/offline` test helpers.
  - **Result.** The hamstrings tile reads "7 / 16" and the glutes tile "3.5 / 20" (R11-E4 pattern). The same seed without the 3 queued sets reads "4 / 16" and "2 / 20".
  - **Call count.** `balance` is called exactly once per cache read.
  - **No server calls.** A `fetch` spy sees no request to `/functions/v1/` (no `GET /balance`, no `POST /workouts/suggest`, D-0071 §8).
- **AC-4 (attention line, returning after 10 days off)**
  - **R5-E1.** Given the R5-E1 history (4 RDL sets on 09-17 only) at F-tz, the line reads "Needs attention: Chest, Back, Shoulders +6 more". The names are the first 3 `needsAttention` areas in `result.areas` order, and "+6 more" is a link to `/balance`.
  - **Counts.**
    - A stubbed result with exactly 2 attention areas (back, then chest in `areas` order) reads "Needs attention: Back, Chest" with no "more" link. Order is the engine's, not alphabetical.
    - With 4 attention areas, the line ends "+1 more".
    - With 0, there is no attention line.
- **AC-5 (check-in slot, D-0071 §4)**
  - **The slot is empty in this ticket.** `features/UF-02/slots.tsx` exports `todayCheckinSlot` (`ComponentType | null`), and a test pins it to `null`.
  - **Injected.** With `vi.mock("../slots.js", …)` injecting a test component, it renders exactly once, inside a `Suspense` with a `null` fallback:
    - after the C-01 region and the attention line, in DOM order;
    - right after C-01 when there is no attention line;
    - before the no-workouts line and Start.
  - **Null.** With `null`, nothing renders between the attention line and Start: no wrapper element and no empty margin box.
  - **Lazy.** A lazy injected component that never resolves still lets AC-1's h1 and Start render.
  - **Import ban.** A source test finds no import of `features/UF-11` in `features/UF-02/**`.
- **AC-6 (Start → UF-08.1, principle 2)**
  - **Ready state.** The primary action is a link with the accessible name "Start workout" and `href="/session/setup"`. Clicking it lands on `/session/setup` (location probe).
  - **Offline.** It is present and enabled with `navigator.onLine` false too.
  - **Never starts a session.** The screen never calls `upsertSession` (spy, 0 calls).
- **AC-7 (zero history, an empty window, and which line shows)** Exactly one of these three conditions decides the line above Start. Each is read from engine output or engine helpers, with no UI arithmetic:
  - **The attention line** shows iff at least one `result.areas[i].needsAttention` is true (rule 5).
  - **"No workouts yet. Start your first one."** shows iff the loaded history has no hard set at all: `history.some(isHardSet)` is false, using `isHardSet` from `@workoutlab/engine`.
  - **"Nothing logged in the last 14 days. Start a workout to pick up again."** shows iff the history has a hard set, but every `result.areas[i].load` is 0 (the window is empty).

  Rule 5 sets `needsAttention` false for every area when the window holds no hard set (R5-E4). So without the second and third lines, both of these cases would show nothing. Tests, with the real engine, F-targets and a profile:
  - **Empty history.** All 9 tiles read "0 / <target>" (chest "0 / 20", calves "0 / 12"). "No workouts yet. Start your first one." shows directly above Start. There is no attention line and no "Nothing logged…" line.
  - **Only older sets.** Given 4 hard RDL sets on 2026-09-01 only (before the window 09-14…09-27), all tiles read 0. "Nothing logged in the last 14 days. Start a workout to pick up again." shows directly above Start. There is no attention line and no "No workouts yet" line.
  - **R5-E1** (4 RDL sets on 09-17, inside the window). The attention line shows, and neither of the other two lines does.
  - **A balanced history** (no area `needsAttention`, some load > 0). None of the three lines shows. This is the only state with no line, and it is AC-4's 0-attention case.
- **AC-8 (loading and refresh, D-0071 §8, D-0104)**
  - **Loading.** Before the loaders resolve, C-01 renders with `loading` true (its `aria-busy`), and there is no attention line and no no-workouts line.
  - **Online.** `refreshAll` is called exactly once per mount. After it resolves, `balance` runs once more, and the tiles show the refreshed cache (a loader mock that returns new rows on its second call).
  - **Offline.** `refreshAll` isn't called (0 calls after a 50 ms macrotask).
  - **The cap: recompute after the refresh resolves or after 3 s, whichever comes first (parent AC-A7).** With `refreshAll` never resolving (fake timers):
    - The cached render is on screen before 3 000 ms. At 2 999 ms there is exactly 1 `balance` call and 1 read of each loader.
    - Advancing to 3 000 ms gives exactly one more `balance` call (count 1 → 2) over a second cache read (loader mock counts 1 → 2).
    - Another 10 000 ms adds no call.
    - Each of two planted faults must turn this test red: (a) "await `refreshAll` without the cap", which gives no second call at 3 000 ms; (b) "the cap fires but skips the recompute", which also gives no second call.
  - **Rejected refresh.** It keeps the cached render, with no `role="alert"` and no unhandled rejection (a `process.on("unhandledRejection")` spy has 0 calls).
- **AC-9 (offline status)** With `navigator.onLine` false and `lastSyncedAt` "2026-09-27T08:15:00Z", the header shows "Offline · last synced 10:15". With `lastSyncedAt` null, it shows "Offline · not synced yet". Online, neither text is in the DOM.
- **AC-10 (no profile or targets)**
  - **Missing data.** Given `loadProfile()` null (one test), or 8 targets (another test), the screen shows "Connect to finish setting up your plan". There is no C-01, no attention line and no Start, and `balance` has 0 calls.
  - **Recovery.** Online, a `refreshAll` that fills the profile and 9 targets brings back the normal render (C-01 present, `balance` called once).
  - **Present.** Profile + 9 targets: the message is absent.
  - **Rejecting loader.** A rejecting `loadTargets` gives the same message with no uncaught error.
- **AC-11 (offline cold start, e2e, NFR-OFF-1, OFF-6, AN-1, D-0091 §1, D-0108)** In `tests/e2e/uf-02-today.spec.ts`, which imports `test`/`expect` from `fixtures/guarded-test.js`:
  - **Seed.**
    - Signed in, with `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData` and `mockProfilePresent`.
    - 9 targets at 10.
    - 2 exercises, both with `equipment: []`: one compound with `exercise_areas` quads 1.0, one isolation with chest 1.0. Because both match the default `mockProfilePresent` row (`equipment: []`), T-0302c AC-9 can reuse this seed and get a non-empty plan.
    - 5 hard quads sets (reps 8, weight 60) with `completed_at = Date.now() − 2 days`. No fixed calendar date.
  - **Online.** After one online load, the spec waits for the history and library caches and the precache, as `offline.spec.ts` does. It then goes offline and reloads `/`.
  - **Offline.** Within 3 s, `[data-screen-id="UF-02.1"]` is visible and the text matches `/^Offline · last synced \d{1,2}:\d{2}/`. 9 C-01 tiles are visible, the quads tile reads "5 / 10" and the chest tile "0 / 10" (built content). The attention line is visible and starts "Needs attention:".
  - **Requests.** Every request during the run goes to the preview origin or the mocked Supabase origin (NFR-AN-1), and the guard reports no unclaimed request.
- **AC-12 (a11y and perf, e2e)**
  - **axe.** axe on `/` (the AC-11 seed, online) reports 0 serious or critical violations (NFR-A11Y-1).
  - **Size.** Start and the C-01 link each measure ≥ 44 × 44 px (`boundingBox`, NFR-A11Y-2).
  - **Bundle.** `check:size` is green after a fresh build. The UF-02 chunk is ≤ 100 KB gzip (NFR-PERF-2).
  - **First paint (jsdom).** The `balance` spy records that the h1 was already in the DOM when it was first called.
- **AC-13 (strings, exports, lint)**
  - **Strings.** Every UF-02.1 string comes from `en.uf02`. The area names come from `en.bodyMap.areas` and the offline text from `OfflineStatus`. A source test pins `Today.tsx`'s catalogue reads to `en.uf02`, `en.screens.today` and `en.bodyMap`.
  - **Lint.** `react/jsx-no-literals` is green, and `en.ts` is unchanged.
  - **Flow file shape.** `flows/uf-02.ts` keeps the D-0075 multi-line `export const uf02 = {…} as const;` shape, so `flows.test.ts` passes unchanged.
  - **Exports.** A test pins `Object.keys` of `features/UF-02/index.tsx` to `["Today"]`.
- **AC-14 (shell tests unchanged, D-0108 §3)**
  - **Byte-identical.** `git diff main...HEAD` lists no file under `apps/web/src/app/**`, `tests/e2e/fixtures/**`, or `tests/e2e/{offline,auth,shell}.spec.ts`.
  - **Green.** Those files' tests pass in the DoD run. The relevant cases are App.test `/` → UF-02.1, auth-guard "stale + offline renders UF-02.1", the profile-gate `/` cases, and offline.spec AC-C20.

## Paths you may change
- `apps/web/src/features/UF-02/**` (the lane: `web-feature:UF-02`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-02.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-02-today.spec.ts`: new, this ticket's e2e spec (D-0071 §10); T-0302c and T-0302b append later.
  - `docs/tickets/T-0302a-today.md`: this file, for the accept log.
- Read-only imports (not grants): `components/body-map`, `components/offline-status`, `lib/offline`, `lib/format`, `lib/i18n/en.ts`, `@workoutlab/engine`, `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The screen only renders `BalanceResult` (`api/openapi.yaml`) from the on-device engine.

## NFRs owned
OFF-1 and OFF-6 on UF-02.1 (AC-9, AC-11), AN-1 (AC-11), PERF-2 for the UF-02 chunk (AC-12), and A11Y-1/2/3 on UF-02.1 (AC-2, AC-12).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite, not only the new spec) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0302a` and cite UF-02.1 (for example `T-0302a UF-02.1: attention line from balance()`).

## Notes
- **Flow:** `wl-build-web`. Parallel-safe with T-0303a (D-0108 §1). Don't run it at the same time as another ticket that runs the `profile-gate.test.tsx` suite in its own worktree on this machine (state.md: one vitest per machine).
- **Board (orchestrator):** this row loses "lib/i18n/workout.ts formatters" (D-0106 §6). It keeps "features/UF-02/slots.tsx (todayCheckinSlot)".

## Build log (frontend-dev, 2026-10-02)
- **AC-8 cap, planted faults.** Both were run with `vitest -t "the cap"` against `features/UF-02/use-today.ts` and then reverted:
  - (a) awaiting `refreshAll` without the cap (`refreshAll(…).then(noop, noop)` in place of `settledOrCapped(…)`) failed with "expected vi.fn() to be called 2 times, but got 1 times".
  - (b) a cap that fires but returns before the recompute (a `capped` flag checked after `await refreshed`) failed the same way.
  - The fixed code passes.
- **AC-14.** `profile-gate.test.tsx` "stale + `missing` on `/` redirects to /welcome/save" goes red, because Today's mount-time refresh adds a second `profiles` read. Raised as TR-0034 and not edited (D-0108 §3).
