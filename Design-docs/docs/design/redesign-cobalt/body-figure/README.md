# Body figure v2: "smooth outline" (redesign-cobalt 1b)

The owner picked the 1b style. This folder contains everything needed to ship it.

| File | Goes to | What |
|---|---|---|
| `../../assets/body-figure/body-figure.svg` | `Design-docs/docs/design/assets/body-figure/body-figure.svg` (replaces) | The new geometry. Paths only, no colours, no transforms. viewBox `0 0 212 215`: front at x 0–100, back at x 112–212. |
| `body-figure.css` | replaces `body-figure.css` next to `BodyFigure.tsx` | All colours, as tokens via the `--wl-*` state variables. |
| `BodyFigure-changes.md` | — | A two-line component change (highlight classes), plus checks before merging. |
| `decision-draft.md` | `.squad/decisions/` as the next D-NNNN | Supersedes D-0207's art. |
| `../canvas/Body Figure.dc.html` | — | The design reference. Build **1b** only; 1a and 1c are rejected. |
| `../canvas/Body Figure Export.dc.html` | — | The exported SVG rendered in every state. This is the visual acceptance target. |

## Visual rules
- **Silhouette:** head, torso + legs and both arms, filled with ink at 16 %.
- **Zones:** filled with ink at 32 %, with a 2.4-unit stroke in the screen background colour; 4 units at compact size.
- **Primary:** solid ink (white).
- **Secondary:** a 45° hatch, ink lines 1.7 wide every 4 units over the 16 % base.
- **Coverage:** white means on target, salmon (`plan.attention` `#FFB3A3`) plus a ring means needs attention, and every other area keeps the zone tint.
- **Highlight** (area detail): the chosen area is white with a ring, and everything else is dimmed to 12 % / 20 %.
- **Session screens:** the same art. It inherits `--wl-bg` and `--wl-ink` from `[data-wl-state]`, so the seams turn red or teal automatically. Attention isn't shown on session screens.
- **Sizes:** full ≈ 300 px tall (Balance, onboarding), detail ≈ 220 px (area detail, workout preview, exercise detail, session), compact ≈ 60 px (Exercises list thumbnails).
- **Accessibility:** the SVG stays `aria-hidden`. The area list or labels beside it carry the meaning, as before. On the interactive onboarding figure, the chips are the accessible control; the figure is a pointer shortcut.

## Where it's used
Balance (UF-10.1), Balance area (UF-10.2), Workout preview (UF-02.2), Exercise detail (UF-04.2), Exercises list (UF-04.1), Onboarding priority areas (UF-01 / UF-11.3), and the session Set / Next exercise screens (UF-09.3, UF-09.6). See `canvas/Body Figure.dc.html` → 1b for each screen.
