---
id: T-0561
title: "Favorite exercises design: screen specs for UF-11.6, the UF-04.2 Favorite toggle beside Don't suggest this, the UF-04.1/UF-08.2 Favorite tag and the UF-11.2 row"
lane: design
screens: [UF-11.6, UF-11.2, UF-04.1, UF-04.2, UF-08.2]
decisions: [D-0202, D-0199, D-0191, D-0203, D-0207, D-0002]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §10, GitHub #46). Flow: wl-design (agent designer). About ⅓ day. The design prerequisite of D-0202: no favorites UI ticket (T-0568, T-0569, T-0571) starts before this one is done. T-0572 (D-0205 design) runs after this one because both edit Design-docs/docs/design/screens/UF-08.2.md. -->

## Why
D-0202 §10: before any UI ticket the four changed surfaces need one agreed layout, on the D-0203 visual foundation, with no new token. Spec: `docs/specs/favorite-exercises.md`.

## Scope
- In (`Design-docs/docs/design/**`):
  - **New `screens/UF-11.6.md` Favorite exercises** (`/plan/favorites`), modelled on `screens/UF-11.5.md`: back link to Plan, header "Favorite exercises" and its lead line ("When a workout trains one of these areas, your favorites come first. Recovery, equipment and your time still decide."), the search field, the grouped list (area label, rows with name, Remove, and the optional status line "Not available with your equipment" / "Above your level"), the search results (primary areas, Add or "Favorite" + Remove, the "Excluded" tag), the move status line, the empty states ("No favorites yet. Search to add one, or tap Favorite on an exercise." and "No exercises match “{query}”."), the offline state ("Connect to change favorites", once per screen, `aria-describedby`) and the write-failure alert.
  - **`screens/UF-04.1-UF-04.2.md`**: the "Favorite" toggle beside "Don't suggest this" (the D-0191 toggle chip, ≥ 44 px, `aria-pressed`, star icon plus the word, never icon or colour only; pressed and unpressed states), its placement relative to the D-0207 figure card, the move status line, the offline state; the "Favorite" text tag on a UF-04.1 row in the same slot as D-0199's "Not suggested" tag. The two are mutually exclusive; if the two caches ever disagree, "Not suggested" shows (exclusion wins, D-0202 §3).
  - **`screens/UF-08.2.md`**: the "Favorite" text tag on an item row (display only), where it sits relative to the reason line.
  - **`screens/UF-11.2.md`**: the "Favorite exercises · n" row ("· none" at 0) directly above "Excluded exercises · n".
- Out: any token change (`packages/design-tokens/src/tokens.json` stays unchanged); any code; the D-0205 surfaces (T-0572).

### Edge cases that are in scope
- **Offline:** every control that changes the list has a disabled state with one "Connect to change favorites" line per screen.
- **Zero favorites:** UF-11.6 empty state; UF-11.2 row reads "· none".
- **Long names at 320 px:** the toggle and "Don't suggest this" wrap to two rows without overlapping; the tag doesn't push the row's actions off screen.
- Time running out, returning after 10 days: no visual change (favorites never expire).

## Acceptance criteria
- **AC1 (UF-11.6 spec)** `screens/UF-11.6.md` exists and covers each item listed for it under Scope, with the exact copy strings from `docs/specs/favorite-exercises.md` and the class names from the D-0203 foundation (`.wl-page`, `.wl-card`, `.wl-row`, `.wl-label`).
- **AC2 (toggle)** `screens/UF-04.1-UF-04.2.md` specifies the toggle's two states, its accessible name "Favorite {name}", `aria-pressed`, a ≥ 44 px target, icon plus text, and its position next to "Don't suggest this" at 320 px and 390 px widths.
- **AC3 (tags and row)** The UF-04.1 tag, the UF-08.2 tag and the UF-11.2 row are specified, each in text (never colour only).
- **AC4 (tokens)** Every colour, font and size in the new text names an existing token or D-0203 class; no hex value appears in any changed file; `tokens.json` is byte-identical to `main`.
- **AC5 (labels unique)** The specs state that "Favorite {name}", "Add {name} to favorites" and "Remove {name} from favorites" are unique per screen.
- **AC6 (checks)** `node .github/scripts/check-all.mjs` passes (screen IDs, v1 labels).

Checklist (D-0197 §7): online and offline states are both specified (AC1, AC2); empty and non-empty lists both specified (AC1).

## Paths you may change
- `Design-docs/docs/design/**` (lane)

## Contract impact
None. No token change (D-0202 §10).

## Definition of done
Every AC has a check-all pass or a reviewed section · `node .github/scripts/check-all.mjs` green · `tokens.json` unchanged · commits start with `T-0561:` and cite UF-11.6 / UF-04.2.

## Build / accept log
