---
id: T-0572
title: "Add and reorder design: screen specs for UF-08.5 Add exercise, the UF-08.2 Add exercise button, Added by you, Start with this, Doesn't fit line and Reorder mode, and the UF-09.9 Do {name} later action"
lane: design
screens: [UF-08.5, UF-08.2, UF-09.9]
decisions: [D-0205, D-0203, D-0202, D-0199, D-0191, D-0002]
deps: [T-0561]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 §11, item A). Flow: wl-design (agent designer). About ½ day. The design prerequisite of D-0205: no UF-08 add/reorder ticket (T-0573…T-0577) and not T-0579 starts before this one is done. Runs after T-0561 because both edit screens/UF-08.2.md. -->

## Why
D-0205 §11: the new sheet and the UF-08.2/UF-09.9 changes need agreed layouts on the D-0203 visual foundation, with no new token. Spec: `docs/specs/uf-08-add-and-reorder.md`.

## Scope
- In (`Design-docs/docs/design/**`):
  - **New `screens/UF-08.5.md` Add exercise**, modelled on `screens/UF-08.3-UF-05.1.md` (sheet, Close, focus return to "Add exercise"): header "Add exercise", the lead line "The rest of your workout adjusts to fit {n} min.", the search field, the empty-query sections ("Favorites", "Today's areas" grouped by area), the "Search to find an exercise." line, the no-match line, result rows (name, primary areas, "Favorite" tag, Add, Start with this for a compound), the six disabled-row lines with `aria-disabled` actions described by the line, the refusal status line, at 320 px and 390 px.
  - **`screens/UF-08.2.md`**: the "Add exercise" button under the list, above Shuffle; the "Added by you" reason line next to T-0561's "Favorite" tag; the "Start with {name}" row action on a non-main compound; the "Doesn't fit in {n} min: {names}." line; the status line; **Reorder mode** (the "Reorder" button in the list header, each row with Move up / Move down ≥ 44 px, the warm-up row fixed and control-free, the hidden controls, "Done", focus rules).
  - **UF-09.9 Paused** (the existing UF-09 screen spec, or a new `screens/UF-09.9.md` if none exists): "Do {name} later" between Swap and Skip to next exercise, its hidden states, the UF-09.6 "{name} moved to later." status line, and the "Couldn't move {name}. Try again." alert. Principle 1: nothing on UF-09.1–.8.
- Out: any token change; any code; the D-0202 favorites surfaces beyond the tag placement already in T-0561.

### Edge cases that are in scope
- **Offline:** UF-08.5 works fully offline, so it has no offline state; the spec says so explicitly.
- **All items removed:** UF-08.5's Favorites-only empty query and "Search to find an exercise."
- **Time running out:** the refusal copy ("doesn't fit", the two cap lines) and the UF-08.2 "Doesn't fit" line.
- **Long names at 320 px:** Add and Start with this wrap without overlap; Move up/down stay ≥ 44 px.
- Zero history, returning after 10 days: no visual difference (recovering lines only appear with history).

## Acceptance criteria
- **AC1 (UF-08.5)** `screens/UF-08.5.md` exists and covers every item listed for it under Scope with the exact copy strings from the spec.
- **AC2 (UF-08.2)** `screens/UF-08.2.md` specifies the Add exercise button, Added by you, Start with this, the Doesn't fit line and Reorder mode, including which controls are hidden in Reorder mode and where focus goes after a move at the top and bottom.
- **AC3 (UF-09.9)** The UF-09.9 spec places "Do {name} later" between Swap and Skip to next exercise and lists when it is hidden (partly done item, last unfinished item, pause from UF-09.8).
- **AC4 (tokens)** No hex value in any changed file; every colour/size names an existing token or D-0203 class; `tokens.json` byte-identical to `main`.
- **AC5 (labels)** The specs state the unique labels "Add {name}", "Start with {name}", "Move {name} up", "Move {name} down" and "Do {name} later", and ≥ 44 px targets.
- **AC6 (checks)** `node .github/scripts/check-all.mjs` passes.

Checklist (D-0197 §7): empty/non-empty query and plan (AC1); online is the only UF-08.5 state and the spec says why offline is identical (AC1).

## Paths you may change
- `Design-docs/docs/design/**` (lane)

## Contract impact
None. No token change (D-0205 §10).

## Definition of done
Every AC has a check-all pass or a reviewed section · `node .github/scripts/check-all.mjs` green · `tokens.json` unchanged · commits start with `T-0572:` and cite UF-08.5 / UF-08.2 / UF-09.9.

## Build / accept log
Archived in `docs/tickets/log/T-0572.md` (D-0157).
