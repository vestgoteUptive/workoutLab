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

- Built (frontend-dev): Today and Preview roots are `data-wl-state="plan"` + `.wl-page`; Today h1 is `.wl-type-hero .wl-title--stop`; the suggestion card is unboxed (section-title h2, `.wl-row` rows, outline `.wl-chip` labels, "See all" `.wl-button--text`); Start is the one `.wl-button--primary` (arrow icon, sticky above the tab bar with a solid halo so rows scrolling under it don't show); Preview rows are `.wl-row` with an aria-hidden chevron, the name link's `::after` stretches over the row; Back is a text button. New `glyphs.tsx`. `today.css`/`preview.css` rewritten (rem only, `--wl-*` only; legacy `.wl-today*`/`.wl-preview*` classes are used by nothing else, grepped). The UF-09 Resume card is restyled from `today.css` (`.wl-today .wl-resume-card*`, unboxed row block, Resume as the outline button). The UF-11 check-in card is untouched except `today.css` maps its legacy `.wl-label`/`.wl-muted` colour to `--wl-ink-muted` (axe contrast on plan.bg; without it the heading fails).
- AC map: AC1 `cobalt.test.tsx` AC1 + e2e "T-0601 AC1"; AC2 cobalt AC2 + e2e AC2; AC3 cobalt AC3 + e2e AC3 (colours, 8.6, gap to tab bar 0..44); AC4 e2e AC4 (28 / 20 px, 320 × 640); AC5 cobalt AC5 + e2e AC5 (computed legacy surface / surface-2 scan, skeleton, pending check-in); AC6 e2e AC6 (every text pair >= 4.5, no ink-muted on raise, label 5.9, axe colour-contrast with and without a pending check-in, and on Preview); AC7 e2e AC7 (targets, cross-fade 0.2 s and nothing else, reduced motion 0s) + cobalt AC7 (CSS source guards: no px font-size, hex, legacy var, letter/word-spacing, `:disabled`, transition); AC8 e2e AC8 cases (zero history, 10 days off, offline, pending check-in, preview offline, resume card in the T-0395 test) and the unchanged UF-02 vitest suite; AC9 e2e AC9 `compareWithCanvas` x3.
- Deliberate pin moves: `visual-foundation.spec.ts` AC3 on `/` now asserts the state hero (Familjen Grotesk, 700, no uppercase, 96-112 px). AC4 on `/` still holds (left >= 16, right <= 344: left is 28 now). AC6 there is screenshots only, nothing to move.
- Red/planted faults (backups in scratchpad, restored by cp): (1) combined run, 21 e2e + 5 vitest red: `data-wl-state` removed (AC1/2/4/5/6/8), `wl-title--stop` removed (AC2 `::after`), a second primary on Preview (AC3 count), `.wl-today-card` legacy surface (AC5), ink-muted date on raise (AC6), `transition` on Start (AC7 motion, cobalt CSS guard), See all 20 px (AC7 target); (2) isolated: Start `position: static` -> AC3 gap -144.7 (expected 0..44); Preview `padding-inline: 10px` -> AC4 gutter "10px" at 390 and 340.
- Deviations from the canvas (screenshots in the scratchpad `shots-T-0601/`): no week row, "Lower A." title, PR line, Quick 20-min link (T-0623, T-0636, T-0638 and copy are out); the title is "Today." and the card's own copy; C-01 compact stays (canvas has no figure on Today); no Swap button on Preview (no swap action or copy exists on UF-02.2, copy and engine calls are out); Preview shows the tab bar (shell shows it for `/`), so AC3's "viewport bottom" is measured to the tab bar top there; Edit, body-map frame, numbered rows and "last N kg" are canvas sample data.
- Follow-ups: T-0612 should restyle the check-in card (two primaries show when it is pending: its Accept and Today's Start; its `.wl-label`/`.wl-muted` colour mapping here can then go); shell: hide the tab bar on `/?view=preview` if the canvas "pinned to the viewport bottom" is wanted; Swap on UF-02.2 needs a ticket with copy.
- Rework (review): (A) `today.css` and `preview.css` get `.wl-today :focus-visible, .wl-preview :focus-visible { scroll-margin-block-end: tab bar + safe area + 8rem }` (WCAG 2.4.11); e2e "focus is never hidden under Start (320 x 640)" parks See all and the check-in Accept in Start's zone, focuses them and asserts their bottom is above Start's top. Planted fault (`scroll-margin-block-end` renamed in `today.css`, restored by cp): red, gap -42.3 px; green with the rule. The Preview copy of the rule has no test of its own. (B) the "no second primary" test is renamed "outside the check-in slot, Today's own Start is the only primary" and asserts 2 primaries in all (T-0612 owns the Accept) and exactly 1 outside the card.
