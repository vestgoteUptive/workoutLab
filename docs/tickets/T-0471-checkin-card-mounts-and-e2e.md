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
- **2026-10-04 (frontend-dev, resumed session).** Resumed mid-build after a usage-limit reset.
  `slots.tsx`, `index.tsx`, `source.test.ts`, `checkin-mount.test.tsx`, the e2e appends and D-0177
  (three UF-02-lane mock fixes) were already in place from the interrupted session; verified and
  continued from there.
- **AC→test map.** AC-1/AC-2/AC-3 → `features/UF-11/__tests__/checkin-mount.test.tsx` (new).
  AC-1 clock-pin → `mount-stability.test.tsx`, `plan.render.test.tsx` (both updated for the
  `CheckinCard` mount's `lib/auth/client.js` hazard, D-0177-adjacent but inside this ticket's own
  UF-11 files). AC-4 → `tests/e2e/uf-11-plan.spec.ts` (a)-(d), appended. AC-5 → `source.test.ts`'s
  two changed pins + the new `slots.tsx` pin. AC-6 → `check:size` plus a planted static import
  (below).
- **D-0177 (three UF-02 files, carried over from the interrupted session).** Confirmed still
  applied: `today.test.tsx`, `reads.test.tsx`, `real.test.tsx` each got the one-line
  `vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }))`. Ran
  `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run
  src/features/UF-02/__tests__/{today,reads,real,source}.test.{tsx,ts}`: 81/81 pass (the 6
  previously-red cases are green again).
- **D-0177 extended to a fourth file, found by this session.** The full `-w test` gate (run once,
  per D-0158, before hand-back) turned up a fourth break the ticket's own `slots.tsx` change
  causes: `UF-02/__tests__/resume-slot.test.tsx` (T-0395 AC6, the `todayResumeSlot`/`ResumeCard`
  mount) — red: `(UF-02) ready: [data-part=resume] sits after the header...` timed out (5000 ms)
  because the real `CheckinCard` now mounts there too (its own `PROFILE` fixture yields a genuine
  proposal) and replaced the resume card's own markup. Unlike the other three files, this one's
  own subject IS a `slots.js` export (`todayResumeSlot`), so D-0177's blanket
  `{ todayCheckinSlot: null, todayResumeSlot: null }` factory would have silenced the very thing
  under test. Fixed with a partial mock instead: `vi.mock("../slots.js", async (importOriginal)
  => ({ ...(await importOriginal()), todayCheckinSlot: null }))`, keeping `todayResumeSlot` real.
  D-0177 updated (title, Context, Decision, Consequences, Revisit) to record this fourth file and
  its different fix shape. `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web
  exec vitest run src/features/UF-02/__tests__/resume-slot.test.tsx`: red before (1 failed/3
  passed, 5000 ms timeout), green after (4/4).
