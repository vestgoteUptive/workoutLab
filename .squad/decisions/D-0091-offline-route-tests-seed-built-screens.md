---
id: D-0091
title: Offline route tests seed data for built screens and assert the URL holds; the UF-06.2 row of shell.spec.ts AC-6 belongs to T-0307b
status: revisit
date: 2026-10-01
by: product-owner (T-0905 ci-spec)
area: process
builds-on: D-0079 §3, D-0086, D-0088
---
## Context
T-0318 put five Phase 3 sub-routes in one `OTHER_SUB_ROUTES` loop in `tests/e2e/shell.spec.ts`
(AC-6, offline). The loop warms on `/`, goes offline with an empty IndexedDB library, and checks
that `[data-screen-id]` becomes visible. That worked while every route was a stub that rendered
its id unconditionally. T-0306a built UF-04.3, which correctly redirects an exercise id it can't
find in the cache to `/library` (D-0079 §3). The test then passed or failed on whether
Playwright's first poll landed in the ~70–120 ms before the redirect. It failed in CI run
36684650472 (diagnosis `docs/ci/CI-T-0905-uf04-compare-offline-redirect-race.md`).

`/progress/back-squat` (UF-06.2) in the same loop will hit the same race once T-0307b merges,
because its built screen also redirects an unknown exercise id (D-0088 context). The jsdom guard
test `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx` has the same latent shape for UF-04.3.

## Decision
1. **A route test on a built screen seeds the data that screen needs.** It asserts the built
   screen's content, not just the outer `data-screen-id` wrapper. "Seed" means the real path:
   `mockSupabaseData` and an online visit in e2e, the `lib/offline` test helpers in jsdom.
2. **A route test that expects a screen to stay asserts that the URL is unchanged after
   render.** This turns a redirect into a deterministic failure instead of a timing-dependent
   pass. T-0905 adds the assertion to the shared `OTHER_SUB_ROUTES` loop body. It is trivially
   true for stubs and catches the next built screen that redirects.
3. **The empty-cache path is pinned by a contrast test, not raced.** For UF-04.3, offline with
   an empty cache, the compare URL lands on `/library` (UF-04.1).
4. **UF-06.2's row is left to T-0307b, not hardened by T-0905.** On `main`, UF-06.2 is still the
   stub. It loads nothing, so there is no built content to assert yet, and seeding it now would
   test nothing. With §2 in the loop, T-0307b's own PR run fails deterministically on that row
   rather than by luck. T-0307b then takes the row out of the loop and seeds it per §1, with
   its own fixture.
5. **Grant (the D-0088 §4 mechanism).** T-0307b may change the `/progress/back-squat` row and its
   dedicated test in `tests/e2e/shell.spec.ts` (AC-6 describe) only. Other rows and the shared
   loop body stay byte-identical. The orchestrator adds this grant to T-0307b's
   `## Paths you may change` on main. No timeout is raised and no retry is added (D-0086 §6).

## Consequences
- T-0905 (qa) fixes the UF-04.3 e2e row and adds §2 to the loop. T-0365 (web-shell) fixes the
  UF-04.3 row of `auth-guard.phase3.test.tsx`.
- T-0307b gets one more grant, for its row in `shell.spec.ts`. T-0308a/T-0308b rows (`/plan/edit`,
  `/plan/routines/*`) follow the same rule if their built screens redirect on an empty cache.
- `profile-gate.test.tsx` visits the same compare path, and `/library/back-squat`, in its AC-6
  "gate stands down" contrast. It may have the same latent shape. It is not changed by T-0905 or
  T-0365. It is a follow-up check for web-shell.

## Revisit when
- Every Phase 3 route is built and no stub row is left in `OTHER_SUB_ROUTES`. The loop can then
  be replaced by per-route seeded tests, and this grant expires.
