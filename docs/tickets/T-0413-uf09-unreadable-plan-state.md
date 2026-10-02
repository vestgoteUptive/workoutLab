---
id: T-0413
title: "UF-09 load: a stored plan that fails parseSessionPlan gets its own host-level state ('This workout's plan can't be read') and one console warning, instead of 'not on this device' (D-0138)"
lane: web-feature:UF-09
screens: [UF-09]
decisions: [D-0138, D-0111, D-0133, D-0071]
deps: [T-0222]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Follow-up from the T-0222 review (load.ts:49). D-0133 §5 made the case reachable: a stored timed `prefill.durationS` outside 15..120 now parses as `invalid`. No contract change. -->

## Why
`loadSession` in `apps/web/src/features/UF-09/load.ts` returns `notOnDevice` when the stored plan fails `parseSessionPlan`. The row is on the device and belongs to the user, so "This workout isn't on this device" is false, and nothing is logged. A user is told their workout is somewhere else, and a developer has no trace. D-0138 gives the case its own host-level state and one warning line. It keeps D-0111's other rules: one screen id, no alert, a link home, and nothing deleted.

## Scope
- In:
  - `apps/web/src/features/UF-09/load.ts`: `HostLoad` gains `{ kind: "unreadable" }`. Return it when the row exists, belongs to `currentUserId()`, and `parseSessionPlan` returns `ok: false`. Call `console.warn` once, with the D-0138 §5 text.
  - `apps/web/src/features/UF-09/host.tsx`: render the new state through `HostLevel` with `en.uf09.unreadableTitle` and the home link.
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: `unreadableTitle: "This workout's plan can't be read"`.
  - `apps/web/src/features/UF-09/__tests__/host.load.test.tsx`: the new ACs, and the one expectation D-0138 moves (AC1).
- Out:
  - Every other `notOnDevice` case (D-0138 §2), and the ended, stale and ready paths.
  - Any "End this workout" or repair action (D-0138 Revisit).
  - `packages/shared/**` (`parseSessionPlan` is unchanged) and `api/openapi.yaml`.
  - `tests/e2e/**`.

## Acceptance criteria
Rows are seeded with the real `upsertSession` over `fake-indexeddb`, as the existing `host.load.test.tsx` cases are (`seedSession`, `renderLoaded`, `signIn`). `t = en.uf09`. Each new test title starts with `T-0413 ACn`.
- **AC1 (the corrupt plan, D-0138 §1 §3)**
  - **Given** `seedSession({ plan: { version: 1, items: "nope" } })` for the signed-in user, **When** `/session/<S1>` renders, **Then**:
    - `screenId()` is `"UF-09"`;
    - the `h1` has text `t.unreadableTitle`, and `t.unreadableTitle` is `"This workout's plan can't be read"`;
    - the page doesn't contain `t.notOnDeviceTitle`;
    - there is exactly one link, to `/`;
    - there is no `role="alert"` and no `banner`, and no machine state (`UF-09.1`…`UF-09.9`) is on screen.
  - The existing test "row.plan failing parseSessionPlan" changes its expectation from `expectNotOnDevice()` to this state, under D-0138. Cite D-0138 in a comment. That is the only existing expectation this ticket edits.
  - **Red on unfixed code:** on `main` the heading is `t.notOnDeviceTitle`. Record the red run in the build log.
- **AC2 (the D-0133 case)** **Given** an otherwise valid plan (the fixtures' `P1`) whose first timed item, or a timed item built from a P1 item, has `prefill.durationS: 3`, **Then** the same state as AC1 renders. With `durationS: 45` the pair starts the machine at `UF-09.1`.
- **AC3 (the warning, D-0138 §5)**
  - **Given** AC1's row, **Then** `console.warn` is called exactly once, with one string that contains `UF-09`, the session id, `parseSessionPlan` and `invalid`.
  - The warning contains no part of the stored plan (`nope` doesn't appear) and not the user id.
  - `console.error` isn't called.
  - **Pair:** a valid row and every `notOnDevice` case in the existing "AC-5 not on this device" block call `console.warn` zero times.
- **AC4 (only that case moves, D-0138 §2)** The existing "AC-5 not on this device" tests for no row, another user's row, `plan: null`, IndexedDB unavailable and a rejected read pass unedited.
- **AC5 (nothing is deleted, D-0138 §4)** **Given** AC1's row and a stored `wl-focus:<S1>` value, **When** it renders, **Then** `localStorage` still holds the same `wl-focus:<S1>` string, and `offlineDb().sessions.get(S1)` still returns the row.
- **AC6 (order, D-0138 §6)** **Given** a row with a corrupt plan and `ended_at` set, **Then** the AC1 state renders, not "This workout has ended". A stale started-at with a corrupt plan also renders the AC1 state.
- **AC7** `npx -y pnpm@10.28.2 --filter @workoutlab/web typecheck lint test` is green, and every other UF-09 test passes unedited.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: the one `unreadableTitle` string (D-0138 §3).
  - `docs/tickets/T-0413-uf09-unreadable-plan-state.md`: this file, for the build and accept log.

## Contract impact
none (`api/openapi.yaml`, `docs/data-model.md` and `packages/shared/**` unchanged)

## Coordination
- Files: `features/UF-09/load.ts`, `features/UF-09/host.tsx`, `features/UF-09/__tests__/host.load.test.tsx` and `lib/i18n/flows/uf-09.ts`.
- T-0409 (ready, UF-09.4 weight field) works in `weight-input.ts` and the confirm view. If it also edits `uf-09.ts`, run the two one after the other; the string additions don't conflict otherwise.
- T-0304d (todo) adds UF-09.9 and End; D-0138's "End this workout" revisit would land there or later.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0413` and cite UF-09 (e.g. `T-0413 UF-09: a corrupt stored plan shows its own state, not 'not on this device' (D-0138)`).

## Build / accept log
Archived in `docs/tickets/log/T-0413.md` (D-0157).
