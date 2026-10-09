---
id: D-NNNN
title: "Body figure v2: smooth-outline art, translucent ink on the state background, two-colour coverage; supersedes D-0207's art (not its 9-area model or API)"
status: proposed
date: 2026-10-09
by: designer handoff (redesign-cobalt/body-figure); owner picked style 1b
supersedes: D-0207 art and colours
builds-on: D-0003, D-0207 (areas, API), redesign-cobalt decision
---
## Decision
1. Replace `body-figure.svg` with the v2 geometry: one silhouette per view, with the areas as soft zones inside it. Front shows chest, shoulders, arms, core and quads. Back shows back, shoulders, arms, glutes, hamstrings and calves.
2. Colours come only from state variables. Ink at 16 % for the silhouette and 32 % for the zones, background-coloured seams, white for primary or on target, a hatch for secondary, and `plan.attention` plus a ring for needs attention. The same art is used on plan, lift and rest.
3. Coverage shows two colours (white = on target, salmon = needs attention). Every other step keeps the zone tint.
4. The BodyFigure API is unchanged. Two classes are added for highlight dimming.
5. Not chosen: geometric blocks (1a) and the type-only figure (1c).
