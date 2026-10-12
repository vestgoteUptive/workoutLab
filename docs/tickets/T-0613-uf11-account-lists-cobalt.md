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
- `tests/e2e/cobalt-controls.spec.ts`, `tests/e2e/fonts.spec.ts` (orchestrator grant: their 'unchanged outside a state' checks used a now-migrating screen; move each to an injected no-state fixture, never another real screen)
- `apps/web/src/features/UF-11/**` (lane)
- `tests/e2e/uf-11-account.spec.ts`, `tests/e2e/uf-11-excluded.spec.ts`, `tests/e2e/uf-11-favorites.spec.ts`, `tests/e2e/uf-11-plan-layout.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (listed extras)
- `docs/tickets/T-0613-uf11-account-lists-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-11 specs green · commit messages start with `T-0613` and cite UF-11.4/UF-11.5/UF-11.6.

## Build / accept log
- Built on `main` 4476465 (clean). UF-11.4/.5/.6 roots are `data-wl-state="plan"`; legacy plan.css block (`wl-plan__linkbtn`, `wl-plan__notice`, `wl-card--strong`, account rules) removed after grep (src + tests/e2e: no other user); `wl-plan__name` kept (PlanBody). excluded.css rewritten on `--wl-*` only.
- Controls on the three screens now use `aria-disabled` (never native `disabled`), with click guards: Sign out, Export, Delete opener, Delete my account (+ typed guard), Cancel, Save, Sign out anyway, Include/Exclude/Add/Remove.
- AC map: AC1 `account-settings.rework` "T-0613 AC1", e2e `uf-11-account` AC1 (390/340/320), UF-11.5/.6 e2e plan-state tests; AC2 rework "AC2 unsynced paper panel" (queued/empty/cancel) + e2e AC2; AC3 rework "AC3 delete panel" (+ 1.5px authored pin in main.css) + e2e AC3 (online/offline); AC4 excluded/favorites "T-0613 plan state" + cold-library unchanged; AC5 e2e axe + text pairs (closed, delete open, paper), 44px, motion/reduced motion, stylesheet guards (plan.css, excluded.css); AC6 existing UF-11 suites + uf-11-account/excluded/favorites specs pass; AC7 shots in scratchpad `shots-T-0613/`.
- Expectation changes (not weakening): `toBeDisabled/toBeEnabled` -> `aria-disabled` in account-settings, rework and equipment-section tests and uf-11-account e2e; Save is secondary (was "one primary"); `wl-card--strong` -> `wl-account__delete`; strings.test allows "left" and checks `var(--wl-`; uf-11-account 390 test now pins the plan title (Familjen 700/56/none) and 28px gutter (was Big Shoulders/20px); input border probe reads `--wl-ink-muted`; cobalt-controls "/plan/account secondary 14px" moved to an injected no-state fixture; plan.css guards now cover the whole file.
- Planted faults (all red, then restored from backup copies): `.wl-paper` removed; `!confirmed`, opener, export, Save and `toggle` online guards removed; Save class primary; `data-wl-state` removed on UF-11.4/.6; `font-size:13px` in excluded.css; Cancel moved before confirm; 20px list button; low-contrast email/warning text; `transition` on back link; `overflow-wrap:normal` on the email.
- Canvas compare (390x844, verdict by eye): Account settings close (app title wraps to two lines at the 56px plan page title; Sign out/Save keep label-left + icon; Save is the outlined secondary, canvas shows a filled disabled pill); unsynced: paper panel matches, canvas shows "Sign out anyway" as an outline below the panel, the ticket asks for the paper.action pill so the app differs deliberately; delete-open matches pattern. UF-11.5/.6 app-only.
- Rework (review blocker): `onDelete` kept `deletingRef` true through `leaveToWelcome` (reset only on failure) and the click is guarded by `confirmed && !deleteDisabled`. New test "a tap on Deleting… during the wait sends no second delete" (red on the old code, green now). Audit: sign-out keeps `signingOutRef` true; export, Save and Include/Remove have no awaited navigation, so no change.
