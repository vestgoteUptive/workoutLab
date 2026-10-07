---
id: T-0550
title: "UF-11.4 Account settings rework — back link to Plan, .wl-page, section cards in the D-0195 order, C-03 equipment checkboxes, Delete card last and set apart, text-muted input borders"
lane: web-feature:UF-11
screens: [UF-11.4, UF-11.2]
decisions: [D-0203, D-0204, D-0136, D-0195, D-0168, D-0199, D-0002]
deps: [T-0546, T-0549]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §4; GitHub #45). Flow: wl-build-web (agent frontend-dev). About ½ day. Same folder as T-0548/T-0549/T-0540: run serially; deps on T-0549 only for that reason. Behaviour is unchanged; this is presentation plus one new link. -->

## Why
GitHub #45 "the Account page looks bad": loose paragraphs, same-looking 8 px buttons in the system font, flush against the screen edge, nine accent-filled chips, and no way back to Plan in the installed PWA (the route has no tab bar and iOS standalone has no back button). `Design-docs/docs/design/screens/UF-11.4.md` fixes the layout; D-0203 §4 adopts it and amends D-0136 §1 with a back link to Plan. No danger colour (an owner-overridable default).

## Scope
- In:
  - **`.wl-page`** on the `data-screen-id="UF-11.4"` root.
  - **Back link (block 1)**, first in the root: a text-button link to `/plan` with a 2 px chevron-left icon (`aria-hidden`), visible text "Plan" (reuse `en.screens.plan`), accessible name "Back to Plan", min 44 × 44 px.
  - **Title (block 2)**: the existing `h1` "Account settings".
  - **Account card (block 3)**: `.wl-card` with a `.wl-label` `h2` "Signed in as" (or "Account" when `storedEmail` returns null, with no email line), the email on its own line (`overflow-wrap: anywhere`), then Sign out as the secondary button with a sign-out icon. The unsynced confirm (D-0195 §4) replaces the button inside this card: the neutral notice, "Sign out anyway" (secondary, gets focus), "Cancel" (text button, returns focus to Sign out). `signedInAs(email)` may stay as the card's accessible description.
  - **Equipment card (block 4)**: `.wl-card` wrapping the existing `fieldset`; the `legend` "Your equipment" in label style; the hint in `.wl-muted`; the nine items as the shared C-03 `Checkbox` (`apps/web/src/components/checkbox`) in a `repeat(auto-fill, minmax(140px, 1fr))` grid, rows ≥ 44 px; Save as the primary button (the only primary on the screen), disabled until a change; "Saving", "Saved" (`role="status"`), the failure alert, "Connect to save" offline, and the cold-cache caption as today.
  - **Your data card (block 5)**: `.wl-card`, `.wl-label` `h2` "Your data", the body in `.wl-muted`, Export my data as the secondary button with a download icon; the offline caption and failure alert as today.
  - **Delete account card (block 6)**: last, 32 px above it, a `.wl-card` variant with a 1 px `line-strong` border (one modifier class, for example `.wl-card--strong`); `.wl-label` `h2` "Delete account"; closed: the new caption "Permanently removes your account and all your data." and "Delete account…" (secondary); open: the permanence text, a visible `label` "Type delete to confirm", the input with the shared `.wl-input` style (1 px `text-muted` border), "Delete my account" (secondary, never primary), "Cancel" (text button). Errors and focus moves as today.
  - **Disabled actions explained**: each disabled action's "Connect to …" caption sits directly under its button and is linked with `aria-describedby`.
  - **Copy** in `lib/i18n/flows/uf-11.ts`: "Back to Plan", "Account", "Permanently removes your account and all your data."
  - Remove the chip styles (`wl-plan__radio` on UF-11.4) and the old `wl-plan__section` margins on this screen.
- Out:
  - Any behaviour change to export, delete, sign-out or equipment save (D-0136, D-0195, T-0216).
  - A danger colour or a new token (D-0203 §4).
  - UF-11.2 (T-0548, T-0549).

