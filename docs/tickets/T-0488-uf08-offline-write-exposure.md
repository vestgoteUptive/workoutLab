---
id: T-0488
title: "tests/e2e/uf-08-setup.spec.ts T-0303d AC-10 UF-08.4 offline: recordSessions's route is registered before context.setOffline(true) and always fulfills with 201 — migrate onto the shared goOffline fixture"
lane: qa
screens: [UF-08.4]
decisions: [D-0175, T-0484]
deps: [T-0484]
status: ready
---
<!-- Written 2026-10-04 by orchestrator, from a T-0484 build finding (its own report flagged this
as a valid, separate follow-up — not fixed inline since T-0484 was scoped to UF-03/UF-09). Build
flow: wl-build-qa. Small: one site, same pattern already applied elsewhere. -->

## Why
T-0484 built the shared `goOffline(page, context)` e2e fixture (`tests/e2e/fixtures/offline.ts`)
and migrated `uf-03-list-summary.spec.ts` and `uf-09-focus.spec.ts` onto it, closing the
T-0906-style hazard where `context.setOffline(true)` alone doesn't stop `page.route`
interception, so a spec's own mocked write routes can "succeed" even though the app believes
it's offline.

One more site has the same exposure: `tests/e2e/uf-08-setup.spec.ts:517` (T-0303d AC-10, UF-08.4
offline). `recordSessions`'s route is registered **before** `context.setOffline(true)` and always
fulfills writes with `201`, regardless of the offline state. The test's
`expect(writes).toEqual([])` assertion only holds today because nothing happens to attempt a
write in the gap between going offline and the assertion — not because the route would actually
refuse one. If a future change made something write during that window, this test would not catch
it: the mock would silently accept the write, exactly the class of flake T-0906/T-0484 closed
elsewhere.

## Scope
- In: `tests/e2e/uf-08-setup.spec.ts`, the T-0303d AC-10 UF-08.4 offline describe block only.
  Migrate its offline write-recording onto `goOffline`/`writesFulfilledOffline()` /
  `writesAbortedOffline()` from `tests/e2e/fixtures/offline.ts` (see
  `uf-03-list-summary.spec.ts` or `uf-09-focus.spec.ts` for the pattern after T-0484).
- Out: Any other describe block in `uf-08-setup.spec.ts`. `apps/web/src/**` — this is a
  test-harness fix, not a product change. `tests/e2e/fixtures/offline.ts` itself (already correct;
  this ticket only calls it).

## Acceptance criteria
- **AC-1 (real offline model).** The UF-08.4 offline describe block uses `goOffline(page, context)`
  instead of a bare `context.setOffline(true)` plus its own inline write route. Reads continue to
  fall through to the spec's existing mocks.
- **AC-2 (assertion strengthened, proven).** The existing `expect(writes).toEqual([])`-style
  assertion is replaced with (or supplemented by) `expect(writesFulfilledOffline()).toBe(0)`, so
  the test fails if a write is ever actually accepted while offline — not just if one happens to
  be attempted and recorded by the old ad hoc counter.
- **AC-3 (fault proof).** On a backup copy, remove the `goOffline` migration (revert to the old
  always-200 route registered before `setOffline`) and force one write during the offline window
  (e.g. via a temporary direct call in the test). Confirm the new assertion catches it (fails),
  where the old `expect(writes).toEqual([])` would not have. Restore from backup; record both
  runs.
- **AC-4 (no regression).** Every other test in `uf-08-setup.spec.ts` passes unedited. The full e2e
  suite is green.

## Paths you may change
- `tests/e2e/uf-08-setup.spec.ts` (the T-0303d AC-10 UF-08.4 offline block only).
- `docs/tickets/T-0488-uf08-offline-write-exposure.md` (this file, accept log only).

## Contract impact
None.

## Definition of done
Every AC has a passing test or a recorded fault-proof run. `scripts/locked.sh heavy` full gate
green (`-w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`), plus the full e2e suite. Commits start `T-0488` and cite
UF-08.4.

## Notes
- This is the same class of fix as T-0906 and T-0484 — no new decision needed, it applies an
  existing, already-reviewed pattern to one more site.

## Build / accept log
Archived in `docs/tickets/log/T-0488.md` (D-0157).
