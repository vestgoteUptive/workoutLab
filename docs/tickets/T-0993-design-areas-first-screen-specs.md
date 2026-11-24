---
id: T-0993
title: Screen specs for areas first - UF-08.2 Today's plan rewritten, new UF-08.6 Area detail, amended UF-08.1, UF-08.5 and UF-08.3
lane: design
screens: [UF-08.1, UF-08.2, UF-08.3, UF-08.5, UF-08.6]
decisions: [D-0274, D-0275, D-0276, D-0211, D-0239]
deps: []
status: todo
---
## Why
The web build needs one spec per screen (`docs/specs/areas-first-planning.md`, D-0276). `UF-08.2.md` today documents the exercise list, the Removed line, Add and reorder, and empty mode.

## Scope
- In (`Design-docs/docs/design/screens/`): rewrite the head of `UF-08.2.md` (layout top to bottom at 320 and 390 px, title, time bar per area, why chips, area row, stepper, Add an area, Fill the rest, time chips, Looks good, state table, copy, focus, live region, contrast pairs) and mark the Reorder, empty-mode and Shuffle sections retired; new `UF-08.6.md` (header, exercise rows with Swap, Not today, Remove, Start with this, how-to, Add exercise, Removed line, states, focus); amend `UF-08.1.md` (Start empty opens UF-08.2 with no areas), `UF-08.5.md` (area-first list, local Add, lead line) and `UF-08.3-UF-05.1.md` (opened from UF-08.6). A web follow-up note for `web-feature:UF-08`.
- Out: tokens (none new), the layer 1 prompt card and UF-11.4 (T-1000), code.

## Acceptance criteria
- AC1 Given `UF-08.2.md`, Then it specifies the area row (name, time, stepper `− k sets +`, "Last 14 days: load of target sets", "{n} exercises" and chevron), the stepper rules (min 2, max 7 or 6, − becomes Remove at 2, + refused for time or cap with the reason line), the "Add an area" list with its four reasons, "Fill the rest for me" and "Looks good" disabled at 0 areas.
- AC2 Given the state table, Then it has a row for each of: normal, zero history, returning after 10 days off, time running out, everything skipped or recovering, offline, start empty, over budget, all areas at maximum, loading. Sibling pairs are covered: online/offline, empty/non-empty.
- AC3 Given `UF-08.6.md`, Then it specifies the route `?step=area&area=...` and the cold-load rule, the row actions with unique accessible names, "Not today" and its Undo line, the local Add, the last-exercise-removed return, and the focus rule on Back.
- AC4 Given every new rule, Then it uses only `--wl-*` variables and existing foundation classes; the contrast pairs are written with ratios; every target is at least 44 px; state is in words (D-0211 §5). `check-all` and the design-docs tests pass.
- AC5 Given the retired features, Then each section that is retired says "retired by D-0274" and what replaces it.

## Paths you may change
`Design-docs/docs/design/**`, `packages/design-tokens/test/**` (docs test only)

## Contract impact
none (no token change).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0993` and cite UF-08.2 and UF-08.6.

## Build / accept log
