# C-01 Body map: silhouette layout (delta)

- **Status:** proposed, GitHub #48. It replaces **D-0060 §1 (tile layout)** once the body-figure decision is recorded (`docs/specs/body-map-silhouette.md` §9). Until then, C-01 is built from `c-01-body-map.md` and D-0060 as they stand.
- **Unchanged:** everything in `c-01-body-map.md` (where it appears, data in, coverage steps, labels, legend, states), D-0003 / D-0013 / D-0019 colours and copy, and D-0060 §2–§8 (props, number format, accessible names, keyboard, loading, axe, import ban).
- **Component:** `BodyMap` (`components/body-map`) renders `BodyFigure` (`components/body-figure`) above a label grid.

## Layout

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

- **Figure:** both views, centred. Each region's fill is `var(--wl-color-coverage-<coverageStep>)`. Shoulders and arms appear in both views and are filled the same in both.
- **Label grid** (this is the D-0060 tile grid, slimmed down; it replaces the big fill shapes):
  - Order: shoulders, chest, back / arms, core, glutes / quads, hamstrings, calves (the D-0060 §1 body order, 3 columns).
  - Each label: a 12 × 12 px swatch dot (the area's coverage fill, with a 1 px `text-muted` border, and a 2 px `warn` ring when `needsAttention`), the area name, and `load / target` under it.
  - `full`: name in DM Sans 500 14 px `text`, numbers DM Sans 700 14 px `text`. The whole label is the area button, min 44 × 44 CSS px. The grid wraps to 2 columns below 300 px container width or at 200 % text zoom.
  - `compact`: name DM Sans 500 12 px `text-muted`, numbers 700 12 px `text`. Not buttons (the whole map is one link, as today). Rows are at least 32 px apart.
- **Legend:** unchanged, below the label grid, in both variants.

## Attention outline on the figure

- `needsAttention` draws a 2 px `warn` stroke **outside** the region's 1 px `text-muted` border, with a 1 px `surface`/`bg` gap between them (a halo). So `warn` never touches a lime fill directly (`warn` against `coverage-4` is only 1.9:1). It's drawn on every path of that area in both views.
- The same area's label swatch gets the 2 px `warn` ring, and the accessible name keeps the D-0060 §4 ", needs attention" suffix.

## Interaction (`full` only)

- **Controls:** the 9 labels are the buttons (D-0060 §4 names and §5 keys). DOM order = visual order. Nothing in the figure is focusable.
- **Region taps:** a pointer tap or click on any region path calls the same handler as its label (`onSelectArea(area)`, then `/balance/:area`). Small regions (calves, the arms on the back view) don't need their own 44 px target, because the label is the equivalent control (WCAG 2.5.8).
- **Linking:** hover or focus on a label draws the 2 px `accent` focus ring (offset 2 px) around that area's regions. Hover on a region shows the hover state on its label. The focus ring stays distinct from the `warn` outline (different colour, and the ring sits further out).
- `compact`: no region handlers. The link covers the whole map, as today.

## States

| State | Figure | Labels |
|---|---|---|
| Loading | All regions `surface-2`, with the D-0060 §6 pulse on region fills (off under reduced motion). | "<Area>" with no numbers. Buttons disabled, as D-0060 §4. |
| Zero history | All regions `coverage-0`. | "0 / target". |
| Area missing or step out of range | That area's regions `surface-2` (D-0060 §2). | "<Area>" neutral name, as D-0060 §4. |
| Offline | Identical (the figure is bundled). | Identical. |

## Accessibility

- The `<svg>` is `aria-hidden`. The labels carry every value as text (NFR-A11Y-3), and the accessible names are unchanged from D-0060 §4.
- Region shapes are visible at every step through the 1 px `text-muted` border (5.8:1 on `coverage-0`/`surface-2`, 6.8:1 on `surface`), even where the step fill is under 3:1.
- Targets: 9 × ≥ 44 px label buttons in `full`.
- Forced colours: regions `Canvas` with `CanvasText` borders, and attention a 3 px `Highlight` stroke.

## Follow-up

- web-shell builds this (T-new-b in the spec) after `BodyFigure` (T-new-a). UF-02.1 and UF-10.1 call sites don't change.
- When T-0315 lands, merge this file into `c-01-body-map.md` and mark D-0060 §1 superseded.
