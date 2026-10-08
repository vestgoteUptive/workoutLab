---
id: D-0207
title: "GitHub #48: an original SVG body figure (front and back, 9 area regions, Chalk & Iron tokens) on C-01 and UF-04.2; supersedes D-0060 §1 only; no gender toggle, no named sub-muscles, no UF-08.2 figure in v1"
status: decided
date: 2026-10-08
by: orchestrator, from the designer's intake (docs/specs/body-map-silhouette.md); owner may override the defaults
supersedes: D-0060 §1 (C-01 drawn as a tile grid only)
builds-on: D-0003, D-0005, D-0060 §2–§8, D-0192
---
## Context
GitHub #48 asks for a body visual like ExerciseDB's: front and back figures with primary and secondary muscles highlighted. ExerciseDB media can't be stored (D-0192). D-0005 allows designer-made line figures and no third-party images. The MIT react-(native-)body-highlighter drawings have an unconfirmed artwork licence (public issue #102, unanswered). The Wikimedia muscle SVG is CC BY-SA, which would make our main visual share-alike.

## Decision
1. **Original art.** One neutral figure, front and back views, with 9 regions tagged by `data-area` and no colour attributes. It's drawn in-house and stored in `Design-docs/docs/design/assets/body-figure/`.
2. **C-01 (UF-02.1, UF-10.1).** The figure sits above the existing D-0060 tiles. The tiles stay as a slimmer label grid that carries the numbers and the 44 px tap targets. A tap on a region forwards to its label. The attention outline is drawn outside the region border with a 1 px gap, because `warn` on lime is 1.9:1.
3. **UF-04.2.** Primary areas (weight 1.0) are solid lime and secondary areas (0.5) are hatched lime, with visible Primary/Secondary labels and swatches. Regions there aren't tappable.
4. **Not in v1:** a Male/Female toggle, named sub-muscles (decorative shapes only), and a figure on UF-08.2.
5. D-0060 §2–§8 stand. The §8 import ban also covers `BodyFigure`.

## Owner-overridable defaults
Spec §11, Q1–Q7, listed above.
