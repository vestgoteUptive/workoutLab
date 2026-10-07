---
id: T-0532
title: "Excluded exercises design: C-03 checkbox component spec and screen specs for UF-11.5, UF-08.2, UF-08.3/UF-05.1, UF-04.1/UF-04.2 and UF-11.2"
lane: design
screens: [UF-11.5, UF-11.2, UF-08.2, UF-08.3, UF-05.1, UF-04.1, UF-04.2]
decisions: [D-0199, D-0200, D-0003, D-0019, D-0002]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item a). Flow: wl-design (agent designer; there is no wl-build-design flow in .agentlab/flows). About ½ day. The design prerequisite of D-0199 §10: no UI ticket (T-0537…T-0541) starts before this one is done. -->

## Why
D-0199 adds a durable "never suggest" list (spec `docs/specs/excluded-exercises.md`). The UI tickets need a checkbox, which the design system doesn't have yet. They also need one agreed layout per changed screen. `Design-docs/docs/design/screens/` doesn't exist yet. The design impact review asked for both before any UI work (D-0199 §10).

## Scope
- In:
  - **C-03 Checkbox**, `Design-docs/docs/design/components/c-03-checkbox.md`. A native `<input type="checkbox">` inside its `<label>`. A 24 px box in a row at least 44 px tall. The whole row is the hit target. The box border is at least 3:1 against the surface it sits on, checked state uses `accent` with an `on-accent` tick, and the focus ring is visible. It has a disabled (`aria-disabled`) state. It uses existing tokens only.
  - **Neutral notice pattern** (inside the same components folder or the screen specs): `surface-2` fill, `line` border, `text-muted` text, a 2 px stroke info icon. It is **not** `warn` (design-system.md reserves `warn` for PRs, warm-up, rest's last 10 s, over time and the C-01 attention outline).
  - **Screen specs** under `Design-docs/docs/design/screens/` for:
    - UF-11.5 Excluded exercises (`/plan/excluded`): header and lead line, search field, list rows (name, primary areas, "Excluded {d MMM}", Include again), search results (Exclude / Include again), the three empty states (none, no match, offline), the notice at the top.
    - UF-11.2: the "Excluded exercises · n" / "· none" row under the priority areas.
    - UF-08.2: the "Removed" line at the end of the list ("{name} · Never suggest" → "{name} won't be suggested · Undo") and the notice under the "Skipping today" line.
    - UF-08.3 / UF-05.1: the C-03 checkbox "Don't suggest {name} again", unchecked, under "Always use this in <routine>", and the "No alternatives left. The others are excluded." empty state.
    - UF-04.1 "Not suggested" text tag; UF-04.2 "Don't suggest this" (secondary button) / "Not suggested" + "Suggest again".
  - Each spec records the a11y rules of D-0199 §10: the Removed line is a persistent `role="status"` present on mount; focus stays on the line after Undo; offline write controls use `aria-disabled` plus one `aria-describedby` "Connect to change excluded exercises" per screen; "Couldn't save. Try again." is `role="alert"`; labels are unique ("Exclude {name}", "Include {name} again"); the UF-04.1 tag is text, never colour only.
  - A contrast row for the checkbox border pair in design-system.md's "Contrast checks" table, enforced by the existing design-tokens contrast test.
- Out:
  - Any new token or `tokens.json` change. Any code in `apps/**`. Any new UF-09 control (principle 1). The UF-07.1 tag (D-0199 default: none in v1).

### Edge cases that are in scope
- **Offline:** each screen spec shows the disabled state of every write control and where the single "Connect to change excluded exercises" line sits.
- **Zero exclusions:** UF-11.2 "· none"; UF-11.5's empty copy.
- **Long names / many areas:** the notice wraps; row text wraps rather than truncates the name.
- **Time running out / returning after 10 days:** not applicable to these screens (no UF-09 change).

## Acceptance criteria
- **AC1 (component spec)** Given `Design-docs/docs/design/components/c-03-checkbox.md`, Then it specifies a native input inside its label, a 24 px box, a row ≥ 44 px, the border token and its contrast ratio against `surface` and `bg` (each ≥ 3:1), checked, focus and `aria-disabled` states, and names only existing tokens. Test: the design-tokens contrast test asserts the new table row's ratio ≥ 3.0 for the chosen pair (a planted fault: the pair `line-strong` on `surface` fails it).
- **AC2 (notice is neutral)** Given the notice pattern, Then it names `surface-2`, `line`, `text-muted` and an info icon, and no screen spec in this ticket names `warn` for it. Test: a design-tokens (or design-docs) test greps the new spec files for `warn` near "Not suggested" and fails on a match.
- **AC3 (one copy)** Given the UF-08.2 and UF-11.5 specs, Then both show the exact strings "Not suggested: {areas}. Every exercise for them is excluded." and "Not suggested: {area}. Every exercise for it is excluded.", areas in the fixed order, joined with ", ". Checked by the same test as AC2 (both strings present in both files).
- **AC4 (no hex, no new token)** Given the diff, Then no new spec file contains a `#RRGGBB` value, and `packages/design-tokens/src/tokens.json` is unchanged. Test: the existing raw-colour check (`wl-check-colours`) covers the new markdown files, or the AC2 test also asserts no hex.
- **AC5 (screen specs complete)** Given `Design-docs/docs/design/screens/`, Then there is one file each for UF-11.5, UF-11.2, UF-08.2, UF-08.3-UF-05.1 and UF-04.1-UF-04.2, each citing D-0199 and its screen IDs, each new control ≥ 44 px, and each listing the D-0199 §10 a11y rules that apply to it. `node .github/scripts/check-all.mjs` (screen IDs) is green.
- **AC6 (no UF-09 control)** Given the specs, Then none adds a control to UF-09.1–UF-09.9; the in-workout entry is only the UF-05.1 sheet behind Pause.

Checklist (D-0197 §7): online/offline both specified per screen (AC5); empty and non-empty lists both specified (UF-11.5, UF-11.2). No migration.

## Paths you may change
- `Design-docs/docs/design/**`
- `packages/design-tokens/**`: the contrast test row only. The token file itself is a contract and stays unchanged (AC4).

## Contract impact
None. No token changes (D-0199 §10).

## Definition of done
Every AC has a passing test or a check-all pass · `pnpm -w typecheck lint test` green · `node .github/scripts/check-all.mjs` green · `tokens.json` unchanged · commits start with `T-0532:` and cite the screen IDs.

## Build / accept log

- 2026-10-07 designer: added `components/c-03-checkbox.md`, `components/neutral-notice.md`, five specs under `screens/`, a contrast row in design-system.md (`text-muted` border 7.5 / 6.8 / 5.8, needs 3.0). Border token is `text-muted`; `line-strong` on `surface` is 1.5:1 and fails. `tokens.json` unchanged.
- AC1: `tokens.test.ts` C-03 border rows (bg/surface/surface-2 ≥ 3.0) plus the planted pair `line-strong` on `surface` < 3.0. AC2/AC3/AC4/AC5/AC6: `docs.test.ts` "T-0532" block (no `warn`, no hex, notice tokens, both strings in UF-08.2 and UF-11.5, C-03 anatomy, a11y words, no UF-09 control). AC5 screen IDs: `check-all.mjs` green.
- Planted fault (backup copy, restored): border pair swapped to `line-strong` made the 3 new rows fail. UF-11.2 is exempt from the `aria-disabled` check by design (a nav link, not a write control).
- Gate: design-tokens package tests 84/84, `format:check` clean, check-all rc=0. Full `-w` gate not run (docs and one package test only).
- Follow-ups: web-feature:excluded-exercises (T-0537…T-0541) build from these specs.
