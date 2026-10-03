---
id: T-0394
title: "UF-09 Back means Pause: a same-URL history guard turns Back in a running machine state into UF-09.9; Back while paused leaves; Back with a seam overlay open ends paused on UF-09.9; tighten the T-0303d Back row; plus the T-0438 comment fix"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.1, UF-09.2, UF-09.3, UF-09.4, UF-09.5, UF-09.6, UF-09.7, UF-09.8]
decisions: [D-0066, D-0071, D-0086, D-0091, D-0103, D-0108, D-0110, D-0111, D-0123, D-0153, D-0162]
deps: [T-0304d, T-0303d, T-0415]
status: ready
---
<!-- Written 2026-10-02 by triage (TR-0038, D-0123 §3). Re-groomed 2026-10-03 by product-owner against main (T-0304g, T-0422, T-0435 merged; T-0415 in QA): Back with an overlay open is now exact (D-0162 §1), and T-0438 is folded in (D-0162 §2, AC-8). Build flow: wl-build-web. About ⅓ day. The spec is ready; the build waits for T-0415, which edits host.tsx and session.tsx. Start from a main that has it. -->

## Why
Principle 1: during a workout everything other than the current step lives behind Pause (UF-09.9). Today a Back (the browser button, or the Android system Back in the standalone PWA) leaves focus mode silently and lands on UF-08.1, where Start makes a second session (TR-0038). D-0123 §3 makes Back mean Pause while a machine state is running, so leaving a workout is always a decision taken on UF-09.9. D-0162 §1 makes "Back closes the overlay to UF-09.9" exact for both overlay kinds.

T-0438 (T-0435 review) is folded in. Since D-0153 §6, a failed finish applies a plan write that landed after `finish()` started, but two comments still say such a write "moves nothing".

## Scope
- In (all in `apps/web/src/features/UF-09/`, plus the listed extras):
  - **The guard** (D-0123 §3), for example `back-guard.ts` used by `SessionHost`:
    - When a machine state first renders, push one guard entry with the same URL: `history.pushState({...history.state, wlFocusGuard: true}, "", location.href)`. Push at most once while the guard entry is on top.
    - On `popstate` landing on `/session/<id>` with no `wlFocusGuard` in `history.state`:
      - in UF-09.1–UF-09.8 with no overlay open: dispatch `PAUSE` (with `atMs`), and push the guard again;
      - with a seam overlay open (D-0162 §1): close it, ending paused on UF-09.9, and push the guard again:
        - `keepsClockRunning: true`: the `close()` path (forced check point cleared, `RESYNC`), then `PAUSE` at the same `atMs`;
        - `keepsClockRunning: false`: close **without** the overlay's `RESUME` (`resumeOnClose` is ignored);
      - in `paused` with no overlay: do nothing (the Back already moved off the guard; the next Back leaves normally).
    - Host-level states (loading, not on this device, ended, stale, `done`) never push a guard.
    - App navigations away from `/session/<id>` (End → `/session/<id>/summary`, the "not on this device" / "ended" / "stale" links to `/`) use `replace: true` when the guard entry is on top.
    - The listener is removed on unmount. No `useBlocker` and no edit to `apps/web/src/app/**` (D-0123 §3).
  - **T-0438 comments** (D-0162 §2):
    - `session.tsx`: the `SessionWrites` docblock sentence "A plan write that resolves once `finish()` has started moves nothing".
    - `host.tsx`: the comment above `createSessionWrites()`, "a plan write that lands after finish() started moves nothing".
    - Both say instead that such a write is held in `landed`: a failed finish applies it, and a finish that succeeds drops it (D-0153 §6). Comments only, with no code change in those lines.
  - **e2e** rows appended to `tests/e2e/uf-09-focus.spec.ts`.
  - **The T-0303d Back row** in `tests/e2e/uf-08-setup.spec.ts`, tightened as AC-6 says.
