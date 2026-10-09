---
id: T-0606
title: "UF-01.5 Sign in / Save your plan in the plan state: Send link / Enter code as a segmented control, email and code as .wl-input with the plan error form, Send link as the one white primary, Google as the secondary, the auth status lines as labels"
lane: web-feature:UF-01
screens: [UF-01.5]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0045]
deps: [T-0605]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Sign in · save your plan" (#turn-5). Behaviour: T-0301c, en.auth strings. -->
## Why
UF-01.5 is the last onboarding step and the sign-in screen for returning users. It takes the same plan look.

## Scope
- **In:**
  - `AccountScreen.tsx`, `SaveScreen.tsx` and `uf-01.css` (sign-in parts).
  - The root has `data-wl-state="plan"`.
  - The title is a page title with `.wl-title--stop`.
  - The "Send link / Enter code" tabs become `.wl-segmented`, keeping their current roles.
  - Email and code are `.wl-input`; invalid input (`aria-invalid`) uses the plan error form.
  - Send link and Verify code are the white primary.
  - "Continue with Google" is a secondary button, if it's shown today.
  - The Privacy link is a text button.
  - The `en.auth` status lines (sent, offline, rate-limited, expired) are labels; errors are `--wl-attention`.
- **Out:**
  - Copy, auth flows and redirects.

## Acceptance criteria
- **AC1 (state).** `/account` (UF-01.5) has `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (inputs).** The email input's border is 1px `plan.ink-muted` (5.9, ≥ 3:1). After an invalid email, it's 2px `plan.attention`, and `en.auth.invalidEmail` shows in `plan.attention` (≥ 5.0). Both are tested; the code input behaves the same.
- **AC3 (segmented).** The two modes keep their roles and names. The active one is a `plan.selected` pill with `plan.on-selected` text.
- **AC4 (offline).** Offline, the existing offline line shows as a label and Send link behaves as today (existing test). The online path also renders and sends (existing test).
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations in the send, sent, error and offline states.
  - Controls are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `tests/e2e/auth.spec.ts` (magic link, code, expired link, rate limit) and the UF-01 vitest suite pass with no role or name change.
- **AC7 (visual compare).** `compareWithCanvas` saves "Sign in · save your plan" (turn-5). The log lists the verdict.

Checklist (D-0197 §7):
- Online and offline, valid and invalid, and sent and not sent are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-01/**` (lane)
- `tests/e2e/auth.spec.ts`, `tests/e2e/uf-01-onboarding.spec.ts` (listed extras)
- `docs/tickets/T-0606-uf01-signin-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `auth.spec.ts` and `uf-01-onboarding.spec.ts` green · commit messages start with `T-0606` and cite UF-01.5.

## Build / accept log
