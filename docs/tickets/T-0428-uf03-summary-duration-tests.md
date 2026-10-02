---
id: T-0428
title: "UF-03.3: paired tests for D-0147 §3, a non-finite duration is 'isn't on this device' and a negative duration reads '0 min'"
lane: web-feature:UF-03
screens: [UF-03.3]
decisions: [D-0147, D-0142]
deps: [T-0419]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. From the T-0419 accept log: D-0147 §3 was built but has no direct test. Build flow: wl-build-web. About ⅛ day, test-only. T-0419 is done, so this is ready now. It writes a new test file so it doesn't collide with T-0420 in the same lane. -->

## Why
- **D-0147 §3:** a session row whose `ended_at − started_at` isn't a finite number is unreadable and shows "This workout isn't on this device". A negative duration reads "0 min".
- T-0419 implements both in `features/UF-03/summary-data.ts` (`Number.isFinite(durationMs)` and `Math.max(0, Math.floor(...))`), but no test pins them. Deleting either line leaves the suite green.
- **Principle 3:** the Time figure is a field of the stored row, so a corrupt or clock-skewed row must never show "NaN min" or "-1 min".

## Scope
- In:
  - A new `apps/web/src/features/UF-03/__tests__/summary.duration.test.tsx`, built on the existing `helpers.tsx`, `fixtures.ts` and `mocks.ts` (`freshDb`, `signIn`, `seedAll`, `renderSummary`, `waitReal`).
  - If a test exposes a real defect, the fix in `summary-data.ts` (record it in the build log).
- Out:
  - Any change to D-0147's visible behaviour or copy.
  - Effort and Save (T-0420), the List view (T-0416–T-0418).
  - Edits to the existing UF-03 test files.

### Edge cases that are in scope
- **Clock skew:** a device clock moved back during a workout gives `ended_at` before `started_at`. The server check `sessions_ended_after_started` forbids that row, but the device queue can hold it (AC-2).
- **Corrupt row:** an unparsable timestamp in IndexedDB (AC-1).
- **Offline:** every case reads IndexedDB only, the same as T-0419 AC-7.

## Acceptance criteria
**Test setup.** The T-0419 setup: tz `Europe/Stockholm`, `locale="en-GB"`, now `2026-09-27T12:00:00+02:00`, library L1, the nine default targets, S1's plan and queued sets from `fixtures.ts`. S1 rows are seeded directly in `offlineDb().sessions` (with `as never` where the type forbids the value). Every test installs a `process.on("unhandledRejection")` probe and asserts it saw nothing.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms (`waitReal`). The code on main already passes these tests, so the build log records each planted fault below turning its ACs red, applied alone to `summary-data.ts` and reverted:
- the `if (!Number.isFinite(durationMs)) return NOT_ON_DEVICE;` line removed (AC-1 red for the bad `started_at` case: the screen shows "NaN min"). The bad `ended_at` case may stay green under this fault, because `balance` at an unparsable `now` can throw into the outer catch. The build log says which it did;
- `Math.max(0, …)` removed from `minutes` (AC-2 red: "-5 min" and "-1 min");
- `Math.floor` swapped for `Math.ceil` (AC-3 red: 52 min 59 s reads "53 min", and the AC-1 pair reads "53 min").

- **AC-1 (non-finite is "isn't on this device", D-0147 §3)**
  - **Bad `started_at`.** Given S1 with `started_at: "not-a-date"` and `ended_at` `2026-09-27T09:52:40.000Z`, When `/session/S1/summary` mounts, Then exactly one `[data-screen-id="UF-03.3"]` shows "This workout isn't on this device" and a "Go to Today" link with `href="/"`. After 50 ms there is no "min" text, no Sets or Exercises figure, no `a[href^="/balance"]`, the location is still `/session/S1/summary`, and the probe saw nothing.
  - **Bad `ended_at`.** The same with `started_at` valid and `ended_at: "not-a-date"` (a non-null string, so it isn't the still-running state) gives the same screen.
  - **The pair.** With both timestamps valid (`STARTED_AT`, `ENDED_AT`), the ended summary shows "52 min" and "45 min budget".
- **AC-2 (negative reads "0 min", D-0147 §3)**
  - Given S1 with `started_at` `2026-09-27T09:52:40.000Z` and `ended_at` `2026-09-27T09:47:40.000Z` (−5 min), the ended summary shows "0 min" and "45 min budget", plus the Exercises and Sets figures and one "See balance" link. The text contains no "-" next to "min" and no "NaN".
  - **Just below zero.** With `ended_at` 30 s before `started_at`, it shows "0 min".
  - **The pair.** With `ended_at` 59 s after `started_at` it shows "0 min", and with `ENDED_AT` (52 min 40 s) it shows "52 min".
- **AC-3 (zero and the floor)** With `ended_at` equal to `started_at` it shows "0 min". With `ended_at` 52 min 59 s after `started_at` it shows "52 min" (rounded down). This is the pair that catches a `ceil` swap.
- **AC-4 (nothing else moves)** All existing UF-03 tests pass with no edit, and `features/UF-03/index.tsx` still exports exactly `Summary` (the T-0419 AC-9 pin).

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`), in practice the new `__tests__/summary.duration.test.tsx`.
- **Listed extras:**
  - `docs/tickets/T-0428-uf03-summary-duration-tests.md`: this file, for the build and accept logs.
- Read-only: `.squad/decisions/D-0147-uf03-summary-build-defaults.md`, `lib/offline`, `lib/i18n/flows/uf-03.ts`.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0428` and cite the screen (for example `T-0428 UF-03.3: pin the D-0147 §3 duration rules`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** safe with T-0324, T-0416 and every UF-05 and UF-09 ticket. It shares the UF-03 lane with T-0420 but only adds a new test file. Run it before or after T-0420, never in the same worktree.

## Build log
- 2026-10-02 frontend-dev: added `apps/web/src/features/UF-03/__tests__/summary.duration.test.tsx` (9 tests: AC-1 ×3, AC-2 ×4, AC-3 ×2), built on `helpers.tsx`/`fixtures.ts`/`mocks.ts`. S1 is seeded with `seedAll`, then its row is rewritten in `offlineDb().sessions` with the case's `started_at`/`ended_at` (`as never`). Every test checks the `unhandledRejection` probe, both inside the test and in `afterEach`. Negative checks wait 50 ms (`waitReal`). No src change: main already passes, so no defect was found. Existing UF-03 files are unedited; AC-4 is covered by the untouched suite (56/56 green, including `exports-and-lint` "exports exactly Summary").
- Planted faults, each applied alone to `summary-data.ts` and reverted (`git checkout`), running the new file:
  - `if (!Number.isFinite(durationMs)) return NOT_ON_DEVICE;` removed: 1 red / 8 green. AC-1 bad `started_at` is red, and the screen shows "NaN min" in `[data-part="time"]`. **AC-1 bad `ended_at` stayed green:** `balance` at the unparsable `now` throws into the outer catch, which still gives "isn't on this device".
  - `Math.max(0, …)` removed: 2 red. AC-2 −5 min shows "Time-5 min" and AC-2 −30 s shows "Time-1 min", both caught by the no "-N min" check.
  - `Math.floor` → `Math.ceil`: 4 red. The AC-1 pair and the AC-2 ENDED_AT pair read "53 min", AC-2 +59 s reads "1 min", and AC-3 52 min 59 s reads "53 min".
