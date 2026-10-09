---
id: T-0589
title: "data-wl-state scopes and .wl-paper in main.css (generic --wl-* variables with the Chalk & Iron fallback), --wl-gutter on .wl-page, the state type scale and .wl-title--stop, the 200 ms background cross-fade, runtime theme-color from the screen root's state"
lane: web-shell
screens: []
decisions: [D-0208, D-0210, D-0211, D-0209, D-0045, D-0203, D-0017]
deps: [T-0587, T-0588]
status: done
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. main.css is shared: run the full web e2e suite. No screen sets data-wl-state yet, so the app looks unchanged; the rules are proven on injected fixtures. The first of the main.css chain T-0589 → T-0592 → T-0593. -->
## Why
D-0208 §2: every screen root declares its state, and components read only generic variables. D-0210 §2 and D-0211 §2: those variables fall back to Chalk & Iron when no state is set, so screens can flip one at a time. The browser chrome colour (`theme-color`) follows the state.

## Scope
- **In** (`apps/web/src/main.css`):
  - A `:root` block mapping every D-0211 §2 generic variable to its legacy value.
  - `[data-wl-state="plan"]`, `[data-wl-state="lift"]`, `[data-wl-state="rest"]` and `.wl-paper` blocks, each mapping the variables per D-0211 §2.
  - Each state root sets `background-color: var(--wl-bg)`, `color: var(--wl-ink)` and `font-family: var(--wl-font)`.
  - `.wl-page` reads `--wl-gutter` (D-0211 §3), including the 20 px rule below 360 px.
  - The page background (`html`) follows the screen root's state with `:root:has([data-screen-id][data-wl-state="…"])`, and keeps the legacy `bg` otherwise.
  - The cross-fade: `transition: background-color 200ms ease-out` on state roots and `html`; `transition: none` under `prefers-reduced-motion: reduce`.
  - **The state type scale** (rem only), as role classes under `[data-wl-state]`:
    - `.wl-type-hero`: `clamp(6rem, 26vw, 7rem)`/0.88/700/−0.05em
    - `.wl-type-page-title`: 3.5rem/1/700/−0.04em
    - `.wl-type-section`: 2.75rem/1/700/−0.04em
    - `.wl-type-stat`: 2.125rem/700/−0.03em
    - `.wl-type-row-title`: 1.0625rem/600
    - `.wl-type-body`: 1.0625rem/1.45
    - `.wl-type-label`: 0.875rem/400, `--wl-ink-muted`
    - `.wl-type-button`: 1.375rem/700
  - **The session overrides** under lift and rest:
    - page title (exercise name) 2.75rem/800/−0.03em;
    - section (next exercise name) 4rem/800;
    - stat 3.5rem/800;
    - `.wl-type-hero-number` 9.375rem/0.85/800/−0.06em, and `.wl-type-countdown` 18.75rem;
    - row title 1.0625rem/800;
    - label 0.9375rem/600;
    - button 1.5rem/800.
  - **Defaults under a state:** `h1`, `h2` and `h3` lose `text-transform` and take `font-family: var(--wl-font)`. `h1` takes the page-title role, and `h2`/`h3` the row-title role, unless a role class is set.
  - `.wl-title--stop::after { content: "." / ""; }`, under `@supports`, with a fallback that keeps the dot out of the accessible name.
- **In** (theme-color): `apps/web/src/app/theme-color.ts`, a hook used once in the shell.
  - On every route change, and when a `data-wl-state` attribute changes (a `MutationObserver` on the app root), it sets `<meta name="theme-color">` to the state's `bg` token.
  - The state is read from the outermost element that carries `data-screen-id`; sheets don't change it.
  - Values come from `@workoutlab/design-tokens` (`tokens.color.plan.bg`, `.lift.bg`, `.rest.bg`; no literal), and fall back to `tokens.color.bg` when there's no state.
- **Out:**
  - Any component or screen restyle (T-0592 onwards).
  - The build-time manifest and icons (T-0616).

## Acceptance criteria
- **AC1 (fallback, vitest on main.css text).** `main.css` sets each D-0211 §2 variable on `:root` to its legacy value, with no raw colour and no `px` font size. The existing T-4 checks stay green.
- **AC2 (state mapping, Playwright, `tests/e2e/cobalt-state.spec.ts`).**
  - **Given** `/` at 390 × 844 **when** a test injects `<div data-screen-id="X" data-wl-state="plan">` **then** its computed `background-color` is `plan.bg`, its `color` is `plan.ink`, and its `font-family` starts with `"Familjen Grotesk"`.
  - The same for `lift` (`lift.bg`, `"Bricolage Grotesque"`), `rest` (`rest.bg`) and `.wl-paper` (`paper.bg`, `paper.ink`).
  - Expected values are read from `tokens.json`, never typed.
- **AC3 (fallback, Playwright).** **Given** a div without the attribute **when** its `--wl-bg` is read **then** it resolves to the legacy `bg`, and the existing `visual-foundation.spec.ts` `/plan` checks (Big Shoulders, uppercase) still pass.
- **AC4 (gutter).**
  - A `.wl-page` inside plan computes `padding-left` `28px` at a 390 px viewport and `20px` at 340 px.
  - Inside lift it's `26px` at 390 px.
  - A `.wl-page` without a state stays `20px`, so the existing G-2 pins hold.
- **AC5 (cross-fade and reduced motion).**
  - A state root's computed `transition` includes `background-color 0.2s ease-out`.
  - With `page.emulateMedia({ reducedMotion: "reduce" })` the duration is `0s`.
  - Both values are tested.
- **AC6 (theme-color, vitest).**
  - With a plan root mounted, the meta's `content` equals `tokens.color.plan.bg`.
  - After the attribute switches to `lift`, it equals `tokens.color.lift.bg`.
  - With no state root, it equals `tokens.color.bg`.
  - A `.wl-sheet[data-wl-state="plan"]` inside a lift root leaves it at `lift.bg`.
  - When no meta exists (dev), one is created.
- **AC7 (no uppercase under a state).** Inside a state root, the computed `text-transform` of `h1` and `h2` is `none`; outside one it stays `uppercase`. The `main-css.test.ts` "h1 and h2 … uppercase" pin is scoped deliberately (logged), and `visual-foundation.spec.ts` gains the inside-a-state case.
- **AC8 (full stop).** An `h1.wl-title--stop` reading "Progress" renders a `::after` with content `"."`, and `getByRole("heading", { name: "Progress", exact: true })` finds it.
- **AC9 (type is rem).** A vitest over `main.css` finds every `font-size` in rem or `clamp()` of rem and vw, and none in px. A planted `font-size: 56px` fails (log).

Checklist (D-0197 §7):
- State and no state, and reduced motion on and off, are both tested.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/main.css` (listed extra: the global stylesheet)
- `apps/web/src/app/**` (lane: `theme-color.ts`, its test, the shell line, `__tests__/main-css.test.ts`)
- `tests/e2e/cobalt-state.spec.ts` (new), `tests/e2e/visual-foundation.spec.ts` (listed extras)
- `docs/tickets/T-0589-state-scopes-theme-color.md` (log only)

## Contract impact
none (reads tokens; D-0211 names the mapping)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0589`.

## Build / accept log
Archived in `docs/tickets/log/T-0589.md` (D-0157).
