---
id: T-0622
title: "Name the library \"Exercises\": en.tabBar.library and en.screens.library become \"Exercises\" (C-02 tab and the UF-04.1 heading); route /library, screen IDs and \"Exercise\" on UF-04.2 unchanged"
lane: web-shell
screens: [UF-04.1]
decisions: [D-0212, D-0196, D-0071]
deps: [T-0594, T-0607]
status: todo
---
<!-- Groomed 2026-10-09 (D-0212 §1.5, D-0213). Flow: wl-build-web (agent frontend-dev). About ¼ day. en.ts is web-shell's. Runs after the tab-bar restyle (T-0594) and the UF-04.1 restyle (T-0607), so no other ticket edits shell.spec or uf-04-library.spec in parallel. User flows v2 gets the name in T-0618. -->
## Why
The mock names the tab and the browse screen "Exercises", and the owner asked for the mock's wording (2026-10-09). "Exercises" says what's there. "Library" is our internal word.

## Scope
- **In:**
  - `apps/web/src/lib/i18n/en.ts`: `tabBar.library: "Exercises"` and `screens.library: "Exercises"`. The keys keep their names, so no code change is needed beyond the strings.
  - The tests that query the tab link or the UF-04.1 heading by "Library" move to "Exercises": `tests/e2e/shell.spec.ts`, `tests/e2e/uf-04-library.spec.ts` and the shell and UF-04 vitests that read the literal. Each is listed in the log; tests that read `en.tabBar.library` need no change.
- **Out:**
  - The route `/library` and the `data-screen-id`s.
  - `screens.libraryDetail` ("Exercise").
  - Lower-case "library" inside sentences ("The exercise library downloads…"), which stays.

## Acceptance criteria
- **AC1 (tab).** **Given** any tab screen **then** `getByRole("link", { name: "Exercises" })` in the main nav exists, has `href="/library"`, and has `aria-current="page"` on `/library`. No nav link is named "Library".
- **AC2 (heading).** **Given** `/library` **then** the `h1` is "Exercises" (with the CSS stop from T-0607, the name is still exactly "Exercises"), and the document title, if it's built from `screens.library`, says "Exercises".
- **AC3 (nothing else renamed).** A test scans every string value in `en` and the flow files: none is exactly "Library", and `screens.libraryDetail` is still "Exercise".
- **AC4 (offline).** Offline, the tab and heading still read "Exercises" and the cached list renders (the existing UF-04 offline case). Online is covered by AC1.
- **AC5 (no layout regressions).** At 320 px, the four tab labels fit on one line each, with no wrap or overflow (the tab bar's `scrollWidth` ≤ `clientWidth`), and each link stays ≥ 44 × 44.

Checklist (D-0197 §7):
- Online and offline, and current tab and not, are both covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/lib/i18n/en.ts`, `apps/web/src/app/**` tests, `apps/web/src/components/tab-bar/**` tests (lane)
- `apps/web/src/features/UF-04/__tests__/**` (listed extra, literal queries only)
- `tests/e2e/shell.spec.ts`, `tests/e2e/uf-04-library.spec.ts` (listed extras)
- `docs/tickets/T-0622-exercises-tab-name.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `shell.spec.ts` and `uf-04-library.spec.ts` green · commit messages start with `T-0622` and cite UF-04.1.

## Build / accept log
