---
id: T-0451
title: "UF-05.1 swap seam: a failed chunk load is retried (Try again, and on the next open) instead of sticking until reload; drop the vacuous boundary 'scope' test and the stale TR-0043 comment (D-0162 §3)"
lane: web-feature:UF-09
screens: [UF-05.1, UF-09.9, UF-09.6]
decisions: [D-0162, D-0142, D-0144, D-0156, D-0160, D-0071]
deps: [T-0422, T-0416]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0422 re-review and QA. Build flow: wl-build-web. About ¼ day. The spec is ready; the build waits for T-0416 (in build), which also edits seams.tsx. Start from a main that has it. -->

## Why
- **The bug.** `seams.tsx` makes the UF-05 sheet with a module-level `React.lazy`. React caches a
  rejected import for the life of the page. One failed load (flaky gym Wi-Fi, a dropped request)
  makes every later Swap show "Couldn't load alternatives." until the page reloads, so the user
  loses Swap for the whole workout. D-0162 §3: retry in-page, both on a "Try again" tap and on the
  next open.
- **Test hygiene (T-0422 re-review).** `t0422.seams` "the swap boundary doesn't catch an error
  outside the sheet" renders a throwing *sibling* of the overlay. The outer boundary catches that
  whatever `SwapBoundary` does, so the test proves nothing. Its real guard is
  `t0422.lazy-reject`: with F6, removing the boundary, it went red.
- **Stale comment.** `t0422.host.test.tsx` still says "TR-0043: red until it is resolved". D-0156
  resolved it, and the test is green.

## Scope
- In (all in `apps/web/src/features/UF-09/`, plus the listed extra):
  - `seams.tsx`:
    - The swap sheet's lazy component can be made again. After a failed load, the next render of
      the swap overlay imports again. A small helper (for example `lazy-retry.ts`, exporting
      `retryableLazy(load)` → `{ Component, reset }`) is fine.
    - `SwapBoundary`'s failure state, `SwapPlaceholder` with `uf05.loadFailed`, gets a "Try again"
      button before Close. It resets the lazy component and the boundary.
    - The importer stays `import("../UF-05/index.js")` (D-0144).
  - `__tests__/t0422.seams.test.tsx`: delete the one vacuous test named above. Nothing else in the
    file changes.
  - `__tests__/t0422.host.test.tsx`: replace the two-line "TR-0043: red until it is resolved…"
    comment with one that cites D-0156. No code change.
  - New tests in `__tests__/` (file names start `t0451`).
- Out:
  - Retry for any other lazy seam entry that T-0416 may add (how-to, list-view). If T-0416 lands a
    bare `lazy()` with no failure state, file a follow-up for it. Don't extend this ticket.
  - An app-wide boundary for route chunks (T-0446).
  - An automatic retry, a page reload, or any change to `SwapSheet` itself (UF-05 lane).

### Edge cases that are in scope
- **Offline:** an import that fails offline fails again on "Try again" while still offline. That
  shows the same failure state with both buttons, and nothing throws (AC-2).
- **Time running out:** none. Swap holds the workout paused (D-0071 §4).
- **Zero history, 10 days off:** no effect.

## Acceptance criteria
**Test setup.** As `t0422.lazy-reject.test.tsx`: the real `SessionHost`, `fake-indexeddb`, a seeded
paused focus state on item 1, `locale="en-GB"`, `timeZone="UTC"`. The UF-05 import is controlled
through a `vi.fn` loader. It rejects with "Failed to fetch dynamically imported module" on the calls
the test chooses and resolves the real module on the others. **AC-1 and AC-2 must fail on `main`.**
The build log records each red run.

- **AC-1 (the next open imports again)**
  - Given the first load rejects: Swap → the failure state. Close → UF-09.9.
  - When Swap is pressed again (the loader now resolves), Then the loader has been called twice
    and the sheet `[role="dialog"]` named "Replace Barbell row" is shown.
  - Red on main: the second open shows "Couldn't load alternatives." with the loader called once.
- **AC-2 (Try again)**
  - **Recovers.** In the failure state, focus is on Close (unchanged). The buttons are, in order,
    "Try again" then "Close". Pressing "Try again" (the loader now resolves) shows the sheet, and
    the loader has been called twice. The stored `wl-focus` state is unchanged throughout.
  - **Fails again (offline).** If the loader rejects again, the failure state shows again with
    both buttons, "Close" still returns to UF-09.9, and there's no unhandled rejection and no
    `console.error` outside React's boundary log.
  - Red on main: there is no "Try again" button.
- **AC-3 (unchanged paths)**
  - **Pending.** `t0422.lazy-pending` stays green unedited: "Loading alternatives…", then Close.
  - **Reject.** `t0422.lazy-reject` stays green unedited.
  - **The UF-09.6 entry.** The same AC-1 flow from UF-09.6's Swap (`nextSeamActions`) also
    re-imports on the next open. One test.
  - **D-0144.** `build.test.ts` AC-A6 (UF-05 never in the entry chunk) stays green.
  - **Imports.** The T-0304e pin "seams.tsx imports nothing from UF-03, UF-04 or UF-05" (static
    imports) stays green.
- **AC-4 (hygiene)**
  - `t0422.seams.test.tsx` no longer contains "the swap boundary doesn't catch an error outside
    the sheet", and its other tests are byte-for-byte unchanged (`git diff` in the build log).
  - `t0422.host.test.tsx` contains no "red until it is resolved".
- **AC-5 (strings)** "Try again" comes from `en.uf05` (a new key, `retry`). `react/jsx-no-literals`
  is green.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-05.ts`: add the `retry: "Try again"` key only.
  - `docs/tickets/T-0451-uf05-swap-chunk-retry.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1` (including `build.test.ts` AC-A6),
`-w test:repo-checks`, `-w format:check` and `check-all` green · `uf-05-swap.spec.ts` and
`uf-09-focus.spec.ts` green · contracts unchanged · commits start `T-0451` and cite UF-05.1.

## Notes
- **Parallel:**
  - **Not with T-0416**, because both edit `seams.tsx`. Build after it merges.
  - **Not with T-0446**, which threads `timeZone` through the swap seam in `seams.tsx`.
  - **Not with any other ticket that lists `flows/uf-05.ts`** (D-0071 §1).
  - **Safe with T-0415**, T-0394 (`host.tsx`, `session.tsx` and `uf-09-focus.spec.ts`; this ticket
    touches none of them), T-0447 and T-0453.
