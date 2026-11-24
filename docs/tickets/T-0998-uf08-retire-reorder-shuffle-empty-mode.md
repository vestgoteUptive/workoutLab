---
id: T-0998
title: UF-08 retire Reorder, Shuffle and the empty-mode Suggestions code now that the area plan replaces them
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.5]
decisions: [D-0274, D-0236, D-0238, D-0205, D-0242]
deps: [T-0997]
status: todo
---
## Why
After T-0996 and T-0997 the old controls are unreachable. Dead code and dead tests slow every later ticket (D-0274 §3). This ticket removes them and keeps the engine inputs they used.

## Scope
- In (`apps/web/src/features/UF-08/`, `apps/web/src/lib/i18n/flows/uf-08.ts`): delete Reorder mode and `order.ts`'s permutation use, Shuffle on UF-08.2, the Suggestions section and `suggestions.ts`, "Other suggestions", the `mode: "empty"` visit state and its budget line, the empty-mode branches in `AddExerciseSheet`, dead copy and CSS; keep `autoMainLift` and `fill` calls only where "Start empty" and "Fill the rest" still use them. Mark `docs/specs/empty-start-plan.md` status "folded into D-0274" (extra, product path, by grant). Delete or rewrite the tests that pinned the retired behaviour, each with a one-line reason.
- Out: the engine switches and rule 13 (stay), UF-09.10 and its sheet, data, tokens.

## Acceptance criteria
- AC1 Given UF-08.2 in any state, Then there is no "Reorder", "Move up", "Move down", "Shuffle", "Other suggestions" or "Suggestions" text or control (a text-absence test with the area plan present: the sibling assertion that the area rows still render).
- AC2 Given "Start empty" and "Suggest my workout", Then both still open UF-08.2 (empty and default) and "Fill the rest for me" still works (the T-0996 ACs pass unchanged).
- AC3 Given UF-08.5 opened from UF-08.6, Then its lead line is the area-first line of the spec (not the empty-mode "{left} of {n} min left."), and an Add is local (T-0997 AC5 unchanged).
- AC4 Given the sources, Then no import of the deleted files remains, `exports-and-lint` and `jsx-no-literals` pass, and `pnpm -w lint` is clean.
- AC5 Given UF-09.10 (add during a workout) and UF-09.9 "Do later", Then their tests pass unchanged (they are not retired).
- AC6 Given `docs/specs/empty-start-plan.md`, Then its status line says it is folded into D-0274 and `check-all` passes.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `docs/specs/empty-start-plan.md` (extra, one status line), `tests/e2e/uf-08-*.spec.ts`. Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0998` and cite UF-08.2.

## Build / accept log
