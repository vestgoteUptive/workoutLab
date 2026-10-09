# BodyFigure.tsx: changes for v2

The new `body-figure.svg` fits the current component as it is: the same `<g data-view>` → `<path data-area>` structure, the `wl-fig-hatch` pattern id, and paths that carry only `d` and `class`, with the back view's offset baked into `d`. The props API doesn't change.

To implement the "highlight dims the rest" look from the design, make two small additions:

```tsx
// 1. on the <svg>
className: `wl-fig wl-fig--${size}${highlighted ? " wl-fig--has-highlight" : ""}`,

// 2. on the region path
`${cls} wl-fig__region--${m}${attention ? " wl-fig__region--attention" : ""}${highlighted === area ? " wl-fig__region--highlighted" : ""}`,
```

Nothing else changes. `onAccent()` and the seam handling stay. The new SVG has no `data-seam` paths, because the regions' background-coloured stroke now draws the seams.

## Check before merging
- The `data-area` values in the SVG are `chest`, `shoulders`, `arms`, `core`, `quads`, `back`, `glutes`, `hamstrings` and `calves`. They must match `AREAS` in `@workoutlab/shared` exactly. Rename them in the SVG if the keys differ, for example `upper-back`.
- Coverage mapping: the CSS paints `step-4` white ("on target") and `step-0`–`step-3` with the zone tint. If "on target" is a different step in the engine (D-0003), move the selector. The owner asked for two colours: white for on target and salmon for needs attention.
- Area coverage across the two views:
  - front: chest, shoulders, arms, core, quads;
  - back: back, shoulders, arms, glutes, hamstrings, calves.

  Calves appear on the back only.
- Existing tests that snapshot the old SVG, its region count or its class names need updating (T-0556 ACs).
