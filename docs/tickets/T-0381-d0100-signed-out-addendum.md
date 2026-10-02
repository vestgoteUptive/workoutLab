---
id: T-0381
title: "D-0100 addendum §6: a signed-out visitor at /welcome/save with a saveable plan is replace-navigated to /account, as shipped in T-0301c"
lane: product
screens: [UF-01.5, UF-01.5-save]
decisions: [D-0100, D-0014, D-0073, D-0098]
deps: [T-0301c]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). This is a decision edit only, with no build. The addendum is written in this groom branch (t/groom-small-2). -->

## Why
D-0100 §2–§4 describe `/welcome/save` for a signed-in user. T-0301c also handles a signed-out visitor who holds a saveable plan (`SaveScreen.tsx`: `status === "signed-out"` → `<Navigate to="/account" replace />`), but no decision recorded that behaviour (T-0301c review).

## Scope
- In: D-0100 gains a dated addendum, §6, that records the shipped behaviour and the reason for it.
- Out: any code change. The `replace` assertion goes to T-0382 (same lane and test folder as the screen).

## Acceptance criteria
- AC1 Given D-0100, When it is read, Then it has a section "Addendum 2026-10-02 (T-0381 …)" with §6, and its frontmatter has `addenda: 2026-10-02 §6`. §6 states:
  - the order: saveable plan first, then the auth status;
  - signed out with a plan → `/account` with `replace`, with no call, no write and the record left byte-identical.
- AC2 The existing test `features/UF-01/__tests__/save.test.tsx` "signed out with PLAN: sent to /account to sign in first, with no call" is cited as the test for §6, and it passes unedited on `main`.

## Paths you may change
- `docs/tickets/**` (the lane: `product`).
- **Listed extras:**
  - `.squad/decisions/D-0100-welcome-save-screen.md`: the dated addendum §6 and the `addenda` frontmatter line only.

## Contract impact
none

## Definition of done
The addendum is merged with the groom branch. No code changes.
