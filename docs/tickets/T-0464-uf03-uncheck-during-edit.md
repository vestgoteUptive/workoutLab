---
id: T-0464
title: "UF-03.1 List view: an uncheck tapped while a done row's edit is saving is no longer dropped — it runs once the edit settles"
lane: web-feature:UF-03
screens: [UF-03.1]
decisions: [D-0071, D-0128, D-0015]
deps: [T-0417]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48 (T-0417 review follow-up).
Build flow: wl-build-web. About ¼ day. Small-to-medium: timing in a shared row component, so it
keeps review + QA (D-0178 §2). -->

## Why
On UF-03.1 a user corrects the weight on a set they already ticked, then taps that row's checkbox
to untick it. The tap blurs the kg field first. Blur commits the edit (`ctx.editSet`), which sets
the row's `busy` flag, and the click that follows hits `onToggle`'s `if (busy.current) return`. The
uncheck is silently dropped: the set stays logged, and the user has to notice and tap again
(`apps/web/src/features/UF-03/ListView.tsx`, `SetRow`, `run`/`onToggle`/`commit`). That is wrong
data on the user's 14-day balance from a normal gesture.

## Scope
- In: `SetRow` remembers one toggle that arrives while an **edit** (`ctx.editSet`) is in flight,
  and runs it once that edit settles, whether it resolved or rejected (the user's last intent
  wins). At most one toggle is remembered; a second tap while the edit is still in flight cancels
  the remembered one (tap, tap = no change).
- In: the pending state stays visible (`aria-busy`) until the remembered toggle has also settled.
- Out: a toggle that arrives while a **toggle** (`recordSet`/`deleteSet`) is in flight is still
  dropped. That guard prevents a double log on a double tap, and T-0417's tests pin it.
- Out: UF-09, the queue, `ctx` (D-0071 §5).

### Edge cases in scope
- Offline: `editSet` and `deleteSet` go to the IndexedDB queue (D-0015), so the order holds offline.
- The edit fails: the row shows its failed state, then the remembered uncheck still runs.
- An above-plan row (T-0472 `keepRow`): the uncheck keeps the row with the **edited** values.

## Acceptance criteria
Tests in `apps/web/src/features/UF-03/__tests__/`, with a `ctx` whose `editSet` resolves on a
deferred the test controls.
- **AC-1 (the bug)** Given a done row logged at 60 kg × 8, when the user types `62.5` in its kg
  field and clicks its checkbox (blur fires `editSet`, which is still pending), then `deleteSet` has
  not been called yet; when `editSet` resolves, then `deleteSet` is called exactly once with that
  row's `clientId`, after `editSet`, and the row ends unchecked. **Red on main:** `deleteSet` is
  never called.
- **AC-2 (edit fails)** Same as AC-1, but `editSet` rejects: then `deleteSet` is still called
  exactly once after the rejection, and the row ends unchecked.
- **AC-3 (tap, tap)** Same as AC-1, but the checkbox is clicked twice while `editSet` is pending:
  then after it resolves `deleteSet` is never called and the row stays checked with 62.5 kg.
- **AC-4 (toggle during toggle, the other value)** Given an unchecked row, when its checkbox is
  clicked twice while the first `recordSet` is pending, then `recordSet` is called once and
  `deleteSet` never (T-0417's double-tap guard is unchanged).
- **AC-5 (busy shown)** During AC-1, from the click until `deleteSet` settles, the row has
  `aria-busy="true"`.
- **AC-6 (no edit)** Given a done row with no edit typed, when its checkbox is clicked, then
  `deleteSet` is called at once (no regression).
- Existing UF-03 tests stay green.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- `docs/tickets/T-0464-uf03-uncheck-during-edit.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, each red on main or on a planted fault (record which) · `pnpm -w typecheck
lint test` green plus `-w test:repo-checks` · the UF-03 e2e spec(s) green · commits start with
`T-0464` and cite UF-03.1.

## Build / accept log

### Build log (2026-10-07, base ec3c73a, tree clean)
- `SetRow` (`ListView.tsx`): `run` takes an `edit` marker; a toggle during an in-flight edit sets `queued` (a second tap flips it back); on edit settle (resolve or reject) the remembered toggle runs through the latest `onToggle`; `keepRow` gets the edited values. Toggle-during-toggle still dropped.
- Tests: `__tests__/list-view.uncheck-edit.test.tsx`. AC-1 → "AC-1"/"AC-1b", AC-2, AC-3, AC-4, AC-5, AC-6 (one test each).
- Red on main (ListView.tsx at HEAD): AC-1, AC-1b, AC-2, AC-5 fail; AC-3/AC-4/AC-6 pass on main (they pin unchanged behaviour). Planted faults (backup copy, restored by cp): second tap doesn't cancel → AC-3 red; no run after reject → AC-2 red; remember toggle during toggle too → AC-4 red.
- Loop: new test file x20 = 0 failures.
- Gate: `-w typecheck lint test --concurrency=1` green; test:repo-checks 311 pass; format:check clean; check-all exit 0; e2e `uf-03-list-summary.spec.ts` 4 passed.
