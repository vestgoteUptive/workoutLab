---
id: T-0394
title: "UF-09 Back means Pause: a same-URL history guard turns Back in a running machine state into UF-09.9; Back while paused leaves; Back closes a seam overlay; tighten the T-0303d Back row"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.1, UF-09.2, UF-09.3, UF-09.4, UF-09.5, UF-09.6, UF-09.7, UF-09.8]
decisions: [D-0066, D-0071, D-0086, D-0091, D-0103, D-0108, D-0110, D-0111, D-0123]
deps: [T-0304d, T-0303d]
status: todo
---
<!-- Written 2026-10-02 by triage (TR-0038, D-0123 §3). Build flow: wl-build-web. About ¼ day. Runs after T-0304d (same lane; T-0304d builds the real UF-09.9 and End). -->

## Why
Principle 1: during a workout everything other than the current step lives behind Pause (UF-09.9). Today a Back (the browser button, or the Android system Back in the standalone PWA) leaves focus mode silently and lands on UF-08.1, where Start makes a second session (TR-0038). D-0123 §3 makes Back mean Pause while a machine state is running, so leaving a workout is always a decision taken on UF-09.9.

## Scope
- In (all in `apps/web/src/features/UF-09/`, plus the listed extras):
  - **The guard** (D-0123 §3), for example `back-guard.ts` used by `SessionHost`:
    - When a machine state first renders, push one guard entry with the same URL: `history.pushState({...history.state, wlFocusGuard: true}, "", location.href)`. Push at most once while the guard entry is on top.
    - On `popstate` landing on `/session/<id>` with no `wlFocusGuard` in `history.state`:
      - in UF-09.1–UF-09.8 (not `paused`): dispatch `PAUSE` (with `atMs`), and push the guard again;
      - with a seam overlay open: close the overlay to UF-09.9, and push the guard again;
      - in `paused` with no overlay: do nothing (the Back already moved off the guard; the next Back leaves normally).
    - Host-level states (loading, not on this device, ended, stale, `done`) never push a guard.
    - App navigations away from `/session/<id>` (End → `/session/<id>/summary`, the "not on this device" / "ended" / "stale" links to `/`) use `replace: true` when the guard entry is on top.
    - The listener is removed on unmount. No `useBlocker` and no edit to `apps/web/src/app/**` (D-0123 §3).
  - **e2e** rows appended to `tests/e2e/uf-09-focus.spec.ts`.
  - **The T-0303d Back row** in `tests/e2e/uf-08-setup.spec.ts`, tightened as AC-6 says.
- Out:
  - A "Resume workout" entry on Today or UF-08.1, and any in-progress guard on UF-08.1 (D-0123 §4–§5, a product follow-up).
  - A confirm dialog on leaving.
  - Any change to `features/UF-08/**`, `lib/offline/**`, `routes.ts`, `App.tsx`, `components/**`, `tests/e2e/fixtures/**` or the shell tests.
  - Any contract change.

## Acceptance criteria
**Test setup.** Vitest + Testing Library in `apps/web/src/features/UF-09/__tests__/`, with the T-0304a/e fixtures (real `upsertSession` over `fake-indexeddb`, signed-in user stubbed through the supabase-js `localStorage` key). These tests mount `SessionHost` under a real `BrowserRouter` over jsdom's `window.history` (not MemoryRouter), starting from `history` = `["/", "/session/setup", "/session/<id>"]`. Back is `window.history.back()` followed by waiting for the `popstate`. Negative asserts wait a real 50 ms macrotask. Both values of every binary condition get a test.

- **AC-1 (the guard is armed)**
  - **Machine state.** After the host renders UF-09.1, `history.length` grew by exactly 1, `history.state.wlFocusGuard` is `true`, and `location.pathname` is `/session/<id>`.
  - **Once.** After 3 transitions (UF-09.1 → UF-09.3 → UF-09.4 → UF-09.5), `history.length` is unchanged from the line above.
  - **Host-level, the pair.** For each of "not on this device", "ended", "stale" and loading, `history.length` is unchanged and `history.state?.wlFocusGuard` is not `true` after 50 ms.
