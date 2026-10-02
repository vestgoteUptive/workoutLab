---
id: T-0382
title: "UF-01.5 Account a11y: roving tabindex and arrow keys on the Send link / Enter code tabs; the role=status live region is mounted before its first message"
lane: web-feature:UF-01
screens: [UF-01.5, UF-01.5-save]
decisions: [D-0064, D-0100]
deps: [T-0301c]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Follow-up from the T-0301c review (pre-existing, low). It also carries the D-0100 §6 `replace` assertion (T-0381). -->

## Why
`AccountScreen.tsx` renders a `role="tablist"` whose two `role="tab"` buttons are both in the Tab order and ignore the arrow keys. That breaks the WAI-ARIA tabs pattern (NFR-A11Y-2).

Its `role="status"` paragraph is mounted only once `message` is set. Many screen readers don't announce a live region that is inserted already holding its text, so "Check your email…" and the error texts can go unannounced (NFR-A11Y-1).

Principle 5 (onboarding under 60 seconds) depends on this screen working by keyboard and screen reader.

## Scope
- In (`features/UF-01/AccountScreen.tsx`, `uf-01.css`):
  - **Roving tabindex.** The selected tab has `tabIndex={0}` and the other has `tabIndex={-1}`.
  - **Keys, with automatic activation:**
    - `ArrowRight` and `ArrowLeft` move focus to the next or previous tab, wrapping, and select it (`mode` changes);
    - `Home` and `End` go to the first and last tab;
    - `Enter`, `Space` and click keep working.
  - **The live region.** `<p role="status">` is rendered from the first paint, empty when there is no message, and gets its text in place. The empty state takes no layout space (for example `.wl-uf01__status:empty { margin: 0 }`). It must not use `display: none`, `visibility: hidden`, `hidden` or `aria-hidden`.
  - **D-0100 §6 (T-0381):** a new `save.test.tsx` case for the `replace`.
- Out:
  - `SaveScreen.tsx`'s own status lines.
  - The auth logic (`lib/auth/**`).
  - Copy changes and visual redesign.

## Acceptance criteria
Each test title starts with `T-0382 ACn`. "Tabs" means `getAllByRole("tab")` inside UF-01.5: ["Send link", "Enter code"].
- AC1 (roving tabindex)
  - **Given** `/account` on first render, **Then** "Send link" has `aria-selected="true"` and `tabindex="0"`, and "Enter code" has `aria-selected="false"` and `tabindex="-1"`.
  - **After** a click on "Enter code", the two are swapped.
  - **And** from the email field, Shift+Tab (the `keyboard.ts` harness) lands on the selected tab, and one more Shift+Tab leaves the tablist without visiting the other tab.
- AC2 (arrow keys)
  - **Given** focus on "Send link", **When** `ArrowRight` is pressed, **Then**:
    - focus is on "Enter code", and it has `aria-selected="true"`;
    - the "6-digit code" field is rendered;
    - `tabpanel` has `aria-labelledby` set to "Enter code"'s id.
  - **When** `ArrowRight` is pressed again, **Then** focus and selection wrap to "Send link".
  - `ArrowLeft` from "Send link" goes to "Enter code" (wrap).
  - `End` goes to "Enter code" and `Home` goes to "Send link".
  - `ArrowUp` and `ArrowDown` change nothing.
- AC3 (live region present before the message)
  - **Given** `/account` on first render, **Then** exactly one `getByRole("status")` exists and it is empty (`toBeEmptyDOMElement()`).
  - **When** "Send link" succeeds, **Then** that same DOM node (the same reference captured before the submit) has the text `en.auth.linkSent`.
  - Every existing `role=status` text test in `account.test.tsx` (lines ~195, 221–226, 250, 273) passes unedited.
- AC4 (the one sanctioned test edit)
  - In `account.test.tsx` "a successful start keeps the button busy", `expect(screen.queryByRole("status")).toBeNull()` becomes `expect(screen.getByRole("status")).toBeEmptyDOMElement()`. The intent, "no message shown", is kept and the check is stricter.
  - No other existing assertion in `features/UF-01/__tests__/**` is edited.
