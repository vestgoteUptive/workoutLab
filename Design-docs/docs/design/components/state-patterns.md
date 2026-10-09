# Cobalt shared patterns (state patterns)

- **Source:** the "Shared patterns" list in the redesign handoff (`origin/design/redesign-cobalt`, `redesign-cobalt/README.md`), written here in the repo's spec form.
- **Decisions:** D-0208 (Cobalt + state colour), D-0210 (token naming, retirement), D-0211 (generic variables, contrast pairs, retired keys), D-0213 (phase tickets), D-0199, D-0191, D-0196, D-0203.
- **Built by:** T-0592, T-0593 and T-0594 from this file. C-01 and the body figure are not here (T-0614). C-03 and the neutral notice have their own files and are summarised below.
- **Variables:** components read only the generic `--wl-*` variables of D-0211 §2 (`--wl-bg`, `--wl-raise`, `--wl-ink`, `--wl-ink-muted`, `--wl-ink-on-raise`, `--wl-line`, `--wl-action`, `--wl-on-action`, `--wl-selected`, `--wl-on-selected`, `--wl-attention`, `--wl-progress-off`, `--wl-focus`, `--wl-scrim`, `--wl-font`, `--wl-gutter`). A pattern works in `plan`, `lift`, `rest` and `paper` by the state attribute alone. No hex and no state-specific colour name appears in component CSS.

**Rules for every pattern**

- **Radius and space tokens:** `radius.pill` 999, `radius.session-button` 22, `radius.sheet` 28, `radius.option` 16, `radius.tile` 12, `radius.input` 12, `radius.progress` 2; `space.gutter-plan` 28, `space.gutter-session` 26 (20 below 360 px, D-0211 §3), `space.option-bleed` 18.
- **States:** rest; hover (pointer only, never the only change); focus-visible, a 2 px `--wl-focus` outline at a 2 px offset; disabled, `aria-disabled="true"` and never the `disabled` attribute, with one line of explanation referenced by `aria-describedby` (as C-03); selected, always carried by a shape or a word as well as by fill.
- **Targets:** every control is at least 44 × 44 px (WCAG 2.5.8 and the project rule).
- **Glyphs:** ticks, arrows, the session check, ✕, pause and chevrons are `aria-hidden` 2 px stroke icons in `currentColor`, so accessible names don't change (D-0211 §6).
- **Motion:** none, except the D-0208 state cross-fade and the drain's 1 s step. Both are instant under `prefers-reduced-motion`.
- **Contrast values** are the D-0211 §4 pairs: white on `plan.bg` 8.6; `plan.ink-muted` on `plan.bg` 5.9; white on `plan.raise` 6.2; `plan.ink-on-raise` on `plan.raise` 4.9; white on `lift.bg` 4.8; white on `rest.bg` 4.9; `lift.on-action` on white 6.1; `rest.on-action` on white 8.1; `paper.ink` on `paper.bg` 12.9; `paper.ink-muted` on `paper.bg` 6.5; `plan.attention` on `plan.bg` 5.0. Text on `--wl-raise` uses `--wl-ink` or `--wl-ink-on-raise`, never `--wl-ink-muted` (4.2). `--wl-line` is decorative (2.1 on `plan.bg`), so no state is identified by it alone.
- **Destructive actions** (delete account, End workout, Sign out anyway) use the secondary outline and sit last on the screen. There is no danger colour.

## Primary button