- Out:
  - A "Resume workout" entry on Today or UF-08.1, and any in-progress guard on UF-08.1 (D-0123 §4–§5, a product follow-up).
  - A confirm dialog on leaving.
  - Any change to `seams.tsx` (T-0416, T-0451), `features/UF-08/**`, `lib/offline/**`, `routes.ts`, `App.tsx`, `components/**`, `tests/e2e/fixtures/**` or the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the guard is pure history and store state, so it works offline (AC-6 offline row).
- **Time running out:** Back on UF-09.8 pauses like any running state. AC-2 covers it through the D-0123 rule, and the UF-09.8 row is one of its tests.
- **A cold restore** (returning after 10 days off finds the session stale, so no guard; a fresh restore within 12 h arms it on first render, AC-1). The Chromium intervention note below applies.
- **Zero history:** no effect.

## Acceptance criteria
**Test setup.** Vitest + Testing Library in `apps/web/src/features/UF-09/__tests__/` (new files start `t0394`), with the T-0304a/e fixtures (real `upsertSession` over `fake-indexeddb`, signed-in user stubbed through the supabase-js `localStorage` key). These tests mount `SessionHost` under a real `BrowserRouter` over jsdom's `window.history` (not MemoryRouter), starting from `history` = `["/", "/session/setup", "/session/<id>"]`. Back is `window.history.back()` followed by waiting for the `popstate`. Negative asserts wait a real 50 ms macrotask. Both values of every binary condition get a test. **AC-1, AC-2, AC-3 (pair), AC-4 and AC-5 (End) must fail on `main`.** The build log records each red run.

- **AC-1 (the guard is armed)**
  - **Machine state.** After the host renders UF-09.1, `history.length` grew by exactly 1, `history.state.wlFocusGuard` is `true`, and `location.pathname` is `/session/<id>`.
  - **Once.** After 3 transitions (UF-09.1 → UF-09.3 → UF-09.4 → UF-09.5), `history.length` is unchanged from the line above.
  - **Host-level, the pair.** For each of "not on this device", "ended", "stale" and loading, `history.length` is unchanged and `history.state?.wlFocusGuard` is not `true` after 50 ms.
- **AC-2 (Back in a running state means Pause)**
  - For each of UF-09.1, UF-09.3, UF-09.5, UF-09.6 and UF-09.8 (one test each, reached through the real events or a seeded state): Back shows `[data-screen-id="UF-09.9"]`, the location is still `/session/<id>`, and the guard is armed again (`history.state.wlFocusGuard === true`).
  - **Same as the button.** The stored `wl-focus:<id>` after a Back equals, apart from `atMs`-derived fields, the value after pressing "Pause workout" in the same state (`phase: "paused"`, `resumePhase` set, `pausedAtMs` set).
  - **The rest timer stops.** Back in UF-09.5 at 90 s left, then 60 s of fake time, then Resume shows 90 s left.
- **AC-3 (Back while paused leaves)**
  - From UF-09.9 reached by "Pause workout": Back moves the location off `/session/<id>` (to `/session/setup`), and `wl-focus:<id>` is still stored.
  - **The pair.** From UF-09.9 reached by a Back (AC-2): one more Back leaves the same way; it doesn't pause again or push a guard.
- **AC-4 (a seam overlay, D-0162 §1)** Seams are injected through the host's `seams` prop (T-0304e's mechanism). The real `seams.tsx` isn't used.
  - **`keepsClockRunning: false` from UF-09.9.** Open the entry from UF-09.9, then Back. The overlay is gone, UF-09.9 is shown, the stored state is `paused` with the same `resumePhase` as before the open, and the guard is re-armed. A second Back leaves (AC-3).
  - **`keepsClockRunning: false` from UF-09.6** (a `nextSeamActions` entry). Open it from a running UF-09.6, then Back. UF-09.9 is shown with `resumePhase: "next"`, not UF-09.6. The pair: the entry's own close from UF-09.6 still resumes to UF-09.6 (unchanged).
  - **`keepsClockRunning: true` from UF-09.9.** Open it (the machine resumes, `phase: "set"`), then Back. UF-09.9 is shown, the stored state is `paused` with `resumePhase: "set"`, the gate's forced check point is cleared, and the guard is re-armed. The pair: the entry's own `ctx.close()` still shows UF-09.3 (RESYNC, unchanged).
