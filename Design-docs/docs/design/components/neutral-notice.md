# Neutral notice pattern

- **Pattern:** an inline, standing, non-modal message that informs and asks for nothing. First use: the excluded-areas notice on UF-11.5 and UF-08.2 (D-0199 §8). Also the offline helper line style.
- **Decisions:** D-0199, D-0208, D-0211 §5, T-0590.
- **Variables (D-0211 §2):** `--wl-raise`, `--wl-ink`. Radius `tile` (12). No new token.

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

## Copy: areas left without an exercise

Same text on UF-11.5 and UF-08.2. Areas use their labels, in the fixed order (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), joined with ", ".

- Several areas: "Not suggested: {areas}. Every exercise for them is excluded."
- One area: "Not suggested: {area}. Every exercise for it is excluded."

Examples: "Not suggested: Quads. Every exercise for it is excluded." and "Not suggested: Quads, Calves. Every exercise for them is excluded."
