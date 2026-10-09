---
id: T-0597
title: "UF-09.1 Get ready, UF-09.5 Rest and UF-09.6 Next exercise in the rest state with the drain (lift rises over rest) replacing the ring and the orange last 10 s; Skip on the drain uses lift.on-action; −15 s/+15 s as session outlines"
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.5, UF-09.6]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0066, D-0118]
deps: [T-0596]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "In session · rest" (#turn-3), "Get ready" and "Next exercise" (#turn-4). Behaviour: T-0304f. UF-09 folder chain; never in parallel with T-0580. -->
## Why
Rest and set-up time are teal, with red rising from the bottom as the time runs out. At 100 % the screen is fully red, which is the moment the set starts (README "Drain fill").

## Scope
- **In:**
  - `get-ready.tsx`, `rest.tsx`, `next-exercise.tsx`, `ring.tsx` (removed from these views) and `uf-09.css`.
  - Each root has `data-wl-state="rest"` and `.wl-drain`, with `drainStyle(elapsedS, totalS)` from the existing persisted timer, stepped once per second.
  - The countdown is in `.wl-type-hero-number`; the UF-09.1 single digit is in `.wl-type-countdown`.
  - The next exercise name on UF-09.6 is in the session section role (4rem/800).
  - **Buttons:**
    - Rest's "Skip rest" is a session button with `lift.on-action` text, because it sits on the drain;
    - −15 s and +15 s are session outline buttons;
    - "I'm ready" and "Start now" are the session primary, and "Skip warm-up" is an outline;
    - Swap and Do-later seams are outline buttons.
  - The `data-warn` orange is removed.
- **Out:**
  - Copy (T-0619 has added the UF-09.6 caption; T-0621 adds the status lines).
  - Timer and cue behaviour.

## Acceptance criteria
- **AC1 (drain).** **Given** a 60 s rest (fake timers) **when** 30 s have passed **then** `--wl-drain` is "50%". At 0 s elapsed it's "0%" and the top pixel is `rest.bg` (Playwright, seeded). At 60 s it's "100%" and the top pixel is `lift.bg`.
- **AC2 (no ring, cue kept).** UF-09.5 renders no `.wl-uf09__ring` and no `data-warn`. At 10 s left, the existing cue assertion fires once.
- **AC3 (state per step and theme-color).**
  - The roots have `data-wl-state="rest"`, and `theme-color` is `rest.bg`.
  - After Skip rest, UF-09.3 shows `lift` and `theme-color` `lift.bg`.
  - The cross-fade is 200 ms, instant under reduced motion. Both values are tested.
- **AC4 (state named in text).** "Get ready", "Rest" and the T-0619 "Next exercise" caption are visible, read from `en.uf09` in the test.
- **AC5 (contrast).**
  - White on `rest.bg` is ≥ 4.9 at one decimal; white on `lift.bg` is ≥ 4.8.
  - The Skip button's text is `lift.on-action` on white (6.1).
  - Axe colour-contrast has 0 violations at 0 %, 50 % and 100 % drain.
- **AC6 (motion).** The drain's `transition-duration` is `1s`, and `0s` under reduced motion. Both are tested.
- **AC7 (targets, type, guard).** Every control is ≥ 44 × 44. No px font size and no raw colour in the changed CSS.
- **AC8 (behaviour unchanged).**
  - `uf-09-focus.spec.ts`, `uf-09-ready.spec.ts`, `uf-09-offline.spec.ts`, `uf-09-do-later.spec.ts` and the UF-09 vitest suite pass with no role, name, timing or cue change.
  - A reload mid-rest resumes the drain at the persisted elapsed value (NFR-TIME-1): one e2e case at about 50 %.
  - Offline rest shows the offline line.
- **AC9 (visual compare).** `compareWithCanvas` saves "In session · rest" (turn-3), "Get ready" and "Next exercise" (turn-4) pairs. The log lists the verdicts, with the README override: no `#D9472B`.

Checklist (D-0197 §7):
- A reload mid-rest and an uninterrupted rest, online and offline, and reduced motion on and off are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `tests/e2e/uf-09-focus.spec.ts`, `tests/e2e/uf-09-ready.spec.ts` (listed extras)
- `docs/tickets/T-0597-uf09-drain-screens-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0597` and cite UF-09.1/UF-09.5/UF-09.6.

## Build / accept log
