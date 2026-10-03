---
id: T-0463
title: "UF-09.9 seams: the how-to (UF-04) and List view (UF-03.1) seams retry a failed chunk load like the swap seam, and a parent re-render never re-imports or remounts an open seam view (QA fault F3) (D-0167 §2-4)"
lane: web-feature:UF-09
screens: [UF-09.9, UF-03.1, UF-05.1]
decisions: [D-0167, D-0162, D-0142, D-0071, D-0144]
deps: [T-0451, T-0446]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0451 build and QA follow-ups. Build flow: wl-build-web. About ⅓ day. Start after T-0446 merges (both edit features/UF-09/seams.tsx). -->

## Why
A stale deploy's 404 on the UF-04 or UF-03 chunk leaves the how-to or List view overlay on
"Couldn't load this view." until a full reload, because both seams use a plain `lazy()`, which
caches the rejection. T-0451 fixed exactly this for the swap seam (D-0162 §3) with
`retryableLazy`, `onFailed` and `onRetry`. Its QA found that resetting the lazy on every
`SwapOverlay` render (fault F3) passes every test. That matters most for the List view, whose
host re-renders every second because its clocks keep running (D-0142 §8).

## Scope
- In (`apps/web/src/features/UF-09/`):
  - `seams.tsx`: `ListView` and `ExerciseHowTo` become `retryableLazy` loaders. Their overlays
    pass `onFailed={loader.reset}` and an `onRetry` that remounts the boundary (the
    `SwapOverlay` pattern, a `key` on an attempt counter). `howToChrome` and `listViewChrome` set
    `retryLabel: uf09.seamRetry`. A shared helper for the three seams is fine. `SwapOverlay`'s
    behaviour and its `timeZone` prop (T-0446) stay as they are.
  - `lib/i18n/flows/uf-09.ts`: add `seamRetry: "Try again"` (D-0167 §3).
  - New tests in `__tests__/`, file names starting `t0463`. Each file holds at most one test that
    ends with a successful load (a resolved `React.lazy` stays resolved, see
    `t0451-fixtures.tsx`).
- Out:
  - `features/UF-03/**`, `features/UF-04/**`, `features/UF-05/**` (tests stub their exports with
    `vi.mock`).
  - `lazy-retry.ts`'s API (use it as it is).
  - An automatic retry, or a retry counter shown to the user (D-0162 §3).

### Edge cases that are in scope
- **Offline:** "Try again" offline fails again and shows both buttons again, with no unhandled
  rejection (AC-1, AC-2).
- **Time running out:** the List view's clocks keep running while it's failed and while it
  retries. The stored focus state is unchanged by a retry (AC-2).
- **Zero history, 10 days off:** no effect.

## Acceptance criteria
**Test setup.** The UF-09 host helpers (`seedSession`, `renderLoaded` in `helpers.tsx`,
`renderSession` in `session-helpers.tsx`, `useFakeClock`, `storedFocus`, `flushReal`). A file-level `vi.mock("../../UF-04/index.js")` or
`vi.mock("../../UF-03/index.js")` whose factory counts calls in a hoisted `loader` and throws while
`loader.failing` is true, as in `t0451.try-again.test.tsx`. On success it returns a stub
`ExerciseHowTo` / `ListView` that renders a marker and counts its mounts in a `useEffect(() => {
mounts += 1 }, [])`. React's console error for a caught error is expected and silenced only
inside these tests.

**Test rules.** Both values of every binary condition get a test. **AC-1, AC-2 and AC-3 must fail
on `main`**: the build log records each red run (no "Try again" button; the loader isn't called
again). It also records one planted fault per seam turning AC-4 red: a `loader.reset()` (and for
swap, `swapSheet.reset()`) in the overlay's render body, which is F3.

- **AC-1 (how-to: Try again)** Given UF-09.9 Paused and the UF-04 loader failing, When How-to
  is tapped, Then the dialog reads "Couldn't load this view." with buttons in the order
  `["Try again", "Close"]`, and focus is on Close.
  - **Recovers:** with `loader.failing = false`, "Try again" calls the loader once more and
    renders the stub with the current item's `exerciseId`.
  - **Fails again (offline):** still failing, "Try again" shows both buttons again, `console.error`
    holds only boundary logs, and Close returns to UF-09.9 with `storedFocus()` unchanged.
