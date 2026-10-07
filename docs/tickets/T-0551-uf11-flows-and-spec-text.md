---
id: T-0551
title: User flows v2 UF-11.2 / UF-11.4 text and docs/specs/uf-11-plan-checkin.md UF-11.2 section updated to the D-0203 layout (cards, purpose line, Balance link, back link)
lane: product
screens: [UF-11.2, UF-11.4, UF-11.5, UF-11.6, UF-10.1]
decisions: [D-0203, D-0204, D-0195, D-0199, D-0202, D-0002]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203). Flow: wl-spec (agent product-owner). About ⅛ day. Docs only; can run in parallel with every other D-0203 ticket. -->

## Why
D-0203 §3 and §4 change what UF-11.2 and UF-11.4 show: Plan gains a purpose line, cards, a target tile grid without "From your plan", and a "See this period in Balance" link; Account gains a back link to Plan and C-03 equipment. The flow index (`Design-docs/docs/product/user-flows.md`, the only source of screen IDs, D-0002) and the UF-11 product spec (`docs/specs/uf-11-plan-checkin.md` § UF-11.2) still describe the old screen. The design specs (`Design-docs/docs/design/screens/UF-11.2.md`, `UF-11.4.md`) are the source; this ticket only aligns the product text.

## Scope
- In:
  - `Design-docs/docs/product/user-flows.md`:
    - the **UF-11.2 Plan** bullet: what Plan is for (the goal, rhythm and per-area 14-day targets; how it adapts); the "Your plan" card with Edit plan; the Favorite (UF-11.6) and Excluded (UF-11.5) rows directly under it, in that order (D-0202, D-0199); per-area targets with a source shown only when it isn't the default ("Adapted {d MMM}" / "Set by you"); the "See this period in Balance" link to UF-10.1; the next check-in date and the last 3 check-ins; routines;
    - the **UF-11.4 Account settings** bullet: add "a back link to Plan (D-0203)" and that equipment uses C-03 checkboxes. The rest (D-0136, D-0195) stays.
  - `docs/specs/uf-11-plan-checkin.md` § UF-11.2: the same layout in the spec's terms; "From your plan" is no longer shown on Plan (it stays on UF-10.2, `docs/specs/uf-10-balance.md`, unchanged); "First check-in" / "Next check-in" as a caption above the date; Edit plan is the one primary action except while a check-in is pending (then Accept is).
- Out:
  - Any screen ID change or new screen ID.
  - The design specs (design lane) and `docs/specs/uf-10-balance.md`.

### Edge cases that are in scope
- The flow text keeps the offline rule for UF-11.4 ("export and delete are disabled") and adds nothing about workouts: UF-11.x is never reachable from UF-03, UF-08 or UF-09 (principle 1).

## Acceptance criteria
- **AC1** Given `user-flows.md` after the edit, Then the UF-11.2 bullet contains "See this period in Balance", "UF-10.1", "UF-11.6" before "UF-11.5", and does not contain "From your plan"; the UF-11.4 bullet contains "back link to Plan".
- **AC2** Given `docs/specs/uf-11-plan-checkin.md` § UF-11.2, Then it no longer lists "From your plan" as a UF-11.2 source label, names the purpose line, the "Your plan" / "Targets" / "Check-ins" / "Routines" cards and the Balance link, and cites D-0203.
- **AC3** `node .github/scripts/check-all.mjs` exits 0 (screen IDs, stale wording).
- **AC4** Every other bullet in `user-flows.md` and every other section of `uf-11-plan-checkin.md` is byte-identical (`git diff` shows only the two bullets and the one section).

Checklist (D-0197 §7): not applicable to a docs edit beyond AC4's "nothing else changed".

## Paths you may change
- `Design-docs/docs/product/user-flows.md` (lane)
- `docs/specs/uf-11-plan-checkin.md` (lane)

## Contract impact
None.

## Definition of done
AC1–AC4 hold · `node .github/scripts/check-all.mjs` exits 0 · `pnpm -w format:check` green on the two files · commits start with `T-0551:` and cite UF-11.2 / UF-11.4.

## Build / accept log
