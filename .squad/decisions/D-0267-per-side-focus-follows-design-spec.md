---
id: D-0267
title: "T-0974: UF-09 per-side labels follow the round-2 design spec where the ticket text differs (hidden reading span, no timed stepper, helper options object)"
status: revisit
date: 2026-11-21
by: frontend-dev (T-0974 build)
area: web
---
## Context
The ticket ACs (AC1 to AC3, AC6) were written from D-0263 §4 §5. The design spec `UF-09.3-UF-09.4.md` was amended afterwards (T-0973 round 2, commit 9efd68fa) and differs in four places.

## Decision
Build from the design spec, the newer text:
1. The `<p>` has no `aria-label`; a visually hidden span holds "12 kg, 10 reps per arm" and the visible lines are `aria-hidden` (flagged rows only).
2. Timed holds (UF-09.7, `timed-set.tsx`) read "Hold 0:40 per side" by appending `perSide`. There is no stepper for holds, so no "Seconds per side" group.
3. `formatReps(n, word, { timed, locale })` takes an options object; null or unknown words give the bilateral text.
4. The group label is built in the shared module (`repsGroupLabel`), so UF-09 holds no copy of the strings.
`oneSideHowTo` stays in `features/UF-04/one-side.ts`: UF-04 is outside this ticket's paths.

## Revisit when
The ticket ACs are re-synced to the design spec, or UF-03/UF-06 need another helper shape.