- **AC-2 (Back in a running state means Pause)**
  - For each of UF-09.1, UF-09.3, UF-09.5 and UF-09.6 (one test each, reached through the real events): Back shows `[data-screen-id="UF-09.9"]`, the location is still `/session/<id>`, and the guard is armed again (`history.state.wlFocusGuard === true`).
  - **Same as the button.** The stored `wl-focus:<id>` after a Back equals, apart from `atMs`-derived fields, the value after pressing "Pause workout" in the same state (`phase: "paused"`, `resumePhase` set, `pausedAtMs` set).
  - **The rest timer stops.** Back in UF-09.5 at 90 s left, then 60 s of fake time, then Resume shows 90 s left.
- **AC-3 (Back while paused leaves)**
  - From UF-09.9 reached by "Pause workout": Back moves the location off `/session/<id>` (to `/session/setup`), and `wl-focus:<id>` is still stored.
  - **The pair.** From UF-09.9 reached by a Back (AC-2): one more Back leaves the same way; it doesn't pause again or push a guard.
- **AC-4 (a seam overlay)** With a test entry injected into `pauseSeamActions` (T-0304e's mechanism), opening it from UF-09.9 and pressing Back closes the overlay, shows UF-09.9, and re-arms the guard. A second Back leaves (AC-3).
- **AC-5 (leaving by the app's own navigation)**
  - **End.** End workout → confirm → `/session/<id>/summary`, and `history.length` is unchanged by that navigation (a REPLACE on the guard entry; `useNavigationType()` === "REPLACE" on the summary route).
  - **Unmount.** After the host unmounts, a `popstate` dispatches nothing (store spy unchanged after 50 ms) and no listener is left (`removeEventListener` called with the same handler).
- **AC-6 (e2e, D-0086, D-0091 §1)** Rows appended to `tests/e2e/uf-09-focus.spec.ts`, with no fixture edits:
  - **Start → Back.** `/` → "Start workout" → UF-08.1 → Suggest → Looks good → Start → (tap once in focus mode) → `page.goBack()`: `[data-screen-id="UF-09.9"]` is visible and the URL still matches `/session/<uuid>`.
  - **Back twice leaves.** One more `page.goBack()`: the URL no longer matches `/session/<uuid>`, and `[data-screen-id="UF-08.4"]` is not in the DOM.
  - **Offline the same.** The Start → Back row passes with the context offline.
  - **The T-0303d row.** In `tests/e2e/uf-08-setup.spec.ts`, the D-0123 §2 "Back after Start" row is tightened to: after Start, `page.goBack()` shows `[data-screen-id="UF-09.9"]` and the URL stays `/session/<uuid>`.
- **AC-7 (lint and shell tests)** `react/jsx-no-literals` and the D-0071 §9 import bans are green. `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `apps/web/src/features/UF-08/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: add keys only, if any string is needed.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows.
  - `tests/e2e/uf-08-setup.spec.ts`: only the T-0303d "Back after Start" row (AC-6).
  - `docs/tickets/T-0394-uf09-back-means-pause.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0394` and cite UF-09.9.

## Notes
- **Chromium's history intervention** may skip a guard entry made without a user activation. That's why the e2e taps once in focus mode before `goBack()`. A cold-restore Back before any tap may still leave; D-0123 §3 accepts that.
- **Order.** After T-0304d (same lane, and it owns the real UF-09.9 and End) and after T-0303d (its e2e row is the one AC-6 tightens).
- **From T-0303d review/accept (2026-10-02):** also loosen `startWorkout()` in tests/e2e/uf-08-setup.spec.ts to assert `[data-screen-id^="UF-09"]` instead of UF-09.1, so the UF-08 spec isn't coupled to UF-09's first screen. Make the Back row catch a PUSH navigate.
