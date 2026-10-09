---
id: D-0211
title: "Cobalt app phase design defaults: four additive tokens (plan.ink-on-raise, plan.scrim, radius.progress, space.option-bleed) and meta.planCoverage; the generic --wl-* state variables and their per-state mapping; 20 px gutter below 360 px; contrast pairs every screen ticket tests; where warn, accent and bg-focus go"
status: revisit
date: 2026-10-09
by: product-owner (groom, Cobalt app phase)
area: design
amends: D-0208, D-0209
builds-on: D-0003, D-0013, D-0019, D-0203, D-0207, D-0210
---
## Context
The handoff README (`origin/design/redesign-cobalt`, `Design-docs/docs/design/redesign-cobalt/README.md`) uses some values that T-0583 didn't add, because they aren't in `tokens.proposed.json`:
- `#DDE3FF` for labels on `plan.raise` tiles (4.9:1);
- the sheet scrim `#0E1652` at 45 %;
- a 2 px progress-segment radius (`tokens.proposed.json` has `radius.segment: 4`, the README says "progress segments 2");
- the 18 px bleed of the selected option row.

Without tokens these would be raw colours and literals in app CSS, which the colour guard rejects. The handoff also leaves open:
- how `--wl-ink-muted`, `--wl-attention` and `--wl-raise` map in lift and rest (those groups have no such keys);
- the focus ring colour once `accent` retires;
- the many meanings `warn` has in code today (conflicts doc §A 13).

## Decision
1. **Additive tokens.** These are named contract changes to `tokens.json`. The flat keys stay until the D-0210 §6 retirement.

   | Token | Value | Use |
   |---|---|---|
   | `color.plan.ink-on-raise` | `#DDE3FF` | labels on `plan.raise` tiles (4.9:1) |
   | `color.plan.scrim` | `#0E1652` | the sheet dim, applied at 45 % with `color-mix(in oklch, var(--wl-color-plan-scrim) 45%, transparent)` |
   | `radius.progress` | `2` | session progress segments |
   | `space.option-bleed` | `18` | the selected option row's bleed past the gutter |

   - `meta.planCoverage[n].requiresLabel` = contrast of `--wl-color-plan-coverage-n` on `plan.bg` < 3, computed by the test.
   - `radius.segment` (4) has no app use. It stays until the token retirement, which removes it if it still has none. The segmented control's 4 px inner padding is plain CSS.
2. **Generic state variables** (CSS in `apps/web/src/main.css`, not tokens):
   - **The variables:** `--wl-bg`, `--wl-raise`, `--wl-ink`, `--wl-ink-muted`, `--wl-ink-on-raise`, `--wl-line`, `--wl-action`, `--wl-on-action`, `--wl-selected`, `--wl-on-selected`, `--wl-attention`, `--wl-progress-off`, `--wl-focus`, `--wl-scrim`, `--wl-font`, `--wl-gutter`, `--wl-coverage-0` … `--wl-coverage-4`.
   - **`[data-wl-state="plan"]`:**
     - each variable maps to the `plan` key of the same name;
     - `--wl-focus` = `plan.ink`;
     - `--wl-coverage-n` = `--wl-color-plan-coverage-n`;
     - `--wl-font` = `--wl-font-plan`;
     - `--wl-gutter` = `--wl-space-gutter-plan`.
   - **`lift` and `rest`:** their own keys. Where a group has no key of that name:
     - `--wl-ink-muted`, `--wl-attention`, `--wl-selected` and `--wl-focus` = `--wl-ink`. White, so the meaning is carried by the words.
     - `--wl-on-selected` = the state's `on-action`.
     - `--wl-raise` = `lift.bg-deep` in lift and `rest.line` in rest.
     - `--wl-font` = `--wl-font-session` and `--wl-gutter` = `--wl-space-gutter-session`.
   - **`.wl-paper`:** the paper group, with `--wl-focus` = `--wl-attention` = `paper.ink`.
   - **`:root` legacy fallback** (D-0210 §2, until the web retirement ticket):

     | Generic variable | Legacy token |
     |---|---|
     | `--wl-bg` | `bg` |
     | `--wl-raise` | `surface-2` |
     | `--wl-ink` | `text` |
     | `--wl-ink-muted` and `--wl-ink-on-raise` | `text-muted` |
     | `--wl-line` | `line` |
     | `--wl-action`, `--wl-selected` and `--wl-focus` | `accent` |
     | `--wl-on-action` and `--wl-on-selected` | `on-accent` |
     | `--wl-attention` | `warn` |
     | `--wl-progress-off` | `line-strong` |
     | `--wl-scrim` | `bg` |
     | `--wl-coverage-n` | `--wl-color-coverage-n` |
     | `--wl-font` | `--wl-font-body` |
     | `--wl-gutter` | `20px` |

