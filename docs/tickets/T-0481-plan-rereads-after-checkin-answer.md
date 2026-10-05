---
id: T-0481
title: "UF-11.2 re-reads the plan after the card's Accept or Keep (CheckinCard onAnswered → Plan's usePlanData cache re-read)"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2]
decisions: [D-0070, D-0113, D-0172, D-0174, D-0181]
deps: [T-0471]
status: ready
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-03 (groom, D-0174 §2). Split from T-0471 by D-0157 §7.
Re-groomed 2026-10-05 against main b16b2ee (D-0181 §1): T-0471 moved the one `usePlanData` call
from `PlanBody` up into `Plan` (`index.tsx`), so a `key` bump on `PlanBody` would re-read nothing.
The re-read now lives in the hook. Build flow: wl-build-web. About ¼ day. -->

## Why
T-0471 mounts the card at the top of UF-11.2. A successful Accept changes the rhythm and the 9
targets, but `Plan` reads the cache once per mount (`usePlanData`), so the screen keeps showing
the old "3–4 per week" and the old numbers right under the card that just changed them. That's a
silent mismatch (principle 4: targets adapt, and the user sees it).

## Scope
- In:
  - **`CheckinCard`** (`features/UF-11/CheckinCard.tsx`) gets an optional
    `onAnswered?: () => void` on `CheckinCardProps`. `CardReady` calls it **once**, after a
    successful Accept or Keep, after that write's `refreshAll` has settled (resolved or rejected),
    in `runWrite`'s success path. It is never called:
    - for a failed write (the `catch` path);
    - when the card hides because another device answered (D-0172 §2, the `insertIfFirstShown`
      path);
    - offline (the buttons are disabled).
  - **`usePlanData(clock, revision = 0)`** (`features/UF-11/use-plan-data.ts`) gets an optional
    second argument. When `revision` changes after mount, the hook runs **one cache read**
    (`read()`, the same function the mount uses) and sets `{ phase: "ready", data }` if it
    returns data. That re-read:
    - does **not** call `refreshAll` (the card just ran one);
    - never sets `loading` or `cold`; a `null` or rejected read leaves the state as it was;
    - is cancelled on unmount and when the next revision arrives (the newest read wins);
    - keeps the pinned `at` instant.

    The mount effect (D-0113 refresh, 3 s cap) is unchanged.
  - **`Plan`** (`features/UF-11/index.tsx`) holds `const [revision, setRevision] = useState(0)`,
    calls `usePlanData(now, revision)` and passes
    `onAnswered={() => setRevision((r) => r + 1)}` to `CheckinCard`.
- Out:
  - Remounting `PlanBody` or `CheckinCard` (D-0181 §1). A remounted card would re-read a cache
    that, after a rejected refresh, still holds the unanswered proposal, and it would show the card
    again right after the user answered it.
  - UF-11.3 `EditPlanBody`. It keeps calling `usePlanData(clock)` with no second argument.
  - Today (UF-02.1). That's T-0482, which uses this ticket's `onAnswered` prop.
  - Any change to the writes (`checkin-writes.ts`) or to the D-0113 mount refresh rule.
  - e2e. `mockSupabaseData` serves static rows, so a post-Accept `refreshAll` in Playwright
    re-reads the old profile. The unit tests prove the behaviour against a real `lib/offline`
    cache.

### Edge cases that are in scope
- **Offline:** the buttons are disabled offline, so `onAnswered` can't fire (AC-3).
- **Refresh fails after the write:** the cache still holds what it had before. The callback still
  fires, the body shows what the cache has, and the card stays hidden (AC-2).

