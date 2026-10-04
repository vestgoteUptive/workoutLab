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
- 2026-10-04 wl-build-qa. `git status` clean, HEAD `29ea533` on `t/T-0488-uf08-offline-write`
  (behind `main`; `git merge-tree` against current `main` shows a clean auto-merge, no
  `<<<<<<<` markers — only `.squad/board.md`/`.squad/journal/**` text differs, both out of this
  ticket's scope — so per the ticket no merge action is needed here).
- Migrated the T-0303d AC-10 UF-08.4 offline describe block
  (`tests/e2e/uf-08-setup.spec.ts`) onto `goOffline`/`OfflineGate` (T-0484,
  `tests/e2e/fixtures/offline.ts`), following the `uf-09-focus.spec.ts` pattern: `recordSessions`
  (the spec's own `sessions*` route) is still registered first; `goOffline(page, context)` is
  called after it, so the gate's write-abort route is the last-registered handler on
  `rest/v1/**` and wins while armed, and the gate itself puts the context offline (no window
  where `setOffline(true)` is true but a write could still be fulfilled). `context.setOffline`
  calls replaced with `goOffline`/`gate.goOnline()`; `expect(writes).toEqual([])` replaced with
  `expect(gate.writesFulfilledOffline()).toBe(0)`.
- AC map: AC-1 → the block now calls `goOffline(page, context)` instead of a bare
  `context.setOffline(true)`, reads still fall through `recordSessions`'/`mockSupabaseData`'s
  mocks unchanged (the existing `toReady`/`startWorkout` flow still passes). AC-2 →
  `expect(gate.writesFulfilledOffline()).toBe(0)` replaces `expect(writes).toEqual([])`. AC-3 →
  fault-proof below. AC-4 → full spec file and full e2e suite green below.
- **AC-3 fault proof** (backup via `cp` to the scratchpad, restored via `cp`, never
  `git checkout`):
  1. Reverted the block to the old pattern (`await context.setOffline(true)` /
     `expect(writes).toEqual([])`, no `goOffline`) and forced one write to `session_sets`
     (a table `recordSessions`'s `sessions*` route never watches, still answered 200 by
     `mockSupabaseData`'s always-on route) from inside the offline window via
     `page.evaluate(fetch(...))`. Red run: **1 passed** — the old assertion stayed green and
     never saw the write (`writes` only watches `sessions*`); this is the exact silent-accept
     hazard the ticket describes.
     `TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y pnpm@10.28.2 exec playwright
     test --config tests/e2e/playwright.config.ts -g "offline Start writes IndexedDB and
     navigates"`.
  2. Planted my own fault on top of the real migration: a spec-local route on
     `session_sets*` registered *after* `goOffline` (the documented ordering hazard —
     most-recently-registered handler wins), fulfilling 201, simulating a future write path
     added below the gate. Forced the same write; asserted `writes` stayed `[]` (old assertion:
     still blind to it) and `await expect.poll(() => gate.writesFulfilledOffline()).toBe(1)`
     (new assertion catches it — the gate's `requestfinished` listener watches every non-GET/HEAD
     `rest/v1` request regardless of which route answered it, not just `sessions*`). Run: **1
     passed**, confirming the new assertion detects what the old one would miss (same command as
     above, `toBe(1)` temporarily swapped in).
  3. Restored `tests/e2e/uf-08-setup.spec.ts` from the post-migration backup (`cp`, not
     `git checkout`) to the clean AC-1/AC-2 version; re-ran the full spec file: 32/32 green.
- Full gate: `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test
  --concurrency=1` → 19/19 tasks, 255 test files / 3539 tests passed (Turbo cache hit, stderr
  noise in a few UF-09 lazy-seam tests is the fixtures' own simulated-rejection logging, not a
  failure). `-w test:repo-checks` → 159/159 passed. `-w format:check` → clean. `node
  .github/scripts/check-all.mjs` → exit 0. Full e2e suite (`TMPDIR=$HOME/.cache/wl-pw-tmp
  scripts/locked.sh heavy npx -y pnpm@10.28.2 exec playwright test --config
  tests/e2e/playwright.config.ts`) → **231/231 passed**.
