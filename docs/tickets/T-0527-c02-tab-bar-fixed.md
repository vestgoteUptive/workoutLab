---
id: T-0527
title: "C-02: the tab bar stays fixed at the bottom of the viewport (safe-area padded), with clearance so no content or focus hides under it (GitHub #36)"
lane: web-shell
screens: [UF-02.1, UF-04.1, UF-06.1, UF-10.1, UF-11.2]
decisions: [D-0196, D-0045, D-0071]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Specced 2026-10-06 by product-owner against main da5c366 from GitHub #36 (D-0196).
Build flow: wl-build-web. About ⅓ day. -->

## Why
GitHub #36, from the owner on the installed PWA: "Navigation buttons in the bottom should be
fixed. Now you need to scroll to bottom to see them."

Cause: `Shell` (`apps/web/src/app/App.tsx`) renders `<TabBar />` after `<Routes>` as an ordinary
block, and `.wl-tab-bar` (`apps/web/src/components/tab-bar/tab-bar.css`) has no `position`. The bar
is just the last element of the page: below the fold on a long screen, mid-screen under a short
one. `index.html` has no `viewport-fit=cover`, and nothing reads the safe-area insets.

## Scope
- In (D-0196):
  - `tab-bar.css`: `.wl-tab-bar` fixed to the viewport bottom, full width, `z-index: 5`; padding
    `env(safe-area-inset-bottom, 0px)` below the links and `env(safe-area-inset-left/right, 0px)`
    at the sides; one custom property `--wl-tab-bar-block-size` for the bar height.
  - `TabBar.tsx`: render an in-flow spacer (`aria-hidden="true"`, class `wl-tab-bar__spacer`) as
    tall as the bar plus the bottom inset, next to the `<nav>`, so clearance exists only where the
    bar does. Keep the four links, their order, `aria-current` and `aria-label` as they are.
  - Scroll padding: while the bar is rendered, the root scroller has `scroll-padding-block-end`
    equal to the bar height (e.g. `html:has(.wl-tab-bar) { … }` in `tab-bar.css`).
  - `index.html`: viewport `width=device-width, initial-scale=1.0, viewport-fit=cover`. No
    `interactive-widget`.
- Out:
  - Which routes show the bar (`routes.ts` `showTabBar`) — unchanged, principle 1.
  - Icons on the tabs (D-0045 §3 mentions them; separate).
  - The top safe-area inset (D-0196 §6).
  - Any feature folder.

### Edge cases that are in scope
- **Short screen** (little content): the bar is still at the viewport bottom, not under the
  content.
- **Long screen:** the bar is visible at scroll top; at scroll bottom the last content isn't under
  it.
- **Keyboard focus** to the last link on a long screen leaves it fully above the bar.
- **Focus mode and editing routes:** no bar and no spacer (no extra blank space at the bottom of
  UF-09 or `/plan/account`).
- **Offline:** CSS only; the cached shell renders the same.

## Acceptance criteria
Unit tests are vitest in `apps/web/src/components/tab-bar/__tests__/` (new); e2e go in
`tests/e2e/shell.spec.ts`'s "AC-A7 tab bar (e2e, 360x640)" describe, signed in with its existing
setup. Test titles start `T-0527 AC-n`.

