---
id: D-0242
title: "UF-08.2 empty mode: the T-0939 spec defaults are ratified (Fill the rest refused while over budget; Suggestions sub-line only while rows show; the empty-plan line replaces both empty lines; Reorder hides Suggestions)"
status: decided
date: 2026-11-13
by: orchestrator (human said "implement all")
area: design
amends: D-0236, D-0239
---
## Context
T-0939 wrote the UF-08.1, UF-08.2 and UF-08.5 empty-mode specs. It listed four defaults that no decision covers, under "Spec defaults (T-0939)" in `Design-docs/docs/design/screens/UF-08.2.md`.

## Decision
The four defaults are adopted as written:
1. "Fill the rest for me" stays shown while the plan is over budget. Tapping it is refused in the status line with "Your workout is {over} min over. Remove or swap an exercise first.", the same as Shuffle (D-0240 §4). When the time is exactly full it still works and adds nothing that doesn't fit.
2. The Suggestions sub-line shows only while the section has rows.
3. In empty mode the empty-plan line replaces both of suggested mode's empty lines.
4. Reorder mode hides the Suggestions section, along with the other controls.

## Revisit when
The first user test of empty mode.
