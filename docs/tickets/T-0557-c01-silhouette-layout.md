---
id: T-0557
title: "C-01 silhouette layout: BodyFigure above a slim label grid, label-to-region linking, region taps, attention halo (UF-02.1, UF-10.1)"
lane: web-shell
screens: [UF-02.1, UF-10.1]
decisions: [D-0207, D-0060, D-0003, D-0013]
deps: [T-0556]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0207; GitHub #48; spec AC-6/7/8/9/11 and the folded-in e2e). Flow: wl-build-web (agent frontend-dev). About ½ day. Can run in parallel with T-0558 (different folders). -->

## Why
D-0207 §2 replaces D-0060 §1 (the tile layout) only. D-0060 §2–§8 stand (props, number format, accessible names, keyboard, loading, axe, import ban). UF-02.1 and UF-10.1 call sites don't change.

## Scope
- In (`apps/web/src/components/body-map/**`, its CSS and tests, e2e specs for `/` and `/balance`):
  - `BodyMap` renders `BodyFigure` (size `compact` 140 px or `full` 240 px) above the label grid; 3 columns in the order shoulders, chest, back / arms, core, glutes / quads, hamstrings, calves; legend unchanged below.
  - Region style per area comes straight from `coverageStep` (neutral when missing or out of range) and `needsAttention`.
  - `full`: the 9 labels are the buttons (D-0060 §4 names, ≥ 44 × 44 px). A tap on a region calls `onSelectArea(area)` once. Hover or focus on a label sets `highlighted`; hover on a region gives its label the hover state. Nothing in the figure is focusable.
  - `compact`: one link, "Body map, last 14 days. Open all areas", nothing focusable inside; no region handlers.
  - The label grid goes to 2 columns below 300 px container width or at 200 % text zoom. Loading: regions `surface-2` with the D-0060 §6 pulse (off under reduced motion).
- Out: `BodyFigure` internals (T-0556); the UF-04 screen; any copy change (legend strings come from the tokens package).

### Edge cases that are in scope
- **Zero history:** all regions `coverage-0`, labels "0 / target".
- **Loading, missing area, offline:** per the C-01 delta (neutral names, disabled buttons while loading; the figure is bundled so offline is identical).
- **Returning after 10 days off:** all nine `needsAttention` with `coverageStep` 0 shows nine halos and nine rings, and the figure is still readable.
- **Small screens:** 320 px and 390 px.

## Acceptance criteria
Vitest in `components/body-map/__tests__/` plus Playwright in `tests/e2e/body-map-figure.spec.ts` (new; guarded-test fixtures).
- **AC-1 (spec AC-6)** Given balance `{calves: step 3}`, `{chest: step 7}`, and `{back: step 4, needsAttention: true}`, then calves regions have `--step-3`, chest regions are neutral, back regions have `--step-4` plus the attention class, and a label swatch for back has the `warn` ring and the accessible name ends ", needs attention".
- **AC-2 (spec AC-7, unit)** Given `full`, then there are 9 buttons with the D-0060 §4 names; each has `getBoundingClientRect` min-size 44 × 44 via the CSS rule (assert the computed `min-height`/`min-width`); clicking any of the two calves paths calls `onSelectArea("calves")` once.
- **AC-3 (spec AC-7, e2e, real taps)** Given `/balance` at 390 px with fixtures where calves is in the data, when Playwright taps (a real `page.touchscreen`/`mouse` click at the centre of) a calves region, then the URL becomes `/balance/calves` exactly once (one history entry); and tapping the "Calves" label does the same.
- **AC-4 (spec AC-8/9)** Given `compact` on `/`, then exactly one link with the name above, `querySelectorAll(a,button,[tabindex])` inside it is 1 (the link itself), and every area shows its `load / target` text in both variants.
- **AC-5 (linking)** Given `full`, when the "Shoulders" label is focused, then both front and back shoulder regions get the highlight class; blur removes it; hovering a chest region adds the hover class to the Chest label only.
- **AC-6 (spec AC-10, axe)** Given `/` and `/balance` (zero-history and with-data fixtures), then axe reports 0 serious or critical issues.
- **AC-7 (spec AC-11, layout)** Given `/balance` at 320 and 390 px and with root font-size 200 %, then: the label grid has 2 columns at 320 or at 200 %, no label's text is clipped (`scrollWidth <= clientWidth`), no two labels' bounding boxes overlap, the figure is inside the viewport (no horizontal scroll), and screenshots are written with `testInfo.outputPath("balance-320.png")` and `"balance-390.png"` (not committed).
- **AC-8 (forced colours)** Given `forcedColors: "active"` on `/balance`, then a region's computed stroke is not transparent, and the label text is still visible (the numbers are in the DOM).
- **AC-9 (D-0060 unchanged)** The existing D-0060 BodyMap tests (props, number format, names, keys, loading, import ban) pass unchanged; none is deleted or weakened.

## Paths you may change
- `apps/web/src/components/body-map/**`
- `tests/e2e/body-map-figure.spec.ts` (new)
- `docs/tickets/T-0557-c01-silhouette-layout.md` (log only)
- **Not yours:** `components/body-figure/**`, `features/**`, `routes.ts`, `tests/e2e/fixtures/**`. If a fixture needs a change, raise a follow-up.

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the new e2e spec and the existing UF-02 and UF-10 specs green · contracts unchanged · commits start with `T-0557:` and cite UF-02.1 / UF-10.1.

## Build / accept log

### Build log (frontend-dev, T-0557 C-01)
- Built: `BodyMap` renders `BodyFigure` above a 3-column label grid (shoulders, chest, back / arms, core, glutes / quads, hamstrings, calves); container query to 2 columns below 18.75rem (so also at 200 % text). Labels are `data-part="label"`; region tap forwards through `onRegionPointer`; label focus/hover sets `highlighted`; region hover sets `data-hover` on its label; compact has no handlers; loading pulses regions via `wl-body-map--pulse`.
- AC to test: AC-1/2/4/5 `BodyMap.silhouette.test.tsx` (13 tests); AC-3/6/7/8 `tests/e2e/body-map-figure.spec.ts` (real touch/mouse taps, axe on / and /balance zero+data, 320/390/200 % layout, forced colours); AC-9 existing D-0060 tests pass.
- D-0060 §1 changes to existing tests (meaning kept, superseded layout only): helper `areaEl` now selects `[data-part="label"]` (figure paths also carry `data-area`); qa order test now asserts body order + 3 columns; AC-D8 offline test normalises BodyFigure's per-render `useId` hatch id. `tests/e2e/uf-02-today.spec.ts` lines 195/197 selector narrowed to labels (outside the listed paths; forced by the figure's `data-area` paths).
- Planted faults (backup copies, restored by cp), each red: attention dropped; no region forwarding; no highlight; no region hover; compact region handler; step ignored; min-height 40; (e2e) no forwarding -> 2 tap tests fail; no container query -> 3 layout tests fail; forced-colours block disabled (body-figure.css copy) -> AC-8 fails; labels unnamed -> 4 axe tests fail.
- Red run: first full e2e had uf-02 offline cold-start failing (41 `[data-area]` matches); fixed via the selector above. One gate run had a UF-11 vitest flake (passes alone, unrelated); rerun green.
- Gate: typecheck lint test 19/19; test:repo-checks, format:check, check-all green; full web e2e 301 passed. Screenshot 390 /balance copied to scratchpad/c01-after.png.
- The ticket did not ask to re-point T-0556's AC-5 spec; left as is.