- **Anatomy:** one full-width pill. The label is left-aligned, the arrow or check right-aligned (an `aria-hidden` icon). Pinned to the bottom of the screen (`margin-top: auto`). One per screen.
- **Variables:** `--wl-action` fill, `--wl-on-action` text, `--wl-font`. Text 1.375 rem (22 px), weight 700, padding 20 px 28 px. Radius `pill`.
- **Target:** at least 44 × 44 px, in practice 64 px tall.
- **States:** rest as above; hover adds a 1 px `--wl-on-action` inset ring; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled`, `--wl-raise` fill with `--wl-ink` text at 6.2:1 and the reason line below; selected: not applicable.
- **Contrast:** `plan.on-action` on `plan.action` 8.6; `lift.on-action` on white 6.1; `rest.on-action` on white 8.1; white `paper.on-action` on `paper.action` 8.6. Focus ring white on `plan.bg` 8.6.
- **Motion:** none.

## Secondary button

- **Anatomy:** a transparent pill with a 1.5 px `--wl-ink` outline and `--wl-ink` text, 1.125 rem (18 px) weight 600, 16 px vertical padding. It is the form of every destructive action and sits last.
- **Variables:** `--wl-ink`, `--wl-focus`. Radius `pill`.
- **Target:** at least 44 × 44 px (a 48 px minimum height in forms).
- **States:** rest; hover fills nothing, it thickens the outline to 2 px; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled` with `--wl-ink-muted` outline and text (5.9 on `plan.bg`); selected: not applicable.
- **Contrast:** `--wl-ink` on `plan.bg` 8.6, on `lift.bg` 4.8, on `rest.bg` 4.9; `paper.ink` on `paper.bg` 12.9. The outline needs 3:1 and meets it in each state.
- **Motion:** none.

## Text button

