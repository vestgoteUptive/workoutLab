---
id: T-0471
title: "UF-11.1 CheckinCard mounts: top of UF-11.2, UF-02.1 through todayCheckinSlot (lazy), never on /session/*, e2e Accept on Today"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2, UF-02.1]
decisions: [D-0070, D-0071, D-0106, D-0158, D-0168, D-0169, D-0174]
deps: [T-0470]
status: ready
---
<!-- Written by product-owner 2026-10-03 (groom, D-0168 §5). Third child of the T-0308c board row.
Parent: docs/tickets/T-0308-routines-plan-checkin.md AC-C11, C13, C14. Build flow: wl-build-web.
About ⅓ day. Re-groomed 2026-10-03 against main d84ba81 (D-0174 §1–§3): two UF-02 pins change,
not one; the whole web e2e runs; the Plan re-read after Accept is T-0481. -->

## Why
The card belongs where the user plans (UF-11.2) and where they start each day (UF-02.1). It never
appears inside a workout (principle 1, D-0070 §7). UF-02 owns a registry file for exactly this,
`features/UF-02/slots.tsx` (D-0071 §4), so the mount touches no other UF-02 source file. T-0470
(on main) made the card's writes work. This ticket makes the card reachable.

## Scope
- In:
  - **UF-11.2:** `CheckinCard` is the first element after the `<h1>` inside
    `[data-screen-id="UF-11.2"]` (`features/UF-11/index.tsx`), in every Plan state. `Plan`
    passes its own `now` clock to the card, so a test that pins the Plan clock pins the card's
    too. On Today the card uses its default `systemClock`.
  - **UF-02.1:** `features/UF-02/slots.tsx` sets `todayCheckinSlot` to `lazy(() =>
    import("../UF-11/index.js").then((m) => ({ default: m.CheckinCard })))`. Today already
    renders the slot inside `Suspense`, after C-01 and the attention line (T-0302a AC-A11). Keep
    `todayResumeSlot` (T-0395) exactly as it is.
  - **The two UF-02 pins (D-0174 §1)**, both in `features/UF-02/__tests__/source.test.ts`:
    1. "todayCheckinSlot is null in this ticket" becomes "todayCheckinSlot lazily loads
       CheckinCard from features/UF-11/index.js".
    2. "no file in features/UF-02 imports features/UF-11" skips `slots.tsx` only. A new `it` in
       the same `describe` pins `slots.tsx`: exactly one UF-11 reference, the dynamic
       `import("../UF-11/index.js")`, and no static or side-effect UF-11 import.

    The "AC-5 import-ban CONTRAST" test and every other UF-02 test stay byte-identical.
  - **e2e** appended to `tests/e2e/uf-11-plan.spec.ts`.
  - **The whole web e2e** (D-0158: `slots.tsx` is outside the UF-11 folder). If another spec goes
    red only because the card now shows on `/`, D-0174 §3 applies: you may edit only the
    `plan_checkins` handling in `tests/e2e/fixtures/supabase-mock.ts`. Anything else is
    `needs-triage`.
- Out:
  - Anything in the card itself (T-0308c, T-0470).
  - The Plan re-read after Accept or Keep (T-0481).
  - Today reflecting an Accept before a remount (T-0482).
  - Editing `Today.tsx` or any other UF-02 source file.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the lazy chunk is precached. Offline, after one online load, `/` shows the card
  with both actions disabled (AC-4).
- **In a workout:** the card never renders on `/session/*` (AC-3).
- **Date independence:** the e2e data has no sets, so on any run date it proposes a step down from
  3–4. Assert that the card is present and that the writes happen, not any date text (D-0174 §3).
- **Zero history / returning after 10 days off:** the card's own logic covers these (T-0308c).
  Nothing new here.

## Acceptance criteria
Each test title starts with `T-0471 AC-n`. The vitest fixtures are T-0308c's: the AC-1 proposal
(P2 = 7, P3 = 3) cached, and `features/UF-11/__tests__/fixtures.ts`.

