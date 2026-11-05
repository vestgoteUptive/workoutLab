# Neutral notice pattern

- **Pattern:** an inline, standing, non-modal message that informs and asks for nothing, or ("with one link" variant) offers one way to act on it. First use: the excluded-areas notice on UF-11.5 and UF-08.2 (D-0199 §8). Also the offline helper line style.
- **Decisions:** D-0199, D-0208, D-0211 §5, T-0590, D-0233 §7 (the "with one link" variant).
- **Variables (D-0211 §2):** `--wl-raise`, `--wl-ink`; the link variant adds `--wl-focus`. Radius `tile` (12). No new token.

## Look

- Container: `--wl-raise` fill, no border, radius 12 px (`tile`), padding 12 px 14 px.
- Icon: an info icon (circle with an "i"), 20 px, **2 px stroke**, `--wl-ink`, top-aligned with the first text line. No emoji, no fill.
- Text: the state font, weight 400, 14 px, line height 1.4, `--wl-ink`. Never `--wl-ink-muted`, which is 4.2:1 on `--wl-raise`. It wraps; it is never truncated or clamped.
- Contrast: `--wl-ink` on `--wl-raise` is 6.2:1 (needs 4.5); the info icon is non-text and needs 3:1, which it meets.

## Rules

- It is not the attention treatment. The attention colour is reserved for C-01 attention, errors and over time (D-0211 §5). A notice never uses it, as a border, icon or text.
- Meaning is in the words. The icon is decorative (`aria-hidden="true"`).
- Semantics: a plain `<p>` or `<div>` in reading order. It is standing content, not a live region, because it is there when the screen renders. (A change after render, such as excluding the last exercise for an area on UF-11.5, is announced through that screen's status line instead.)
- Not dismissible and no timeout.

## Variant: with one link (D-0233 §7)

- **Use:** a notice whose reader can fix the cause on another screen. First use: the level notice on UF-11.6 ("Your level is {Level}. Some favorites are above it." then "Change level" → `/plan/edit?from=favorites`, D-0231 §2).
- **Same container and text** as above: `--wl-raise` fill, radius 12 px, padding 12 px 14 px, the 2 px stroke info icon, 14 px `--wl-ink` text.
- **The link:** one inline text link at the end of the text, after the last sentence and a space.
  - `--wl-ink`, underlined (4 px offset, as the Text button pattern), weight 500, so the link is never shown by colour alone.
  - Target at least 44 px tall: the link is `inline-flex` with `align-items: center` and `min-height: 44px`, so the last line of the notice grows to fit it; the underline sits on the text only. It may wrap to its own line.
  - Focus-visible: 2 px `--wl-focus` ring at a 2 px offset, radius `tile`.
  - Accessible name is the visible text. A link (`<a href>`), never a button: it only navigates.
  - Contrast: `--wl-ink` on `--wl-raise` 6.2:1, the same as the text.
- **Limits:** at most one link per notice, and at most one such notice per screen. A notice that needs two actions is not a notice; use a screen or a sheet.
- **Still a notice:** standing content, not a live region (no `role="status"`, no `role="alert"`, no `aria-live`); never the attention colour (D-0211 §5), as border, icon, text or link; not dismissible and no timeout.

## Copy: areas left without an exercise

Same text on UF-11.5 and UF-08.2. Areas use their labels, in the fixed order (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), joined with ", ".

- Several areas: "Not suggested: {areas}. Every exercise for them is excluded."
- One area: "Not suggested: {area}. Every exercise for it is excluded."

Examples: "Not suggested: Quads. Every exercise for it is excluded." and "Not suggested: Quads, Calves. Every exercise for them is excluded."
