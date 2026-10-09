---
id: T-0595
title: "UF-09.3 Current set and UF-09.4 Confirm set in the lift state, and the UF-09 chrome on SessionProgress: Bricolage hero numbers, full-width session button, stepper and RIR as session controls, lift error form; visual-foundation AC5 pin moves"
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4]
decisions: [D-0208, D-0210, D-0211, D-0212, D-0213, D-0111, D-0118]
deps: [T-0593, T-0594, T-0591, T-0619]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "In session · set" (#turn-3), "In session · log set" (#turn-5). Behaviour: T-0304b. UF-09 folder chain T-0619 → T-0595 → T-0596 → T-0597 → T-0598 → T-0620 → T-0621; never in parallel with T-0580. Principle 1 (one task on screen) is the test that matters most. -->
## Why
Lifting screens turn red (D-0208 §2). The 200 px round "Done set" becomes the full-width session button. The UF-09 chrome (pause, progress, index) becomes the shared SessionProgress, so every later UF-09 ticket inherits it.

## Scope
- **In:**
  - `chrome.tsx`, `current-set.tsx`, `confirm-set.tsx`, the host's state attribute, and `uf-09.css` for these views.
  - While the machine is in UF-09.3 or UF-09.4, the element carrying `data-screen-id` has `data-wl-state="lift"`. `bg-focus` is dropped for these views.
  - `chrome.tsx` renders `SessionProgress`, using the existing pause action and name (`en.uf09.pauseWorkout`) and the existing index text (`en.uf09.index(k, n)`). Segments are filled for done items.
  - **Type:**
    - the exercise name in the session page-title role (2.75rem/800);
    - the load (for example "100 kg") and the reps ("×8") in `.wl-type-hero-number` (9.375rem/0.85/800);
    - the T-0619 state caption in the session label role.
  - **Controls:**
    - Done is `.wl-button--session` (white with `lift.on-action` text);
    - the UF-09.4 reps and weight steppers use session outline buttons around `.wl-input` fields;
    - RIR is a `.wl-segmented` on its existing controls;
    - Save is the one session primary;
    - the autosave line is in the label role.
  - The `aria-invalid` weight input uses the lift error form (D-0211 §5).
  - `tests/e2e/visual-foundation.spec.ts` AC5 ("focus mode is untouched") is rewritten deliberately to the new UF-09 sizes, and the log shows its red run.
- **Out:**
  - UF-09.1/.2/.5/.6/.7/.8/.9 (T-0596–T-0598).
  - Any string (T-0620 renames "Done set").
  - Machine, timer, cue and wake-lock behaviour.

## Acceptance criteria
- **AC1 (state).** **Given** a session reached from UF-08.4 Ready in the e2e **when** on UF-09.3 and UF-09.4 **then** the `data-screen-id` element has `data-wl-state="lift"`, its computed background is `lift.bg` `#CC4225`, and `theme-color` equals `lift.bg`. No element on the screen uses the legacy `bg-focus`.
- **AC2 (one task on screen).** Each screen shows exactly one session primary and no tab bar, and everything else is behind Pause. The existing principle-1 assertions in `tests/e2e/uf-09-focus.spec.ts` pass unchanged.
- **AC3 (Done).** On UF-09.3, the primary's accessible name is unchanged (`en.uf09.doneSet`). Its width is ≥ the content width minus 1 px, its height ≥ 64 px, and it has a `lift.action` background with `lift.on-action` text (6.1:1).
- **AC4 (state named in text).** The T-0619 caption ("Lifting · set n of N") is visible on both screens, read from `en.uf09` keys in the test.
- **AC5 (progress chrome).**
  - The counter reads `en.uf09.index(k, n)`, and the filled segments equal the done items.
  - At 320 × 640 the counter doesn't wrap, and there's no horizontal scroll.
  - The pause button is 44 × 44 with its existing name.
- **AC6 (contrast).**
  - White on `lift.bg` is ≥ 4.8 at one decimal (≥ 4.5 required), as computed from the rendered colours.
  - Axe colour-contrast has 0 violations on both screens.
  - No `#D9472B` anywhere (a computed-colour scan).
- **AC7 (error form).** **Given** an invalid weight on UF-09.4 **then** the input has a 2px `lift.ink` border, an `aria-hidden` icon and the existing error text. A valid weight shows the 1px boundary. Both are tested.
- **AC8 (targets, type, guard).**
  - Every interactive control is ≥ 44 × 44.
  - A vitest over `uf-09.css` finds no px font size and no raw colour.
  - The lint and `wl-check-colours` pass.
- **AC9 (motion).** Entering UF-09.3 from Rest cross-fades the background over 200 ms, and instantly under reduced motion. Both values are tested, and nothing else animates.
- **AC10 (behaviour unchanged).**
  - `uf-09-focus.spec.ts`, `uf-09-ready.spec.ts`, `uf-09-offline.spec.ts`, `uf-09-do-later.spec.ts` and the UF-09 vitest suite pass with no change to role or name queries, timings or cue assertions.
  - Offline UF-09.3 still logs to the queue (the existing offline spec), and the offline line renders on lift.
- **AC11 (visual compare).** With `WL_CANVAS_COMPARE=1`, `compareWithCanvas` saves UF-09.3 against "In session · set" (turn-3) and UF-09.4 against "In session · log set" (turn-5) at 390 × 844. The log lists each pair and a per-frame verdict. The README overrides apply (lift `#CC4225`).

Checklist (D-0197 §7):
- Online and offline (AC10) and valid and invalid weight (AC7) are both covered. A back-off set shows its caption: one e2e case.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `tests/e2e/uf-09-focus.spec.ts`, `tests/e2e/visual-foundation.spec.ts` (listed extras)
- `docs/tickets/T-0595-uf09-chrome-set-confirm-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs and `visual-foundation.spec.ts` green · commit messages start with `T-0595` and cite UF-09.3/UF-09.4.

## Build / accept log
