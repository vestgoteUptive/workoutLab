---
id: T-0343
title: "UF-10.1/.2 roll the 14-day window over at local midnight on a mounted Balance screen (cache re-read, no remount, no extra refresh)"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0013, D-0015, D-0071, D-0113, D-0182]
deps: [T-0307a]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main b99a184 (D-0182 §1). Filed by the T-0307a
accept (log: docs/tickets/log/T-0307a.md, AC-A6 row). Build flow: wl-build-web. About ¼ day. -->

## Why
Balance shows the rolling 14 days ending today (engine-rules §3: D−13 … D in the user's time zone).
`useResult` in `features/UF-10/index.tsx` pins `now` once per mount
(`const [mountedAt] = useState(() => new Date())`), on purpose: a fresh `new Date()` per render
looped (the T-0307a `mount-stability` regression). The cost is that a screen left open across
local midnight (a PWA tab left on Balance overnight, then picked up in the morning) keeps
yesterday's window: the header still reads `14–27 Sep`, a set from 13 days ago still counts,
"Last trained N days ago" is a day short, and the attention outline can be wrong. The user sees
stale numbers with no sign they are stale (principle 4: the targets and coverage the user sees
must be the real ones).

## Scope
- In (`apps/web/src/features/UF-10/`):
  - When the screen has **no `now` prop** (the real router path), it checks whether the local
    calendar day in the screen's `timeZone` has changed since its current `now`. Use
    `localDate(iso, timeZone)` from `lib/format/intl.ts` (import only; no change there). It checks:
    - every **60 s**, from a `setInterval` started on mount and cleared on unmount;
    - immediately on `document` `visibilitychange` when `document.visibilityState === "visible"`
      (a backgrounded tab's timers are throttled or frozen, so the interval alone can be hours
      late; D-0182 §1).
  - When the local day **has** changed, the screen's `now` becomes the current instant. That
    changes `useBalance`'s `nowIso`, so its existing cache-read effect recomputes `balance()` from
    the cache and publishes the result. UF-10.1 and UF-10.2 both get it, since both use
    `useResult`.
  - When the day has **not** changed, nothing happens: no state change, no cache read.
  - The `now` prop (the test seam) stays fixed for the life of the mount. No interval, no
    listener.
  - Fold-in from the T-0307a accept: `balance.css`'s header comment still says the attention
    outline is "set inline". It has been set in CSS since the T-0307a review. Fix the comment.
- Out:
  - A second `refreshAll` at the rollover. D-0113 §2 allows one refresh per mount, and the
    rollover is a calendar change, not new server data (D-0182 §1).
  - Any change to `use-balance.ts`'s refresh effect, the 3 s cap, or `lib/**`.
  - Rolling over on Today (UF-02.1) or Plan (UF-11.2). Each lane gets its own ticket if a
    report comes in.
  - e2e. The behaviour is clock-driven, and the unit tests drive the clock directly.

### Edge cases that are in scope
- **Offline:** the rollover recomputes from the cache alone and needs no network (AC-1 runs
  offline).
- **Returning after 10 days off / a tab left in the background overnight:** the
  `visibilitychange` path catches up at once, however many days have passed (AC-3).
- **DST:** `localDate` works on calendar days in `timeZone`, so a 23-hour or 25-hour day rolls at
  local midnight. No new case needed: AC-1 runs in Europe/Stockholm, and the 60 s check does not
  depend on day length.
- **Zero history:** a rollover with no sets keeps nine `0 / target` rows and the empty state.
  Nothing changes, so there is no separate AC.

## Acceptance criteria
Each test title starts with `T-0343 AC-n`. Use the T-0307a fixtures and helpers
(`__tests__/fixtures.ts`, `test-helpers.tsx`: `freshDb`, `seedCache`, `renderBalance`,
`rowValue`, `signIn`), `TZ = "Europe/Stockholm"`, `LOCALE`, default targets, and a real
`lib/offline` cache over fake-indexeddb. Mount with **no `now` prop** but with `timeZone: TZ`.
Fake the clock with `vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })`
(not `setTimeout` and not `setImmediate`, which fake-indexeddb and `waitFor` need), then
`vi.setSystemTime(...)`. The seed is AC-A6's: one back-squat set at `2026-09-14T23:59:00+02:00`.
Unless an AC says otherwise, `navigator.onLine` is `false`.

- **AC-1 (the 60 s tick rolls the window, UF-10.1, red on main)**
  - **Given** the system time is `2026-09-27T23:59:30+02:00`, `/balance` is mounted, and it shows
    quads `1 / 20` and the heading `en.uf10.window("14–27 Sep")`.
  - **When** the clock advances 60 s (`vi.advanceTimersByTime(60_000)`, now
    `2026-09-28T00:00:30+02:00`).
  - **Then**, with no remount:
    - quads reads `0 / 20`;
    - the heading reads `en.uf10.window("15–28 Sep")`;
    - the `<h1>` is the **same DOM node** as before the tick.

  **Red:** on main, the heading still reads `14–27 Sep` after the tick.
- **AC-2 (UF-10.2 follows)**
  - **Given** one Romanian-deadlift set at `2026-09-17T18:00:00+02:00`, the system time at
    `2026-09-27T23:59:30+02:00`, and `/balance/hamstrings` mounted, showing
    `en.uf10.lastTrainedDaysAgo("10")`.
  - **When** the clock advances 60 s.
  - **Then** it shows `en.uf10.lastTrainedDaysAgo("11")`, and the day strip's first cell has
    `data-date="2026-09-15"`.
- **AC-3 (catching up on visibility, the 10-days-away case)**
  - **Given** the AC-1 mount at `2026-09-27T23:59:30+02:00`.
  - **When** the system time is set to `2026-10-07T08:00:00+02:00` **without** advancing timers
    (`vi.setSystemTime`), `document.visibilityState` is stubbed to `"visible"`, and one
    `visibilitychange` event is dispatched on `document`.
  - **Then** the heading reads `en.uf10.window("24 Sep–7 Oct")` (`formatDateRange`'s
    cross-month form, D−13 = 24 Sep) and quads reads `0 / 20`.
  - **And** a `visibilitychange` with `visibilityState` `"hidden"` changes nothing: before the
    visible event, the heading still reads `14–27 Sep`.
- **AC-4 (same day: no work)**
  - **Given** the system time is `2026-09-27T12:00:00+02:00`, `/balance` is mounted and settled,
    and `vi.spyOn(history, "loadTargets")` is installed after the first paint.
  - **When** the clock advances 60 s five times and one visible `visibilitychange` is dispatched.
  - **Then** `loadTargets` was called 0 times.
- **AC-5 (no second refresh, D-0113 §2)**
  - **Given** online and signed in, `refreshAll` mocked to resolve, and the AC-1 mount.
  - **When** the clock rolls past midnight as in AC-1.
  - **Then** after the heading reads `15–28 Sep`, `refreshAll` has been called exactly **once**
    in total (the mount refresh).
- **AC-6 (cleanup)**
  - **Given** an AC-1 mount.
  - **When** it unmounts (`cleanup()`).
  - **Then** `vi.getTimerCount()` is 0. A `visibilitychange` after the unmount logs no React
    warning (spy on `console.error`: 0 calls).
- **AC-7 (the seam stays fixed)** With `now: new Date("2026-09-27T23:59:30+02:00")` passed as a
  prop, advancing 60 s and dispatching a visible `visibilitychange` leaves the heading at
  `14–27 Sep`. `mount-stability.test.tsx` and the AC-A6 tests in `balance.engine.test.tsx` pass
  unedited.

**Red proof.** Run AC-1 and AC-3 on main: both must fail. Then plant two faults, each on a
backup copy, and restore each from the backup with `cp`:
1. Drop the `visibilitychange` listener. AC-3 must fail.
2. Set `now` on every tick, even when the day has not changed. AC-4 must fail.

Record all four runs in the log.

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `docs/tickets/T-0343-uf10-midnight-rollover.md`, for the build and accept logs.

## Contract impact
None. The engine is unchanged; this only changes when the screen calls it.

## Definition of done
- Tests for every AC pass, with the red runs and both planted faults recorded.
- `tests/e2e/uf-10-balance.spec.ts` is green (that one spec, `npx playwright test`, through
  `scripts/locked.sh heavy`, D-0178). The whole e2e suite isn't needed: the diff stays in one
  feature folder.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0343` and cite UF-10.1 / UF-10.2.

## Notes
- **Parallel:** the only UF-10 ticket in flight. Runs alongside T-0472 (UF-03) and T-0443
  (web-shell): no shared files.

## Build / accept log

Built 2026-10-05 from clean `t/T-0343-uf10-midnight-rollover` at d3b749a (status clean).
- Change: `features/UF-10/index.tsx` `useResult` holds `now` in state; with no `now` prop a 60 s `setInterval` and a visible `visibilitychange` call a check that moves `now` only when `localDate(…, timeZone)` differs. Cleanup clears both. `balance.css` header comment fixed (fold-in). `use-balance.ts` untouched.
- Tests: `__tests__/midnight-rollover.test.tsx`, one `T-0343 AC-n` test per AC (AC-1..AC-7, same numbering).
- Red on main (index.tsx stashed): AC-1, AC-2, AC-3, AC-5 fail (4 failed, 3 passed; AC-4/6/7 pass trivially there as no-op ACs).
- Planted fault 1 (visibilitychange listener dropped, restored from backup via `cp`): AC-3 fails.
- Planted fault 2 (`now` set on every tick): AC-4 fails.
- Green with the fix: 7/7.
- Gate: `-w typecheck lint test --concurrency=1` green (19/19 tasks); `-w test:repo-checks` 167 pass/0 fail; `-w format:check` clean; `check-all.mjs` rc 0; `playwright test --config tests/e2e/playwright.config.ts uf-10-balance` 10/10 (a first run without `--config` failed on a missing baseURL, not a code fault).
