---
id: T-0407
title: "OfflineStatus icon gets role=\"img\" (axe aria-prohibited-attr), an offline axe check in its own tests, and the UF-09 e2e axe scan loses its D-0127 filter"
lane: web-shell
screens: [UF-08.1, UF-09.3, UF-09.4]
decisions: [D-0127, D-0045, D-0086, D-0060]
deps: [T-0304b]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Filed on the board as the web-shell row "T-0400". It was renumbered because T-0400 is already the infra Terraform ticket (D-0011, D-0017, ci.yml); the orchestrator updates the board row. Follow-up from T-0304b (D-0127). It becomes ready when T-0304b is done, because the filter it removes lives only on T-0304b's branch. -->

## Why
Offline, `<OfflineStatus variant="icon" />` renders `<span aria-label="Offline">` with no role. Axe
reports that as `aria-prohibited-attr` (serious), because `aria-label` isn't allowed on a generic
`span`, and some screen readers never announce it. The icon is in the UF-08.1 header and the
UF-09 chrome, which are the screens a user sees in a gym with no signal. T-0304b's offline axe rows
had to filter this one finding (D-0127). This ticket fixes it at the source and removes the filter,
so the UF-09 scan is unfiltered again. Principle 1 holds: the icon stays silent, with no
`alert`/`banner`/live region.

## Scope
- In:
  - `apps/web/src/components/offline-status/OfflineStatus.tsx`: the icon span gets `role="img"` and
    keeps `aria-label={en.offline.ariaLabel}` ("Offline") and its class. Update the header comment.
  - `apps/web/src/components/offline-status/__tests__/OfflineStatus.test.tsx`: an offline axe
    check. It uses axe-core resolved through `@axe-core/playwright`, the way
    `components/body-map/__tests__/BodyMap.a11y.test.tsx` does (D-0060), with `color-contrast`
    off.
  - `tests/e2e/uf-09-focus.spec.ts`: delete `isKnownShellIcon` and its D-0127 doc comment.
    `expectAxeClean` then keeps every serious or critical violation.
  - `.squad/decisions/D-0127-uf09-offline-axe-shell-icon.md`: set `status: superseded` and append a
    `## Superseded` line: "T-0407 gave the icon `role=\"img\"`; the T-0304b AC-12 scans are
    unfiltered."
- Out:
  - The text variant's markup.
  - The icon's CSS and size, `en.offline` copy and where the icon is placed (UF-08, UF-09 chrome).
  - Any other axe finding. If the unfiltered scan finds another one, raise triage rather than
    filtering it.
  - New dependencies (`vitest-axe` stays out: lockfile changes go through the orchestrator).

## Acceptance criteria
Each new unit test title starts with `T-0407 ACn`.
- AC1 (axe clean offline, red on unfixed code) **Given** `navigator.onLine` is `false`, **When**
  `<OfflineStatus variant="icon" lastSyncedAt={null} />` renders and axe runs on the container,
  **Then** there are 0 violations. In particular there is no `aria-prohibited-attr`.
  - **Red proof:** on main's `OfflineStatus.tsx` this test fails, and the violation ids it lists
    include `aria-prohibited-attr`. Record the failing output in the build log.
- AC2 (the pair) The same axe run on `<OfflineStatus variant="text" lastSyncedAt={null} />` offline
  gives 0 violations. Online, both variants render nothing, so axe has 0 violations on the
  container too.
- AC3 (the role and name) **Given** offline, **When** the icon renders, **Then**
  `screen.getByRole("img", { name: "Offline" })` finds exactly one element with class
  `wl-offline-status__icon` and `textContent === ""`. There is still no `alert`, `banner` or
  `status` role, and there is no `aria-live`. On unfixed code `getByRole("img", …)` throws, so this
  is red.
- AC4 (no regressions) These pass unedited: the existing `OfflineStatus.test.tsx` cases,
  `OfflineStatus.read-guard.test.tsx`, `features/UF-08/__tests__/refresh-offline.test.tsx`
  (`getByLabelText("Offline")`), `features/UF-09/__tests__/host.load.test.tsx` and the UF-04
  `offline-status-elements` scans.
