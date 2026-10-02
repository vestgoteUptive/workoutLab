---
id: D-0106
title: T-0302a is split into T-0302a (UF-02.1 frame) and T-0302c (suggestion card + `lib/i18n/workout.ts`); workout.ts stays a UF-02 listed extra, not a web-shell ticket; the formatter export list and the swap reason copy
status: revisit
date: 2026-10-02
by: product-owner (groom T-0302a/T-0303a)
area: product
builds-on: D-0065 §1, D-0071 §1 §4 §10, D-0074 §4
---
## Context
The board row for T-0302a holds UF-02.1 in full: data loading, compact C-01, the attention line, the check-in slot, the 45-min suggestion card, Start, offline and zero-history states, an offline e2e, a11y, and the shared formatter module `lib/i18n/workout.ts` (six functions and about 20 copy cases). That is more than half a day of agent work. Web builds that run past their budget die without a result, so the ticket has to be smaller.

The board row also asked where `lib/i18n/workout.ts` and `features/UF-02/slots.tsx` belong: in the UF-02 ticket as a listed extra (a grant into web-shell's `lib/`), or in a separate web-shell ticket.

The parent T-0302 AC-A9 maps `swap {null}` to "Shuffled". Rule 13 (shuffle) adds no `swap` reason, and D-0071 §7 says `swap {null}` is what a "Best match" swap produces (R12-E10). "Shuffled" would be wrong copy for every Best-match swap on UF-08.3 and UF-05.1.

## Decision
1. **Split.** T-0302a becomes two children in lane `web-feature:UF-02`, which run one after the other:
   - **T-0302a, UF-02.1 frame.** The data hook (cache first, then `refreshAll` capped at 3 s), the header and date, `<OfflineStatus variant="text">`, compact C-01 fed by `balance()`, the attention line, `features/UF-02/slots.tsx` and its render position, the zero-history line, the no-profile state, Start → `/session/setup`, and the e2e spec `tests/e2e/uf-02-today.spec.ts`. It does not call `suggest`.
   - **T-0302c, the suggestion card + `lib/i18n/workout.ts`.** The D-0065 §1 `suggest` call, the card (rows, chips, "+N more", "See all", empty plan, skeleton with a fixed min-height), and the formatter module. It appends to T-0302a's e2e spec.
2. **`slots.tsx` belongs to T-0302a.** It is a `features/UF-02` file, inside the UF-02 lane's own paths, so it needs no grant. D-0071 §4 says the host creates its registry file.
3. **`lib/i18n/workout.ts` stays a UF-02 feature-lane listed extra, now held by T-0302c.** It does not move to a web-shell ticket:
   - D-0071 §1 (decided) names a UF-02 feature ticket as the creator. This decision only moves the creator role from T-0302a to its own split child, T-0302c. The convention is unchanged: one creator, T-0303b may add keys, everyone else imports read-only, and two tickets that list the file never run in parallel.
   - A web-shell ticket would queue behind the web-shell backlog, and T-0302c, T-0302b and T-0303b would then wait on it.
   - `check-lane-paths` allows a listed extra even on a shared path (D-0074 §4), so the grant is mechanical.
4. **`workout.ts` exports exactly six names**, and a test pins the export keys:
   - `itemSummary(item)`
   - `restLabel(seconds)`
   - `reasonLine(reason)`: one reason → one string, `""` for `prefill`.
   - `itemReasonLine(reasons)`: the non-empty `reasonLine`s in `reasons` order, at most 2, joined with " · ".
   - `sessionReasonChips(reasons)`: the non-empty `reasonLine`s, at most 3.
   - `areaName(area)`: reads `en.bodyMap.areas`, so there is no second copy of the area names (the T-0301d AC-10 precedent).
5. **Swap reason copy.**
   - `swap {null}` → "Swapped". This is a neutral line, because null is the Best-match swap.
   - `equipment_taken` → "Swapped: equipment taken"
   - `discomfort` → "Swapped for comfort"
   - `variety` → "Swapped for variety"
   - `short_on_time` → "Swapped to save time"

   This replaces T-0302 AC-A9's "Shuffled". `days_since {area, 0}` → "{Area} last trained today". Every other T-0302 AC-A9 string stands.
6. **Board changes (orchestrator):**
   - Add the row T-0302c (lane `web-feature:UF-02`, deps T-0302a, `wl-build-web`).
   - Re-point T-0302b's dep from T-0302a to T-0302c.
   - Re-point T-0303b's dep from T-0302a to T-0302c, because T-0303b adds keys to `workout.ts`.
   - T-0308c keeps T-0302a, because `slots.tsx` lives there.
   - Remove "lib/i18n/workout.ts formatters" from the T-0302a row.

## Consequences
- T-0302a and T-0303a share no file, so they can run in parallel (D-0108). T-0302c can also run in parallel with T-0303a.
- T-0302 AC-A9's "Shuffled" line is withdrawn. T-0303c AC-C2's "reasonLine's output for `swap {short_on_time}`" reads "Swapped to save time".

## Revisit when
- Shuffle starts adding a reason code of its own (rule 13). Then give it its own line.
- A second shared formatter module is needed. Then move both under web-shell with a D-0071 §1 amendment.
