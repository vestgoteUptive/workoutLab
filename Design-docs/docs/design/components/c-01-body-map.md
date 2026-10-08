# C-01 Body map: coverage colours and legend

- **Component:** C-01 Body map (shared, built in T-0300)
- **Screens:** UF-02.1 Today (compact map, tap opens UF-10.1) and UF-10.1 All areas (full map above the nine rows). Tapping one area opens UF-10.2 for that area.
- **Decisions:** D-0003 (lime ramp, `warn` outline), D-0013 (steps and window), D-0017 (NFRs), D-0019 (tokens, legend copy)
- **Proposed change (GitHub #48):** a body silhouette above a label grid, replacing the D-0060 §1 tiles. See `c-01-body-map-silhouette.md` and `docs/specs/body-map-silhouette.md`. It isn't in force until a decision records it.
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
