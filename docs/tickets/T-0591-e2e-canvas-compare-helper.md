---
id: T-0591
title: "e2e helper compareWithCanvas: with WL_CANVAS_COMPARE=1, save the app screen and the named Cobalt canvas artboard (rounds 3–5) side by side at 390 × 844; a no-op with an annotation otherwise or when the design ref is missing"
lane: qa
screens: [UF-02.1, UF-09.3]
decisions: [D-0208, D-0213]
deps: []
status: done
---
<!-- Groomed 2026-10-09 (D-0213 §6). Flow: wl-build-qa (agent qa-tester). About ½ day. Every Cobalt screen ticket's "visual compare" AC calls this helper. No fixture or config change, so the full e2e suite isn't needed. -->
## Why
The owner wants every restyled screen screenshotted at 390 × 844 and compared against the matching canvas frame. The canvas, `Design-docs/docs/design/redesign-cobalt/canvas/Design Directions.dc.html` with `support.js`, lives only on `origin/design/redesign-cobalt`. It uses sample data, so the comparison is by eye, not a pixel diff. One shared helper keeps that cheap and identical across 27 screen tickets, and costs CI nothing.

## Scope
- **In:**
  - `tests/e2e/helpers/canvas-compare.ts` exports `compareWithCanvas(page, testInfo, { turn: "turn-3" | "turn-4" | "turn-5", frame: string, name?: string })`.
  - **When `process.env.WL_CANVAS_COMPARE === "1"`:**
    1. It screenshots `page` at its current state into `testInfo.outputPath("cobalt", "<name>-app.png")`. The page viewport must be 390 × 844, or the helper throws.
    2. Once per worker, it materialises the canvas HTML and `support.js` with `git show origin/design/redesign-cobalt:<path>` into `testInfo.outputPath("cobalt-canvas/")`. Nothing goes into the repo tree.
    3. It opens that file in a **new browser context** (so the page's supabase and console guards don't apply), with every Google Fonts request routed to the repo's `packages/design-tokens/fonts/*.woff2`.
    4. It finds the artboard: the element after the label whose text is exactly `frame`, inside `section#<turn>`, with a 390 px width. It screenshots that element to `<name>-canvas.png`.
    5. It writes `<name>.html`, showing the two PNGs side by side with the frame name, the turn and the README fixes that override the canvas (lift `#CC4225`, inactive tabs `ink-muted`, "Previous" white, rest days `ink-muted`, attention `#FFB3A3`).
  - **When the variable is unset, or the ref is missing:** it adds a `canvas-compare: skipped (<reason>)` annotation and returns. It never fails or skips the test.
  - A frame list constant, `CANVAS_FRAMES`, holds the exact labels from rounds 3–5 (D-0213 §6). The helper rejects an unknown frame name.
  - `tests/e2e/canvas-compare.spec.ts`: the helper's own tests.
- **Out:**
  - Any pixel threshold.
  - Committing screenshots.
  - Calling the helper from feature specs (the screen tickets do that).

## Acceptance criteria
- **AC1 (artboard capture).** **Given** `WL_CANVAS_COMPARE=1` and the ref present **when** `compareWithCanvas` runs for `{ turn: "turn-3", frame: "Today" }` on a 390 × 844 page **then**:
  - `today-canvas.png` exists and is 390 × 844 (read from the PNG header);
  - `today-app.png` exists and is 390 × 844;
  - `today.html` references both.
- **AC2 (frames).** Every entry in `CANVAS_FRAMES` resolves to exactly one 390-px artboard in its turn. A parametrised test runs the lookup on the materialised HTML without screenshots. An unknown frame ("Todya") throws with the list of valid names.
- **AC3 (fonts local).** During the canvas render, no request leaves `127.0.0.1` or `file:`. Font requests are fulfilled from the repo files: a route log asserts zero external hosts, and `document.fonts.check('700 56px "Familjen Grotesk"')` is true in the canvas context.
- **AC4 (off by default).** **Given** `WL_CANVAS_COMPARE` unset **when** it's called **then** it writes no file, adds a `canvas-compare: skipped (WL_CANVAS_COMPARE unset)` annotation, and the test passes.
- **AC5 (ref missing).** **Given** `WL_CANVAS_COMPARE=1` and a ref that doesn't exist (the test injects a bad ref name) **when** it's called **then** it writes only the app PNG, annotates `skipped (design ref missing)`, and the test passes. This is the CI case.
- **AC6 (viewport guard).** **Given** a 1280-wide page **when** it's called with the variable set **then** it throws "compareWithCanvas needs a 390 × 844 viewport".
- **AC7 (no repo writes).** After a run, `git status --porcelain` lists nothing new outside `test-results/`.

Checklist (D-0197 §7):
- Variable set and unset (AC1, AC4), and ref present and missing (AC1, AC5), are both covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/helpers/**` (new), `tests/e2e/canvas-compare.spec.ts` (new) (lane)
- `docs/tickets/T-0591-e2e-canvas-compare-helper.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `npx playwright test tests/e2e/canvas-compare.spec.ts` green with and without `WL_CANVAS_COMPARE=1` · `-w test:repo-checks` (check-e2e-wiring) and check-all green · commit messages start with `T-0591`.

## Build / accept log
Archived in `docs/tickets/log/T-0591.md` (D-0157).
