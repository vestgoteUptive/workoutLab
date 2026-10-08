# C-01 Body map: coverage colours and legend

- **Component:** C-01 Body map (shared, built in T-0300)
- **Screens:** UF-02.1 Today (compact map, tap opens UF-10.1) and UF-10.1 All areas (full map above the nine rows). Tapping one area opens UF-10.2 for that area.
- **Decisions:** D-0003 (lime ramp, `warn` outline), D-0013 (steps and window), D-0017 (NFRs), D-0019 (tokens, legend copy)
- **Layout (D-0207, GitHub #48):** the body figure (`BodyFigure`) above a label grid. D-0060 §1 is superseded by D-0207 (the tile-only layout is gone); D-0060 §2–§8 still apply. See "Silhouette layout" below, `docs/specs/body-map-silhouette.md` and the asset in `../assets/body-figure/`.
- **Tokens:** `@workoutlab/design-tokens`. Use `coverageLegend` and `attentionLegend` for copy and `var(--wl-color-coverage-N)` / `var(--wl-color-warn)` for colour. Don't retype the copy or the colours.

## Where it appears

- UF-02.1 Today and UF-10.1 All areas only.
- C-01 is never shown on UF-08.* or UF-09.* (principle 1: one task on screen during a workout). The legend isn't shown there either.

## Data in, nothing computed

For each of the nine areas (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), the engine's balance output gives `load`, `target`, `coverageStep` (0–4) and `needsAttention`. C-01 maps `coverageStep` to a token and `needsAttention` to the outline. It never derives either from `load / target`. The UI doesn't know the thresholds (D-0013, principle 3).

## Coverage steps

The step mapping is `0 / <0.33 / <0.66 / <1 / ≥1` for `r = load / target` (D-0013). The engine applies it. The legend only explains it.

| Step | Fill token | Legend `label` | Screen reader `srLabel` | Engine rule (D-0013) | Contrast on `bg` |
|---|---|---|---|---|---|
| 0 | `coverage-0` | None | No hard sets | load = 0 | 1.3:1 (needs label) |
| 1 | `coverage-1` | Under ⅓ | Under one third of target | 0 < r < 0.33 | 2.4:1 (needs label) |
| 2 | `coverage-2` | Under ⅔ | Under two thirds of target | 0.33 ≤ r < 0.66 | 4.7:1 |
| 3 | `coverage-3` | Under target | Under target | 0.66 ≤ r < 1 | 8.7:1 |
| 4 | `coverage-4` | On target | On target or over | r ≥ 1 | 14.9:1 |

**Attention:** "Needs attention" is a 2 px `warn` outline around the area, drawn outline, never fill. It sits on top of whatever coverage fill the area has, including `coverage-0`, where `warn` is 6.2:1. An area can be both "On target" and "Needs attention" if the engine says so.

## Labels (accessibility)

- Every area shows its numeric label (NFR-A11Y-3). Show `load / target` next to or on the area, for example "7.5 / 20" or "8 / 20". Use one decimal only when the value is fractional (D-0013). This is required because `coverage-0` and `coverage-1` are under 3:1 against `bg` (`requiresLabel: true` in `tokens.json`), and colour must never be the only signal.
- Numeric labels use `text` on `bg` or `surface`, or `on-accent` when drawn on `coverage-3`/`coverage-4` fills. Minimum 12 px DM Sans 700.
- Each area is a button with a hit area of at least 44 × 44 CSS px (NFR-A11Y-2). Accessible name: "<Area>, <load> of <target> hard sets, <srLabel>". Append ", needs attention" when flagged, for example "Hamstrings, 6 of 16 hard sets, under target, needs attention".
- Focus ring: 2 px `accent`, offset 2 px. It must not be confused with the `warn` outline.

## Legend

- **Layout:** one row of six chips under the map: five 12 × 12 px swatches with their `label`, and one outlined swatch (2 px `warn`, transparent fill) labelled "Needs attention". Wrap to two rows under 360 px. Chip text is `text-muted` DM Sans 500, 12 px.
- **Copy:** exactly the `label` values above, in step order, then "Needs attention". No other wording.
- **Screen readers:** the legend is a list (`role="list"`) named "Coverage legend". Each item reads its `srLabel`. Swatches are decorative (`aria-hidden`).
- **Always shown**, including with zero history.

## States

- **Zero history:** every area is `coverage-0` (the same colour as `surface-2`) and reads "0 / target". The legend is still shown. On UF-10.1, the "Start workout" action follows (see `docs/specs/uf-10-balance.md`).
- **Offline:** tokens are bundled at build time, so colours and fonts render with no network. Fonts fall back to the generic family in each stack. Data comes from the device recompute described in UF-10.1.
- **Returning after 10 days off:** nothing special in C-01. It shows the steps the engine returns, and the legend is unchanged.
- **Loading:** areas in `surface-2` with no numbers, and the legend visible. No skeleton shimmer when `prefers-reduced-motion` is set.

## Silhouette layout

- **Component:** `BodyMap` (`components/body-map`) renders `BodyFigure` (`components/body-figure`) above a label grid. `BodyFigure` is built from `../assets/body-figure/body-figure.svg` (front and back views, 9 `data-area` regions, no colour attributes). Stroke, seam and hatch rules: `design-system.md` § Body figure.
- **Unchanged:** everything above (where it appears, data in, coverage steps, labels, legend, states), D-0003 / D-0013 / D-0019 colours and copy, and D-0060 §2–§8 (props, number format, accessible names, keyboard, loading, axe, import ban). The D-0060 §8 import ban also covers `BodyFigure` (D-0207 §5).

```
┌──────────────────────────────────┐
│     FRONT            BACK        │  BodyFigure: full 240 px tall, compact 140 px
│    (figure)        (figure)      │  fills = coverage-<step>, attention outline
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

- **Figure:** both views, centred. Each region's fill is `var(--wl-color-coverage-<coverageStep>)`. Shoulders and arms appear in both views and are filled the same in both. Seams inside `coverage-3` / `coverage-4` regions switch to `on-accent`.
- **Label grid** (the D-0060 tile grid, slimmed down; it replaces the big fill shapes):
  - Order: shoulders, chest, back / arms, core, glutes / quads, hamstrings, calves (the D-0060 body order, 3 columns).
  - Each label: a 12 × 12 px swatch dot (the area's coverage fill, with a 1 px `text-muted` border, and a 2 px `warn` ring when `needsAttention`), the area name, and `load / target` under it.
  - `full`: name in DM Sans 500 14 px `text`, numbers DM Sans 700 14 px `text`. The whole label is the area button, min 44 × 44 CSS px. The grid wraps to 2 columns below 300 px container width or at 200 % text zoom.
  - `compact`: name DM Sans 500 12 px `text-muted`, numbers 700 12 px `text`. Not buttons (the whole map is one link, as today). Rows are at least 32 px apart.
- **Legend:** unchanged, below the label grid, in both variants.

### Attention outline on the figure

- `needsAttention` draws a 2 px `warn` stroke **outside** the region's 1 px `text-muted` border, with a 1 px `surface`/`bg` gap between them (a halo). So `warn` never touches a lime fill directly (`warn` against `coverage-4` is only 1.9:1). It's drawn on every path of that area in both views, above the neighbouring regions.
- The same area's label swatch gets the 2 px `warn` ring, and the accessible name keeps the D-0060 §4 ", needs attention" suffix.

### Interaction (`full` only)

- **Controls:** the 9 labels are the buttons (D-0060 §4 names and §5 keys). DOM order = visual order. Nothing in the figure is focusable.
- **Region taps:** a pointer tap or click on any region path calls the same handler as its label (`onSelectArea(area)`, then `/balance/:area`). Small regions (calves, the arms on the back view) don't need their own 44 px target, because the label is the equivalent control (WCAG 2.5.8).
- **Linking:** hover or focus on a label draws the 2 px `accent` focus ring (offset 2 px) around that area's regions. Hover on a region shows the hover state on its label. The focus ring stays distinct from the `warn` outline (different colour, and the ring sits further out).
- `compact`: no region handlers. The link covers the whole map, as today.

### Silhouette states

| State | Figure | Labels |
|---|---|---|
| Loading | All regions `surface-2`, with the D-0060 §6 pulse on region fills (off under reduced motion). | "<Area>" with no numbers. Buttons disabled, as D-0060 §4. |
| Zero history | All regions `coverage-0`. | "0 / target". |
| Area missing or step out of range | That area's regions `surface-2` (D-0060 §2). | "<Area>" neutral name, as D-0060 §4. |
| Offline | Identical (the figure is bundled inline). | Identical. |

### Silhouette accessibility

- The `<svg>` is `aria-hidden`. The labels carry every value as text (NFR-A11Y-3), and the accessible names are unchanged from D-0060 §4.
- Region shapes are visible at every step through the 1 px `text-muted` border (5.8:1 on `coverage-0`/`surface-2`, 6.8:1 on `surface`), even where the step fill is under 3:1.
- Targets: 9 × ≥ 44 px label buttons in `full`.
- Forced colours: regions `Canvas` with `CanvasText` borders, and attention a 3 px `Highlight` stroke.
- Build: web-shell (T-0556 `BodyFigure`, then the C-01 layout). UF-02.1 and UF-10.1 call sites don't change.
