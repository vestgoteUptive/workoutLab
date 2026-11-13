---
id: T-0946
title: "User flows and PRD: list \"Add exercise during a workout\" as a real screen (UF-09.10) and add the new button to UF-09.9 Paused"
lane: product
screens: [UF-09.10, UF-09.9]
decisions: [D-0243, D-0246, D-0002, D-0205]
deps: []
status: ready
---
## Why
D-0243 registered UF-09.10 in user flows v2 as "proposed, not built" so the screen-ID check accepts it. The owner accepted the spec (D-0246 §1), so the flow and PRD now describe it as part of v1.

## Scope
- In: the UF-09.10 row without "proposed, not built"; the UF-09.9 row's actions in D-0243 §1 order; an "Add exercise" paragraph beside the existing "Do {name} later" paragraph; one PRD Scope v1 row; the PRD "Add and reorder" row and Out of scope no longer say adding is before-workout only.
- Out: screen specs (T-0944), any code.

## Acceptance criteria
- AC1 Given `Design-docs/docs/product/user-flows.md`, Then the UF-09.10 row has no "proposed" text and cites D-0243 and the spec.
- AC2 Given the UF-09.9 row, Then its actions read Resume · swap · do later · add exercise · skip · how-to · list view · end.
- AC3 Given user flows, Then an "Add exercise" paragraph says: from UF-09.9 only, hidden on a pause from UF-09.8, goes after the current exercise, refused when it doesn't fit the time left or the plan has 8 exercises, stays paused after the add, works offline.
- AC4 Given `docs/PRD.md` Scope v1, Then one row "Add exercise during a workout" names UF-09.10 and UF-09.9, the spec and D-0243–D-0246 with tickets T-0944–T-0950, and the UF-09 row's screens read ".1 Get ready … .10 Add exercise".
- AC5 Given the change, When `node .github/scripts/check-all.mjs` runs, Then it exits 0.

## Paths you may change
`Design-docs/docs/product/user-flows.md`, `docs/PRD.md`

## Contract impact
none.

## Definition of done
Every AC checked · `node .github/scripts/check-all.mjs` and `pnpm -w format:check` green · commit messages start with `T-0946` and cite UF-09.10.
