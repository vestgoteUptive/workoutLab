---
id: D-0247
title: "UF-09.10: the add sheet is a host overlay over a still-mounted Paused, and Back goes through closeForBack (corrects D-0246 §6); disabled rows keep an inert aria-disabled Add, as on UF-08.5"
status: decided
date: 2026-11-13
by: orchestrator (T-0944 review)
area: product
amends: D-0246, D-0243
---
## Context
The T-0944 review found two problems. First, D-0246 §6 says the Back→Pause guard is "unchanged" and has nothing to do. In the code (`UF-09/host.tsx`, D-0163 §1), Back pressed while paused with no overlay open leaves the session. The existing seam overlays also replace Paused, which unmounts it, and D-0246 §7 forbids that. Second, the spec says disabled rows have "no Add", but UF-08.5 (`AddExerciseSheet.tsx`) keeps an inert, focusable `aria-disabled` button, and D-0243 §3's `aria-describedby` needs a focusable control to sit on.

## Decision
1. **The UF-09.10 sheet is a host overlay drawn over a still-mounted UF-09.9 Paused.** It is not a seam that replaces Paused. While the sheet is open, Back goes through the host's `closeForBack()`, which closes only the sheet and pushes the guard again. The workout stays paused and Paused never remounts (D-0246 §7). This corrects D-0246 §6.
2. **Disabled rows keep their Add button, but inert:** `aria-disabled="true"`, still focusable, with the reason referenced by `aria-describedby`, and tapping it does nothing. This is the same as UF-08.5 today. Where the spec says "no Add", read it as "no working Add".
3. **The time refusal** applies when `m ≤ 0` (`timeLeftS < 60`), including when the time left is negative.

## Revisit when
A screen-reader user test finds the inert buttons noisy.
