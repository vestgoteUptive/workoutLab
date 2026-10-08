---
id: T-0558
title: "UF-04.2 exercise figure card with Primary/Secondary labels and swatches"
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0207, D-0079, D-0199]
deps: [T-0556]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0207; GitHub #48; spec AC-4/5/11 and the folded-in e2e). Flow: wl-build-web (agent frontend-dev). About ¼ day. SAME FOLDER AS T-0541 AND THE FAVORITES TOGGLE (D-0202): serial, never in parallel. Order: T-0558 first, then T-0541, then the favorites-toggle ticket (it is not groomed yet and must depend on both). -->

## Why
D-0207 §3: UF-04.2 shows the exercise's primary areas solid and its secondary areas hatched, next to the existing text lists, which become the legend. The figure is a picture, not a control.

## Scope
- In (`apps/web/src/features/UF-04/**`, `lib/i18n/flows/uf-04.ts`, e2e for `/library/:id`):
  - A figure card under the tagline: `BodyFigure` size `detail` (200 px) with `regions` derived from `exercise.areas` only (1.0 → `primary`, 0.5 → `secondary`, absent → `none`). The two pill lists move into the card under the figure.
  - Visible labels "Primary" and "Secondary" (`en.uf04.primaryLabel` / `secondaryLabel`) with an `aria-hidden` swatch (solid / hatched). The lists keep the accessible names "Primary areas" and "Secondary areas" (D-0079 §2); the visible word starts the name.
  - No secondary areas: the Secondary label and list aren't rendered. No area weights: no card and no lists.
- Out: any change to the "Don't suggest this" or Favorite controls (T-0541, favorites ticket); tappable regions (Q6 default: static); a figure on UF-04.1 or UF-08.

### Edge cases that are in scope
- **Offline:** identical; the figure is bundled (test with `navigator.onLine = false`).
- **Detail missing (`detail === null`):** the card still shows, then "detailMissing".
- **Zero history:** not applicable (no history input); noted.
- **Warm-up rows:** a warm-up with areas shows its card like any other.

## Acceptance criteria
Vitest in `features/UF-04/__tests__/`, L1 library fixture; one Playwright spec `tests/e2e/uf-04-figure.spec.ts`.
- **AC-1 (spec AC-4)** Given back-squat (quads 1, glutes 0.5, hamstrings 0.5, core 0.5 in the fixture), then the BodyFigure props are `quads: primary`, `glutes/hamstrings/core: secondary`, others `none`; given a row with only weight-1.0 areas (no secondary) then no region is `secondary`; given a third row with a single primary area, only that area is `primary`. The test reads the rendered classes, not the props.
- **AC-2 (spec AC-5)** Given the same rows, then the labels "Primary" and "Secondary" are visible, each followed by an `aria-hidden` swatch; the lists have accessible names "Primary areas" and "Secondary areas" (`getByRole("list", {name})` or the existing query); with no secondary areas neither the label nor the list exists. The existing UF-04 tests pass unchanged.
- **AC-3 (no area weights)** Given a row with `areas` empty, then there is no figure card and no lists, and the rest of the screen renders.
- **AC-4 (detail missing)** Given `detail === null`, then the figure card shows and "detailMissing" follows it.
- **AC-5 (not interactive)** Given UF-04.2, then the figure has `aria-hidden="true"`, nothing inside it is focusable, and the tab order of the screen is the same as before (no new stops).
- **AC-6 (spec AC-10, axe, e2e)** Given `/library/back-squat` online and offline (`context.setOffline(true)` after load), then axe reports 0 serious or critical issues and the figure is still in the DOM.
- **AC-7 (spec AC-11, layout, e2e)** Given `/library/back-squat` at 320 and 390 px and at 200 % root font size, then the pills wrap, nothing is clipped or overlaps (bounding boxes of the figure, labels and pills are disjoint), no horizontal scroll, and screenshots are written with `testInfo.outputPath("uf04-320.png")` and `"uf04-390.png"`.
- **AC-8 (forced colours, e2e)** Given `forcedColors: "active"`, then a primary region's computed fill is not `transparent` and the lists' text is visible.

## Paths you may change
- `apps/web/src/features/UF-04/**`
- `apps/web/src/lib/i18n/flows/uf-04.ts`
- `tests/e2e/uf-04-figure.spec.ts` (new)
- `docs/tickets/T-0558-uf04-exercise-figure.md` (log only)
- **Not yours:** `components/body-figure/**`, `routes.ts`, `tests/e2e/fixtures/**`.

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the new e2e spec and the existing UF-04 specs green · contracts unchanged · commits start with `T-0558:` and cite UF-04.2.

## Build / accept log

- 2026-10-08 frontend-dev: start tree clean at 9af39fb; merged origin/main before the gate. Built the figure card in `LibraryDetail.tsx` (BodyFigure `detail`, regions from `exercise.areas`, labels + swatches, lists inside the card), `uf-04.css`, `uf-04.ts` (primaryLabel/secondaryLabel). Warm-up rows still redirect to /library (existing behaviour), so the warm-up edge isn't reachable.
- AC to test: AC-1..AC-5 -> `__tests__/figure.test.tsx` (new file; detail.test.tsx untouched, T-0911 safe); AC-6, AC-7 (320/390/200%), AC-8 -> `tests/e2e/uf-04-figure.spec.ts`. Screenshots via `testInfo.outputPath`; 390 shot copied to scratchpad/uf04-figure-after.png.
- Planted faults (backup copy, restored by cp): secondary->primary (AC-1 red), label text swapped (AC-2 red x2), hasAreas=true (AC-3 red), swatch aria-hidden removed (AC-2 red), focusable button in card (AC-5 red), secondary always rendered (AC-2 red); figure width 600px (AC-7 red x3). AC-4, AC-6 and AC-8 have no planted fault.
- Gate: typecheck lint test (Turbo cache on) green; test:repo-checks 369 pass; format:check clean; check-all clean; e2e uf-04-figure + uf-04-library 10/10.
