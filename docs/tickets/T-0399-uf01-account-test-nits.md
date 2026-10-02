---
id: T-0399
title: "UF-01.5 test nits: Home/End through the keyboard.ts press() harness; the e2e role=status assertions scoped to the UF-01.5 screen"
lane: web-feature:UF-01
screens: [UF-01.5]
decisions: [D-0064]
deps: [T-0382]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0382 review (accept log, non-blocking nits). T-0382 is done. Test-only: no product code changes. -->

## Why
Two T-0382 review nits:
- The "T-0382 AC2 End goes to Enter code and Home to Send link" test in `features/UF-01/__tests__/account.test.tsx` dispatches `fireEvent.keyDown` by hand. Every other key test goes through the `keyboard.ts` `press()` harness, which dispatches keydown and keyup on the focused element. `@testing-library/user-event` isn't a dependency of `apps/web` (see the `keyboard.ts` header), so the harness is how we drive keys: `press()` gains `Home` and `End`.
- The e2e `page.getByRole("status")` in `tests/e2e/uf-01-onboarding.spec.ts` is page-wide and strict. A second status region anywhere on the page (an offline banner, a toast) would break it with a strict-mode error that has nothing to do with UF-01.5. `tests/e2e/auth.spec.ts` has the same pattern on `/account`.

## Scope
- In:
  - `features/UF-01/__tests__/keyboard.ts`: add `"Home"` and `"End"` to `Key` and `KEY_PROPS` (`{ key: "Home", code: "Home" }`, `{ key: "End", code: "End" }`). No default action: jsdom has none for these keys on a button, and the browser has none either.
  - `account.test.tsx`: the Home/End test uses `await press("End")` / `await press("Home")` on the focused tab.
  - `tests/e2e/uf-01-onboarding.spec.ts` test (c) and `tests/e2e/auth.spec.ts` "send link, then follow the callback link": the status locator is scoped to the UF-01.5 screen (`page.locator('[data-screen-id="UF-01.5"]').getByRole("status")`).
- Out:
  - `AccountScreen.tsx`, `uf-01.css` and any other product code.
  - Adding `@testing-library/user-event`.
  - The other `fireEvent` uses in `account.test.tsx` (clicks and `change`).
  - Other e2e specs.

## Acceptance criteria
Each new or edited test title starts with `T-0399 ACn`.
- AC1 (harness keys, red on unfixed code) A new `features/UF-01/__tests__/keyboard.test.ts`:
  - **Given** a focused `<button>` with keydown and keyup listeners, **When** `press("Home")` and then `press("End")` run, **Then** the listeners record, in order, keydown `Home`, keyup `Home`, keydown `End`, keyup `End`. Each event has `code` equal to its `key`, and `document.activeElement` is still the button.
  - On main, `press("Home")` is a type error and `KEY_PROPS["Home"]` is undefined, so the test fails.
- AC2 (Home/End through press) The Home/End test in `account.test.tsx` is retitled `T-0399 AC2 (T-0382 AC2) End goes to Enter code and Home to Send link (each also from its own end)`. It contains no `fireEvent.keyDown` and asserts the same four focus and selection states, in the same order, as today's test.
  - **Red proof:** with `Home` and `End` removed from `AccountScreen.tsx`'s key handler (temporary, reverted), the test fails. Record this in the build log.
- AC3 (scoped status, red on unfixed code) In both e2e tests, the status assertion uses the screen-scoped locator. Each test also gets a guard step, placed before the Send link action: `page.evaluate` appends `<p role="status">other</p>` to `document.body`, outside the app root. **Then** the "Check your email for a link and a 6-digit code." assertion still passes.
  - **Red proof:** with today's page-wide `page.getByRole("status")` and the guard step in place, both tests fail with a strict-mode violation. Record this in the build log.
- AC4 (no regression)
  - Every other `account.test.tsx`, `a11y.test.tsx` and `save.test.tsx` case passes unedited. `a11y.test.tsx` still uses `press` and `tabTo` as today.
  - `uf-01-onboarding.spec.ts` and `auth.spec.ts` pass in the local Playwright run. Their other steps are unchanged.

## Paths you may change
- `apps/web/src/features/UF-01/__tests__/**` (the lane: `web-feature:UF-01`). The edits go in `keyboard.ts`, `account.test.tsx` and a new `keyboard.test.ts`.
- **Listed extras:**
  - `tests/e2e/uf-01-onboarding.spec.ts`: test (c), the status assertion and its guard step.
  - `tests/e2e/auth.spec.ts`: the "send link, then follow the callback link" test, the status assertion and its guard step.
  - `docs/tickets/T-0399-uf01-account-test-nits.md`: this file, for the build and accept log.

## Contract impact
none

## Coordination
- No other ready or doing ticket edits `features/UF-01/**`, `uf-01-onboarding.spec.ts` or `auth.spec.ts`. T-0393 (qa, ready) edits the UF-04 library fixture only.
- It can run in parallel with T-0386 (UF-08), T-0385, T-0396 and T-0398 (web-shell). Stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · both e2e specs pass · contracts unchanged · commit messages start with `T-0399` and cite UF-01.5 (e.g. `T-0399 UF-01.5: Home/End through press(), scoped status locator`).

## Build / accept log
- 2026-10-02 build (frontend-dev): `keyboard.ts` gains `Home`/`End` in `Key` and `KEY_PROPS` (no default action); new `keyboard.test.ts` (`T-0399 AC1`); the Home/End test in `account.test.tsx` is retitled `T-0399 AC2 (T-0382 AC2) …` and drives keys with `await press(...)`, same four focus/selection asserts in the same order, no `fireEvent.keyDown`; `uf-01-onboarding.spec.ts` (c) and `auth.spec.ts` "send link, then follow the callback link" append `<p role="status">other</p>` to `document.body` before the Send link action and assert the status scoped to `[data-screen-id="UF-01.5"]` (`T-0399 AC3`). No product code changed.
  - Red on unfixed code: AC1 with main's `keyboard.ts` fails (`expected [ …(4) ] to deeply equal …`; tsc also rejects `press("Home"/"End")`, TS2345). AC2 with the Home and End branches removed from `AccountScreen.tsx` `onTabKeyDown` (temporary, reverted) fails (focus still on the first tab after `End`). AC3 with the guard step in place and the page-wide `page.getByRole("status")` restored (temporary, reverted), both e2e tests fail: `strict mode violation: getByRole('status') resolved to 2 elements`.
  - Green: `pnpm --filter @workoutlab/web test` 121 files / 1789 tests; Playwright `uf-01-onboarding.spec.ts` + `auth.spec.ts` 14 passed; `pnpm -w typecheck lint test --force --concurrency=1` 19/19 tasks; `-w format:check` clean; `check:repo` (check-all) exit 0.
