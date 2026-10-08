---
id: T-0580
title: "Show 'Couldn't save. Try again.' on the host screen after the swap sheet has closed (failed exclusion write)"
lane: web-feature:UF-09
screens: [UF-09.6, UF-08.3, UF-03.1]
decisions: [D-0199]
deps: [T-0539]
status: todo
---

## Why
T-0539 (spec: screens/UF-08.3-UF-05.1.md line 21). When the "Don't suggest again" write fails online, the swap is still applied. Hosts unmount the sheet on apply, so the alert can't be seen. The spec says the message shows on the screen the user returns to.

## Acceptance criteria
- AC-1: SwapSheet's onApply result (or a callback) tells the host that the exclusion write failed.
- AC-2: each host that applies a swap (UF-09 pause/UF-09.6, UF-08.3, UF-03.1 if it applies) shows "Couldn't save. Try again." as a role=alert on its own screen after the sheet closes. It isn't part of the focus-mode main task (principle 1): show it in the existing status area.
- AC-3: tests per host, each proven to fail on a planted fault.

## Paths you may change
- `apps/web/src/features/UF-09/**`, `apps/web/src/features/UF-08/**`, `apps/web/src/features/UF-03/**`, `apps/web/src/features/UF-05/**`

## Contract impact
None.

## Build / accept log
