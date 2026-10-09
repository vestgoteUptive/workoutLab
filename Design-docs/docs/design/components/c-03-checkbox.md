# C-03 Checkbox

- **Component:** C-03 Checkbox (shared). First use: "Don't suggest {name} again" on UF-08.3 and UF-05.1 (D-0199).
- **Decisions:** D-0199 (§10 design impact), D-0208 (Cobalt look), D-0211 (generic variables, contrast), T-0590.
- **Variables (D-0211 §2):** `--wl-ink-muted`, `--wl-selected`, `--wl-on-selected`, `--wl-ink`, `--wl-focus`, `--wl-bg`. Radius 6 px. No new token. Pattern summary: `state-patterns.md` (Checkbox).

## Anatomy

- A native `<input type="checkbox">` **inside its `<label>`**. No ARIA role, no custom widget. The label text is the accessible name.
- Row: the whole `<label>` is the hit target, at least **44 px tall** and the full width of its container. Padding makes up the height; the box never defines it.
- Box: **22 × 22 px**, radius 6 px, 1.5 px border, vertically centred, 12 px gap to the label text.
- Label text: the state font (`--wl-font`), weight 500, 15 px, `--wl-ink`. It wraps over as many lines as it needs. Long names are never truncated. The box stays top-aligned with the first line when the text wraps (row padding 10 px top and bottom).
- The native input is visually replaced with `appearance: none` and drawn with the tokens below. It stays in the accessibility tree and the tab order.

## States

| State | Box | Tick | Notes |
|---|---|---|---|
| Unchecked | transparent fill, 1.5 px `--wl-ink-muted` border | none | Default for every use in v1 |
| Checked | `--wl-selected` fill and border | `--wl-on-selected`, 2 px stroke check icon | |
| Hover (pointer) | border `--wl-ink` | as state | |
| Focus-visible | 2 px `--wl-focus` ring, offset 2 px, around the box and label text | as state | Same ring as C-01 |
| Disabled | `aria-disabled="true"`, not `disabled`; border and label `--wl-ink-muted`, tick and fill as state, no hover | as state | See below |

### Disabled (`aria-disabled`)

- Use `aria-disabled="true"`, not the `disabled` attribute, so the box stays focusable and a screen reader can reach the explanation.
- The click and the Space key do nothing: the handler returns early and the checked state doesn't change.
- The explanation is one line of `--wl-ink-muted` 13 px text, referenced with `aria-describedby`. **One line per screen**, referenced by every disabled control on it. For exclusions: "Connect to change excluded exercises".
- When the reason clears (the connection returns), the attribute is removed without a reload.

## Contrast (WCAG 2.2 AA, D-0211 §4, enforced by the design-tokens contrast test)

The 1.5 px border is a UI-component boundary, so it needs 3:1 against the surface it sits on. The box sits on `plan.bg`.

| Pair | Ratio | Needs |
|---|---|---|
| `--wl-ink-muted` border on `plan.bg` | 5.9 | 3.0 |
| `--wl-on-selected` tick on `--wl-selected` | 8.6 | 3.0 |
| `--wl-selected` fill on `plan.bg` | 8.6 | 3.0 |
| `--wl-ink` label on `plan.bg` | 8.6 | 4.5 |
| `--wl-ink-muted` on `plan.raise` (**do not use** for text) | 4.2 | fails 4.5 |

`--wl-line` is decorative (2.1 on `plan.bg`) and must not draw the checkbox border.

## Accessibility

- Space toggles. The state is announced by the browser ("checked" / "not checked"). Don't add `aria-checked`.
- Checked is never colour only: the tick shape changes too.
- Targets: the row is at least 44 px tall (WCAG 2.5.8 and the project's 44 px rule).
- The label must be unique on its screen when more than one is shown. On the swap screens there is one.
- Reduced motion: the tick appears with no animation.
