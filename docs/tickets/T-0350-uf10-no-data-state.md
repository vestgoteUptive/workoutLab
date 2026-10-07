---
id: T-0350
title: "UF-10.1/UF-10.2: with no cached balance and no way to load one, show a no-data line instead of an endless loading skeleton"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0197, D-0071, D-0113, D-0013]
deps: [T-0307a]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48 (T-0307a QA follow-up). D-0197 §3
sets the behaviour and copy. Build flow: wl-build-web. About ¼ day. -->

## Why
`useBalance` (`apps/web/src/features/UF-10/use-balance.ts`) returns `result: null` while the cache
holds no targets, and the screen passes `loading={result === null}` to C-01. If the device has no
cached targets and no refresh can fill them (offline on a fresh device, the browser evicted
storage while the user was away for ten days, the refresh failed), the body map stays a loading
skeleton forever and the user is never told why. D-0197 §3: show one line that says so.

## Scope
- In: `useBalance` also reports whether it has finished trying, for example `settled: boolean`:
  `true` once the first cache read has settled **and** either no refresh will run (offline, or not
  `signed-in`, per D-0113) or the refresh has settled or hit `REFRESH_TIMEOUT_MS` and the cache has
  been re-read.
- In: when `result === null && settled`, UF-10.1 and UF-10.2 render
  `<p role="status">` with `en.uf10.noData` ("No balance on this device yet. Connect to the internet
  to load it.") in place of the C-01 skeleton, and no area rows. The header and the UF-10.1 "Plan"
  link stay.
- In: the string goes in `lib/i18n/flows/uf-10.ts`.
- Out: retrying when the device comes back online on a mounted screen. D-0113 allows one refresh
  per mount; leaving and re-opening the tab retries. Note it in the log if the builder sees a cheap
  way, but don't build it here.
- Out: the "nothing logged in 14 days" empty state (`emptyState`), which needs targets and stays as is.

### Edge cases in scope
Offline, zero history on a new device, returning after 10 days off with an evicted cache.

## Acceptance criteria
Tests in `apps/web/src/features/UF-10/__tests__/`, with an empty fake-indexeddb cache.
- **AC-1 (offline, no cache)** Given a signed-in user, `navigator.onLine === false` and no cached
  targets, when `/balance` mounts, then after the first cache read settles UF-10.1 shows a
  `role="status"` element with the exact `en.uf10.noData` text, C-01 is not in its loading state,
  there are no area rows, and `refreshAll` was not called. **Red on main:** the skeleton stays.
- **AC-2 (online, refresh leaves the cache empty)** Given online and signed in with no cached
  targets, and a `refreshAll` that never settles, when `/balance` mounts and fake time passes
  `REFRESH_TIMEOUT_MS` (3000 ms), then the no-data line shows. At 2999 ms it does not.
- **AC-3 (online, refresh fills the cache: the other value)** Given online and signed in with no
  cached targets, and a `refreshAll` that writes nine targets, when it resolves, then nine area
  rows render and the no-data line is absent.
- **AC-4 (no flash)** Given a cache read that has not settled yet, then neither the no-data line
  nor area rows render; C-01 is in its loading state.
- **AC-5 (UF-10.2)** AC-1's setup on `/balance/chest`: UF-10.2 shows the same no-data line and no
  contributor list.
- **AC-6 (cached data unchanged)** Given cached targets and offline, then nine rows render and no
  no-data line (no regression).
- **AC-7 (copy)** `en.uf10.noData` is the exact D-0197 §3 string (pin it in `strings.test.ts`).

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-10.ts`: add the `noData` key only.
  - `docs/tickets/T-0350-uf10-no-data-state.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, each red on main or on a planted fault (record which) · `pnpm -w typecheck
lint test` green plus `-w test:repo-checks` · the UF-10 e2e spec green · commits start with `T-0350`
and cite UF-10.1/UF-10.2.

## Build / accept log

### Build log (2026-10-07, wl-build-web)
- Start: clean, HEAD ec3c73a. `useBalance` now returns `settled` (first cache read done and either no refresh will run, or the refresh and its cache re-read are done). UF-10.1 renders `<p role="status">` with `en.uf10.noData` instead of C-01 when `result === null && settled`; UF-10.2 renders it under the h1. String added to `flows/uf-10.ts`.
- AC to test (`__tests__/no-data.test.tsx`, AC-7 in `strings.test.ts`): AC-1..AC-6 one test each (AC-2 uses fake setTimeout, 2999 vs 3000 ms).
- Planted faults (backup copy restored via cp): `settled: false` fails AC-1, AC-2, AC-5 (that is main's behaviour); `settled: true` fails AC-2, AC-4; `settled = firstReadDone` fails AC-2; UF-10.2 line removed fails AC-5. AC-3 and AC-6 are the other-value/no-regression checks (green on main by design). AC-7 is a string pin.
- Retry on reconnect not built (out of scope; a cheap path would be an `online` listener that resets `started`, but D-0113 says once per mount).
- Gate: `-w typecheck lint test` green except one load-flaky `never-in-workout` AC-A12 (/session/S1, 1.2 s timeout under heavy load; passes alone and in a re-run of the UF-10 folder minus load, also passes on stash); test:repo-checks 311/311, format:check, check-all green; `uf-10-balance.spec.ts` e2e 10/10.
