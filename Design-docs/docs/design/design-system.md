# Design system — "Chalk & Iron"

Dark, high-contrast, athletic. Big condensed numbers for anything read mid-set.

**Source of truth:** `packages/design-tokens/src/tokens.json` (`@workoutlab/design-tokens`, D-0019). This page mirrors it, and a test in that package fails if the table below drifts. Apps use `var(--wl-color-<token>)` from `dist/tokens.css` or `tokens.color` from the package. Raw colour values anywhere else fail lint (`workoutlab/no-raw-colour`, `wl-check-colours`).

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `bg` | `#121210` | App background |
| `bg-focus` | `#0B0B0A` | Focus mode background |
| `surface` | `#1D1C19` | Cards |
| `surface-2` | `#2A2925` | Pills, empty bars |
| `line` | `#2E2C28` | Borders |
| `line-strong` | `#3A3833` | Inputs, secondary buttons |
| `text` | `#F2EFE8` | Primary text |
| `text-muted` | `#A8A398` | Secondary text |
| `accent` | `#D4F25A` | Primary actions, done, progress (text on it: `#121210`) |
| `accent-hover` | `#E6FA95` | Hover |
| `warn` | `#FF8A3D` | PRs, warm-up, last 10 s of rest, over time; "Needs attention" 2 px outline on C-01 |
| `on-accent` | `#121210` | Text and icons on `accent` / `accent-hover` |
| `coverage-0` | `#2A2925` | C-01 step 0: no hard sets (= `surface-2`) |
| `coverage-1` | `#585332` | C-01 step 1: under ⅓ of target |
| `coverage-2` | `#85833D` | C-01 step 2: under ⅔ of target |
| `coverage-3` | `#AFB849` | C-01 step 3: under target |
| `coverage-4` | `#D4F25A` | C-01 step 4: on target or over (= `accent`) |

### Coverage ramp (D-0003, D-0013, D-0019)

- `coverage-1..3` sit at t = 0.25 / 0.5 / 0.75 of an OKLCH interpolation from `surface-2` to `accent`. Lightness rises strictly from step 0 to step 4.
- Contrast against `bg`: step 0 1.3:1, step 1 2.4:1, step 2 4.7:1, step 3 8.7:1, step 4 14.9:1. Steps 0 and 1 are under the 3:1 non-text minimum, so `tokens.json` marks them `requiresLabel: true`. Because of that, C-01 always shows numeric labels (see `components/c-01-body-map.md`).
- The engine picks the step (`coverageStep`, D-0013). Tokens and UI never compute it.
- "Needs attention" is a 2 px `warn` outline, never a fill. `warn` reaches 8.0:1 on `bg` and 6.2:1 on `coverage-0`.

### Contrast checks (WCAG 2.2 AA, enforced by tests)

| Pair | Ratio | Needs |
|---|---|---|
| `text` on `bg` / `bg-focus` / `surface` | 16.3 / 17.2 / 14.8 | 4.5 |
| `text-muted` on `bg` / `bg-focus` / `surface` | 7.5 / 7.8 / 6.8 | 4.5 |
| `on-accent` on `accent` / `accent-hover` | 14.9 / 16.5 | 4.5 |
| `warn` outline on `bg` / `surface-2` | 8.0 / 6.2 | 3.0 |
| `text-muted` checkbox border (C-03) on `bg` / `surface` / `surface-2` | 7.5 / 6.8 / 5.8 | 3.0 |

## Type

- Display: **Big Shoulders Display** 700/800, uppercase for titles, numbers and timers. Token `--wl-font-display`: `"Big Shoulders Display", "Arial Narrow", "Roboto Condensed", sans-serif`.
- Body: **DM Sans** 400/500/700. Token `--wl-font-body`: `"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Fonts are self-hosted (woff2), with no third-party font CDN, for offline use and privacy (D-0019): one variable `latin` file per family, `font-display: swap`, preloaded and precached. Spec: `docs/specs/visual-foundation.md` §1. Until that ships, the stacks fall back to system fonts.
- Scale (spec: `docs/specs/visual-foundation.md` §3; sizes in `rem` in code):

| Role | Font | Size / line height | Weight | Case |
|---|---|---|---|---|
| Page title `h1` | display | 32–40 px (`clamp`) / 1.0 | 800 | uppercase |
| Section title `h2` | display | 24 px / 1.1 | 800 | uppercase |
| Card label | body | 12 px / 1.33, 0.08em tracking, `text-muted` | 700 | uppercase |
| Stat number | display | 28 px (34 px hero) / 1.0 | 800 | — |
| Body | body | 16 px / 1.5 | 400 (500/700 for emphasis) | — |
| Secondary | body | 14 px / 1.4, `text-muted` | 400 | — |
| Caption | body | 13 px (never under 12) / 1.3, `text-muted` | 500 | — |
| Focus mode numbers | display | 104–180 px | 800 | — |

## Layout & touch

- Phone frame 390 × 844. Page gutter 20 px (`.wl-page`, never under 16 px, wider when the safe-area inset is), content max width 640 px centred, 16 px between cards. Focus mode (UF-09) is full-bleed and sets its own padding. Spec: `docs/specs/visual-foundation.md` §2.
- Card: `surface`, 1 px `line` border, radius 16 px, padding 16 px. Buttons radius 14 px: primary `accent` 54 px tall, secondary `surface-2` + `line-strong` 48 px. Text inputs and checkbox boxes use a `text-muted` boundary (3:1 non-text contrast); `line-strong` is decorative only (1.5:1).
- Touch targets ≥ 44 px; primary buttons 54–64 px tall; Done set 200 px round.
- Icons: 2 px stroke line icons. No emoji.