- **Anatomy:** text only, `--wl-ink`, underlined with a 4 px offset. Used for Cancel and back-style actions.
- **Variables:** `--wl-ink`, `--wl-focus`. No fill. Radius `tile` (the focus ring corner).
- **Target:** at least 44 × 44 px, made with padding; the underline sits on the text only.
- **States:** rest; hover removes the underline offset to 2 px; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled` with `--wl-ink-muted`; selected: not applicable.
- **Contrast:** `--wl-ink` on `plan.bg` 8.6; `paper.ink` on `paper.bg` 12.9; `--wl-ink-muted` on `plan.bg` 5.9.
- **Motion:** none.

## Session button

- **Anatomy:** the primary button at session scale: radius 22 (`radius.session-button`), padding 24 px 26 px, 1.5 rem (24 px) weight 800, **at least 64 px tall**. Outline variants (secondary form) are used for "−15 s", "+15 s", "Restart" and "Next".
- **Variables:** `--wl-action`, `--wl-on-action`, `--wl-ink`, `--wl-focus`, `--wl-font` (the session font).
- **Target:** at least 64 px tall and 44 px wide, so at least 44 × 44 px with room for a gloved thumb.
- **States:** rest; hover as the primary; focus-visible 2 px `--wl-focus` (white) at a 2 px offset; disabled `aria-disabled` with the outline form in `--wl-ink` at reduced weight and the reason as words; selected: not applicable. The Done and Accept check is an `aria-hidden` icon.
- **Contrast:** `lift.on-action` on white 6.1; `rest.on-action` on white 8.1; on the rest drain's red part Skip rest uses `lift.on-action` (6.1); white focus ring on `lift.bg` 4.8 and `rest.bg` 4.9 (needs 3).
- **Motion:** none.

## Row

- **Anatomy:** 12 px vertical padding and a 1 px `--wl-line` bottom hairline. A title (1.0625 rem, 17 px, weight 600), an optional caption (14 px, `--wl-ink-muted`) and an optional trailing value or chevron (`aria-hidden`).
- **Variables:** `--wl-ink`, `--wl-ink-muted`, `--wl-line`, `--wl-focus`.
- **Target:** when a row is a link or button the whole row is at least 44 × 44 px (56 px for the Excluded and Favorite rows).
- **States:** rest; hover shows a `--wl-raise` fill; focus-visible 2 px `--wl-focus` at a 2 px offset, inset so it isn't clipped; disabled `aria-disabled` with the caption explaining; selected: the Selected option row below.
- **Contrast:** `--wl-ink` on `plan.bg` 8.6; the caption `--wl-ink-muted` on `plan.bg` 5.9. On a hover fill the caption becomes `--wl-ink` (white on `plan.raise` 6.2; `--wl-ink-muted` there is 4.2 and is never used).
- **Motion:** none.

## Selected option row

- **Anatomy:** goal, swap and time-check options. Unselected options are plain Rows. The selected one becomes a `--wl-selected` block, radius 16 (`radius.option`), bleeding `space.option-bleed` (18 px) past the gutter on both sides, with `--wl-on-selected` text. It replaces the radio circle visually. **The native radio stays:** an `<input type="radio">` inside its `<label>` in a `radiogroup`, visually hidden but in the tab order, so arrow keys and announcements work. The bleed margins are computed from `--wl-gutter` and `--wl-space-option-bleed`, never from a literal.
- **Variables:** `--wl-selected`, `--wl-on-selected`, `--wl-ink`, `--wl-line`, `--wl-focus`, `--wl-gutter`.
- **Target:** the whole label, at least 44 × 44 px.
- **States:** unselected (a plain Row, `--wl-ink` text); hover a `--wl-raise` fill; selected (white block, `--wl-on-selected` text, plus a 2 px stroke check icon, `aria-hidden`, so fill is not the only cue); focus-visible 2 px `--wl-focus` at a 2 px offset around the block, with the 18 px bleed kept inside the viewport (the focus ring on `--wl-selected` uses `--wl-on-selected`); disabled `aria-disabled`.
- **Contrast:** `plan.on-selected` on `plan.selected` 8.6; white on `plan.bg` 8.6; the focus ring white on `plan.bg` 8.6.
- **Motion:** none.

## Segmented control

- **Anatomy:** a pill with a 1 px `--wl-line` border and 4 px inner padding (plain CSS). The selected segment is a `--wl-selected` pill with `--wl-on-selected` text. Segments are radio inputs in a `radiogroup`, labelled by their text.
- **Variables:** `--wl-line`, `--wl-selected`, `--wl-on-selected`, `--wl-ink`, `--wl-focus`. Radius `pill`.
- **Target:** each segment at least 44 × 44 px.
- **States:** unselected (`--wl-ink` text on the control); hover a `--wl-raise` fill; selected (white pill; the selected state is also carried by the `checked` radio, never by `--wl-line`); focus-visible 2 px `--wl-focus` at a 2 px offset around the focused segment; disabled `aria-disabled`.
- **Contrast:** `--wl-ink` on `plan.bg` 8.6; `plan.on-selected` on `plan.selected` 8.6. The border is decorative (2.1), so segments are identified by their labels.
- **Motion:** none.

## Chip

- **Anatomy:** 8 px × 14 px padding, a pill. Off: a 1 px `--wl-line` outline with `--wl-ink` text. On: `--wl-selected` fill with `--wl-on-selected` text. Multi-select chips show a check tick before the label when on; the tick is an **`aria-hidden`** 2 px stroke icon, so the accessible name is the label alone and the state is not shown by fill alone. The control is a native checkbox (multi) or radio (single).
- **Variables:** `--wl-line`, `--wl-selected`, `--wl-on-selected`, `--wl-ink`, `--wl-focus`. Radius `pill`.
- **Target:** at least 44 × 44 px; the padding is raised with a transparent hit area when the visual chip is smaller.
- **States:** off; hover a `--wl-raise` fill; on; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled` with `--wl-ink-muted` text (5.9 on `plan.bg`).
- **Contrast:** `--wl-ink` on `plan.bg` 8.6; `plan.on-selected` on `plan.selected` 8.6. The off outline is decorative (2.1), so the label text identifies the chip.
- **Motion:** none.

## Checkbox