- **AC-1 (fixed at the bottom, long screen, e2e)** Given a signed-in tab-bar route whose
  `document.documentElement.scrollHeight` is more than `innerHeight + 200` (assert this
  precondition first; use `/library` with the shared mock, or a 360×400 viewport if needed so
  the test can't pass vacuously), when the page is at `scrollY = 0`, then the "Main" navigation's
  bounding box bottom equals `innerHeight` (±1 px) and its top is `> innerHeight - 120`. When
  scrolled to the bottom (`window.scrollTo(0, scrollHeight)`), the same holds.
  **Red on main:** at `scrollY = 0` the nav's top is below `innerHeight`.
- **AC-2 (short screen, e2e)** Given a tab-bar route whose content is shorter than the viewport
  (`/progress` with no history in the mock, or any route meeting `scrollHeight <= innerHeight`
  after the bar's spacer; assert the precondition), then the nav's bounding box bottom equals
  `innerHeight` (±1 px). **Red on main:** the nav sits right under the content.
- **AC-3 (nothing hidden, e2e)** On AC-1's page scrolled to the bottom, the last focusable element
  in the route's content (the last link or button before the nav in DOM order, excluding the nav)
  has bounding box bottom ≤ the nav's top. Then, from the top of the page, focus that element with
  `element.focus()` followed by a keyboard `Tab` back and forth (Shift+Tab then Tab) so the browser
  scrolls it into view: its bottom is ≤ the nav's top.
- **AC-4 (tab bar still works, e2e)** The existing T-0300 AC-A7 tests (44×44 hit areas, Tab order
  and Enter navigation, request origins) stay green unchanged.
- **AC-5 (no bar, no spacer, unit)** Rendering `Shell` (the `App.test.tsx` / `routes.phase3.render`
  setup) at `/session/setup`, `/plan/account` and `/welcome`: no `navigation` named "Main" and no
  `.wl-tab-bar__spacer`. At `/`: exactly one of each, and the spacer has `aria-hidden="true"`.
- **AC-6 (CSS and viewport, unit)** Reading the source files as text:
  - `tab-bar.css`'s `.wl-tab-bar` rule has `position: fixed`, uses
    `env(safe-area-inset-bottom` and defines or uses `--wl-tab-bar-block-size`; the spacer rule
    uses the same property; a `scroll-padding-block-end` (or `scroll-padding-bottom`) rule uses it;
  - `apps/web/index.html`'s viewport `content` includes `viewport-fit=cover` and doesn't include
    `interactive-widget`.
  Prove AC-6 can fail: on a backup copy of `tab-bar.css`, remove `position: fixed`; AC-6 and AC-1
  must fail. Restore with `cp`.

**Red proof.** Run AC-1, AC-2 and AC-6 on main: all fail. Record each.

## Paths you may change
- `apps/web/src/components/tab-bar/**`, `apps/web/index.html`, `apps/web/src/main.css` if the
  scroll padding fits better there, `apps/web/src/app/App.tsx` only if the spacer must be placed
  by the shell (the lane: `web-shell`).
- **Listed extras:**
  - `tests/e2e/shell.spec.ts`: the T-0527 tests in the AC-A7 describe.
  - `docs/tickets/T-0527-c02-tab-bar-fixed.md`, for the build and accept logs.

## Contract impact
None. No colour or font changes; `tokens.json` untouched.

## Definition of done
- Tests for every AC pass, red runs and the AC-6 planted fault recorded.
- `tests/e2e/shell.spec.ts` green, plus `uf-02-today.spec.ts`, `uf-11-plan.spec.ts` and
  `uf-11-account.spec.ts` (tab-bar routes whose clicks could now hit the fixed bar), each through
  `scripts/locked.sh heavy` (D-0178). This touches the shell outside one feature, so say in the
  handback whether you ran the full e2e suite; the orchestrator decides.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` green, through `scripts/locked.sh`.
- Commits start `T-0527` and cite C-02 and GitHub #36.

## Notes
- After deploy, the owner can check the installed iPhone PWA: the tabs sit above the home
  indicator and the bar stays put while scrolling (Chromium can't emulate the inset; not a gate).
- **Parallel:** web-shell lane, as is T-0528. Files don't overlap (`components/tab-bar`,
  `index.html` vs `lib/account`), but run them one after the other if the lane rule is applied
  strictly. An e2e click on an element now under the fixed bar would fail with "element intercepts
  pointer events": fix it in the spec by scrolling, not by hiding the bar.

## Build / accept log
Archived in `docs/tickets/log/T-0527.md` (D-0157).
