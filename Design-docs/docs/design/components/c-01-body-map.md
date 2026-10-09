# C-01 Body map: coverage colours and legend

- **Component:** C-01 Body map (shared, built in T-0300)
- **Screens:** UF-02.1 Today (compact map, tap opens UF-10.1) and UF-10.1 All areas (full map above the nine rows). Tapping one area opens UF-10.2 for that area.
- **Decisions:** D-0208 and D-0211 (Cobalt: the plan coverage ramp, the `plan.attention` outline, the generic state variables), D-0210 (legacy fallback on screens without a state), D-0013 (steps and window), D-0017 (NFRs), D-0019 (legend copy). D-0003's lime ramp and outline colour are superseded by D-0208; its rules (outline, never fill; numeric labels) stand.
- **Layout (D-0207, GitHub #48):** the body figure (`BodyFigure`) above a label grid. D-0060 §1 is superseded by D-0207 (the tile-only layout is gone); D-0060 §2–§8 still apply. See "Silhouette layout" below, `docs/specs/body-map-silhouette.md` and the asset in `../assets/body-figure/`.
- **Tokens:** `@workoutlab/design-tokens`. Use `coverageLegend` and `attentionLegend` for copy. Their `token` fields name the plan tokens (`plan-coverage-N`, `plan-attention`). Components draw them through the generic state variables `var(--wl-coverage-N)` and `var(--wl-attention)` (D-0211 §2), which resolve to `--wl-color-plan-coverage-N` / `--wl-color-plan-attention` on `[data-wl-state="plan"]` and to the legacy palette on a screen without a state (D-0210 §2). Don't retype the copy or the colours.

## Where it appears

- UF-02.1 Today and UF-10.1 All areas only.
- C-01 is never shown on UF-08.* or UF-09.* (principle 1: one task on screen during a workout). The legend isn't shown there either.

## Data in, nothing computed

For each of the nine areas (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), the engine's balance output gives `load`, `target`, `coverageStep` (0–4) and `needsAttention`. C-01 maps `coverageStep` to a token and `needsAttention` to the outline. It never derives either from `load / target`. The UI doesn't know the thresholds (D-0013, principle 3).

## Coverage steps

The step mapping is `0 / <0.33 / <0.66 / <1 / ≥1` for `r = load / target` (D-0013). The engine applies it. The legend only explains it.

| Step | Fill token (variable) | Legend `label` | Screen reader `srLabel` | Engine rule (D-0013) | Contrast on `plan.bg` |
|---|---|---|---|---|---|
| 0 | `plan-coverage-0` (`--wl-coverage-0`, = `plan.raise`) | None | No hard sets | load = 0 | 1.4:1 (needs label) |
| 1 | `plan-coverage-1` (`--wl-coverage-1`) | Under ⅓ | Under one third of target | 0 < r < 0.33 | 2.4:1 (needs label) |
| 2 | `plan-coverage-2` (`--wl-coverage-2`) | Under ⅔ | Under two thirds of target | 0.33 ≤ r < 0.66 | 3.9:1 |
| 3 | `plan-coverage-3` (`--wl-coverage-3`) | Under target | Under target | 0.66 ≤ r < 1 | 6.0:1 |
| 4 | `plan-coverage-4` (`--wl-coverage-4`, white) | On target | On target or over | r ≥ 1 | 8.6:1 |

"Needs label" is `meta.planCoverage[n].requiresLabel` in `tokens.json` (D-0211 §1, T-0587): true when the step is under 3:1 on `plan.bg`, recomputed from the built ramp by the token tests.

**Attention:** "Needs attention" is a 2 px `--wl-attention` outline around the area (`plan.attention`, token `plan-attention`), drawn outline, never fill. A 1 px `--wl-bg` gap separates it from the area, because `plan.attention` on a white fill is only 1.7:1; on `plan.bg` it is 5.0:1 and on `plan.raise` (`plan-coverage-0`) 3.6:1. It sits around whatever coverage fill the area has. An area can be both "On target" and "Needs attention" if the engine says so.

## Labels (accessibility)

- Every area shows its numeric label (NFR-A11Y-3). Show `load / target` next to or on the area, for example "7.5 / 20" or "8 / 20". Use one decimal only when the value is fractional (D-0013). This is required because `plan-coverage-0` and `plan-coverage-1` are under 3:1 against `plan.bg` (`meta.planCoverage[n].requiresLabel: true` in `tokens.json`), and colour must never be the only signal.
- Numeric labels use `--wl-ink` on `--wl-bg` (8.6:1 on plan), or `--wl-on-selected` when drawn on a `--wl-coverage-3` / `--wl-coverage-4` fill. Minimum 12 px `--wl-font` 700.
- Each area is a button with a hit area of at least 44 × 44 CSS px (NFR-A11Y-2). Accessible name: "<Area>, <load> of <target> hard sets, <srLabel>". Append ", needs attention" when flagged, for example "Hamstrings, 6 of 16 hard sets, under target, needs attention".
- Focus ring: 2 px `--wl-focus` (white on plan, 8.6:1), offset 2 px. It must not be confused with the `--wl-attention` outline: different colour, and the ring sits further out.

## Legend

- **Layout:** one row of six chips under the map: five 12 × 12 px swatches (`--wl-coverage-N` with a 1 px `--wl-ink-muted` border, so steps 0 and 1 stay visible on `--wl-bg`) with their `label`, and one outlined swatch (2 px `--wl-attention`, transparent fill) labelled "Needs attention". Wrap to two rows under 360 px. Chip text is `--wl-ink-muted` (5.9:1 on plan) in `--wl-font` 500, 12 px.
- **Copy:** exactly the `label` values above, in step order, then "Needs attention". No other wording.
- **Screen readers:** the legend is a list (`role="list"`) named "Coverage legend". Each item reads its `srLabel`. Swatches are decorative (`aria-hidden`).
- **Always shown**, including with zero history.

## States

- **Zero history:** every area is `plan-coverage-0` (the same colour as `--wl-raise`) and reads "0 / target". The legend is still shown. On UF-10.1, the "Start workout" action follows (see `docs/specs/uf-10-balance.md`).
- **Offline:** tokens are bundled at build time, so colours and fonts render with no network. Fonts fall back to the generic family in each stack. Data comes from the device recompute described in UF-10.1.
- **Returning after 10 days off:** nothing special in C-01. It shows the steps the engine returns, and the legend is unchanged.
- **Loading:** areas in `--wl-raise` with no numbers, and the legend visible. No skeleton shimmer when `prefers-reduced-motion` is set.

## Silhouette layout

- **Component:** `BodyMap` (`components/body-map`) renders `BodyFigure` (`components/body-figure`) above a label grid. `BodyFigure` is built from `../assets/body-figure/body-figure.svg` (front and back views, 9 `data-area` regions, no colour attributes). Fill, stroke, seam, hatch, halo and ring rules, on the generic variables: `design-system.md` § Body figure.
- **Unchanged:** everything above (where it appears, data in, coverage steps, labels, legend, states), D-0013 / D-0019 copy, and D-0060 §2–§8 (props, number format, accessible names, keyboard, loading, axe, import ban). The D-0060 §8 import ban also covers `BodyFigure` (D-0207 §5).

```
┌──────────────────────────────────┐
│     FRONT            BACK        │  BodyFigure: full 240 px tall, compact 140 px
│    (figure)        (figure)      │  fills = --wl-coverage-<step>, attention outline
├──────────────────────────────────┤  16 px gap (full), 12 px (compact)
│ ● Shoulders  ● Chest    ● Back   │  label grid: 3 columns, D-0060 order
│   8 / 16       7.5 / 20   12 / 20│
│ ● Arms       ● Core     ● Glutes │
│   …            …          …      │
│ ● Quads      ● Hamstr…  ● Calves │
├──────────────────────────────────┤
│ legend (unchanged)               │
└──────────────────────────────────┘
```

- **Figure:** both views, centred. Each region's fill is `var(--wl-coverage-<coverageStep>)`. Shoulders and arms appear in both views and are filled the same in both. Seams inside `--wl-coverage-3` / `--wl-coverage-4` regions switch to `--wl-on-selected`.
- **Label grid** (the D-0060 tile grid, slimmed down; it replaces the big fill shapes):
  - Order: shoulders, chest, back / arms, core, glutes / quads, hamstrings, calves (the D-0060 body order, 3 columns).
  - Each label: a 12 × 12 px swatch dot (the area's coverage fill, with a 1 px `--wl-ink-muted` border, and a 2 px `--wl-attention` ring with a 1 px `--wl-bg` gap when `needsAttention`), the area name, and `load / target` under it.
  - `full`: name in `--wl-font` 500 14 px `--wl-ink`, numbers `--wl-font` 700 14 px `--wl-ink`. The whole label is the area button, min 44 × 44 CSS px. The grid wraps to 2 columns below 300 px container width or at 200 % text zoom.
  - `compact`: name `--wl-font` 500 12 px `--wl-ink-muted`, numbers 700 12 px `--wl-ink`. Not buttons (the whole map is one link, as today). Rows are at least 32 px apart.
- **Legend:** unchanged, below the label grid, in both variants.

### Attention outline on the figure

- `needsAttention` draws a 2 px `--wl-attention` stroke **outside** the region's 1 px `--wl-ink-muted` border, with a 1 px `--wl-bg` gap between them (a halo). So `plan.attention` never touches a white fill directly (`plan.attention` against `plan-coverage-4` is only 1.7:1). It's drawn on every path of that area in both views, above the neighbouring regions.
- The same area's label swatch gets the 2 px `--wl-attention` ring, and the accessible name keeps the D-0060 §4 ", needs attention" suffix.

### Interaction (`full` only)

- **Controls:** the 9 labels are the buttons (D-0060 §4 names and §5 keys). DOM order = visual order. Nothing in the figure is focusable.
- **Region taps:** a pointer tap or click on any region path calls the same handler as its label (`onSelectArea(area)`, then `/balance/:area`). Small regions (calves, the arms on the back view) don't need their own 44 px target, because the label is the equivalent control (WCAG 2.5.8).
- **Linking:** hover or focus on a label draws the 2 px `--wl-focus` ring (offset 2 px, a `--wl-bg` gap inside it) around that area's regions. Hover on a region shows the hover state on its label. The focus ring stays distinct from the `--wl-attention` outline (white against salmon, and the ring sits further out).
- `compact`: no region handlers. The link covers the whole map, as today.

### Silhouette states

| State | Figure | Labels |
|---|---|---|
| Loading | All regions `--wl-raise`, with the D-0060 §6 pulse on region fills (off under reduced motion). | "<Area>" with no numbers. Buttons disabled, as D-0060 §4. |
| Zero history | All regions `--wl-coverage-0`. | "0 / target". |
| Area missing or step out of range | That area's regions `--wl-raise` (D-0060 §2). | "<Area>" neutral name, as D-0060 §4. |
| Offline | Identical (the figure is bundled inline). | Identical. |

### Silhouette accessibility

- The `<svg>` is `aria-hidden`. The labels carry every value as text (NFR-A11Y-3), and the accessible names are unchanged from D-0060 §4.
- Region shapes are visible at every step through the 1 px `--wl-ink-muted` border against the `--wl-raise` body (4.2:1 on plan), even where the step fill is under 3:1.
- Targets: 9 × ≥ 44 px label buttons in `full`.
- Forced colours: regions `Canvas` with `CanvasText` borders, and attention a 3 px `Highlight` stroke.
- Build: web-shell (T-0556 `BodyFigure`, then the C-01 layout). UF-02.1 and UF-10.1 call sites don't change.
