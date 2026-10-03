---
id: T-0346
title: "UF-07.1: refresh a cached routine on mount (online + signed-in), replace only an untouched draft; reset loadFailed and the draft when routineId changes in place"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0081, D-0113, D-0071, D-0164, D-0174]
deps: [T-0308a, T-0454]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0308a spec check and the T-0454 review nit
(D-0174 §4). Build flow: wl-build-web. About ⅓ day. T-0308a and T-0454 are on main. -->

## Why
`/plan/routines/:id` reads the routines cache. When the cache already has the id, the editor
never refreshes (D-0081 §5). A deep link on a device with a stale cache therefore shows the old
routine, and Save overwrites another device's newer edit (last write wins, NFR-SYNC-3). D-0174 §4
amends D-0081 §5: for a cached routine, refresh once on mount and replace the draft only if the
user hasn't touched it. Separately, when `routineId` changes in place (a navigation from one
routine to another without an unmount), `loadFailed` keeps the previous id's `true`.

## Scope
- In (`apps/web/src/features/UF-07/use-routine-editor.ts`, and tests in `UF-07/__tests__/`):
  - **The mount refresh (D-0174 §4):**
    - The form renders from the first cache read, as it does today.
    - When the first read **finds** the id, one `refreshRoutines()` starts (3 s cap). It starts
      only while `navigator.onLine` and `useAuth().status === "signed-in"`
      (`lib/auth/auth-context.js`, a read-only import). It runs at most once per mount, and it
      starts later in the mount if the status goes from `stale` to `signed-in` (D-0113 §1–§3).
    - When the refresh resolves, read `loadRoutines()` again:
      - untouched draft (name equals the loaded name, and the item ids equal the loaded list in
        order): replace the draft and the loaded snapshot with the fresh row;
      - touched draft: keep both;
      - id gone and draft untouched: `navigate("/plan", {replace: true})`;
      - id gone and draft touched: keep the draft.
    - A refresh that rejects or hits the cap changes nothing.
  - **The unknown-id path** (the first read doesn't find the id) stays exactly as it is. Its
    refresh counts as the mount's one refresh.
  - **`routineId` changes in place:** the load effect resets `loadFailed`, `ready`, the draft and
    the loaded snapshot before the new id's read.
- Out:
  - The unknown-id path's auth condition. It still checks `navigator.onLine` only. That's a
    possible follow-up, not changed here.
  - A new routine (`/plan/routines/new`), which never refreshes.
  - Any UI or copy change.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** no refresh; the cached draft stands (AC-3).
- **Slow network:** after 3 s the editor stops waiting. A refresh that lands later doesn't touch
  the draft (AC-4).
- **Edited on another device while this one was away:** the untouched draft picks up the newer
  row (AC-1). A draft the user has started editing is never overwritten (AC-2).
- **Deleted on another device:** AC-5.

## Acceptance criteria
Each test title starts with `T-0346 AC-n`. Use the existing `__tests__/harness.tsx` and
`spies.ts`. The cache holds routine R "Push" with two items, A and B: any two `kind: exercise`
library rows the harness seeds. The stubbed `refreshRoutines` writes R as "Push v2" with three
items, A, B and C, into the cache. `useAuth` is
mocked.

- **AC-1 (untouched draft takes the fresh row, red on main)** **Given** the router is online and
  `signed-in` at `/plan/routines/R`, **when** the refresh resolves, **then**:
  - the name field reads "Push v2" and the list shows 3 items;
  - `refreshRoutines` was called exactly once;
  - a Save made right after that sends `name: "Push v2"` with 3 items.

  **Red:** on main the field still reads "Push" and `refreshRoutines` has 0 calls.
- **AC-2 (touched draft is kept)** **Given** the same setup with the refresh held, **when** the
  user types "Push day" into the name and then the refresh resolves, **then** the name still reads
  "Push day" and the list still shows the 2 cached items. Also cover the other kind of edit: with
  an item removed before the refresh resolves, the list stays at 1 item.
- **AC-3 (auth and network, both values, D-0113 §5)** For a cached id:
  - online + `signed-in` → exactly 1 call;
  - online + `stale` → 0 calls after a real 50 ms macrotask;
  - online + `stale` → `signed-in` during the mount → exactly 1 call, and none after another
    50 ms;
  - offline + `signed-in` → 0 calls, and the form shows "Push".
- **AC-4 (the cap)** **Given** a refresh that never settles, **then** the form shows "Push" at
  once and stays usable. With fake timers advanced past 3 000 ms, nothing is replaced. A refresh
  that then rejects changes nothing either, and logs no `console.error`.
- **AC-5 (deleted elsewhere)** **Given** the refresh removes R from the cache: an untouched draft
  navigates to `/plan` with `replace` (history length is unchanged), and a touched draft stays on
  `/plan/routines/R` with the user's text.
- **AC-6 (in-place id change)** **Given** `/plan/routines/X`, where the cache read throws so
  `loadFailed` shows the alert, **when** the route changes to `/plan/routines/R` without an
  unmount, and that read succeeds, **then** the alert is gone and the form shows "Push". **Red:**
  on main the alert stays.
- **AC-7 (unknown id unchanged)** The existing unknown-id tests in `keyboard.test.tsx` and
  `offline.test.tsx` pass unedited, with `refreshRoutines` still called once.

**Red proof.** Run AC-1 and AC-6 on main: both fail. Plant one fault on a backup copy (drop the
"untouched" check, so a touched draft is replaced too): AC-2 must fail. Restore from the backup
and record each run.

## Paths you may change
- `apps/web/src/features/UF-07/**` (the lane: `web-feature:UF-07`).
- **Listed extras:**
  - `docs/tickets/T-0346-uf07-refresh-cached-routine-on-mount.md`

## Contract impact
None. D-0174 §4 amends D-0081 §5, a product default, not a contract.

## Definition of done
- Tests for every AC pass.
- `tests/e2e/uf-07-routines.spec.ts` is green.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0346` and cite UF-07.1.

## Build / accept log