- **AC-2 (List view: Try again)** The same for List view. The placeholder carries
  `data-screen-id="UF-03.1"` in both the failed and the loading state. On recovery the stub gets
  `ctx`. **Clocks:** across the failure and the retry, the workout is not paused
  (`keepsClockRunning`), and advancing the fake clock by 5 s moves the elapsed time on Close as it
  does without a failure.
- **AC-3 (the next open retries)** For each of how-to and List view: fail, Close, then (loader
  now succeeding) open again. The loader is called again and the stub renders. No "Try again" is
  needed.
- **AC-4 (a re-render never re-imports or remounts, F3)** For each of swap, how-to and List view,
  with the view loaded and open: a parent re-render (for the List view, advance the fake clock by
  3 s so the host ticks; for swap and how-to, a re-render of the host, for example
  `rerender` with the same props or a clock tick) leaves `loader.calls` and the stub's `mounts` at
  their values from before the re-render (1 each).
- **AC-5 (unchanged surface)** Unedited: `t0416.*`, `t0422.*`, `t0451.*`, `seams.test.tsx` and
  T-0446's `t0446*` tests (if merged). `orderActions` and the button labels are unchanged. The
  `react/jsx-no-literals` lint is green. `check:size` (D-0144 AC-A6 entry-chunk check) stays green:
  UF-03 and UF-04 stay out of the entry chunk.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: add `seamRetry` only.
  - `docs/tickets/T-0463-uf09-seam-retry-how-to-list-view.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs and the planted faults recorded · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · `check:size` green · `uf-09-focus.spec.ts`, `uf-05-swap.spec.ts` and
`uf-03-list-summary.spec.ts` green · contracts unchanged · commits start `T-0463` and cite the
screen (for example `T-0463 UF-09.9: retry the how-to and List view seams`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:**
  - **Not with T-0446** (in flight): it edits `seams.tsx` (`SwapOverlay` gets `timeZone`) and
    `session.tsx`/`host.tsx`. Start from a `main` that has T-0446.
  - **T-0417** (in flight, UF-03) edits `ListView.tsx` and `flows/uf-03.ts`. There's no shared
    file: this ticket stubs `ListView` and doesn't touch `uf-03.ts` (D-0167 §3).
  - **T-0459, T-0461:** no shared file.
- **Board:** add T-0446 to the row's deps (orchestrator).

## Build / accept log

### Build log (frontend-dev, 2026-10-03)
Start: `git status` clean, HEAD 6cc2f2a. `seams.tsx`: `ListView` and `ExerciseHowTo` are `retryableLazy` loaders; `useSeamRetry(loader)` (key on an attempt counter, `onRetry`, `onFailed = loader.reset`) is shared by the three overlays; `howToChrome` and `listViewChrome` set `retryLabel: uf09.seamRetry`; `uf-09.ts` gains `seamRetry: "Try again"`. Tests: `__tests__/t0463*` (one successful load per file; no `session-helpers`/`set-loop-helpers`, they import UF-03 which is mocked).
- AC-1 how-to: `t0463.how-to.offline` (labels, order, focus on Close, fails again, Close, no unhandled, console.error boundary-only), `t0463.how-to.recovers` (loader +1, stub shows `exerciseId`).
- AC-2 List view: `t0463.list-view.offline` (placeholder `data-screen-id=UF-03.1` failed and again, not paused, 5 s moves elapsed to 20:05 on Pause after Close), `t0463.list-view.recovers`.
- AC-3: `t0463.how-to.next-open`, `t0463.list-view.next-open`.
- AC-4 (F3): `t0463.{swap,how-to,list-view}.rerender`: calls and mounts stay 1 and no Loading placeholder appears.
- AC-5: t0416/t0422/t0451/seams/t0446 unedited, all green in the full web run.
- Red on unfixed (main `seams.tsx`): 6 of 9 red (offline, recovers, next-open for both seams: no Try again button, loader not called again); the 3 rerender tests pass there, as expected.
- Planted faults (backup copy, restored with `cp`): `<loader>.reset()` in the render body of `SwapOverlay`, `HowToOverlay` and `ListViewOverlay` each turn its `rerender` test red. A first version of the test (mounts and calls only) did NOT catch them: a resolved lazy of a cached module resolves to the same component type, so React keeps the fiber and the module factory isn't re-run. The test therefore also watches for the Suspense fallback ("Loading") with a MutationObserver, after advancing the fake clock past React's 300 ms fallback throttle.
- Gate: `-w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`, `check-all` green (one lint red first: unused imports in the new tests, fixed); `build` + `check:size` green; e2e `uf-09-focus`, `uf-05-swap`, `uf-03-list-summary` 15/15.