- **Anatomy:** C-03 (`c-03-checkbox.md`). A native checkbox in its `<label>`, a 22 px box with radius 6, a 1.5 px `--wl-ink-muted` border; checked is a `--wl-selected` fill with a `--wl-on-selected` tick (2 px stroke icon).
- **Variables:** `--wl-ink-muted`, `--wl-selected`, `--wl-on-selected`, `--wl-ink`, `--wl-focus`.
- **Target:** the row is at least 44 × 44 px; the box never defines it.
- **States:** unchecked; hover border `--wl-ink`; checked; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled`, not `disabled`.
- **Contrast:** the boundary `--wl-ink-muted` on `plan.bg` 5.9 (needs 3); `plan.on-selected` on `plan.selected` 8.6; the label `--wl-ink` 8.6.
- **Motion:** none; the tick appears instantly.

## Toggle

- **Anatomy:** a 48 × 28 pill switch (`role="switch"` on a native checkbox, in its label). On: `--wl-selected` track with a `--wl-on-selected` knob. Off: a 1.5 px `--wl-ink-muted` outline with an `--wl-ink-muted` knob. The on/off word is shown next to it ("On" / "Off"), so colour is never the only cue.
- **Variables:** `--wl-selected`, `--wl-on-selected`, `--wl-ink-muted`, `--wl-ink`, `--wl-focus`. Radius `pill`.
- **Target:** the label row is at least 44 × 44 px (the switch is 28 px tall inside it).
- **States:** off; hover border `--wl-ink`; on; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled`.
- **Contrast:** the off outline and knob `--wl-ink-muted` on `plan.bg` 5.9 (needs 3); `plan.on-selected` knob on `plan.selected` track 8.6.
- **Motion:** none; the knob moves instantly.

## Input

- **Anatomy:** a visible `<label>` above, then a field with a **1 px `--wl-ink-muted` boundary**, radius `tile` (12), a `--wl-bg` fill, `--wl-ink` text, 48 px tall. The label never relies on the placeholder.
- **Variables:** `--wl-ink-muted`, `--wl-ink`, `--wl-bg`, `--wl-attention`, `--wl-focus`. Radius `radius.input` (12, `tile`).
- **Target:** at least 44 × 44 px (48 px tall, full width).
- **States:** rest; hover border `--wl-ink`; focus-visible 2 px `--wl-focus` at a 2 px offset; disabled `aria-disabled` with `--wl-ink-muted` text; error (D-0211 §5): on plan a 2 px `--wl-attention` border and `--wl-attention` message text, plus `aria-invalid="true"` and the message linked with `aria-describedby`; on lift and rest a 2 px `--wl-ink` border, an `aria-hidden` error icon and the words; on paper `paper.ink`. The words always carry the error.
- **Contrast:** the boundary `plan.ink-muted` on `plan.bg` 5.9 (needs 3); the error text `plan.attention` on `plan.bg` 5.0 and the border 5.0; `--wl-ink` on `plan.bg` 8.6.
- **Motion:** none.

## Sheet

- **Anatomy:** swap, add and how-to sheets. A full-height sheet from y = 150 in the **plan state even over lift** (swap sheets stay plan-coloured), `plan.bg`, radius 28 on the top corners (`radius.sheet`), a 40 × 4 grabber in `--wl-line`. The screen behind is dimmed by the `plan.scrim` scrim at 45 %, `color-mix(in oklch, var(--wl-color-plan-scrim) 45%, transparent)`. It uses `role="dialog"` with `aria-modal`, traps focus, and Escape and browser Back close it.
- **Variables:** `--wl-bg`, `--wl-line`, `--wl-scrim`, `--wl-ink`, `--wl-focus`.
- **Target:** a Close control at least 44 × 44 px (an `aria-hidden` ✕ icon with an accessible name "Close"); the grabber is decorative.
- **States:** closed; open (focus moves in, returns to the opener on close); focus-visible 2 px `--wl-focus` at a 2 px offset; disabled controls inside use `aria-disabled`; selected: rows inside follow Selected option row.
- **Contrast:** white on `plan.bg` 8.6; `--wl-ink-muted` 5.9. The scrim is not text.
- **Motion:** the sheet rises with a short slide, and the scrim fades with the D-0208 cross-fade. Under `prefers-reduced-motion` both are instant.

## Paper panel

