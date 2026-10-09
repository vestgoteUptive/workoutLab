---
id: T-0613
title: "UF-11.4 Account settings (sign out, C-03 equipment, your data, delete panel, the unsynced sign-out warning on paper), UF-11.5 Excluded and UF-11.6 Favorites in the plan state; Delete account stays the secondary outline, last"
lane: web-feature:UF-11
screens: [UF-11.4, UF-11.5, UF-11.6]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0136, D-0195, D-0199, D-0202]
deps: [T-0612]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Account settings" (#turn-4), "Account · delete panel open" and "Account · unsynced sign-out" (#turn-5). UF-11.5/11.6 aren't drawn, so apply the row and notice patterns. Behaviour: screens/UF-11.4.md, UF-11.5.md, UF-11.6.md. -->
## Why
Account follows the D-0195 order. The unsynced sign-out confirm needs an answer, so it's the paper panel. Delete is never the white primary (README "Interactions").

## Scope
- **In:**
  - `AccountSettingsBody.tsx`, `EquipmentSection.tsx`, `ExcludedBody.tsx`, `ExcludedRow.tsx`, `FavoritesBody.tsx`, `FavoritesRow.tsx`, `excluded.css` and `plan.css` (account parts).
  - The roots `/plan/account`, `/plan/excluded` and `/plan/favorites` get `data-wl-state="plan"`.
  - "Signed in as" is a label, with the email as the row title.
  - Sign out is a secondary button.
  - Equipment uses C-03; Save is a secondary button.
  - Export is a secondary button.
  - The unsynced-sign-out confirm becomes `.wl-paper`: "Sign out anyway" is the `paper.action` pill and Cancel is a text button.
  - In the delete panel, the typed "delete" input is a `.wl-input`, "Delete my account" is `.wl-button--secondary`, and Cancel is a text button, last.
  - The UF-11.5/11.6 rows are `.wl-row`, with the T-0593 notice.
  - G-2 on `/plan/account` → `28px` deliberately, in `uf-11-plan-layout.spec.ts` or `visual-foundation.spec.ts` wherever it's pinned.
- **Out:**
  - Copy, export, wipe and deletion logic.

## Acceptance criteria
- **AC1 (state and reflow).** The three roots have `data-wl-state="plan"`, with `padding-left` `28px` at 390 px. At 320 × 640, `/plan/account` has no horizontal scroll and the email line isn't clipped (G-4).
- **AC2 (unsynced paper).**
  - With queued sets, tapping Sign out shows a `.wl-paper` panel (`paper.bg`, `paper.ink` 12.9, full-bleed) with the existing confirm copy, and focus moves to it as today.
  - With an empty queue, no panel appears and sign-out proceeds.
  - Both are tested.
- **AC3 (delete).**
  - "Delete my account" is not a `.wl-button--primary`, has the 1.5px `plan.ink` outline, and stays disabled until "delete" is typed (existing).
  - The panel's Cancel is the last focusable control.
  - Offline, delete is unavailable with the existing line; online it's available. Both are tested.
- **AC4 (lists).** The UF-11.5/11.6 rows keep their names and remove actions. A cold load still shows the groups once the library arrives (T-0582's test, unchanged). The empty states render in plan.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on each screen, including the open delete panel and the paper warning.
  - Controls are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `uf-11-account.spec.ts`, `uf-11-excluded.spec.ts`, `uf-11-favorites.spec.ts` and the UF-11 vitest suite pass with no role or name change.
- **AC7 (visual compare).** `compareWithCanvas` saves "Account settings" (turn-4), "Account · delete panel open" and "Account · unsynced sign-out" (turn-5), plus app-only shots of `/plan/excluded` and `/plan/favorites`. The log lists the verdicts.

Checklist (D-0197 §7):
- Queue empty and non-empty, online and offline delete, and lists empty and non-empty are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `tests/e2e/uf-11-account.spec.ts`, `tests/e2e/uf-11-excluded.spec.ts`, `tests/e2e/uf-11-favorites.spec.ts`, `tests/e2e/uf-11-plan-layout.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (listed extras)
- `docs/tickets/T-0613-uf11-account-lists-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-11 specs green · commit messages start with `T-0613` and cite UF-11.4/UF-11.5/UF-11.6.

## Build / accept log
