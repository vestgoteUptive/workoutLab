---
id: D-0088
title: T-0318's stub-era cases in the shell route tests describe a creation state; a feature ticket may update the rows for its own routes
status: revisit
date: 2026-09-29
by: orchestrator
area: process
builds-on: D-0075, D-0071 §1, D-0063
---
## Context
T-0318 created stub screens for the Phase 3 routes and pinned them in three web-shell tests:
- `apps/web/src/app/__tests__/routes.phase3.render.test.tsx`: the stub `<h1>` title per route, plus a source scan for `<h1>{en.screens.X}</h1>`.
- `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx` and `apps/web/src/app/__tests__/profile-gate.test.tsx`: guard and gate behaviour, exercised on a feature route such as `/progress/back-squat`, with `lib/offline` mocked only as far as a stub needed.

When T-0307b built UF-06.2, five of those cases failed, although nothing was wrong with the product. The real screen redirects an unknown exercise id, uses the exercise name as its `<h1>`, and calls loaders the stub never needed. The feature lane can't edit `app/**`, so it would be stuck. D-0075 already ruled on this shape for the flow string files: an assertion that pins T-0318's creation state is a defect once the owning feature ticket builds, because it is not an invariant.

## Decision
1. **Same principle as D-0075.** In those three files, the rows and cases that exist only because a route was a stub (its stub title, its stub `<h1>` source scan, and mocks shaped to what the stub loaded) may be updated by the feature ticket that builds that route.
2. **Keep each test's guarantee.** Update rows to the built screen's truth. Don't delete coverage:
   - The route ranking and the C-02 active tab stay asserted for every route.
   - The guard and gate behaviour stay asserted on the same route. Seed the fixture (library row, loaders) so the screen renders, rather than switching to a route where nothing can fail.
   - A source scan may point at the built screen's real heading expression.
3. **Only your own routes.** A ticket touches only the rows or cases naming its own flow's routes. Other rows are left byte-identical.
4. **Grants are explicit.** The orchestrator adds these files to the ticket's `## Paths you may change` on main, citing this decision, because T-0320 reads grants from the base. Review checks that the diff in these files stays within points 2 and 3.

## Consequences
- Granted now to T-0307b (UF-06.2) and T-0306a (UF-04.3, if its Compare heading changes). T-0308a and T-0308b keep the stub `<h1>` literals by spec (their triage checks), so they need no grant.
- Revisit when the stub-era rows are all gone. The three files then describe the built app only, and this decision can be superseded by a plain web-shell ownership note.
