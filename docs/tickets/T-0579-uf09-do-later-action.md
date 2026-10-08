---
id: T-0579
title: "UF-09.9 \"Do {name} later\" action between Swap and Skip to next exercise, UF-09.6 \"{name} moved to later.\" status, failure alert, e2e incl. offline reload"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.6, UF-09.1]
decisions: [D-0205, D-0120, D-0111]
deps: [T-0578, T-0572]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 §9, item G). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Same folder as T-0578, so it runs after it. Principle 1: nothing on UF-09.1–.8. -->

## Why
D-0205 §9: a busy machine is handled from Pause with one action. T-0578 built the logic; this ticket shows it on UF-09.9 per T-0572's spec.

## Scope
- In (`apps/web/src/features/UF-09/**`, `lib/i18n/flows/uf-09.ts`):
  - **Button** "Do {name} later" on UF-09.9 Paused, between Swap and Skip to next exercise, rendered only when T-0578's `canDoLater` is true. ≥ 44 px, unique label.
  - **Tap** → T-0578's deferral. Success: the pause ends as T-0578 defines; on UF-09.6 a `role="status"` line reads "{name} moved to later." (name = the moved exercise). Failure: UF-09.9 stays, `role="alert"` "Couldn't move {name}. Try again.", the button enabled again.
  - e2e `tests/e2e/uf-09-do-later.spec.ts` (new), including an offline run and reload.
- Out: any control on UF-09.1–.8; "Move to end"; UF-03.1 reorder.

### Edge cases that are in scope
- **Offline** and reload (AC5). **Write failure** (AC4).
- **Time running out:** after the move no UF-09.8 appears even when behind (AC1).
- **Hidden states** (AC3).
- Zero history / returning after 10 days: no difference in the UI; the fixtures use zero history.

## Acceptance criteria
Plan P: bench-press × 4 (main), inverted-row × 3, leg-extension × 2.
- **AC1 (from UF-09.6)** Given P with bench-press done and the machine on UF-09.6 for Inverted row, When the user pauses and taps "Do Inverted row later", Then the screen is UF-09.6 for Leg extension with the 60 s countdown, the status says "Inverted row moved to later.", and UF-09.8 is never shown even when `behindS ≥ 60` before the tap.
- **AC2 (from the warm-up)** Given P paused from UF-09.2 Warm-up, When the user taps "Do Bench press later", Then the warm-up resumes where it was and the next screen names Inverted row.
- **AC3 (hidden)** Given one bench-press set logged and paused on UF-09.3 set 2, Then there is no "Do Bench press later". Given the current item is the last unfinished item, Then no "Do … later". Given UF-09.9 opened from UF-09.8, Then no "Do … later". Given AC1's state, Then the button is present, between Swap and "Skip to next exercise" in DOM order.
- **AC4 (failure)** Given the device write rejects, When the user taps "Do Inverted row later", Then UF-09.9 is still shown, "Couldn't move Inverted row. Try again." has `role="alert"`, and the button is enabled.
- **AC5 (e2e offline and reload)** In a real browser: offline, AC1's tap; reload; Then focus mode resumes on Leg extension with every logged bench-press set kept; back online, Then the server upsert carries items bench-press, leg-extension, inverted-row.
- **AC6 (axe)** axe reports no violations on UF-09.9 with the button and on UF-09.6 with the status line.

Checklist (D-0197 §7): shown/hidden (AC1, AC3); online/offline (AC1, AC5); success/failure (AC1, AC4).

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-09.ts` (own flow file)
- `tests/e2e/uf-09-do-later.spec.ts` (new file)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · contracts unchanged · commits start with `T-0579:` and cite UF-09.9 / UF-09.6.

## Build / accept log

### Build log (frontend-dev, 2026-10-08)
- Built: `later` action in `paused.tsx` (gated by `canDoLater`, between Swap and Skip via `seams.tsx` ORDER), pending state (Resume `aria-disabled`), always-mounted `role="alert"` failure strip, host-carried `movedName` -> `role="status"` line on `next-exercise.tsx`; copy in `uf-09.ts`; css strip. The a11y announcement is the status/alert live regions.
- AC->test (`__tests__/t0579.do-later.test.tsx`): AC1 2 tests; AC2 warm-up; AC3 4 tests (partly done, last item, from UF-09.8, DOM order); AC4 failure + pending Resume; AC6 axe x2 (region rule off: isolated host has no landmark, as the shell supplies `main`). AC5: `tests/e2e/uf-09-do-later.spec.ts` (offline tap, reload, online upsert order).
- Planted faults (backup-restored), each red: gate always true (3 fail), Resume not inert (1), failure not shown (1), no status name (2), order swapped (1), e2e `deferItem` removed (1 fail).
- Gate: typecheck+lint+test green (19/19 tasks); test:repo-checks, format:check, check-all green; e2e uf-09 (23 specs incl. new) green. Existing paused/seams/chrome button-list tests updated for the new button (expected change).
