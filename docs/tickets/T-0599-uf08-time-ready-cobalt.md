---
id: T-0599
title: "UF-08.1 Time and energy and UF-08.4 Ready in the plan state: time stepper and quick-pick chips first, energy as a segmented control, Skip today chips with an aria-hidden tick, finish-time .wl-input, warm-up and Ready settings as toggle rows, one white primary"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.4]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0191, D-0107, D-0115]
deps: [T-0593, T-0591]
status: review
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Set up · time and energy" (#turn-3), "Set up · ready" (#turn-5). Behaviour: the UF-08.x tickets (T-0303a, T-0303d), D-0191. UF-08 folder chain T-0599 → T-0600. -->
## Why
Setup is where the time budget is asked (principle 2). The redesign keeps time first, and gives it the strongest control on the screen.

## Scope
- **In:**
  - UF-08.1 and UF-08.4 in `SessionSetup.tsx`, `Ready.tsx`, `time.ts` (view only) and `uf-08.css`.
  - The roots get `data-wl-state="plan"` and `.wl-page`; the old 16 px padding is dropped, so the gutter isn't doubled.
  - **Time:** the minutes value in `.wl-type-hero` with the −/+ steppers as outline pill buttons; the 20/30/45/60/90 quick picks as `.wl-chip`; the finish-time field as `.wl-input`.
  - **Energy:** `.wl-segmented` on its existing controls, with the hint as a label.
  - **Skip today:** `.wl-chip` with the `aria-hidden` tick (D-0211 §6).
  - The warm-up toggle and the Ready settings (sound cues, voice countdown, keep screen awake) become `.wl-toggle` rows.
  - One white primary each ("Suggest my workout", "Start").
  - The `.wl-uf08__error` text uses the plan error form.
- **Out:**
  - UF-08.2, UF-08.5 and Reorder (T-0600).
  - The swap sheet (T-0602).
  - Copy and engine calls.

## Acceptance criteria
- **AC1 (state).** `/session/setup` (UF-08.1) and Ready (UF-08.4) have `data-wl-state="plan"`, a `plan.bg` background and a `plan.bg` `theme-color`. At 390 px, `padding-left` is `28px`.
- **AC2 (time first, principle 2).** The time control is the first interactive element in tab order on UF-08.1. The selected quick pick has the `plan.selected` fill, and the steppers and keys change it as before.
- **AC3 (chips).**
  - A pressed "Skip today" chip's accessible name is exactly the area label ("Quads"), with `aria-pressed="true"`, a `plan.selected` fill and a visible tick.
  - Unpressed: transparent and no tick.
  - Both are tested.
- **AC4 (toggles).** The warm-up toggle and the Ready toggles keep their roles and names (`getByRole` queries unchanged). Toggling the warm-up still changes the plan's warm-up inclusion (existing test, unchanged).
- **AC5 (one primary, contrast).**
  - Exactly one `.wl-button--primary` per screen, with `plan.on-action` on `plan.action` (8.6).
  - Labels are `plan.ink-muted` on `plan.bg` (≥ 5.9 at one decimal).
  - The error line, when shown, is `plan.attention` on `plan.bg` (≥ 5.0). Shown and hidden are both tested.
  - Axe colour-contrast has 0 violations.
- **AC6 (targets, type, motion, guard).**
  - Every control, including each chip, is ≥ 44 × 44.
  - No px font size and no raw colour in `uf-08.css`.
  - No transition except the cross-fade, instant under reduced motion. Both values are tested.
- **AC7 (behaviour unchanged).**
  - `uf-08-setup.spec.ts`, `uf-08-excluded.spec.ts`, `uf-08-favorites.spec.ts` and the UF-08 vitest suite pass with no role or name change.
  - Offline (the cached plan) and zero history both render in plan (two e2e cases).
  - "Nothing fits in 20 min" renders as a label, not an error.
- **AC8 (visual compare).** `compareWithCanvas` saves "Set up · time and energy" (turn-3) with two areas skipped, and "Set up · ready" (turn-5). The log lists the verdicts.

