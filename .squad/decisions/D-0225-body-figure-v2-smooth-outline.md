---
id: D-0225
title: "Body figure v2: smooth-outline art (owner pick 1b), translucent ink on the state background, two-colour coverage (white = on target, salmon + ring = needs attention), highlight dims the rest; supersedes D-0207's art and D-0215's colour defaults (not the 9-area model or the API)"
status: accepted
date: 2026-10-09
by: owner (H-31: picked style 1b and supplied the handoff); filed by the orchestrator
supersedes: D-0207 (art and colours only), D-0215
builds-on: D-0003, D-0207 (areas, API), D-0208, D-0210
---
## Context
H-31: the owner judged the T-0614 Cobalt recolour as needing changes and supplied a v2 figure (handoff `redesign-cobalt/body-figure/`, style 1b), instead of picking from the T-0650 variants. The acceptance target is `Design-docs/docs/design/redesign-cobalt/canvas/Body Figure Export.dc.html`.

## Decision
1. Replace `Design-docs/docs/design/assets/body-figure/body-figure.svg` with the v2 geometry (`redesign-cobalt/body-figure/body-figure.v2.svg`). There is one silhouette per view, with the areas as soft zones. The front shows chest, shoulders, arms, core and quads. The back shows back, shoulders, arms, glutes, hamstrings and calves. The `data-area` keys match `AREAS` exactly (checked 2026-10-09).
2. Colours come only from the state variables:
   - the silhouette is ink at 16 %, and the zones are ink at 32 %;
   - the seams are background-coloured strokes;
   - white means primary or on target, and a hatch means secondary;
   - `plan.attention` plus a ring means needs attention.

   The same art is used on plan, lift and rest. Attention is not shown on session screens.
3. Coverage shows two colours: step 4 (on target, D-0003) is white, and steps 0–3 keep the zone tint. The low steps are told apart by the area list and labels, not by fill (owner choice).
4. The BodyFigure API is unchanged. Two classes are added: `wl-fig--has-highlight` and `wl-fig__region--highlighted` (the highlight dims the rest).
5. Not chosen: geometric blocks (1a), the type-only figure (1c), and the T-0650 variants.
6. Unmigrated screens: D-0210 still applies. Outside `[data-wl-state]` the figure must still render legibly on the Chalk & Iron background. The implementing ticket decides between a legacy fallback and the v2 art at :root, and records the choice.