- AC5 (e2e unfiltered) **Given** `tests/e2e/uf-09-focus.spec.ts` with `isKnownShellIcon` deleted,
  so the source has no `isKnownShellIcon` and no `D-0127`, **When** the T-0304b AC-12 "one set
  offline" rows run, **Then** each `expectAxeClean` on UF-09.3 and UF-09.4 passes with 0 serious or
  critical violations.
  - **Red proof:** run those rows with the filter deleted and main's `OfflineStatus.tsx`. They fail
    on `aria-prohibited-attr` at `.wl-offline-status__icon`. Record this in the build log.
- AC6 (decision) D-0127's front matter reads `status: superseded`, and its body names T-0407.

## Paths you may change
- `apps/web/src/components/**` (the lane: `web-shell`).
- **Listed extras:**
  - `tests/e2e/uf-09-focus.spec.ts`: delete `isKnownShellIcon` and its use in `expectAxeClean`.
  - `.squad/decisions/D-0127-uf09-offline-axe-shell-icon.md`: the status and the superseded line.
  - `docs/tickets/T-0407-offline-icon-role-img.md`: this file, for the build and accept log.

## Contract impact
none

## Coordination
- Files: `components/offline-status/OfflineStatus.tsx`, its `__tests__/OfflineStatus.test.tsx`,
  `tests/e2e/uf-09-focus.spec.ts` and D-0127.
- T-0304b (doing) adds `isKnownShellIcon` to `tests/e2e/uf-09-focus.spec.ts`, hence the dep. Branch
  from `main` after T-0304b merges.
- T-0304f (todo, after T-0304b) will also edit `uf-09-focus.spec.ts`. Run this ticket before it or
  after it, never alongside it.
- Same lane as T-0398 and T-0385 (both doing): their files (`build.test.ts`, `lib/offline`) don't
  overlap with these. Stagger verification runs (one vitest/playwright per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · e2e green (it touches `apps/web/src/**` and `tests/e2e/**`) · contracts unchanged · commit
messages start with `T-0407` and cite the screens (e.g. `T-0407 UF-09.3 UF-09.4: OfflineStatus
icon role="img"; unfiltered offline axe`).

## Build / accept log
- 2026-10-02 frontend-dev (build): icon span gets `role="img"` (keeps `aria-label`, class); T-0407 AC1-AC3 axe/role tests appended to `OfflineStatus.test.tsx` (existing cases unedited); `isKnownShellIcon` and its D-0127 comment deleted from `uf-09-focus.spec.ts`; D-0127 `superseded`. Red proof on unfixed `OfflineStatus.tsx`: AC1 fails with `[{ id: "aria-prohibited-attr", nodes: ['<span aria-label="Offline" class="wl-offline-status__icon"></span>'] }]`; AC3 throws `Unable to find an accessible element with the role "img" and name "Offline"`; e2e T-0304b AC-12 row fails on `aria-prohibited-attr` at `.wl-offline-status__icon` (1 failed). Green: web typecheck/lint/test 2130/2130; e2e `uf-09-focus` + `offline` 9/9 (AC-12 and T-0304f offline axe rows unfiltered); `-w format:check` and `check:repo` clean. No other axe finding surfaced.
- 2026-10-02 product-owner (accept): **done**. AC1: `T-0407 AC1` axe test on the offline icon with `color-contrast` off and axe-core resolved via `@axe-core/playwright` (D-0060); there is also a probe-soundness test proving axe catches a role-less `aria-label` span. Red proof is recorded above. AC2: text variant offline, plus both variants online, 0 violations. AC3: `getByRole("img", { name: "Offline" })` with no alert, banner or status role and no `[aria-live]`; red on main (throws). AC4: existing cases unedited and web 2130/2130 green. AC5: the spec has no `isKnownShellIcon` or `D-0127` left; the AC-12 rows pass unfiltered (e2e 9/9) and were red with main's component. AC6: D-0127 is `status: superseded` with a T-0407 line. Contracts unchanged. Principle 1 holds: the icon is silent with no live region.
