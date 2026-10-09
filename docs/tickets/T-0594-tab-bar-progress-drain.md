---
id: T-0594
title: "C-02 tab bar in the plan state (text only, white with a 2 px underline when active, ink-muted otherwise), a SessionProgress component (44 px pause, segments, nowrap counter) and the drain helper (lift rises over rest, 1 s steps, instant under reduced motion)"
lane: web-shell
screens: [UF-02.1, UF-04.1, UF-06.1, UF-11.2, UF-09.1, UF-09.5, UF-09.6, UF-03.2]
decisions: [D-0208, D-0210, D-0211, D-0196, D-0045, D-0017]
deps: [T-0592]
status: done
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Stays out of main.css (component CSS only), so it may run in parallel with T-0593. The tab bar shows on every tab screen: full web e2e suite. The tab bar turns cobalt ahead of the tab screens; the owner accepts this (D-0210 §4). -->
## Why
The tab bar sits under every tab screen. It sets its own `data-wl-state="plan"`, so it turns cobalt as soon as this merges. SessionProgress and the drain are what UF-09 and UF-03.2 build on.

## Scope
- **In:**
  - **`components/tab-bar`:**
    - `data-wl-state="plan"` on the `<nav>`;
    - a 4-column grid with a 1 px `--wl-line` top rule, padding 14 px 12 px plus the D-0196 safe-area bottom padding;
    - text only, 0.875rem/600;
    - the active tab (`aria-current="page"`) in `--wl-ink` with a 2 px underline at a 6 px offset; inactive tabs in `--wl-ink-muted` (not the mock's `#9AA8F0`).

    Unchanged: placement, spacer, scroll padding, `--wl-tab-bar-block-size`, the labels and the ≥ 44 × 44 hit areas (D-0196).
  - **`components/session-progress/`:** `SessionProgress({ done, total, onPause, pauseLabel, counter })` renders:
    - a 44 px round pause button with a 1.5 px `--wl-ink` outline, the pause icon and the given accessible name;
    - `total` segments, 4 px high, gap 4, radius `--wl-radius-progress`: the first `done` in `--wl-ink`, the rest in `--wl-progress-off`, all `aria-hidden`;
    - the visible `counter` text, with `white-space: nowrap`.
  - **`components/drain/`:**
    - `drainPercent(elapsedS, totalS)` = `clamp(0, elapsed ÷ total, 1) × 100`, rounded to one decimal. It is pure; a zero total counts as done.
    - `drainStyle()` returns `{ "--wl-drain": "<X>%" }`.
    - CSS `.wl-drain` paints `linear-gradient(to top, var(--wl-color-lift-bg) var(--wl-drain), var(--wl-color-rest-bg) var(--wl-drain))`. `.wl-drain--deep` paints `lift.bg-deep` above `lift.bg`.
    - `@property --wl-drain` (`<percentage>`) with `transition: --wl-drain 1s linear`; `none` under reduced motion.
- **Out:**
  - Wiring progress or the drain into UF-09 or UF-03.
  - Renaming the "Library" tab (T-0622).

## Acceptance criteria
- **AC1 (tab bar look, `tests/e2e/cobalt-chrome.spec.ts`).**
  - **Given** `/` at 390 × 844 **then** the tab bar's background is `plan.bg` with a 1px `plan.line` top border.
  - The active link is `plan.ink` (8.6:1) with `text-decoration-line: underline`; each inactive link is `plan.ink-muted` (5.9:1).
  - No link contains an `<svg>`.
  - Each link's box is ≥ 44 × 44.
- **AC2 (tab bar behaviour unchanged).** The existing `tests/e2e/shell.spec.ts` tab-bar tests pass unchanged: fixed position, safe area, spacer, focus not hidden, and hidden on `/session/*`, `/welcome/*`, `/account`, `/auth/*` and the `/plan/*` editors.
- **AC3 (SessionProgress, vitest).**
  - `done = 2, total = 5` renders 5 segments: 2 in `--wl-ink` and 3 in `--wl-progress-off`, with the visible counter as given.
  - The pause button has the given name, and a click calls `onPause` once.
  - `done = 0` and `done = total` give all unfilled and all filled.
  - At 320 px, the counter's height equals one line box.
- **AC4 (drainPercent, vitest).**
  - (0, 60) → 0, (30, 60) → 50, (60, 60) → 100, (75, 60) → 100, (−5, 60) → 0 and (10, 0) → 100.
  - A source scan finds no `Date`, `performance` or timer use in `components/drain/`.
- **AC5 (drain motion and paint, Playwright fixture).**
  - `.wl-drain` has `transition-duration: 1s` normally and `0s` under `reducedMotion: "reduce"`. Both are tested.
  - At `--wl-drain: 100%`, the top and bottom pixels are both `lift.bg`; at `0%`, both are `rest.bg` (screenshot pixel samples).
  - At `50%`, the bottom pixel is `lift.bg` and the top is `rest.bg`.
- **AC6 (guard).** No raw colour and no px font size in the three component folders. The lint and `wl-check-colours` pass.

Checklist (D-0197 §7):
- Reduced motion on and off, active and inactive tabs, and the 0 % and 100 % drain extremes are all tested.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/components/tab-bar/**`, `components/session-progress/**`, `components/drain/**` (lane)
- `tests/e2e/shell.spec.ts` (only if a colour pin there needs a deliberate move), `tests/e2e/cobalt-chrome.spec.ts` (new) (listed extras)
- `docs/tickets/T-0594-tab-bar-progress-drain.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0594`.

## Build / accept log
Archived in `docs/tickets/log/T-0594.md` (D-0157).
