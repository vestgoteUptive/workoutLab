---
id: T-0601
title: "UF-02.1 Today and UF-02.2 Workout preview in the plan state: hero title with a CSS full stop, hairline rows instead of cards, outline reason chips, one white primary pinned to the bottom, Swap + Start side by side on Preview; visual-foundation e2e pins for / move to the state scale"
lane: web-feature:UF-02
screens: [UF-02.1, UF-02.2]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0065, D-0139, D-0207]
deps: [T-0593, T-0594, T-0615, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Today" (#turn-3), "Workout preview" and "Today · check-in pending" (#turn-5). Behaviour: T-0302a/b/c, D-0139 (resume card). The check-in card is a UF-11 component (paper, T-0612). Depends on the figure web ticket (T-0615), so Today's C-01 is never lime on cobalt. The week row is T-0623. -->
## Why
Today is the daily entry point and shows the state model at its plainest: cobalt, one big title and one white button.

## Scope
- **In:**
  - `Today.tsx`, `Preview.tsx`, `SuggestionCard.tsx`, `slots.tsx` (view only), `today.css` and `preview.css`.
  - Each root (the `data-screen-id` element) gets `data-wl-state="plan"` and `.wl-page`; the old padding is dropped.
  - Today's `h1` takes `.wl-type-hero .wl-title--stop`.
  - The suggestion card is unboxed: its title is a section title, its items are `.wl-row` ("Back Squat 4 × 6–8"), the reason chips are outline `.wl-chip`s, and "See all" is a text button.
  - The resume card (D-0139) is a `.wl-row` block with its existing Resume action as a secondary button.
  - "Start workout" is the white primary pinned to the bottom above the tab bar. Others are secondary or text buttons.
  - **Preview:** rows as `.wl-row` with a trailing arrow icon; the Swap (secondary) and Start (primary) pair side by side (1fr 2fr); the back link as a text button.
  - The compact C-01 stays in place (recoloured by T-0615).
  - `tests/e2e/visual-foundation.spec.ts` AC3, AC4 and AC6 on `/` move from the uppercase Big Shoulders pins to the state scale, deliberately (logged). AC4 keeps ≥ 16 px and ≤ 344 px.
- **Out:**
  - The week row and week line (T-0623).
  - Copy.
  - The check-in card look (T-0612).
  - Engine calls.

## Acceptance criteria
- **AC1 (state).** **Given** `/` and `/?view=preview` at 390 × 844 **then** the roots have `data-wl-state="plan"` with a `plan.bg` background, and `theme-color` is `plan.bg`.
- **AC2 (type).**
  - Today's `h1` has a computed `font-family` starting with `"Familjen Grotesk"`, `text-transform: none`, and a `font-size` from 96 to 112 px at 390 px.
  - Its accessible name is unchanged ("Today"); the full stop is CSS only.
  - Body text is 17px.
- **AC3 (one primary).** Exactly one `.wl-button--primary` per screen, with `plan.action` and `plan.on-action` (8.6). Its bottom edge is within 44 px of the top of the tab bar on Today and of the viewport bottom on Preview.
- **AC4 (gutter).** `padding-left` is `28px` at 390 px and `20px` at 340 px. At 320 × 640 there's no horizontal scroll.
- **AC5 (no cards).** No element inside the roots has the computed legacy `surface` or `surface-2` background.
- **AC6 (contrast).**
  - No text uses `ink-muted` on `plan.raise`.
  - Labels are `plan.ink-muted` on `plan.bg` (≥ 5.9 at one decimal).
  - Axe colour-contrast has 0 violations, with and without a pending check-in.
- **AC7 (targets, type, motion, guard).**
  - Every link and button is ≥ 44 × 44.
  - No px font size and no raw colour in `today.css` or `preview.css`.
  - Today → Preview animates nothing but the cross-fade, and nothing under reduced motion. Both values are tested.
- **AC8 (behaviour unchanged).**
  - `tests/e2e/uf-02-today.spec.ts` and the UF-02 vitest suite pass with no role or name change.
  - Four e2e cases each render in plan: zero history, offline, returning after 10 days off (the "Nothing logged in the last 14 days" line), and a pending check-in. A resume card case is also covered.
- **AC9 (visual compare).** `compareWithCanvas` saves "Today" (turn-3), "Today · check-in pending" and "Workout preview" (turn-5). The log lists the verdicts. Expected deviations: no week row until T-0623, the title "Today", and the hero title replaced by the app's card copy.

Checklist (D-0197 §7):
- Online and offline, zero history and returning, a check-in pending and not, and the resume card present and absent are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)
- `tests/e2e/uf-02-today.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (listed extras)
- `docs/tickets/T-0601-uf02-today-preview-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-02-today.spec.ts` and `visual-foundation.spec.ts` green · commit messages start with `T-0601` and cite UF-02.1/UF-02.2.

## Build / accept log
