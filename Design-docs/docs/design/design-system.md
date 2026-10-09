# Design system — Cobalt + state colour, and "Chalk & Iron"

**Source of truth:** `packages/design-tokens/src/tokens.json` (`@workoutlab/design-tokens`, D-0019, D-0208). This page mirrors it, and tests in that package fail if the tables below drift.

**No raw colours.** Colours and fonts are defined only in `tokens.json`. Apps use `var(--wl-color-…)` / `var(--wl-font-…)` from `dist/tokens.css`, or `tokens.color` from the package. A raw colour value (hex, `rgb()`, `hsl()`, `oklch()`, …) anywhere else fails lint (`workoutlab/no-raw-colour`, `wl-check-colours`). The hex values on this page are documentation only.

The tokens file holds two palettes side by side (D-0208 rollout, T-0583):

1. **Cobalt + state colour (D-0208)**: the new state groups. New work (the landing page first, T-0584) uses these.
2. **Chalk & Iron (D-0019)**: the flat keys, **in use until the app screens migrate**. They are retired, with Big Shoulders Display and DM Sans, in a later ticket once the last app screen has moved.

## Cobalt + state colour (D-0208)

One rule: **the background colour shows the session state.** Each screen root carries `data-wl-state="plan|lift|rest"`, and components read generic variables mapped from it (D-0208 §2). Plan is every non-session screen plus mid-session decisions (UF-09.8, UF-09.9, swap sheets); lift is UF-09.2/.3/.4/.7 and UF-03.1; rest, draining to lift, is UF-09.1/.5/.6 and UF-03.2. Paper is a light band for the check-in card, the unsynced notice and blue-over-paper sheets. No cards: structure comes from 1 px hairlines (`line`) and type size; no shadows.

Full handoff: branch `design/redesign-cobalt`, `Design-docs/docs/design/redesign-cobalt/README.md`.

### State colour tokens

CSS variable: `--wl-color-<state>-<name>`, e.g. `plan.ink-muted` is `--wl-color-plan-ink-muted`.