Checklist (D-0197 §7):
- Online and offline, zero history and returning, chip pressed and unpressed, and error shown and hidden are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `tests/e2e/uf-08-setup.spec.ts` (listed extra)
- `docs/tickets/T-0599-uf08-time-ready-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · commit messages start with `T-0599` and cite UF-08.1/UF-08.4.

## Build / accept log

### Build log (frontend-dev, 2026-10-09)
Start: worktree clean at 04a47f1. Restyle only: `SessionSetup.tsx`, `Ready.tsx`, `uf-08.css`; no copy, string or engine change. No `.wl-sheet` mounted (T-0630 not hit).
- **What changed.** Both roots are `data-wl-state="plan"` + `.wl-page`. Time: minutes in `.wl-type-hero`, outline pill steppers, quick picks `.wl-chip`, finish field `.wl-input` + `.wl-input__error`. Energy `.wl-segmented` on the same radios. Skip today `.wl-chip` + aria-hidden `TickIcon`. Warm-up and the three Ready settings `.wl-toggle` (still `checkbox` role, no On/Off word, no copy). One `.wl-button--primary` each with an `ArrowIcon`. Time card `.wl-card` (unboxed). Ready explainer rows lost their numbered tiles (canvas has none). Legacy base `.wl-uf08` padding/colours gated by `:not([data-wl-state])` for UF-08.2; plan rules under `.wl-uf08[data-wl-state]`. All px font sizes in the file became rem.
- **AC to test.** AC1 `cobalt-plan.test.tsx` (roots) + e2e "AC1 UF-08.1/UF-08.4" (bg, padding-left 28px, theme-color, unboxed `.wl-card`). AC2 vitest tab order + e2e "AC2" (first Tab stops, fills, Enter/Space on the stepper). AC3 vitest + e2e "AC3 Skip today chip" (pressed and unpressed, tick). AC4 vitest + e2e "AC4 toggles" (roles unchanged, existing warm-up test unchanged). AC5 vitest (one primary, error shown/hidden on 08.1, alert on 08.4) + e2e "AC5 contrast" x2 (every text pair >= 4.5, named pairs 8.6, 5.9, 5.0, axe color-contrast 0). AC6 vitest guard (no px font, no raw colour, no transition in the plan block) + e2e targets (every control incl. 9 skip chips) + e2e motion (root 0.2s, 0s under reduced motion, controls 0s). AC7 existing suites unchanged and green; e2e "AC7 returning", "AC7 offline", "AC7 Nothing fits".
- **Existing tests changed (one).** `uf-08-setup.spec.ts` "Start, Back and the 3 switches": the three switches are now measured by their `label.wl-toggle` row (the switch is 48 x 28 inside a 44 px row, state-patterns Toggle). Nothing else in the existing suites changed.
- **Red runs.** First e2e run: AC2 tab-order test red (my test focused a stale element), AC4 red (hover state read as the off border); both test bugs, fixed in the test.
- **Planted faults** (copies in scratchpad, restored with cp). Vitest: root state removed (AC1 x2), `wl-chip` class removed (AC2/3), tick removed (AC3), `role="switch"` (AC4), second primary (AC5), `role="alert"` on the fit line (AC7), px font + hex + transition + boxed `.wl-uf08__card` (AC6 x3): 10 of 18 red. E2E, broad: all 13 red. E2E, targeted (tick removed, label colour `--wl-line`, transition on the stepper): AC3, AC5 x2 and the AC6 motion test red, the other 10 green.
- **Deviations from the canvas.** The app has the Skip today group and "Set a finish time", which the canvas frames omit, so UF-08.1 is taller than 844 and "Suggest my workout" sits below the fold at 390 x 844. The h1 reads "How long do you have?" (canvas: "How much time do you have?"), and no "Step n of 3" or "Lower A." (copy, D-0212 §5). Close is the X icon (canvas: the word). No On/Off word beside the switches. Voice countdown shows on in the shot because the default prefs are all on. Canvas screenshots are in the scratchpad `shots-T-0599/`.
- **Gate.** `-w typecheck lint test --concurrency=1` exit 0 (second run; the first two had one unrelated web unit test each time out under machine load average 22: `ensure-tokens-css` then `UF-01 screens`, both green alone). `-w test:repo-checks` 0, `-w format:check` 0, `node .github/scripts/check-all.mjs` 0. Full e2e: 458 passed, 9 unrelated load timeouts (cobalt-chrome x4, uf-01-onboarding x4, uf-09-focus x1); those three specs rerun together exit 0. All UF-08 and T-0599 e2e cases green in the full run.
- **Rework (review).** Restored the UF-08.2 legacy chip rules, `.wl-uf08__skipping` colour and the 8 px `.wl-uf08__chips` gap under `.wl-uf08:not([data-wl-state])`; plan scope keeps 6 px. New e2e "UF-08.2 is unchanged" (computed border, fill, pressed fill, radius, weight, gap vs tokens) went red with the legacy chip rule deleted (planted fault, restored by cp). New contrast e2e: disabled Suggest (ink on raise 6.2), disabled steppers (5.9), start-failed alert (5.0). Status set to review. Dropped the `.wl-page > .wl-button--primary` follow-up (selector does match).