- **Anatomy:** the check-in card (UF-11.1) and the unsynced sign-out warning (UF-11.4). Full-bleed (it bleeds past the gutters, with negative margins from `--wl-gutter`), `paper.bg`, **18–22 px block padding with the gutter as inline padding**, no radius and no shadow. Its text uses `paper.ink`; its action is `paper.action` / `paper.on-action`.
- **Variables:** the `.wl-paper` group (D-0211 §2): `--wl-bg`, `--wl-ink`, `--wl-ink-muted`, `--wl-line`, `--wl-action`, `--wl-on-action`, `--wl-focus` and `--wl-attention` both equal `paper.ink`.
- **Target:** every control in it is at least 44 × 44 px.
- **States:** rest; focus-visible a 2 px `paper.ink` ring (`--wl-focus`) at a 2 px offset; disabled `aria-disabled` with the reason line; error follows Input on paper (`paper.ink` and the words); selected: not applicable.
- **Contrast:** `paper.ink` on `paper.bg` 12.9; `paper.ink-muted` on `paper.bg` 6.5; the `paper.ink` focus ring on `paper.bg` 12.9 (needs 3).
- **Motion:** none, except the D-0208 cross-fade at the state change.

## Tab bar

- **Anatomy:** a 4-column grid, a 1 px `--wl-line` top rule, padding 14 px 12 px 32 px, 0.875 rem (14 px) weight 600. **Text only**. The active tab is `--wl-ink` with a 2 px underline and `aria-current="page"`; inactive tabs are `--wl-ink-muted`. D-0196 placement is unchanged.
- **Variables:** `--wl-ink`, `--wl-ink-muted`, `--wl-line`, `--wl-focus`.
- **Target:** each tab at least 44 × 44 px.
- **States:** inactive; hover `--wl-ink`; active (`aria-current`, underline, so colour is not the only cue); focus-visible 2 px `--wl-focus` at a 2 px offset; disabled: not applicable.
- **Contrast:** inactive `plan.ink-muted` on `plan.bg` 5.9 (the mock's 3.8 value is never used); active white 8.6.
- **Motion:** none.

## Session progress

- **Anatomy:** a **44 px** circular pause button (1.5 px `--wl-ink` outline, `aria-hidden` pause icon, name "Pause"), then N segments **4 px high** with a 4 px gap and `radius.progress` (2): white (`--wl-ink`) for done, `--wl-progress-off` for the rest, then a counter ("2 / 5") with `white-space: nowrap`. The progress is a `role="progressbar"` or its counter text carries the value; the counter always reads in words.
- **Variables:** `--wl-ink`, `--wl-progress-off`, `--wl-focus`.
- **Target:** the pause button is 44 × 44 px.
- **States:** done, current and to-do segments (the counter text is the non-colour cue); pause focus-visible 2 px `--wl-focus` at a 2 px offset; disabled: not applicable.
- **Contrast:** white counter on `lift.bg` 4.8 and on `rest.bg` 4.9; the pause outline white on lift 4.8 (needs 3). `--wl-progress-off` is decorative.
- **Motion:** none.

## Drain fill

- **Anatomy:** Get ready, Rest, Next exercise and List view rest. The background is `linear-gradient(to top, lift.bg X%, rest.bg X%)`, where X = elapsed ÷ total, built from `--wl-color-lift-bg` and `--wl-color-rest-bg`. Red rises from the bottom; at X = 100 the screen is fully `lift.bg`, the moment the set starts. Timed sets and Warm-up use the same idea with `lift.bg-deep` over `lift.bg`. The last 10 s of rest is the drain (D-0211 §5); its 10 s cue is unchanged. The state is also named in text ("Rest", "Get ready"), which is the colour-blind fallback.
- **Variables:** `--wl-ink` for text on it, `--wl-focus`.
- **Target:** none, it is a background and has no control. Buttons on it follow Session button.
- **States:** rest (0 %), draining, full (100 %). Selected, hover, focus and disabled do not apply.
- **Contrast:** white on `lift.bg` 4.8 and on `rest.bg` 4.9 (needs 4.5), so text is safe at every X; Skip rest on the drain uses `lift.on-action` on white 6.1.
- **Motion:** stepped once per second, or a 1 s linear transition. Under `prefers-reduced-motion` it jumps to each value with no transition.