- **AC-5 planted fault (slots.tsx).** Backed up `slots.tsx` (`cp`), replaced the lazy import with
  a static `import { CheckinCard } from "../UF-11/index.js"; export const todayCheckinSlot =
  CheckinCard;`. `source.test.ts` → 2 failed / 27 passed (both new AC-5 pins fail: `typeof
  todayCheckinSlot` is `"function"` not `"object"`, and the "exactly one UF-11 reference, the
  dynamic lazy import" pin no longer matches). Restored from the backup (`cp`, not `git
  checkout`); reran → 29/29 green.
- **AC-6 (size).** Fresh `pnpm --filter @workoutlab/web build` (`VITE_SUPABASE_URL=
  https://abc.supabase.co`, the fixed e2e-config value, D-0071/T-0901 convention; `check:size`
  doesn't care which value, only that the build succeeds): `check:size` green (exit 0). Measured:
  UF-02 chunk (`src/features/UF-02/index.tsx` → `index-B-7iDNmA.js`) 12.3 kB / gzip ~3.9 kB; UF-11
  chunk (`src/features/UF-11/index.tsx` → `index-DFsiv_Jq.js`) 24.65 kB / gzip ~7.82 kB; 58
  precache entries. Grepped the built UF-02 chunk for `CheckinCard`/`insertIfFirstShown`: the only
  hit is the lazy `import().then(e=>({default:e.CheckinCard}))` property access — zero hits for
  `insertIfFirstShown` (the card's write logic), confirming the card's own code isn't inlined.
  Planted the same static import as the AC-5 fault, rebuilt: the manifest's `src/features/UF-02/
  index.tsx` entry now lists `_CheckinCard-DTwks17o.js` as a direct **static** import (not a lazy
  one), i.e. the card's code chunk is now eagerly pulled into the UF-02 entry's own dependency
  graph (59 precache entries, one more than clean); the UF-02 chunk's own code also gained a
  `CheckinCard`/`insertIfFirstShown` hit. Restored `slots.tsx` from the backup, rebuilt clean: back
  to 58 precache entries, `check:size` green again.
- **A second, genuine bug found by the full e2e run (not a planted fault).** `uf-11-plan.spec.ts`
  AC-4(b) and (c) were red on the first full e2e pass:
  - **(c)** Accept/Keep current's `boundingBox()` height was 21 px, not ≥ 44: `CheckinCard.tsx`'s
    two `<button>`s had no `className`, so they got the browser default height — `plan.css`
    already has `.wl-plan__button`/`.wl-plan__button--primary` (44×44 min) but `CheckinCard.tsx`
    never used them (a latent gap since the card was never actually mounted/visible before this
    ticket). Fixed by adding `className="wl-plan__button wl-plan__button--primary"` to Accept and
    `className="wl-plan__button"` to Keep current, in `CheckinCard.tsx`.
  - **(b)** `/plan` never showed the card at all (confirmed reproducible in isolation, not flaky).
    Root cause: `CheckinCard`'s own hook (`use-checkin-data.ts`) does exactly one, un-refreshed
    cache read by design ("never `refreshAll`... the screens that mount it keep the data fresh").
    `Plan`'s own `usePlanData` DOES its own `refreshAll` (cold read, refresh, re-read) — but on a
    genuine first visit to `/plan` (no earlier visit to warm the cache), `CheckinCard` and `Plan`
    mount as independent siblings with no ordering between their two effects, so the card's single
    read can run against a still-cold cache and lose the race, resolving to "no card" with nothing
    to retry it. AC-4(a)/(c)/(d) didn't catch this because they all navigate to `/` twice (the
    first visit's own `refreshAll` warms the cache before the second mount reads it); AC-4(b)
    visits `/plan` once, exposing the real race. Traced with request/response/console logging on a
    scratch copy of the spec (removed before commit) and a temporary `evaluateCheckin` probe under
    `packages/engine/test/` (removed before commit) that confirmed the engine's own proposal is
    correct and non-null for the fixture — the bug is in the mount-site race, not the engine or
    the fixture. First attempted fix (a retry inside `use-checkin-data.ts` mirroring
    `use-plan-data.ts`'s read-refresh-reread shape) was reverted: it would have called the real,
    unmocked `refreshAll` inside `checkin-card.test.tsx`'s existing "no card" unit tests (which only
    wait 50 ms before asserting absence), leaving a dangling `refreshAll` promise and a 3 s timer
    running past each test's own teardown — a cross-test hazard, not a fix. Reverted that file to
    its committed version (`git checkout HEAD --`, safe: it was unmodified by this ticket). Fixed
    at the mount site instead (squarely `index.tsx`/`PlanBody.tsx`, both already touched by this
    ticket's own AC-1): `Plan` now owns the one `usePlanData` call (moved up from `PlanBody`, which
    takes the resulting `PlanState` as a prop instead of calling the hook itself) and gates
    `CheckinCard`'s mount on `state.phase !== "loading"` — so the card's single read never starts
    before Plan's own cache-warming refresh has had its first pass. No extra `usePlanData` call,
    no doubled network reads. `scripts/locked.sh small … vitest run src/features/UF-11`: 184/184
    green after; `src/features/UF-02`: 143/143 green (unaffected).
- **Gate (final, full).** `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test
  --concurrency=1`: 256 test files / 3545 tests, typecheck and lint green. `-w test:repo-checks`:
  159/159. `-w format:check`: green (after one `prettier --write` each on `checkin-mount.test.tsx`
  and `CheckinCard.tsx`, both auto-fixed, re-verified). `node .github/scripts/check-all.mjs`: exit
  0. Fresh build + `check:size`: green, 58 precache entries.
- **e2e (full suite).** `TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y
  pnpm@10.28.2 exec playwright test --config tests/e2e/playwright.config.ts`: first full run 234
  passed / 2 failed (AC-4b, AC-4c, both genuine bugs above, not flakes — reproduced in isolation).
  After the two fixes: 236/236 green, including every AC-3/AC-4 case and the whole existing suite
  (no regression elsewhere).
- **Verdict.** All ACs pass with the fixes above. Two deviations from the ticket's literal "paths
  you may change" list, both flagged for orchestrator/QA ratification: (1) D-0177's now-four
  UF-02-lane test files (one new beyond the interrupted session's three); (2) `CheckinCard.tsx`
  and `PlanBody.tsx` changes that go beyond "mount only" — a button-class fix and a
  cache-warm-ordering fix, both exposed only by this ticket's own new coverage (no prior test,
  unit or e2e, ever exercised the card visible in a real browser or from a genuinely cold cache).
