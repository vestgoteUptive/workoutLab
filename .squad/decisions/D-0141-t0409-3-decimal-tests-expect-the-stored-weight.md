---
id: D-0141
title: "The T-0409 3-decimal UF-09.4 tests expect the stored 82.13 everywhere they read the logged weight, not only in the two AC5 lines T-0233 named"
status: revisit
date: 2026-10-02
by: frontend-dev (build T-0233)
area: web
builds-on: D-0129 §4, D-0128 §4
---
## Context
T-0233 sanctions two edits in `features/UF-09/__tests__/confirm-set.test.tsx`: the T-0409 AC5
logged weight and the reps-edit `weightKg`, 82.125 → 82.13. It says every other T-0409 assertion
stays unedited. But all six tests in "T-0409 a 3-decimal recorded weight" mount through the shared
helper `toConfirmAt(82.125, …)`, which asserts that the logged set has `weightKg` equal to the
pre-fill. After D-0129 §1 the logged set has the stored 82.13, so the helper's own check fails in
all six tests, including the four AC6 tests. The AC6 "More then Less" test also asserts that the
entry keeps 82.125. That is the same expectation D-0129 §4 changes for AC5.

## Decision
1. `toConfirmAt` gets a third parameter, `storedKg` (default: the pre-fill), for the weight the
   queue stores and UF-09 logs. The six 3-decimal tests pass `82.13`. The ar-EG 77.5 tests are
   unchanged.
2. The AC6 "More then Less" stored-weight check goes from 82.125 to 82.13, as D-0129 §4 does for AC5.
   The two AC5 titles that named 82.125 now name 82.13.
3. No other assertion changes. What the UI reads (`82.13`, `84.63`), the `editSet` call counts and
   the AC6 patches (82.5, 84.63, `null`) are as before.

## Consequences
- The suite now encodes D-0129: the logged weight equals the stored weight, and an unedited Save
  still makes no `editSet` call.

## Revisit when
- D-0129 is reverted, or the queue stops rounding.