| Token | Hex | Use |
|---|---|---|
| `plan.bg` | `#2337C6` | Plan background |
| `plan.raise` | `#3B50DD` | Target tiles, empty bars, selected row in the routine editor, the filled part of progress |
| `plan.line` | `#6676DA` | 1 px hairlines, outline chips, segmented control border, tab bar rule (decorative) |
| `plan.ink` | `#FFFFFF` | Primary text |
| `plan.ink-muted` | `#C9D3FF` | Secondary text, labels, captions, inactive tab labels, rest-day labels |
| `plan.action` | `#FFFFFF` | Primary pill button |
| `plan.on-action` | `#2337C6` | Text on `plan.action` |
| `plan.attention` | `#FFB3A3` | "Needs attention" outline and label (Balance), below-target bar (Progress) |
| `plan.selected` | `#FFFFFF` | Selected chip or segment |
| `plan.on-selected` | `#2337C6` | Text on `plan.selected` |
| `plan.ink-on-raise` | `#DDE3FF` | Labels on `plan.raise` tiles (4.9:1; D-0211 §1). Text on `raise` uses `ink` or `ink-on-raise`, never `ink-muted` (4.2:1) |
| `plan.scrim` | `#0E1652` | Sheet dim, at 45 %: `color-mix(in oklch, var(--wl-color-plan-scrim) 45%, transparent)` (D-0211 §1) |
| `lift.bg` | `#CC4225` | Lift background (not the mock's `#D9472B`, which gives white 4.3:1) |
| `lift.bg-deep` | `#B33520` | Top band of a timed or warm-up countdown fill |
| `lift.line` | `#EE8E7B` | Hairlines (decorative) |
| `lift.ink` | `#FFFFFF` | Text on lift |
| `lift.action` | `#FFFFFF` | Done, Save · start rest, Skip, Finish |
| `lift.on-action` | `#B33520` | Text on `lift.action`; also Skip rest on the red drain |
| `lift.progress-off` | `#EE8E7B` | Unfinished progress segments (decorative) |
| `rest.bg` | `#3F7A76` | Rest background |
| `rest.line` | `#7FA8A4` | Hairlines (decorative) |
| `rest.ink` | `#FFFFFF` | Text on rest |
| `rest.action` | `#FFFFFF` | Skip rest |
| `rest.on-action` | `#2C5754` | Text on `rest.action` |
| `rest.progress-off` | `#7FA8A4` | Unfinished progress segments (decorative) |
| `paper.bg` | `#F4F3EE` | Paper band: check-in card, unsynced notice, sheets |
| `paper.line` | `#D6D6E4` | Hairlines on paper (decorative) |
| `paper.ink` | `#1A2266` | Text on paper |
| `paper.ink-muted` | `#4A5290` | Secondary text on paper |
| `paper.action` | `#2337C6` | Accept (check-in) |
| `paper.on-action` | `#FFFFFF` | Text on `paper.action` |

### Plan coverage ramp

`color.coverage` is a spec, not a list: `from` `plan.raise`, `to` white, `interpolation: "oklch"`, `steps: 5`. `scripts/build-css.mjs` interpolates it in OKLCH and emits `--wl-color-plan-coverage-0..4` (the `plan-` prefix keeps it apart from the Chalk & Iron `--wl-color-coverage-*`). OKLCH lightness rises strictly from step 0 to step 4. Steps follow D-0013, and the engine picks the step; the UI never computes it.

| Step | CSS variable | Hex (built) |
|---|---|---|
| 0 | `--wl-color-plan-coverage-0` | `#3B50DD` (= `plan.raise`) |
| 1 | `--wl-color-plan-coverage-1` | `#6580EA` |
| 2 | `--wl-color-plan-coverage-2` | `#95ACF4` |
| 3 | `--wl-color-plan-coverage-3` | `#C9D6FB` |
| 4 | `--wl-color-plan-coverage-4` | `#FFFFFF` |

`meta.planCoverage[n].requiresLabel` (D-0211 §1) is true when step n is below 3:1 on `plan.bg`: steps 0 and 1 (1.4 and 2.4) need their numeric label, steps 2–4 (3.9, 6.0, 8.6) don't. The tests recompute every flag from the built ramp.

The C-01 body figure recolour for `plan.bg` is specified in § Body figure and needs its own design check before it ships (D-0208 Q3, H-31, T-0614).

### Contrast (WCAG 2.2 AA, enforced by tests)

Computed from the tokens by `packages/design-tokens/test/cobalt.test.ts`. A pair passes when its ratio, rounded to one decimal, is at least the measured value below, and every text pair also clears 4.5:1 unrounded (D-0209).

| Pair | Ratio | Needs |
|---|---|---|
| `plan.ink` (white) on `plan.bg` | 8.6 | 4.5 |
| `plan.ink-muted` on `plan.bg` | 5.9 | 4.5 |
| `plan.ink` (white) on `plan.raise` | 6.2 | 4.5 |
| `plan.ink-on-raise` on `plan.raise` | 4.9 | 4.5 |
| `lift.ink` (white) on `lift.bg` | 4.8 | 4.5 |
| `rest.ink` (white) on `rest.bg` | 4.9 | 4.5 |
| `lift.on-action` on `lift.action` (white) | 6.1 | 4.5 |
| `rest.on-action` on `rest.action` (white) | 8.1 | 4.5 |
| `paper.ink` on `paper.bg` | 12.9 | 4.5 |
| `paper.ink-muted` on `paper.bg` | 6.5 | 4.5 |
| `plan.attention` on `plan.bg` | 5.0 | 4.5 |

- `lift.bg` is `#CC4225` because white on the mock's `#D9472B` is 4.3:1; a test plants that value and fails.
- Lift and rest are almost the same luminance (1.03:1), so they differ by hue only. Every session screen names its state in text ("Lifting", "Rest", "Get ready", "Warm-up"); keep those labels, they are the colour-blind fallback.
- `plan.ink-muted` on `plan.raise` is 4.2:1 and fails text contrast (a test keeps it failing), so labels on raise tiles use `plan.ink-on-raise` (D-0211 §4).
- `line` and `progress-off` colours are decorative (no 3:1 duty). Information never rests on them alone.

### Type (D-0208)

- Plan screens: **Familjen Grotesk** 400/600/700. Token `--wl-font-plan`: `"Familjen Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Session screens (lift, rest): **Bricolage Grotesque** 400/600/800. Token `--wl-font-session`: `"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Self-hosted under the visual-foundation §1 rules: one variable `latin` woff2 per family, `font-display: swap`, same-origin only, from `@workoutlab/design-tokens/fonts-state.css` (files, OFL texts and sha256 in `packages/design-tokens/fonts/SOURCES.md`, T-0583).
- No uppercase transforms anywhere; sentence case only. Big titles end with a full stop ("Lower A.", "Progress.").
- Sizes in `rem` (16 px = 1 rem):

| Role | Plan (Familjen) | Session (Bricolage) |
|---|---|---|
| Hero number | — | 9.375rem single-line digits ("100 kg", "×8", "2:29"), 18.75rem single-digit countdowns; 800, line height 0.85, tracking −0.06em |
| Hero title | 6–7rem, 700, line height 0.88, tracking −0.05em ("Lower A." on Today) | — |
| Page title | 3.5rem, 700, tracking −0.04em, line height 1 | 2.75rem, 800, tracking −0.03em (exercise name) |
| Section title | 2.75–3rem, 700, tracking −0.04em | 4rem, 800 (next exercise name) |
| Stat | 2.125rem, 700, tracking −0.03em | 3.5–4.5rem, 800 |
| Row title | 1.0625–1.125rem, 600 | 1.0625rem, 800 |
| Body | 1.0625rem / 1.45 | 1.0625rem / 1.45 |
| Label / caption | 0.875–0.9375rem, 400, `ink-muted` | 0.9375rem, 600 |
| Button | 1.375rem, 700 | 1.5rem, 800 |
| Tab label | 0.875rem, 600 | — |

### Spacing and radius

- Gutters: `--wl-space-gutter-plan` 28 px, `--wl-space-gutter-session` 26 px (replaces the 20 px `.wl-page` gutter once screens migrate; the 640 px max width stays). `--wl-space-top-safe` 72 px and `--wl-space-bottom-safe` 44 px are the 390 × 844 frame values; code uses `env(safe-area-inset-*)` instead.
- Radius (`--wl-radius-<name>`): `pill` 999 px (pill buttons, chips, segmented controls), `session-button` 22 px, `sheet` 28 px (top corners only), `option` 16 px (selected option rows), `tile` 12 px, `input` 12 px, `segment` 4 px (no app use; D-0211 §1), and `--wl-radius-progress` 2 px for session progress segments (D-0211 §1).
- Option bleed: `--wl-space-option-bleed` 18 px, how far the selected option row bleeds past the gutter. Negative margins are computed from `--wl-gutter` and this token, never a literal (D-0211 §3).
- Touch targets ≥ 44 px. Focus-mode numbers (hero number) stay readable at arm's length.

## Chalk & Iron (D-0019) — in use until the app screens migrate

Dark, high-contrast, athletic. Big condensed numbers for anything read mid-set. The app screens still use these flat tokens and fonts; they are retired in a later ticket (D-0208 rollout).

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

## Body figure (D-0207)

One original front-and-back figure, `assets/body-figure/body-figure.svg` (`viewBox="0 0 256 290"`, front x 4..124, back x 132..252), drawn in a flat "chalk line" style. It's used by C-01 (`components/c-01-body-map.md`, 140 px compact, 240 px full) and UF-04.2 (`screens/UF-04.1-UF-04.2.md`, 200 px). The asset has no colour of its own: every colour comes from these class rules and the tokens. Preview: `assets/body-figure/preview.html` (Cobalt section first, then the legacy section until T-0625); region table: `assets/body-figure/README.md`.

**Cobalt recolour (D-0208, D-0211 §2, T-0614).** The class rules read only the generic state variables, so the figure takes the colours of the state it sits in. On `[data-wl-state="plan"]` it is the README "Assets" recolour; on a screen without a state the same variables fall back to the legacy palette (D-0210 §2), so an unmigrated screen doesn't change.

| Part (class) | Fill | Stroke |
|---|---|---|
| Body outline (`wl-fig__body wl-fig__silhouette`) | `--wl-raise` | 1.5 px `--wl-ink-muted` |
| Region (`wl-fig__region`, `data-area`) | `--wl-raise` untouched; `--wl-coverage-N` (C-01); `--wl-ink` primary or the `--wl-ink` hatch secondary (UF-04.2) | 1 px `--wl-ink-muted` |
| Neutral part (`wl-fig__body`: hip flexor, inner thigh, knee, shin, back of knee, achilles) | `--wl-raise` | 0.75 px `--wl-line` (decorative) |
| Seam (`wl-fig__seam`, `data-seam` = its area) | none | 0.75 px `--wl-line`; `--wl-on-selected` when its area is primary, `--wl-coverage-3` or `--wl-coverage-4` (decorative) |
| Attention halo (`wl-fig__halo-warn`, `wl-fig__halo-gap`) | none | the 1 px region border, then a 1 px `--wl-bg` gap, then 2 px `--wl-attention` |
| Highlight ring (`wl-fig__ring`, `wl-fig__ring-gap`) | none | a 2 px `--wl-bg` gap, then 2 px `--wl-focus` |

- **Strokes** are set in CSS px with `vector-effect: non-scaling-stroke`, so they stay 1.5 px / 1 px / 0.75 px at every size. Round joins and caps.
- **Hatch** (secondary areas): `<pattern id="wl-fig-hatch">`, `--wl-ink` stripes (`wl-fig__hatch-stripe`) on a `--wl-raise` ground (`wl-fig__hatch-ground`), 5 px period, 1.5 px stripes, 45°. The pattern is in user units (7.25 / 2.2), which is exactly 5 px / 1.5 px at the 200 px UF-04.2 size. Each inline copy of the figure needs its own pattern id.
- **Attention halo** (C-01): drawn outside the region and above its neighbours. The halo stroke is 7 px and the gap stroke 3 px, both centred on the region path, so with the 1 px border on top the visible bands are 1 px border, 1 px `--wl-bg` gap, 2 px `--wl-attention`. The gap exists because `plan.attention` on a white fill (`--wl-coverage-4`, primary) is only 1.7:1; next to `--wl-bg` it is 5.0:1.
- **Highlight ring** (C-01 label hover or focus): 9 px ring and 5 px gap strokes, drawn under the regions, so the 2 px `--wl-focus` band sits 2 px outside the region border and further out than the attention halo. White ring and salmon halo also differ in colour.
- **Forced colours:** unchanged. Fills `Canvas`, strokes `CanvasText`, primary `CanvasText`, hatch `CanvasText` stripes on `Canvas`, seams `GrayText`, attention 3 px `Highlight`.
- **Not interactive:** the `<svg>` is `aria-hidden`, has no title, role or tab stop; the text equivalents live next to it (C-01 labels, UF-04.2 lists).

**Contrast on plan** (computed by `packages/design-tokens/test/body-figure.test.ts`):

| Pair | Ratio | Needs | Use |
|---|---|---|---|
| `plan.ink-muted` on `plan.raise` | 4.2 | 3.0 | silhouette and region borders against the body |
| `plan.ink` (white) on `plan.raise` | 6.2 | 3.0 | primary areas, hatch stripes, `--wl-coverage-4` |
| `plan.attention` on `plan.bg` | 5.0 | 3.0 | the halo against the gap and the page |
| `plan.attention` on `plan.raise` | 3.6 | 3.0 | the halo where it crosses the body |
| `plan.attention` on white | 1.7 | fails | why the `--wl-bg` gap exists |
| `plan.ink` (white) on `plan.bg` | 8.6 | 3.0 | the highlight ring |

- Every region is visible at every step through its 1 px `--wl-ink-muted` border against the `--wl-raise` body (4.2:1), even where the step fill itself is under 3:1 (steps 0 and 1 on `plan.bg`, which therefore carry their numeric label: `meta.planCoverage`).
- `--wl-line` and the seams are decorative (`plan.line` on `plan.raise` is 1.5:1); no information rests on them.

## Type

- Display: **Big Shoulders Display** 700/800, uppercase for titles, numbers and timers. Token `--wl-font-display`: `"Big Shoulders Display", "Arial Narrow", "Roboto Condensed", sans-serif`.
- Body: **DM Sans** 400/500/700. Token `--wl-font-body`: `"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Fonts are self-hosted (woff2), with no third-party font CDN, for offline use and privacy (D-0019): one variable `latin` file per family, `font-display: swap`, preloaded and precached. Spec: `docs/specs/visual-foundation.md` §1. The faces ship from `@workoutlab/design-tokens/fonts.css` (files and OFL texts in `packages/design-tokens/fonts/`, T-0544).
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