- **AC-5 (leaving by the app's own navigation)**
  - **End.** End workout → confirm → `/session/<id>/summary`, and `history.length` is unchanged by that navigation (a REPLACE on the guard entry; `useNavigationType()` === "REPLACE" on the summary route).
  - **Unmount.** After the host unmounts, a `popstate` dispatches nothing (store spy unchanged after 50 ms) and no listener is left (`removeEventListener` called with the same handler).
- **AC-6 (e2e, D-0086, D-0091 §1)** Rows appended to `tests/e2e/uf-09-focus.spec.ts`, with no fixture edits:
  - **Start → Back.** `/` → "Start workout" → UF-08.1 → Suggest → Looks good → Start → (tap once on a non-control point in focus mode; the screen id is unchanged after it) → `page.goBack()`: `[data-screen-id="UF-09.9"]` is visible and the URL still matches `/session/<uuid>`.
  - **Back twice leaves.** One more `page.goBack()`: the URL no longer matches `/session/<uuid>`, and `[data-screen-id="UF-08.4"]` is not in the DOM.
  - **Offline the same.** The Start → Back row passes with the context offline.
  - **The T-0303d row.** In `tests/e2e/uf-08-setup.spec.ts`:
    - The D-0123 §2 "Back after Start" row is tightened. After Start and one tap on a non-control point, `page.goBack()` shows `[data-screen-id="UF-09.9"]`, and the URL stays `/session/<uuid>`.
    - `startWorkout()` asserts `[data-screen-id^="UF-09"]` and drops the `UF-09.1` line (T-0303d review).
- **AC-7 (lint and shell tests)** `react/jsx-no-literals` and the D-0071 §9 import bans are green. `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `apps/web/src/features/UF-08/**`, `apps/web/src/features/UF-09/seams.tsx`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`.
- **AC-8 (T-0438 comments, D-0153 §6)** A source test (`t0394.comments.test.ts`) reads `session.tsx` and `host.tsx`:
  - neither contains "moves nothing";
  - the `SessionWrites` docblock and the comment above `createSessionWrites()` each cite `D-0153 §6`.
  - Red on main (both files say "moves nothing").

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), except `seams.tsx`.
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: add keys only, if any string is needed.
  - `tests/e2e/uf-09-focus.spec.ts`: append rows.
  - `tests/e2e/uf-08-setup.spec.ts`: only the T-0303d "Back after Start" row and `startWorkout()` (AC-6).
  - `docs/tickets/T-0394-uf09-back-means-pause.md`: this file, for the logs.
  - `docs/tickets/T-0438-uf09-comment-drift.md`: the stub, to record "delivered by T-0394" in its log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `check-all` green · the whole web e2e (`pnpm --filter @workoutlab/web test:e2e`) green, because the ticket touches history behaviour across UF-08 and UF-09 · contracts unchanged · commits start `T-0394` and cite UF-09.9.

## Notes
- **Chromium's history intervention** may skip a guard entry made without a user activation. That's why the e2e taps once in focus mode before `goBack()`. A cold-restore Back before any tap may still leave; D-0123 §3 accepts that.
- **Order.** After T-0304d and T-0303d (done), and after **T-0415** (in QA). Both edit `host.tsx`, and T-0415 also edits `session.tsx`. T-0415's `done`-under-overlay branch is where AC-4's `keepsClockRunning: true` path lands.
- **Parallel:**
  - **Not with T-0415** (above). It is serial.
  - **With T-0416, allowed.** T-0416 edits `seams.tsx` and moves the UF-09.9 count line in `uf-09-focus.spec.ts`, and this ticket only appends rows there. Rebase onto main before QA if T-0416 merged first.
  - **With T-0447, allowed** (`cues.ts` only).
  - **With T-0451, allowed** (`seams.tsx` and the t0422 tests).
  - **With T-0453, allowed** (UF-07).
  - **Not with T-0448** if that one adds a PAUSE hook in `host.tsx`. Today it is `device.ts` only.
- **T-0438** is closed by this ticket (D-0162 §2). The orchestrator marks the T-0438 row done when T-0394 merges.
