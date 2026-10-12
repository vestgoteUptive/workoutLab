# Design system — Cobalt + state colour

**Source of truth:** `packages/design-tokens/src/tokens.json` (`@workoutlab/design-tokens`, D-0019, D-0208). This page mirrors it, and tests in that package fail if the tables below drift.

**No raw colours.** Colours and fonts are defined only in `tokens.json`. Apps use `var(--wl-color-…)` / `var(--wl-font-…)` from `dist/tokens.css`, or `tokens.color` from the package. A raw colour value (hex, `rgb()`, `hsl()`, `oklch()`, …) anywhere else fails lint (`workoutlab/no-raw-colour`, `wl-check-colours`). The hex values on this page are documentation only.

The tokens file holds one palette, Cobalt + state colour (D-0208). The earlier "Chalk & Iron" palette (D-0019: the flat colour keys, Big Shoulders Display and DM Sans) was retired once every app screen had moved (T-0625, D-0210 §6). Its prototypes in `prototype/` stay valid for layout order and copy only.

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

`color.coverage` is a spec, not a list: `from` `plan.raise`, `to` white, `interpolation: "oklch"`, `steps: 5`. `scripts/build-css.mjs` interpolates it in OKLCH and emits `--wl-color-plan-coverage-0..4`. OKLCH lightness rises strictly from step 0 to step 4. Steps follow D-0013, and the engine picks the step; the UI never computes it.

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
- Self-hosted under the visual-foundation §1 rules: one variable `latin` woff2 per family, `font-display: swap`, same-origin only, from `@workoutlab/design-tokens/fonts.css` (`fonts-state.css` is an alias export of the same file; files, OFL texts and sha256 in `packages/design-tokens/fonts/SOURCES.md`, T-0583).
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

- Gutters: `--wl-space-gutter-plan` 28 px, `--wl-space-gutter-session` 26 px; the 640 px max width stays. `--wl-space-top-safe` 72 px and `--wl-space-bottom-safe` 44 px are the 390 × 844 frame values; code uses `env(safe-area-inset-*)` instead.
- Radius (`--wl-radius-<name>`): `pill` 999 px (pill buttons, chips, segmented controls), `session-button` 22 px, `sheet` 28 px (top corners only), `option` 16 px (selected option rows), `tile` 12 px, `input` 12 px, and `--wl-radius-progress` 2 px for session progress segments (D-0211 §1).
- Option bleed: `--wl-space-option-bleed` 18 px, how far the selected option row bleeds past the gutter. Negative margins are computed from `--wl-gutter` and this token, never a literal (D-0211 §3).
- Touch targets ≥ 44 px. Focus-mode numbers (hero number) stay readable at arm's length.

## Body figure (D-0207)

One original front-and-back figure, `assets/body-figure/body-figure.svg` (`viewBox="0 0 256 290"`, front x 4..124, back x 132..252), drawn in a flat "chalk line" style. It's used by C-01 (`components/c-01-body-map.md`, 140 px compact, 240 px full) and UF-04.2 (`screens/UF-04.1-UF-04.2.md`, 200 px). The asset has no colour of its own: every colour comes from these class rules and the tokens. Preview: `assets/body-figure/preview.html`; region table: `assets/body-figure/README.md`.

**Cobalt recolour (D-0208, D-0211 §2, T-0614).** The class rules read only the generic state variables, so the figure takes the colours of the state it sits in. On `[data-wl-state="plan"]` it is the README "Assets" recolour; a screen without a state is plan (D-0210, T-0624).

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

## Layout & touch

- Phone frame 390 × 844, content max width 640 px centred. Gutters, safe areas and radii: § Spacing and radius. Focus mode (UF-09) is full-bleed and sets its own padding. Spec: `docs/specs/visual-foundation.md` §2.
- No cards: structure comes from 1 px hairlines and type size. Buttons, rows, inputs, checkboxes and sheets follow `components/state-patterns.md`; text inputs and checkbox boxes use a 1 px `--wl-ink-muted` boundary (3:1 non-text contrast).
- Touch targets ≥ 44 px; session buttons at least 64 px tall.
- Icons: 2 px stroke line icons. No emoji.