## Acceptance criteria
Each test title starts with `T-0481 AC-n`. Use `checkin-mount.test.tsx`'s seed (`seedAc1Proposal`:
rhythm 3–4, P2 = 7, P3 = 3, so the engine proposes 2–3; `targetsF()` has chest 20). `refreshAll` is
mocked. Its first call (Plan's mount refresh) resolves without writing. Where an AC says
"accepted refresh", its next call writes the accepted profile (rhythm 2–3) and targets (chest 14)
into the cache before resolving.

- **AC-1 (Accept, red on main)** **Given** `/plan` rendered with the seed and an accepted refresh,
  **when** Accept succeeds, **then**:
  - the card (`[data-part="checkin-card"]`) is gone;
  - the rhythm section shows `en.uf11.rhythm(2, 3)` and the chest target row shows 14, with no
    reload;
  - `onAnswered` was called exactly once, after the card's `refreshAll` promise settled. Record
    the order with a shared call log.

  **Red:** on main (after T-0471), the body still shows 3–4 and 20.
- **AC-2 (Keep, and a rejected refresh)**
  - **Given** the same seed, **when** Keep current succeeds, **then** `onAnswered` is called once
    and the rhythm section still shows `en.uf11.rhythm(3, 4)`.
  - **Given** the same seed, **when** Accept succeeds but the card's `refreshAll` rejects,
    **then** `onAnswered` is still called once, the rhythm section still shows 3–4 (what the cache
    has), and after a real 50 ms macrotask `[data-part="checkin-card"]` is still absent.
- **AC-3 (no call when nothing was answered)** `onAnswered` is called 0 times in each case, each
  checked after a real 50 ms macrotask:
  - the area_targets step of Accept fails, so the card shows its error (`role="alert"`);
  - the card hides because the 23505 path found an answered row;
  - offline, where the buttons are disabled.
- **AC-4 (a cache re-read, not a remount)** After AC-1's Accept:
  - `refreshAll` was called exactly twice in total: Plan's mount refresh and the card's own. The
    re-read adds none.
  - The rhythm `<p>` holds new text but is the **same DOM node** as before the tap (node
    identity), so `PlanBody` neither remounted nor fell back to `loading`.
- **AC-5 (Edit plan unchanged)** `EditPlanBody.tsx` is not in the diff, and
  `edit-plan.test.tsx` and `mount-stability.test.tsx` pass unedited.

**Red proof.** Run AC-1 on main: it must fail. Then plant one fault on a backup copy: call
`onAnswered` before `refreshAll` settles. AC-1's ordering check must fail. Restore from the backup
(`cp`) and record both runs.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `docs/tickets/T-0481-plan-rereads-after-checkin-answer.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- `tests/e2e/uf-11-plan.spec.ts` is green (`npx playwright test` on that one spec, through
  `scripts/locked.sh heavy`, D-0178). The whole e2e suite isn't needed: the diff stays in one
  feature folder.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0481` and cite UF-11.2.

## Notes
- **Parallel.** T-0482 (UF-02 lane) waits for this ticket, because it passes `onAnswered` through
  the Today slot. T-0492 and T-0363 share this lane. Don't run either while this ticket edits
  `use-plan-data.ts` or `index.tsx`.

## Build / accept log

- 2026-10-05 build (frontend-dev). Branch base e014da3, tree clean. Added `onAnswered` to
  `CheckinCard`, a `revision` arg to `usePlanData` (one cache-only re-read, no `refreshAll`), and
  `Plan` wiring. New `__tests__/checkin-reread.test.tsx` (9 tests); diff only in
  `features/UF-11/**`, `EditPlanBody.tsx` untouched.
- AC map: AC-1 two tests (Plan body 2-3 / chest 14 / card gone; call-log order refresh:settled
  before onAnswered, once); AC-2 three tests (Keep once, Plan Keep 3-4, rejected refresh once +
  card stays gone after 50 ms); AC-3 three tests (area_targets fails, 23505 hide, offline);
  AC-4 one test (2 `refreshAll` calls, same rhythm `<p>` node); AC-5 `edit-plan.test.tsx` and
  `mount-stability.test.tsx` pass unedited.
- Red on main (tests written before the code): 5 of 9 failed (AC-1 x2, AC-2 x2, AC-4); the AC-3
  no-call tests are green by construction.
- Planted fault (backup copy, restored with `cp`): `onAnswered?.()` before `refreshAll`. AC-1
  ordering test and the AC-2 rejected-refresh test failed (2 red); restored, 9 green.
- Gate: `-w typecheck lint test --concurrency=1` once failed in `@workoutlab/web#test` (cause not
  captured; did not reproduce); web test rerun 261 files / 3619 tests green. UF-11 folder run
  ~12 times: one transient failure, not reproduced, not identified. `test:repo-checks`,
  `format:check`, `check-all.mjs` green. `tests/e2e/uf-11-plan.spec.ts` 15 passed.
