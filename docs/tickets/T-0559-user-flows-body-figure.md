---
id: T-0559
title: "user-flows.md: UF-04.2 exercise figure and the C-01 silhouette lines"
lane: product
screens: [UF-04.2, UF-02.1, UF-10.1]
decisions: [D-0207, D-0002]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-08 (groom, D-0207; spec F-1). Flow: wl-spec (agent product-owner). About ⅛ day. -->

## Why
Screen IDs and behaviour live in user flows v2 (D-0002). D-0207 changes what UF-04.2 and C-01 show.

## Scope
- In (`Design-docs/docs/product/user-flows.md`): one sentence under UF-04.2 and one under the C-01 note (line 42 and the UF-10.1 body); update `docs/specs/body-map-silhouette.md` status to "decided (D-0207)".
- Out: any other flow text; UF-08.2 (no figure in v1).

## Acceptance criteria
Checked by `node .github/scripts/check-all.mjs` and a grep recorded in the log.
- **AC-1** Given the UF-04.2 section, then it says the screen shows a front-and-back figure with primary areas solid and secondary areas hatched, with the Primary/Secondary labels, and that the figure is not tappable.
- **AC-2** Given the C-01 line (shared components) and UF-10.1, then they say C-01 is a body figure above a label grid; in `full` the nine labels are the buttons and tapping a region does the same; `compact` is one link.
- **AC-3** Given the whole file, then it says UF-08 and UF-09 show no figure (D-0060 §8 ban extended to `BodyFigure`).
- **AC-4** `node .github/scripts/check-all.mjs` passes (screen IDs valid, v1 labels, decision IDs).

## Paths you may change
- `Design-docs/docs/product/user-flows.md`
- `docs/specs/body-map-silhouette.md` (status line)
- `docs/tickets/T-0559-user-flows-body-figure.md` (log only)

## Contract impact
None.

## Definition of done
Every AC checked in the log · `check-all.mjs` green · commits start with `T-0559:`.

## Build / accept log
