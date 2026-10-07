---
id: T-0537
title: "Shared C-03 Checkbox component and the neutral excluded-areas notice component, plus their shared copy in en.ts"
lane: web-shell
screens: [UF-05.1, UF-08.2, UF-08.3, UF-11.5]
decisions: [D-0199, D-0200, D-0071, D-0019, D-0045]
deps: [T-0532]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item e). Flow: wl-build-web (agent frontend-dev). About ¼ day. No table access, so no H-27 constraint. It edits en.ts, a shared file (D-0071 §1): never run it in parallel with another ticket that lists en.ts. -->

## Why
UF-05.1 / UF-08.3 need a checkbox, and UF-08.2 and UF-11.5 show the same neutral notice with the same words (D-0199 §8). Two features can't import each other (D-0071 §9), so both live in `components/`, built to T-0532's C-03 and notice specs.

## Scope
- In:
  - `apps/web/src/components/checkbox/`: `Checkbox` per C-03 (native input inside its label, 24 px box, ≥ 44 px row, border token and focus ring from the spec, `aria-disabled` state that ignores clicks and keeps focusability, an optional `describedBy`). Tokens via `var(--wl-color-*)` only.
  - `apps/web/src/components/excluded-areas-notice/`: `ExcludedAreasNotice({areas})` renders nothing for `[]`, otherwise the T-0532 notice with "Not suggested: {area}. Every exercise for it is excluded." (one area) or "Not suggested: {areas}. Every exercise for them is excluded." (two or more, joined with ", "). Labels come from `en.bodyMap.areas`; the order is the order the caller passes (the engine's fixed order, T-0534).
  - `apps/web/src/lib/i18n/en.ts`: a shared `excluded` block with the notice strings, `connectToChange: "Connect to change excluded exercises"`, `saveFailed: "Couldn't save. Try again."`, and `screens.excludedExercises: "Excluded exercises"` (the UF-11.5 `<h1>`, reserved for T-0540).
- Out:
  - Any feature screen (T-0538…T-0541). Any engine call: the notice takes areas, it doesn't compute them.
  - Any new token.

### Edge cases that are in scope
- **Offline:** the `aria-disabled` checkbox state (AC2).
- **Zero areas:** the notice renders nothing (AC3).
- Time running out, zero history, returning after 10 days: not applicable to presentational components.

## Acceptance criteria
- **AC1 (checkbox a11y)** Given `<Checkbox label="Don't suggest Barbell row again">`, Then `getByRole("checkbox", {name: "Don't suggest Barbell row again"})` exists, is unchecked by default, toggles on a click of the label text and on Space, and the row's measured min-height style is ≥ 44 px. axe (the AC-D10 helper) reports no violation in checked, unchecked and disabled states.
- **AC2 (disabled)** Given `aria-disabled` and `describedBy` pointing at "Connect to change excluded exercises", When the user clicks or presses Space, Then `onChange` is not called, the box stays as it was, it stays focusable, and its accessible description is that text. Given it is enabled again (prop change), Then a click toggles it.
- **AC3 (notice copy)** `ExcludedAreasNotice` with `[]` renders nothing; with `["quads"]` renders exactly "Not suggested: Quads. Every exercise for it is excluded."; with `["quads", "calves"]` renders exactly "Not suggested: Quads, Calves. Every exercise for them is excluded."
- **AC4 (neutral styling)** The notice uses `--wl-color-surface-2`, `--wl-color-line` and `--wl-color-text-muted` and no `warn` token; a test reads the component's CSS and fails on `warn`. The existing raw-colour lint stays green.
- **AC5 (i18n)** The jsx-no-literals test passes; no user-visible literal in the two components.

Checklist (D-0197 §7): enabled/disabled (AC2) and empty/non-empty (AC3) both covered.

## Paths you may change
- `apps/web/src/components/**` (lane)
- `apps/web/src/lib/i18n/en.ts`: the new excluded block and the excludedExercises screen title

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · contracts unchanged · commits start with `T-0537:` and cite UF-05.1 / UF-08.2 / UF-11.5.

## Build / accept log
