---
id: D-0165
title: "UF-03.1 a done row's invalid kg reverts on blur; uncheck stays available"
status: revisit
date: 2026-10-03
by: frontend-dev (T-0417 rework)
amends: D-0128 §4
area: web
builds-on: D-0118 §6, D-0128 §4, D-0142 §3
---
## Context
T-0417 AC-5 says an invalid kg makes the row's toggle `aria-disabled` with a hint. That reads
naturally for an unlogged row, where the toggle would record the value. On a done row the toggle
means "uncheck", and the stored value is already valid.

## Decision
1. On an **unlogged** row an invalid or empty kg (loaded lift), or invalid or empty reps or seconds,
   disables the check (`aria-disabled`) with a polite hint, and nothing is written.
2. On a **done** row an invalid or empty kg, reps or seconds is not saved: on blur or Enter the
   field reverts to the logged value, with no `editSet` call. The uncheck stays enabled, so a user
   with half-typed text can always remove the set.
3. Text equal to the field's opening text stands for the exact value (D-0128 §4), on unlogged and
   done rows alike.

## Revisit when
UX wants a visible hint on the revert.
