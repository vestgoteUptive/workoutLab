---
id: T-0471
title: "UF-11.1 CheckinCard mounts: top of UF-11.2, UF-02.1 through todayCheckinSlot (lazy), never on /session/*, e2e Accept on Today"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2, UF-02.1]
decisions: [D-0070, D-0071, D-0106, D-0158, D-0168]
deps: [T-0470]
status: todo
---
<!-- Written by product-owner 2026-10-03 (groom, D-0168 §5). Third child of the T-0308c board row.
Parent: docs/tickets/T-0308-routines-plan-checkin.md AC-C11, C13, C14. Build flow: wl-build-web.
About ⅓ day. Becomes ready when T-0470 is done. -->

## Why
The card belongs where the user plans (UF-11.2) and where they start each day (UF-02.1), and never
inside a workout (principle 1, D-0070 §7). UF-02 owns a registry file for exactly this
(`features/UF-02/slots.tsx`, D-0071 §4), so the mount touches no other UF-02 source file.

## Scope
- In:
  - **UF-11.2:** `CheckinCard` is the first element after the `<h1>` inside
    `[data-screen-id="UF-11.2"]`, in every Plan state.
  - **UF-02.1:** `features/UF-02/slots.tsx` sets `todayCheckinSlot` to `lazy(() =>
    import("../UF-11/index.js").then((m) => ({ default: m.CheckinCard })))`. Today already renders
    it inside `Suspense` after C-01 and the attention line (T-0302a AC-A11). Keep any other slot
    export in that file (T-0395's `todayResumeSlot`) as it is.
  - **The pin:** `features/UF-02/__tests__/source.test.ts` "todayCheckinSlot is null in this ticket"
    becomes "todayCheckinSlot lazily loads CheckinCard from features/UF-11/index.js" (one test
    changed, noted in the build log). No other UF-02 test changes.
  - **e2e** appended to `tests/e2e/uf-11-plan.spec.ts`.
- Out: anything in the card itself (T-0308c, T-0470). Editing `Today.tsx` or any other UF-02
  source file. Any contract change.

### Edge cases that are in scope
- **Offline:** the lazy chunk is precached; offline after one online load, `/` shows the card with
  disabled actions (AC-4).
- **In a workout:** never rendered on `/session/*` (AC-3).
- **Zero history / returning after 10 days off:** the card's own logic (T-0308c); nothing new here.

## Acceptance criteria
Each test title starts with `T-0471 AC-n`. Fixtures as T-0308c (the AC-1 proposal cached).

- **AC-1 (UF-11.2, red on main)** `/plan` renders `[data-part="checkin-card"]` as the next element
  sibling of the `<h1>`; with P3 = 5 there is none and the Plan content is unchanged. **Red:** on
  main `/plan` has no card.
- **AC-2 (UF-02.1)** Rendering `Today` (from `features/UF-02/index.js`, real `slots.tsx`) with the
  proposal cached: the card renders once, after the C-01 compact region and the attention line and
  before the suggestion card in DOM order; the `h1` and "Start workout" render before the lazy
  chunk resolves. `slots.tsx` is the only `features/UF-02` source file in the diff (build-log
  check).
- **AC-3 (never in a workout, principle 1)** With the proposal cached, the router at
  `/session/setup`, `/session/S1` and `/session/S1/summary` has no `[data-part="checkin-card"]` and
  none of its text; `/` has it. The existing import-ban tests (UF-03/UF-08/UF-09 ↛ UF-11) pass
  unedited.
- **AC-4 (e2e)** In `uf-11-plan.spec.ts`, preview build, mocked Supabase with the AC-1 data: `/`
  shows the card; Accept makes the `area_targets`, `profiles` and `plan_checkins` requests in that
  order and the card disappears; `/plan` shows it before Accept (a separate test). axe on `/` with
  the card reports 0 serious or critical violations; Accept and Keep current are each ≥ 44 × 44 px.
  Offline after one online load (precache settled), a reload of `/` shows the card with both
  buttons disabled (D-0091 §1: assert built content).
- **AC-5 (size)** `check:size` green with a fresh build; the UF-02 chunk doesn't contain the card
  (record the UF-02 and UF-11 chunk sizes in the build log).

**Red proof.** Run AC-1 and AC-2 on main: both fail. Plant one fault on a backup copy (import
`CheckinCard` statically in `slots.tsx`): AC-5's chunk check must show the card inside the UF-02
chunk. Record both.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/features/UF-02/slots.tsx`
  - `apps/web/src/features/UF-02/__tests__/source.test.ts`
  - `tests/e2e/uf-11-plan.spec.ts`
  - `docs/tickets/T-0471-checkin-card-mounts-and-e2e.md`
- Notes on the extras: `slots.tsx` gets the one `todayCheckinSlot` value (D-0071 §4); the UF-02
  test file gets the one pin change; the e2e spec gets appended rows; this ticket file is for the
  build and accept logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass · `uf-11-plan.spec.ts` and `uf-02-today.spec.ts` green (the slot changes
what Today renders) · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs` and `check:size`
green, each test command inside `flock /tmp/workoutlab-tests.lock` · contracts unchanged · commits
start `T-0471` and cite UF-11.1 / UF-02.1.

## Notes
- **Parallel.** UF-11 lane after T-0470. `slots.tsx` is shared with T-0395 (run one after the
  other; the second keeps the other's export). `uf-02-today.spec.ts` isn't edited here.

## Build / accept log