### Edge cases that are in scope
- **Offline:** Sign out stays enabled (D-0195 §5); Save, Export and Delete account… are disabled with their captions (AC4).
- **No stored email:** label "Account", no email line (AC1).
- **Long email (64 characters) at 320 px:** wraps, never clipped, no horizontal scroll (AC6).
- **Unsynced work on Sign out:** the confirm sits inside the account card (AC1).
- **Cold cache:** the equipment card shows only the legend and "Your equipment isn't on this device yet." (AC3).
- **No user id yet:** Sign out, Export and Delete disabled as today (existing tests).

## Acceptance criteria
- **AC1 (order and account card, spec AC1)** Given UF-11.4 ready with the stored email `a@example.com`, Then the DOM order is: back link, `h1` "Account settings", the account card (`h2` "Signed in as", the email, Sign out), the equipment `fieldset`, the "Your data" card, the "Delete account" card. Sign out and the email are inside the same `.wl-card`. Given `storedEmail` returns null, Then the card's `h2` is "Account" and no email line renders. Given unsynced sets, When Sign out is pressed, Then the notice, "Sign out anyway" (focused) and "Cancel" render inside the same card.
- **AC2 (back link, spec AC2)** The first focusable element in the root is a link with accessible name "Back to Plan", visible text "Plan" and `href="/plan"`. In Playwright, tapping it lands on `[data-screen-id="UF-11.2"]`.
- **AC3 (equipment, spec AC3)** Given the profile equipment [barbell, bench], Then the fieldset holds nine `label`s each containing an `input[type=checkbox]` (the C-03 component, 24 px box), barbell and bench checked. When "Dumbbell" is toggled, Then Save is enabled. In every state exactly one element in the root has the primary button class (Save). Given a cold cache, Then only the legend and "Your equipment isn't on this device yet." render in the card.
- **AC4 (offline, spec AC4)** Given `navigator.onLine` false, Then Sign out is enabled; Save, "Export my data" and "Delete account…" are disabled, and each has `aria-describedby` pointing at an element whose text is, respectively, "Connect to save", "Connect to export your data." and "Connect to delete your account.", rendered directly after that button. Given online, Then those three are enabled (Save after a change) and none of the three captions renders.
- **AC5 (delete card, spec AC5)** Given UF-11.4, Then the Delete account card is the last card, has the strong-border modifier class, and its closed state shows "Permanently removes your account and all your data." When "Delete account…" is pressed, Then the label "Type delete to confirm" is visible above the focused input, and "Delete my account" is disabled until "delete" is typed. "Delete my account" never has the primary class.
- **AC6 (layout, spec AC6, Playwright)** At 390 × 844: T-1 (the `h1` font family, weight 800, uppercase, 32–40 px; body "DM Sans") and G-2 (root `padding-left`/`padding-right` `20px`) hold on `/plan/account`. At 360 × 740: G-1 holds. At 320 × 640 with a 64-character email: no horizontal scroll, and the email element's `scrollWidth` ≤ `clientWidth` (G-4).
- **AC7 (targets and input border, spec AC7, Playwright)** At 390 × 844 with the delete panel open, every visible `a`, `button`, `input` and checkbox `label` in the root is ≥ 44 px tall, and the confirm input's computed `border-top-color` equals the `text-muted` token's rgb value.
- **AC8 (behaviour unchanged, spec AC8)** Every existing `account-settings*.test.tsx`, `equipment-section.test.tsx` and `tests/e2e/uf-11-account.spec.ts` test passes; the only edits are selectors that named the replaced chip class or the old headings, each listed in the log.

Checklist (D-0197 §7): online/offline (AC4 both sides); email present/absent (AC1); cold/warm equipment cache (AC3); delete panel closed/open (AC5).

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `tests/e2e/uf-11-account.spec.ts` (selector updates and AC2, AC6, AC7)

## Contract impact
None. D-0203 §4 already amends D-0136 §1 for the back link.

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · e2e `uf-11-account.spec.ts` and `uf-11-plan.spec.ts` green · contracts unchanged · commits start with `T-0550:` and cite UF-11.4.

## Build / accept log