- **AC-1 (UF-11.2, red on main)** **Given** the AC-1 proposal is cached, **when** `/plan` renders,
  **then** `[data-part="checkin-card"]` is the next element sibling of the `<h1>`. **Given**
  P3 = 5, **then** there is no card, and the Plan body's text matches the same render on main.
  **Red:** on main, `/plan` has no card.
- **AC-2 (UF-02.1, red on main)** **Given** the proposal is cached, **when** `Today` renders (from
  `features/UF-02/index.js`, with the real `slots.tsx`), **then**:
  - the card renders once;
  - in DOM order it comes after the C-01 compact region and the attention line, and before the
    suggestion card;
  - the `h1` and "Start workout" are in the DOM before the lazy chunk resolves.
- **AC-3 (never in a workout, principle 1)** **Given** the proposal is cached, **when** the router
  is at `/session/setup`, `/session/S1` or `/session/S1/summary`, **then** there is no
  `[data-part="checkin-card"]` and none of its text. At `/`, the card is there. The existing
  import-ban tests (UF-03/UF-08/UF-09 ↛ UF-11) pass unedited.
- **AC-4 (e2e, `uf-11-plan.spec.ts`, preview build, mocked Supabase with `UF11_FIXTURES`)**
  - (a) `/` shows the card. Tap Accept: the writes made after the tap are, in this order, the
    `area_targets` upsert, the `profiles` update and the `plan_checkins` update (by method and
    path; the first-shown `POST plan_checkins` comes before the tap and isn't counted), and the
    card disappears.
  - (b) A separate test: `/plan` shows the card before any tap.
  - (c) axe on `/` with the card shows 0 serious or critical violations. Accept and Keep current
    each have a `boundingBox()` of at least 44 × 44.
  - (d) Offline, after one online load with the precache settled: a reload of `/` shows the card
    with both buttons disabled (D-0091 §1: assert the built content).
- **AC-5 (the slot pins, D-0174 §1)** Both changed tests pass. Then plant a static
  `import { CheckinCard } from "../UF-11/index.js"` into `slots.tsx` on a backup copy: the new
  `slots.tsx` pin fails. Restore from the backup.
- **AC-6 (size)** `check:size` is green with a fresh `pnpm --filter @workoutlab/web build`, and
  the UF-02 chunk doesn't contain the card. Record the measured UF-02 and UF-11 chunk sizes in
  the build log. Then plant the same static import as AC-5: the card's code shows up inside the
  UF-02 chunk. Record it.

**Red proof.** Run AC-1 and AC-2 on main: both fail. Record them, plus the AC-5 and AC-6 planted
faults, in the build log.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/features/UF-02/slots.tsx`
  - `apps/web/src/features/UF-02/__tests__/source.test.ts`
  - `tests/e2e/uf-11-plan.spec.ts`
  - `tests/e2e/fixtures/supabase-mock.ts`
  - `docs/tickets/T-0471-checkin-card-mounts-and-e2e.md`
- What each extra is for:
  - `slots.tsx`: the one `todayCheckinSlot` value (D-0071 §4).
  - `source.test.ts`: the two pin changes (D-0174 §1).
  - `uf-11-plan.spec.ts`: the appended rows.
  - `supabase-mock.ts`: only its `plan_checkins` handling, and only if another spec fails because
    the card shows (D-0174 §3). Leave it alone otherwise.
  - This ticket file: the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- The whole web e2e is green (D-0158), including `uf-11-plan.spec.ts` and `uf-02-today.spec.ts`.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check`, `node .github/scripts/check-all.mjs` and `check:size` (after a fresh build)
  are green. Every test command runs through `scripts/locked.sh` (D-0169): `heavy` for the gate
  and e2e, `small` for named vitest files.
- Contracts are unchanged.
- Commits start `T-0471` and cite UF-11.1 / UF-02.1.

## Notes
- **Parallel.** T-0469 (e2e for the account screen) and T-0216 (`AccountSettingsBody`) are also
  in the UF-11 lane. T-0471 touches neither of their files (D-0172 §8), but don't run it while one
  of them edits `features/UF-11/index.tsx`. T-0481 follows this ticket.

## Build / accept log
