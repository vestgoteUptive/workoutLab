---
id: T-0602
title: "Swap sheet (UF-08.3 before starting, UF-05.1 mid-workout) as the plan sheet even over lift: candidates as selected option rows on native radios, reason chips as outline chips, the C-03 Don't-suggest checkbox, the over-time tag in plan.attention"
lane: web-feature:UF-05
screens: [UF-08.3, UF-05.1]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0199, D-0056]
deps: [T-0593, T-0595, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Set up · swap before starting" and "Swap · mid-workout" (#turn-5). Behaviour: screens/UF-08.3-UF-05.1.md. SwapSheet lives in features/UF-05 and is mounted by UF-08 and UF-09; only UF-05 files change. Depends on T-0595, so the mid-workout case opens over a real lift screen. -->
## Why
A swap is a decision, so it's cobalt even when it opens over the red set screen (D-0208 §2).

## Scope
- **In:**
  - `features/UF-05/SwapSheet.tsx` and `uf-05.css`.
  - The sheet is `.wl-sheet` with `data-wl-state="plan"` and the scrim; `bg-focus` is dropped.
  - The current exercise is the section title, with the area caption as a label.
  - The reason chips are `.wl-chip`, single-select, keeping their native semantics.
  - Candidates are `.wl-option` rows on their existing native radios. Their tags are outline chips, except "Over your time", which is `--wl-attention` text (D-0211 §5).
  - "Don't suggest {name} again" is C-03 (restyled by T-0593).
  - "Use {name}" is the one white primary, and Close is a text button.
- **Out:**
  - Ranking, copy, and the reason enum (D-0056).
  - The host screens.

## Acceptance criteria
- **AC1 (plan over lift).**
  - **Given** UF-09.3 (lift) **when** the swap sheet opens from Pause **then** the sheet has `data-wl-state="plan"` and a `plan.bg` background, the screen root keeps `lift`, `theme-color` stays `lift.bg`, and the scrim is `plan.scrim` at 45 %.
  - **Given** UF-08.2 (plan) **when** it opens **then** the same sheet look applies.
  - Both hosts are tested.
- **AC2 (options).** Each candidate is found by `getByRole("radio", { name })`. The selected one has the `plan.selected` block that bleeds 18 px past the gutter, the others are plain rows, and arrow keys move the selection.
- **AC3 (over-time tag).** An over-time candidate's tag text is `plan.attention` on `plan.bg` (≥ 5.0) and carries its existing words. A candidate without the tag shows none. Both are tested.
- **AC4 (checkbox, offline).** The Don't-suggest checkbox has the C-03 plan look. Offline it's `aria-disabled` with the one explanation line; online it toggles. Both are tested (the existing tests, unchanged).
- **AC5 (contrast, targets, type, guard).**
  - Axe colour-contrast has 0 violations with the sheet open over both hosts.
  - Every control is ≥ 44 × 44.
  - No px font size and no raw colour.
- **AC6 (motion).** The sheet opens and closes without a transition. Under reduced motion the same holds (both values asserted).
- **AC7 (behaviour unchanged).** `tests/e2e/uf-05-swap.spec.ts`, the UF-08.3 cases in `uf-08-setup.spec.ts` and the UF-05 vitest suite pass with no role or name change. The focus trap, focus return, Escape, loading, empty and error states each render in plan.
- **AC8 (visual compare).** `compareWithCanvas` saves "Set up · swap before starting" and "Swap · mid-workout" (turn-5). The log lists the verdicts. Expected deviations: the app's reason chips (D-0212 §4) and no "routine" checkbox.

Checklist (D-0197 §7):
- Online and offline, over-time tag present and absent, both hosts, and empty and non-empty candidates are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/visual-foundation.spec.ts` (orchestrator grant, for every screen restyle: move this screen's checks from the legacy no-state scale to the plan or state scale, as T-0601/T-0597 did, or to an injected no-state fixture; never use another real screen as the no-state host)
- `apps/web/src/features/UF-05/**` (lane)
- `tests/e2e/uf-05-swap.spec.ts` (listed extra)
- `docs/tickets/T-0602-uf05-swap-sheet-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-05-swap.spec.ts` and `uf-08-setup.spec.ts` green · commit messages start with `T-0602` and cite UF-08.3/UF-05.1.

## Build / accept log

### Build log (frontend-dev, 2026-10-12)
- Start: git clean, HEAD dc78220. `SwapSheet.tsx` is now `.wl-sheet[data-wl-state=plan]` + body-level `.wl-sheet-scrim` + grabber, in a `display:contents` plan wrapper (no `data-screen-id` on it). Title = `wl-type-section`, area caption (`wl-type-label`, `en.bodyMap.areas`, names of the heaviest-weight areas; no i18n file touched). Reason chips `.wl-chip` (native radios + tick), candidates `.wl-option` rows (native radios + tick), Use = `.wl-button--primary`, Close = `.wl-button--text`. Tags are outline chips; over-time is `--wl-attention` (5.03 on plan.bg), on the selected block and the hover fill it takes on-selected / ink (attention on raise is 3.62). `uf-05.css` rewritten: wrapper, stack, tags, and a scoped rule that keeps the hidden radio a full-size click target (without it Playwright `.check()` in `uf-08-setup.spec.ts` "Swap the second item" hung: the label span intercepted the click; red on first full run, green after).
- AC map (vitest `__tests__/cobalt.test.tsx`, e2e `uf-05-swap.spec.ts`): AC1 vitest roots + lift-wrapper host, e2e Pause host and UF-08 host (bg, scrim 0.45, radius, top 150); AC2 vitest classes/radios, e2e selected block bleeds 18 px + ArrowDown; AC3 vitest tag present/absent + CSS, e2e computed attention colour; AC4 existing excluded tests unchanged + e2e offline aria-disabled/note, online check; AC5 vitest contrast pairs + guards, e2e 44 px, axe incl. color-contrast; AC6 e2e transition 0s for both reduced-motion values; AC7 vitest states in plan, existing suites + uf-05-swap, uf-08-setup swap cases green; AC8 e2e `compareWithCanvas` both frames.
- Removed the obsolete dialog.test "row and chip classes are at least 44 px in uf-05.css" (it grepped the deleted `.wl-uf05__chip/use/close` rules); replaced by the cobalt classes + e2e 44 px check.
- Planted faults (backup copies, restored by cp), each red: over-time colour to ink (vitest CSS test, e2e computed colour); dialog loses data-wl-state (3 vitest); wl-option class dropped (vitest, e2e bleed); hover rule changed (vitest); scrim removed (vitest, e2e); bare `h2` rule (vitest); raw hex (vitest); Use on legacy class (vitest); `[data-wl-state].wl-uf05__panel{transition}` (e2e 0.2s vs 0s). The first transition fault with a lower-specificity selector stayed green (the shared rule wins), so the fault was re-planted at equal specificity.
- Canvas verdicts (390x844, /tmp/.../shots-T-0602/): "Set up · swap before starting" and "Swap · mid-workout": sheet from y 150, 28 px radius, grabber, plan.bg, white selected block bleeding 18 px, text-button / white primary all match. Expected deviations: the app's 5 reason chips (D-0212 §4) above the list instead of the 3 variation tabs, no "routine" checkbox, no sub-line/Cancel+Swap pair; the app's host is replaced by the overlay (UF-09 mounts the sheet as the only screen root), so the canvas's dimmed screen behind shows the bare scrim.
- Gate: typecheck/lint/test, test:repo-checks, format:check, check-all all exit 0. Full e2e: 597/598 on the final run; the one failure was a `pwa-update.spec.ts` test (a different one each full run, 4/4 green solo with --repeat-each=2): load flake, not in this diff.
