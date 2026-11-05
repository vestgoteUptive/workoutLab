---
id: D-0231
title: "\"Above your level\" says where to change it: text only on UF-08.5 (no link out of session setup), one notice with a \"Change level\" link on UF-11.6; nothing in UF-09"
status: revisit
date: 2026-11-05
by: product-owner (idea: editable level)
area: product
amends: D-0205 (UF-08.5 line 4 copy), D-0202 / docs/specs/favorite-exercises.md (UF-11.6 adds a level notice)
builds-on: D-0230, D-0109, D-0199
---
## Context
"Above your level" appears on UF-08.5 Add exercise (D-0205) and UF-11.6 Favorite exercises (D-0202). The owner wants it actionable without breaking principle 1. Audit: rule 12 `rankSwaps` filters ineligible exercises, so UF-05.1 / UF-08.3 swap lists never show the line; UF-09 never shows it; UF-04 Library uses `isEligible` only for its "Suitable for me" filter.

UF-08.5 is session setup, not focus mode, so a link wouldn't break principle 1 itself. But leaving UF-08 discards the whole visit record (adds, order, Skip today, removes; D-0109), with no way back. The excluded case already set the pattern: "Excluded. Include it again in Plan › Excluded exercises." with no link (D-0205 open question 4).

## Decision
1. **UF-08.5:** the line is "Above your level. Change it in Plan › Edit plan." Text only, no link and no button; the row stays disabled. Same reasons as the excluded line: no silent loss of the setup visit, UF-08.5 stays write-free and offline-complete.
2. **UF-11.6:** each above-level row keeps "Above your level". When at least one row has it, one notice under the header: "Your level is {Level}. Some favorites are above it." and a link "Change level" → `/plan/edit?from=favorites` (returns there, D-0230 §5). One link per screen, not one per row.
3. **UF-09.* and anything reachable from it (UF-09.9 Pause, UF-05.1 swap, UF-03.1 list view):** no level copy and no link to Plan. They don't show the line today, and this stays so.
4. **Anywhere new** the line appears later: inside UF-08/UF-09/UF-03 flows it is text only ("Change it in Plan › Edit plan."); on UF-11/UF-04/UF-02 it may link to `/plan/edit`.

## Consequences
- `docs/specs/uf-08-add-and-reorder.md` rule 4 and AC3, and `docs/specs/favorite-exercises.md` (UF-11.6) are amended; the existing tests that assert the exact "Above your level" string on UF-08.5 change with the UF-08 ticket (a spec change, not a weakened test).
- Spec: `docs/specs/editable-level.md` AC8, AC10, AC15.

## Revisit when
- A user test shows the UF-08.5 text pointer is missed; then consider a link with a "Leave setup?" confirm.