- AC5 (e2e keyboard path) In `tests/e2e/uf-01-onboarding.spec.ts`, the "Space on a tab switches the mode" step (around lines 454–459) becomes:
  - `tabTo` the selected "Send link" tab;
  - press `ArrowRight`;
  - expect "Enter code" to be focused with a visible focus ring;
  - expect the "6-digit code" field to be visible.

  Under roving tabindex, Tab can no longer reach the unselected tab. Nothing else in that file changes. The spec passes in the local Playwright run.
- AC6 (axe) The existing UF-01.5 axe checks (jsdom `a11y.test.tsx` and e2e) report 0 serious or critical violations.
- AC7 (D-0100 §6 replace, T-0381)
  - **Given** a saveable pending plan, signed out, and a MemoryRouter with entries `["/welcome/schedule", "/welcome/save"]` at index 1.
  - **When** `/welcome/save` redirects to `/account` and the test then calls `navigate(-1)`, **Then** the location is `/welcome/schedule`, not `/welcome/save`.
  - This is a new case. The existing "signed out with PLAN" case stays unedited.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`).
- **Listed extras:**
  - `tests/e2e/uf-01-onboarding.spec.ts`: the AC5 step only.
  - `docs/tickets/T-0382-account-tabs-a11y.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- Files:
  - `features/UF-01/AccountScreen.tsx`;
  - `features/UF-01/uf-01.css`;
  - `features/UF-01/__tests__/account.test.tsx`;
  - `features/UF-01/__tests__/save.test.tsx` (one new case);
  - `tests/e2e/uf-01-onboarding.spec.ts`.
- No other ready or doing ticket edits `features/UF-01/**` or `uf-01-onboarding.spec.ts`. It can run in parallel with T-0390, T-0392, T-0393 and T-0228.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force` green · the e2e spec passes · contracts unchanged · commit messages start with `T-0382` and cite UF-01.5 (e.g. `T-0382 UF-01.5: roving tabindex on the Account tabs, live region mounted early`).

## Build log
- 2026-10-02, frontend-dev (build), on top of 742d669. Roving tabindex + automatic activation (ArrowLeft/Right wrap, Home/End; Enter/Space/click left to the button) and `<p role="status">` always mounted; `.wl-uf01__status:empty { position: absolute }` takes it out of the 22 px flex gap without hiding it from AT (`margin: 0` alone would leave the gap). Unfixed code (`AccountScreen.tsx` from HEAD, `<Navigate to="/account">` without `replace`): 14 of the new/edited cases fail (AC1–AC4, AC7), all reverted. Green: web `typecheck`, `lint`, `test` (110 files, 1635 tests), `test:e2e uf-01-onboarding` (7/7, incl. both axe checks for AC6), `-w format:check`, `check-all.mjs`.

## Accept log
- 2026-10-02, product-owner (accept), branch `t/T-0382-account-tabs-a11y` at 25533d6. Verdict: **done**.
  - AC1: `account.test.tsx` "T-0382 AC1" ×3 (first render, click swap, Shift+Tab for both selections).
  - AC2: "T-0382 AC2" cases cover ArrowRight/Left with wrap, Home/End, ArrowUp/Down no-op, and Enter/Space.
  - AC3: "T-0382 AC3" covers the same-node reference getting `linkSent`, the verify path, and a CSS check (`:empty { position: absolute }`, no `display: none` or `visibility: hidden`). The existing status text tests are unedited.
  - AC4: line 288 is the only sanctioned edit (`getByRole("status")).toBeEmptyDOMElement()`).
  - AC5: the e2e step at lines 454–462 uses `tabTo` Send link, then ArrowRight, then checks focus with a visible ring and the 6-digit field. 7/7 passed locally.
  - AC6: the jsdom and e2e axe checks are green.
  - AC7: `save.test.tsx` "T-0382 AC7" is a new case; the existing PLAN case is unedited.
  - QA red proofs: main's CSS, `display: none` planted in the `:empty` rule, main's AccountScreen.tsx and uf-01.css (14 unit tests and the AC5 e2e step red), and `replace` removed (AC7 red). All reverted.
  - Review approved. Web 1635/1635. Contracts unchanged. Principle 5 holds: the Account screen now follows the keyboard and screen-reader pattern.
  - Review nits (not blocking): Home/End tests use `fireEvent`, not `user.keyboard`; the e2e `getByRole("status")` is strict-mode and will break if a second status region appears on the screen.
