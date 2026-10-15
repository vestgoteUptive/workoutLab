---
id: T-0680
title: "UF-03.1 → UF-05.1: e2e for the in-tree swap sheet in List view (scrim z 6, sheet z 7, hit-testing)"
lane: web-feature:UF-03
screens: [UF-03.1, UF-05.1]
decisions: [D-0208, D-0227, D-0178, D-0086]
deps: [T-0602]
status: ready
---
## Why
The swap sheet (`features/UF-05/SwapSheet.tsx`) has three hosts. Two are covered in e2e by
`tests/e2e/uf-05-swap.spec.ts`: UF-09.9 Pause (UF-09 replaces its screen root with the sheet) and
UF-08.2 Set up. In both, `assertCobaltSheet` checks the colours, top 150, radius, the 45 % scrim
and motion. Neither checks **stacking**. The third host, UF-03.1 List view
(`features/UF-03/ListView.tsx` `Card`, `<SwapSheet` at line 758 on `main` 21a205c0; the board's
":738" is stale), has no e2e at all. There the sheet is **in-tree**: the `display: contents`
wrapper `.wl-uf05` puts `.wl-sheet-scrim` (`position: fixed; z-index: 6`, `main.css:1065`) and
the dialog (`.wl-sheet`, `position: fixed; z-index: 7`, `main.css:1039`) inside
`section.wl-uf03-list__card[data-current]`, under the lift-state `[data-screen-id="UF-03.1"]` root.
Two things would silently break it there. An ancestor with `transform`/`filter`/`contain` would
re-anchor the fixed sheet to the card. A positioned UF-03 element with a higher z-index would paint
over the scrim. The T-0602 review asked for this coverage.

## Scope
- In: one new `test.describe` in `tests/e2e/uf-03-list-summary.spec.ts`, named
  `T-0680 UF-03.1 swap sheet in-tree stacking (390 x 844)`, with `test.use({ viewport: { width: 390, height: 844 } })`.
  It reuses the spec's own `openSessionOffline` + `openListView` helpers (offline, seeded running
  S1). Then it clicks the current card's Swap button (`page.getByRole("button", { name: /^Swap / })`).
  Only the current card renders one, so assert count 1 first. Then it waits for
  `page.getByRole("dialog", { name: /^Replace / })` to be visible. Every geometry or hit read
  happens after that visible-wait. The ACs below do not need options to be loaded.
- In, only if the test exposes a real bug: a CSS fix in `apps/web/src/features/UF-03/**`, with the
  red run logged first. A fix needed in `main.css` or `features/UF-05/**` is a follow-up
  (web-shell / web-feature:UF-05), with the test marked `test.fixme` and a link to it. A test is
  never weakened.
- Out: colours, radius, motion and axe of the sheet (`assertCobaltSheet` covers them on the other
  two hosts, and it is the same component). theme-color with the sheet over UF-03 (D-0227 covers
  only Pause). Options and Apply (UF-03 unit tests `list-view.swap*.test.tsx`).
- Unit tests: none needed. If the builder adds any `features/UF-03/__tests__/*.test.tsx`, it must
  pass the T-0922 guard `wait-then-read.guard.test.ts`: no synchronous `screen.getBy*` right after a
  heading wait without a ready-signal await, or a `// same-commit: <reason>` marker.

## Acceptance criteria
All in the new describe block. Probe points are viewport CSS px at 390 × 844. "Hit" means
`document.elementFromPoint(x, y)`, read in one `page.evaluate`.
- **AC1 (the sheet really is in-tree here).** Given UF-03.1 with the sheet open, When the DOM is
  read, Then the dialog and `.wl-sheet-scrim` both have
  `closest('[data-screen-id="UF-03.1"]')` non-null and `closest('[data-part="card"][data-current]')`
  non-null. The UF-03.1 root keeps `data-wl-state="lift"`, and the dialog has
  `data-wl-state="plan"`. (This pins the test to the in-tree case. If the host later portals the
  sheet, the test must be rethought, not pass silently.)
- **AC2 (stacking values and fixed geometry).** Then `getComputedStyle(scrim)` has
  `position === "fixed"` and `zIndex === "6"`, and its rect is exactly `{x: 0, y: 0, width: 390, height: 844}`.
  `getComputedStyle(dialog)` has `position === "fixed"` and `zIndex === "7"`, and its rect has
  `top === 150`, `bottom === 844`, `left === 0`, `width === 390`.
  - Planted fault F1: on a backup copy of `apps/web/src/main.css`, delete `z-index: 6;` from
    `.wl-sheet-scrim`. AC2 goes red (`zIndex` `"auto"`). Restore with `cp`.
  - Planted fault F2: on a backup copy of `features/UF-03/list-view.css`, add
    `.wl-uf03-list__card { transform: translateZ(0); }`. The fixed boxes are re-anchored to the
    card, so AC2's rect or AC3 goes red. Restore with `cp`.
