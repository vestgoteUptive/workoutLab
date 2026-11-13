---
id: T-0943
title: "UF-08.2 suggested mode: an Add (or Shuffle) after a `fitsBudget: false` swap silently drops the swap-in pin — refuse it with the over-budget copy instead"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-08.5]
decisions: [D-0240, D-0235, D-0239, D-0205, D-0211]
deps: [T-0935, T-0940]
status: todo
---
## Why
Triage follow-up from the empty-start review (D-0239, "Revisit when"). After T-0935 (D-0235) a swap-in becomes a pin. When the user confirms a UF-08.3 swap with `fitsBudget: false` (rule 12.1), the plan is over budget. In **suggested** mode the next Add on UF-08.5 re-suggests with the swap-in as a pin, the engine can't fit it, and it disappears with no message; the user sees their swap undone. Empty mode already refuses here (D-0239 §13.1). This ticket proposes the same behaviour for suggested mode.

**Behaviour (decided in D-0240 §3–4).** Extend D-0239 §13.1 to suggested mode: while the plan is over budget after a `fitsBudget: false` swap, a UF-08.5 Add or "Start with {name}" is refused on the sheet, and a row's "Start with this" or Shuffle is refused in the UF-08.2 status line, all with "Your workout is {over} min over. Remove or swap an exercise first." Time chips still re-run and name the dropped swap-in in "Doesn't fit in {n} min: {names}." (D-0205), so the drop is never silent. The rejected alternative, dropping the swap-in on Add with a "{name} was removed to make room" line, makes the earlier confirm meaningless. The orchestrator asks triage for a decision (amending D-0235 and D-0239 §13) before grooming this to `ready`.

## Scope
- In: the over-budget guard on Add, Start with this and Shuffle in suggested mode; the copy reuse from T-0940 (`apps/web/src/lib/i18n/flows/uf-08.ts`); unit tests.
- Out: empty mode (already covered by T-0940/T-0941); any engine change; changing how UF-08.3 offers `fitsBudget: false` swaps.

## Acceptance criteria
- AC1 Given suggested mode at 30 min and a UF-08.3 swap of an accessory A for B confirmed with `fitsBudget: false` that leaves the plan X min over, When the user adds E on UF-08.5, Then the sheet shows "Your workout is X min over. Remove or swap an exercise first.", B is still in the plan, and the plan is unchanged.
- AC2 Given AC1's over-budget plan, When the user taps Shuffle, Then the plan is unchanged and the UF-08.2 status reads the same copy; focus stays on Shuffle.
- AC3 Given AC1's over-budget plan, When the user taps "Start with this" on a row, Then nothing changes and the status reads the same copy.
- AC4 Given AC1's over-budget plan, When the user picks a smaller time chip, Then B is named in "Doesn't fit in {n} min: …" (never silently gone); When the original minutes are picked again, Then B is back.
- AC5 Given AC1's over-budget plan, When the user removes B (or another item) so the plan fits, Then an Add on UF-08.5 works as today (D-0205 §4), the sibling of AC1.
- AC6 Given a swap with `fitsBudget: true` (sibling), Then Add, Shuffle and Start with this behave as today (T-0935's tests still pass).

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`

## Contract impact
none (UI behaviour; needs a triage decision amending D-0235 / D-0239 §13 before it moves to `ready`).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0943` and cite UF-08.2/UF-08.3.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.

## Addendum (D-0240 §3)
- AC-extra Given a swap-in pin, When a time chip re-suggests and the engine drops the swap-in, Then the "Doesn't fit in {n} min: {names}." line names it. T-0935 hides swap-ins from that line, and this ticket removes that exclusion.
