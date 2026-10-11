---
id: T-0611
title: "UF-10.1 Balance and UF-10.2 Area detail in the plan state: full C-01 (recoloured), area rows with Needs attention in plan.attention #FFB3A3 (README fix), 14-day strip and contributor rows, stats value-first with the existing strings"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0013, D-0207]
deps: [T-0593, T-0615, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Balance · all areas", "Balance · area detail" (#turn-5). Behaviour: docs/specs/uf-10-balance.md. README contrast fix: "Needs attention" is #FFB3A3, not the mock's #FF9A85. -->
## Why
Balance shows coverage per area against the 14-day targets. C-01 is recoloured by T-0615. The attention outline and label take `plan.attention`.

## Scope
- **In:**
  - `features/UF-10/**` views and `balance.css`.
  - The roots have `data-wl-state="plan"` and `.wl-page`.
  - The title is a page title with `.wl-title--stop`, and the window line is a label.
  - The area list is `.wl-row`: the name, then "Needs attention" or "Recovering" as a label in `--wl-attention` or `--wl-ink-muted`, then the trailing "load / target" in `.wl-type-row-title`.
  - The attention outline is 2 px `--wl-attention` with the `--wl-bg` gap.
  - **Detail:**
    - the deficit and last-trained values are drawn value-first, using the existing strings and no new copy (D-0212 §2 item 21);
    - the 14-day strip's cells are `--wl-raise`, and days with sets are `--wl-ink`;
    - contributors are `.wl-row`;
    - "Start workout" is the one white primary.
  - The Plan back link is a text button.
- **Out:**
  - C-01 colours (T-0615), engine output and copy.

## Acceptance criteria
- **AC1 (state).** `/balance` and `/balance/:area` have `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (attention).** Seeded with one area `needsAttention: true` and one false:
  - the true row's label text is `plan.attention` (≥ 5.0 on `plan.bg`), and its region outline is 2px `plan.attention`;
  - the false row has neither;
  - a computed scan finds no `#FF9A85` and no legacy `warn`.
- **AC3 (C-01).** C-01's regions use the plan ramp (step 4 is `plan.ink`, step 0 is `plan.raise`), and the numeric labels are still present (D-0019).
- **AC4 (strip).** Days with hard sets are `plan.ink` and days without are `plan.raise`. Each cell keeps its accessible text (`stripCell` / `stripCellEmpty`), so the state isn't shown by colour alone.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on both screens.
  - Rows and area buttons are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `uf-10-balance.spec.ts` (including never-in-workout) and the UF-10 vitest suite pass with no role or name change. Zero history, returning after 10 days off, and no data on this device (offline, never loaded) render in plan: three cases.
- **AC7 (visual compare).** `compareWithCanvas` saves "Balance · all areas" and "Balance · area detail" (turn-5). The log lists the verdicts, with the README override: attention `#FFB3A3`.

Checklist (D-0197 §7):
- Attention true and false, zero and some history, and online and offline-never-loaded are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/body-figure-v2.spec.ts`, `tests/e2e/body-map-figure.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (orchestrator grant: these used `/balance` as the no-state host; re-point them to an injected no-state fixture, as T-0605 did for `/welcome`)
- `apps/web/src/features/UF-10/**` (lane)
- `tests/e2e/uf-10-balance.spec.ts` (listed extra)
- `docs/tickets/T-0611-uf10-balance-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-10-balance.spec.ts` green · commit messages start with `T-0611` and cite UF-10.1/UF-10.2.

## Build / accept log

**Build (frontend-dev, base 4ebb522, tree clean at start).** UF-10.1/10.2 are `data-wl-state="plan"` `.wl-page` roots. Rows are `.wl-row` (name, then `Needs attention` in `--wl-attention` or `Recovering` in `--wl-ink-muted`, trailing load / target as `.wl-type-row-title`, bar on `--wl-raise`). Outline 2 px `--wl-attention`, focus `--wl-focus`. Strip cells `--wl-raise` / `--wl-ink` (on-colour `--wl-on-selected`). Value-first stats, `.wl-row` contributors, one `.wl-button--primary`, Plan is `.wl-button--text`. All legacy `--wl-color-*` removed from balance.css (grepped: no other screen used its classes). The h1 now holds the "Balance." title plus the window label (substring tests unchanged).
- AC1: vitest `cobalt.test.tsx` AC1 + e2e AC1 (data-wl-state, `theme-color` = plan.bg). AC2: vitest AC2 (3), e2e AC2 (computed outline 2px/label on true rows only; scan finds no #FF9A85, legacy warn or legacy accent). AC3: e2e AC3 (bar step 4 = ink, step 0 = raise, figure step-4 fill = ink, 9 numeric labels). AC4: vitest + e2e AC4 (cell bg and aria-label words). AC5: vitest contrast pairs from tokens + e2e axe color-contrast 0 on both screens, 44x44, every text pair >= 4.5, motion 0.2s / 0s under reduced motion. AC6: vitest zero history, 10 days off (real engine), offline-never-loaded x2, plus the existing suite and uf-10 spec. AC7: e2e `compareWithCanvas` turn-5, shots in the orchestrator's shots-T-0611 dir.
- Red runs: e2e AC2 failed on unfixed CSS (`.wl-type-label` muted beat the 1-class attention rule: label was rgb(201,211,255)); fixed with a 3-class selector. Screenshot review caught the window label running words together (inherited h1 -0.04em tracking); fixed with `letter-spacing: normal`.
- Planted faults (backup copies, restored by cp): drop plan state (3 vitest red), strip filled always (1 red), outline not attention (1 red), attention label on every row (2 red). Clean: 20/20.
- Tests updated for the colour mechanism only (no role/name change): balance.render focus-order test (`--wl-attention` / `--wl-focus`), strings.test CSS rule, e2e focus test.
- Deviations from canvas: the C-01 figure and legend sit where the canvas has a dashed placeholder; the "Start workout" CTA is not pinned to the page bottom (page has no min-height); detail shows the load and 63 % as stat size, not the 96 px hero; "Last trained" is one existing sentence, not a split value/label; no "<- Progress" back link (not in the strings). Attention colour is #FFB3A3 per the README, not the mock's.
- Gate: typecheck/lint/test -w exit 0; test:repo-checks 0; format:check 0; check-all 0.
- Full e2e (exit 1, 511 passed, 7 failed): 6 are specs outside this ticket's grants that use /balance as an "unmigrated, no state" host (body-figure-v2 AC3 lift/rest and AC7, body-map-figure unmigrated, visual-foundation /balance h1 scale), plus 1 real regression of mine: body-map-figure /balance at 200 % text overflowed (row grid, 420 > 390; a rem media query did not fire for a style-tag zoom). Fixed by a wrapping flex row; body-map-figure + uf-10 re-run: only the "unmigrated" spec still red. Follow-up: re-point those 6 to an unmigrated host or a fixture.