- **AC3 (nothing from UF-03 paints over the overlay).** Then for the probes (20, 75), (195, 75)
  and (370, 75), which lie above the sheet, the hit has `closest(".wl-sheet-scrim")` non-null. For
  (20, 400), (195, 400) and (195, 830), the hit has `closest('[role="dialog"]')` equal to the
  sheet. For all six, `hit.closest(".wl-uf05")` is non-null: no UF-03 element is the top hit
  anywhere.
  - Planted fault F3: on a backup copy of `list-view.css`, give the element that is the hit at
    (195, 75) with the sheet **closed** (AC4 logs which one) `position: relative; z-index: 8;`.
    AC3 goes red at (195, 75). Restore with `cp`.
- **AC4 (closed is the sibling state).** Given the same screen, When the sheet's "Close" button is
  clicked, Then `.wl-sheet-scrim` has count 0, the dialog is hidden, and the hit at (195, 75) has
  `closest('[data-screen-id="UF-03.1"]')` non-null and `closest(".wl-uf05")` null. The log records
  that element's tag and class (F3 uses it). Focus is back on the Swap button (`toBeFocused`).

Binary-condition check (D-0197 §7):
- Sheet open/closed: AC1–AC3 against AC4.
- Online/offline: the setup is offline (the spec's helpers). Stacking is pure CSS and the same
  component mounts in both cases (the offline/online sheet content is covered in
  `uf-05-swap.spec.ts`), so no online twin.
- Signed in/out: does not apply (a running session needs a signed-in user).

## Paths you may change
- `apps/web/src/features/UF-03/**` (only for a fix the test proves is needed, see Scope)
- Listed extras:
  - `tests/e2e/uf-03-list-summary.spec.ts` (qa lane): the new describe block only.

## Contract impact
none

## Definition of done
- AC1–AC4 pass in `tests/e2e/uf-03-list-summary.spec.ts`. The runs are
  `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-03-list-summary -g T-0680`,
  then the whole file once (other UF-03 describes share the helpers). F1–F3 red/green are in the
  log, one line each. The full e2e suite is not needed (one spec, no fixture change; D-0178 §3).
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- If T-0928 has merged first, `pnpm -w lint` also lints this spec. Use no raw colour except as
  D-0228 §2 allows.
- Commits start `T-0680 UF-03.1:`.

## Build / accept log
- Built on 49cd97ce (clean). New describe `T-0680 UF-03.1 swap sheet in-tree stacking (390 x 844)` in `tests/e2e/uf-03-list-summary.spec.ts`: one test covering AC1-AC4 (geometry/hit reads after the dialog visible-wait). No product code or unit tests changed.
- AC1-AC4 map: all in test "AC1-AC4: in-tree scrim z 6 and sheet z 7 ..."; green 1/1, and 20/20 with `--repeat-each=20`.
- AC4 closed hit at (195, 75): `<div class="wl-uf03-list">` (the list container's blank gap).
- F1 (delete `z-index: 6;` from `.wl-sheet-scrim` in main.css): red (AC2 zIndex). Restored with cp.
- F2 (`.wl-uf03-list__card { transform: translateZ(0); }`): red (AC2 rect). Restored with cp.
- F3 as written in the spec (`position: relative; z-index: 8` on `.wl-uf03-list`): stayed GREEN. Reason: that element is an ancestor of the in-tree sheet, so it only makes a stacking context that contains scrim and sheet; the sheet still wins inside it. The spec's F3 premise is wrong for an ancestor hit element. Replaced F3 with `.wl-uf03-list::before { content: ""; position: fixed; inset: 0 0 auto 0; height: 100px; z-index: 8; }` (a UF-03 box painting over the scrim, host = the same element): red at AC3 `inScrim` (Expected true, Received false). Restored with cp. An earlier full-viewport version blocked the Swap click (red at click, not AC3), hence the 100px band.
- Runs: new test 1/1, x20 repeat 20/20 stable, whole uf-03-list-summary file 13/13. Gate `-w typecheck lint test --concurrency=1` exit 0 (turbo cache), test:repo-checks 0, format:check 0, check-all.mjs 0.