3. **Gutter on narrow screens.** Below a 360 px viewport (`max-width: 359.98px`), `--wl-gutter` is 20 px in every state, so the 320 × 640 reflow check (visual-foundation G-4) has room.
   - `.wl-page` reads `padding-inline: max(var(--wl-gutter), env(safe-area-inset-left)) max(var(--wl-gutter), env(safe-area-inset-right))`.
   - The 640 px max width stays.
   - Bleeds (the selected option row, the paper panel, the tab bar) compute their negative margins from `--wl-gutter` and `--wl-space-option-bleed`, never from a literal.
4. **Contrast pairs** (WCAG 2.2 AA). These are the README "Contrast" values, rounded per D-0209 §1. Every screen ticket tests the pairs its screens use.

   **Text, 4.5:1:**

   | Pair | Ratio |
   |---|---|
   | white on `plan.bg` | 8.6 |
   | `plan.ink-muted` on `plan.bg` | 5.9 |
   | white on `plan.raise` | 6.2 |
   | `plan.ink-on-raise` on `plan.raise` | 4.9 |
   | white on `lift.bg` | 4.8 |
   | white on `rest.bg` | 4.9 |
   | `lift.on-action` on white | 6.1 |
   | `rest.on-action` on white | 8.1 |
   | `paper.ink` on `paper.bg` | 12.9 |
   | `paper.ink-muted` on `paper.bg` | 6.5 |
   | `plan.attention` on `plan.bg` | 5.0 |

   **Non-text, 3:1:**
   - `plan.ink-muted` as the boundary of inputs, checkboxes and the toggle in its off state;
   - the `plan.attention` outline on `plan.bg` (5.0) and on `plan.raise` (3.6);
   - the white focus ring on plan, lift and rest;
   - the `paper.ink` ring on paper.

   **Rules that follow from failing pairs:**
   - `plan.ink-muted` on `plan.raise` is 4.2. Text on `raise` uses `ink` or `ink-on-raise`, never `ink-muted`.
   - `plan.line` on `plan.bg` is 2.1, so `line` is decorative only. Chips and segments are identified by their label text, and their selected state is the white fill.
   - The mockup values the README replaced are never used: `#D9472B`, `#9AA8F0`, `#FBD9D1`, `#7E8EE8` and `#FF9A85`.
5. **Where the retired keys go** (each use moves in its screen ticket):

   | Today | New |
   |---|---|
   | C-01 and UF-10 attention outline | 2 px `--wl-attention`, with a 1 px `--wl-bg` gap outside the region (attention on white is 1.7:1) |
   | PR highlight (UF-03.3) | a full-bleed lift band: `lift.bg`, white text |
   | Warm-up (UF-09.2, the UF-08.2 time-bar `__seg--warn`) | in session, the deep fill; in the UF-08.2 time bar, an `--wl-ink-muted` segment with its existing text label |
   | Last 10 s of rest (`.wl-uf09__ring[data-warn]`) | the drain (the 10 s cue is unchanged) |
   | Over time (UF-05 `[data-tag="over-time"]`) | `--wl-attention` text on `plan.bg` |
   | Errors and `aria-invalid` | plan: a 2 px `--wl-attention` border and `--wl-attention` text; lift and rest: a 2 px `--wl-ink` border, an `aria-hidden` error icon and the words; paper: `paper.ink` |
   | Danger button (UF-07 `data-variant="danger"`, delete account, End workout) | the secondary outline, last on the screen |
   | `accent` primary, selected, done, progress | `--wl-action`, `--wl-selected`, white progress segments |
   | `accent` focus ring | a 2 px `--wl-focus` outline at a 2 px offset |
   | `bg-focus` (UF-09, and the how-to, swap and add sheets) | the lift or rest state; sheets use the plan sheet |

6. **Glyphs are never text.** The mock's text glyphs become `aria-hidden` 2 px stroke icons in `currentColor`, so accessible names don't change:
   - the "✓ " before multi-select chip labels, and the ✓ on Done and Accept;
   - the → on primaries;
   - the ✕, II, ⌄ and ⋮⋮ controls.

## Consequences
- T-0587 adds §1's tokens (a contract change, forced full gate). T-0589 writes §2–§3 in `main.css`. The screen tickets apply §4–§6.
- The `Tokens` and `ColorName` types widen to the new keys.

## Revisit when
- A real phone shows `plan.line` hairlines too faint to read structure.
- The owner wants exact (unrounded) README floors.
- The designer prefers the README's literal `--wl-color-coverage-*` naming. It can only take that name after the token retirement.
