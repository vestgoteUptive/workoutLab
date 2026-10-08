---
id: D-0209
title: "T-0583 build defaults for the D-0208 tokens: rounded README contrast floors, per-stylesheet font budget, Google Fonts as the font source, px radius/space variables"
status: revisit
date: 2026-10-08
by: designer (T-0583)
area: design
builds-on: D-0208, D-0203, D-0204
---
## Context
T-0583 adds the D-0208 state groups and fonts. Four details were open in the ticket and the handoff README.

## Decision
1. **Contrast floors are the README values rounded to one decimal.** The README "Contrast" ratios are rounded: ink-muted on plan.bg is 5.854 (README 5.9), `#B33520` on white 6.093 (6.1), `#2C5754` on white 8.082 (8.1). A pair passes when its ratio, rounded to one decimal, is at least the README value. Every text pair must also clear 4.5:1 unrounded. The `#D9472B` planted fault (4.298) fails both.
2. **The visual-foundation §1 size budget applies per stylesheet.** `fonts-state.css` (Familjen Grotesk 18,916 B + Bricolage Grotesque 41,344 B = 60,260 B) meets "each ≤ 60 KB, pair ≤ 110 KB" on its own. `fonts.css` keeps its own budget. While both ship, a page that loads both stylesheets pays both. That cost ends when the Chalk & Iron fonts retire.
3. **Font source.** The woff2 files are the latin subsets served by the official Google Fonts API (fonts.gstatic.com, built from `google/fonts`). They are byte-identical to the Fontsource `latin-wght-normal` 5.3.0 builds that T-0544 used. The OFL texts come from `google/fonts` at pinned commits. Bricolage's `wght` file spans 200–800, so `fonts-state.css` declares `font-weight: 200 800`.
4. **Radius and space emit as px** (`--wl-radius-pill: 999px`, `--wl-space-gutter-plan: 28px`), because the tokens are px numbers. Type sizes stay in rem in code. `space.top-safe` and `space.bottom-safe` are emitted too, as frame reference values; code uses `env(safe-area-inset-*)`.
5. **`meta.note` from `tokens.proposed.json` is not copied.** It contains two hex values, and the auth-template colour check walks every string in tokens.json. The note lives in `design-system.md` instead. `meta.states` is copied.

## Revisit when
The owner or the design review wants exact (unrounded) README floors, or the app loads both font stylesheets on one page for long enough that the combined size matters.
