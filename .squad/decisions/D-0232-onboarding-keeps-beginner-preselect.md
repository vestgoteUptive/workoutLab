---
id: D-0232
title: "UF-01.3 keeps the Beginner preselect now that level is editable; adds one static line \"You can change this later in Plan.\" (amends D-0064 §2)"
status: revisit
date: 2026-11-05
by: product-owner (idea: editable level)
area: product
amends: D-0064 §2
builds-on: D-0230, D-0014
---
## Context
D-0064 §2 preselects goal, level (beginner), equipment and rhythm so the fastest path is 3 activations to a plan (principle 5, < 60 s). The cost was that a user could end up Beginner without choosing it, with no way to change it. D-0230 adds the way.

## Decision
1. Keep the preselect: UF-01.3 level stays `beginner` by default (a restored answer still replaces it, D-0064 §6). Beginner is the safe default: it never suggests a harder exercise than the user can do, and it is now one Edit plan away from changing.
2. Add one static line under the selected level's hint on UF-01.3: "You can change this later in Plan." No new control, no new step, no change to the D-0014 timing metric.
3. D-0064 §8 (the existing profile wins on `/welcome/save`) is unchanged.

## Consequences
- One UF-01 web ticket (copy + test that the 3-activation path still holds). Spec AC14 in `docs/specs/editable-level.md`.

## Revisit when
- Analytics or a user test show most users change level within their first week (then ask on UF-01.3 without a preselect, or preselect from goal).
