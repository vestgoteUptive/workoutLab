# Neutral notice pattern

- **Pattern:** an inline, standing, non-modal message that informs and asks for nothing. First use: the excluded-areas notice on UF-11.5 and UF-08.2 (D-0199 §8). Also the offline helper line style.
- **Decisions:** D-0199, D-0003.
- **Tokens:** existing only: `surface-2`, `line`, `text-muted`, `text`.

## Look

- Container: `surface-2` fill, 1 px `line` border, radius 12 px, padding 12 px 14 px.
- Icon: an info icon (circle with an "i"), 20 px, **2 px stroke**, `text-muted`, top-aligned with the first text line. No emoji, no fill.
- Text: DM Sans 400, 14 px, line height 1.4, `text-muted`. It wraps; it is never truncated or clamped.
- Contrast: `text-muted` on `surface-2` is 5.8:1 (needs 4.5).

## Rules

- It is not the attention treatment. The orange attention colour is reserved for PRs, warm-up, the last 10 s of rest, over time and the C-01 attention outline (design-system.md). A notice never uses it, as a border, icon or text.
- Meaning is in the words. The icon is decorative (`aria-hidden="true"`).
- Semantics: a plain `<p>` or `<div>` in reading order. It is standing content, not a live region, because it is there when the screen renders. (A change after render, such as excluding the last exercise for an area on UF-11.5, is announced through that screen's status line instead.)
- Not dismissible and no timeout.

## Copy: areas left without an exercise

Same text on UF-11.5 and UF-08.2. Areas use their labels, in the fixed order (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), joined with ", ".

- Several areas: "Not suggested: {areas}. Every exercise for them is excluded."
- One area: "Not suggested: {area}. Every exercise for it is excluded."

Examples: "Not suggested: Quads. Every exercise for it is excluded." and "Not suggested: Quads, Calves. Every exercise for them is excluded."
